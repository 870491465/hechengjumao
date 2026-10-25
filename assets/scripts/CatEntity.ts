import { CircleCollider2D, Collider2D, Contact2DType, ERigidBody2DType, IPhysics2DContact, isValid, Node, RigidBody2D, UIOpacity, Vec2 } from 'cc';
import { CONFIG, radius } from './GameConfig';
import { ball, uiNode } from './GameView';
import { ART, ArtAssets } from './ArtAssets';
import { LevelOneVisual } from './LevelOneVisual';
import { LEVEL_ONE } from './LevelOneConfig';

export class CatEntity {
    readonly node: Node; readonly body: RigidBody2D; readonly collider: CircleCollider2D; readonly art: Node;
    locked = false; touched = false; mergeAt = 0; protectionUntil = 0; bornAt: number;
    incomingX = 0; incomingY = 0;
    private jellyAt = -Infinity; private jellyStrength = 0; private jellyAngle = 0;
    private jellyNormalX = 0; private jellyNormalY = 1;
    private mergeVisualAt = -Infinity;
    private mergeElapsed = -Infinity;
    private disposed = false;
    rig?: LevelOneVisual;
    private supportContacts = new Set<Collider2D>();
    get x() { return this.node.position.x; }
    get y() { return this.node.position.y; }
    get r() { return radius(this.level); }
    constructor(parent: Node, readonly id: number, readonly level: number, x: number, y: number, now: number,
        onBegin: (self: CatEntity, other: Collider2D, contact?: IPhysics2DContact) => void, onEnd: (self: CatEntity, other: Collider2D) => void) {
        this.bornAt = now; this.protectionUntil = now + CONFIG.dropProtection;
        this.node = uiNode(`Cat-${id}-L${level}`, parent, x, y, this.r * 2, this.r * 2);
        this.node.active = false;
        this.body = this.node.addComponent(RigidBody2D); this.body.type = ERigidBody2DType.Dynamic;
        this.body.enabledContactListener = true; this.body.bullet = true;
        this.body.linearDamping = CONFIG.linearDamping; this.body.angularDamping = CONFIG.angularDamping;
        this.collider = this.node.addComponent(CircleCollider2D); this.collider.radius = this.r;
        this.collider.density = CONFIG.density; this.collider.friction = CONFIG.friction; this.collider.restitution = CONFIG.restitution;
        this.collider.on(Contact2DType.BEGIN_CONTACT, (_: Collider2D, other: Collider2D, contact: IPhysics2DContact) => onBegin(this, other, contact));
        this.collider.on(Contact2DType.END_CONTACT, (_: Collider2D, other: Collider2D) => onEnd(this, other));
        this.art = ball(this.node, level, this.r);this.rig=LevelOneVisual.of(this.art);this.rig?.fall(); this.node.active = true;
    }
    contactVisual(other:Collider2D, supported:boolean, closingSpeed:number){
        if(!this.rig)return;
        // Manual Box2D sync can refresh resting contacts. Numerical contact chatter
        // is not a new hit and must not reset the stable/quiet clock every step.
        if(closingSpeed>=LEVEL_ONE.quietContactSpeed)this.rig.touch();
        this.supportContacts.add(other);
        if(supported)this.rig.contact(this.node.angle);
    }
    endContactVisual(other:Collider2D){this.supportContacts.delete(other);}
    updateVisualState(dt:number,shaking:boolean){
        if(!this.rig)return;
        let supported=false;
        for(const other of this.supportContacts){
            if(!isValid(other,true)||!other.node.activeInHierarchy){this.supportContacts.delete(other);continue;}
            if(other.node.name==='Floor'){supported=true;break;}
            if(other instanceof CircleCollider2D){
                const p=other.node.position,dx=this.x-p.x,dy=this.y-p.y;
                if(dy>.35*Math.hypot(dx,dy)){supported=true;break;}
            }
        }
        this.rig.motion(dt,this.body.linearVelocity.length()*CONFIG.pixelsPerMetre,this.body.angularVelocity,supported,shaking);
    }
    stopOwnAnimation(){this.rig?.stop();}
    rebuildVisual(){
        this.rig?.dispose();this.rig=undefined;
        for(const n of this.art.children.slice()){n.removeFromParent();n.destroy();}
        if(ArtAssets.cat(this.art,this.level,this.r)){
            this.rig=LevelOneVisual.of(this.art);
            if(this.rig){this.rig.fall();if(this.touched){this.rig.contact(this.node.angle);this.rig.advance(.25,this.node.angle);}}
        }
    }
    captureMotion() { const v = this.body.linearVelocity; this.incomingX = v.x; this.incomingY = v.y; }
    impact(speed: number, nx: number, ny: number, now: number, force = false) {
        if (!force && (speed < CONFIG.width * CONFIG.jellyImpactThresholdRatio
            || now - this.jellyAt < CONFIG.jellyImpactCooldown)) return false;
        const strength = Math.min(CONFIG.jellyMaxSquash, Math.max(CONFIG.jellyMinSquash,
            speed / (CONFIG.width * CONFIG.jellySpeedRatio) * CONFIG.jellyGain));
        const age = now - this.jellyAt;
        if (!force && age < .2 && strength < this.jellyStrength * Math.exp(-CONFIG.jellyDecay * age)) return false;
        this.jellyAt = now; this.jellyStrength = strength;
        this.jellyAngle = Math.atan2(ny, nx) * 180 / Math.PI - 90;
        if (this.jellyAngle < -90) this.jellyAngle += 180;
        if (this.jellyAngle > 90) this.jellyAngle -= 180;
        const length = Math.hypot(nx, ny) || 1;
        this.jellyNormalX = nx / length; this.jellyNormalY = ny / length;
        this.rig?.impact();
        return true;
    }
    pop(now: number) {
        this.mergeVisualAt=now;this.mergeElapsed=0;
        (this.art.getComponent(UIOpacity)||this.art.addComponent(UIOpacity)).opacity=0;
    }
    animate(now: number, boxOffset = 0, visualDt = 0) {
        if(this.rig){
            this.rig.advance(visualDt,this.node.angle);
            const {sx,sy,angle}=this.rig.pose;
            this.art.setScale(sx,sy,1);this.art.angle=angle-this.node.angle;
            const theta=angle*Math.PI/180;
            const ex=this.r*Math.hypot(sx*Math.cos(theta),sy*Math.sin(theta));
            const ey=this.r*Math.hypot(sx*Math.sin(theta),sy*Math.cos(theta));
            const x=Math.max(-CONFIG.width/2+Math.max(0,boxOffset)+ex,Math.min(CONFIG.width/2+Math.min(0,boxOffset)-ex,this.x));
            const planted=this.y-this.r<=CONFIG.bottom+1?Math.min(0,sy-1)*this.r:0;
            const y=Math.max(CONFIG.bottom+ey,this.y+planted);
            const a=this.node.angle*Math.PI/180,dx=x-this.x,dy=y-this.y;
            this.art.setPosition(dx*Math.cos(a)+dy*Math.sin(a),-dx*Math.sin(a)+dy*Math.cos(a));return;
        }
        this.mergeElapsed+=visualDt;
        const age = Math.max(0, now - this.jellyAt);
        const strength = ArtAssets.hasCat(this.level) ? Math.min(this.jellyStrength, ART.catMaxSquash) : this.jellyStrength;
        const squash = age < CONFIG.jellyDuration ? strength
            * Math.exp(-CONFIG.jellyDecay * age) * Math.sin(age * Math.PI * 2 * CONFIG.jellyFrequency) : 0;
        const mergeAge = Math.max(now-this.mergeVisualAt,this.mergeElapsed);
        let growth=1;
        if(mergeAge>=0&&mergeAge<CONFIG.mergeAnimation) {
            const t=Math.max(0,(mergeAge-CONFIG.mergeGather)/(CONFIG.mergeAnimation-CONFIG.mergeGather));
            if(t<.48)growth=CONFIG.mergeBirthScale+(1+ART.mergeGrowth-CONFIG.mergeBirthScale)*(1-Math.pow(1-t/.48,3));
            else {const p=(t-.48)/.52;growth=1+ART.mergeGrowth*(1-p*p*(3-2*p));}
        }
        const opacity=this.art.getComponent(UIOpacity);
        if(opacity)opacity.opacity=Math.round(255*Math.max(0,Math.min(1,(mergeAge-CONFIG.mergeGather*.7)/.035)));
        // An area-preserving ellipse compresses along the collision normal, then rings down.
        const sy = (1 - squash) * growth, sx = growth / (1 - squash);
        this.art.setScale(sx, sy, 1);
        this.art.angle = this.jellyAngle - this.node.angle;
        const label = this.art.getChildByName('Text'); if (label) label.angle = -this.jellyAngle;
        const picture = this.art.getChildByName('CatPicture');
        if (picture) picture.angle = this.node.angle - this.jellyAngle;
        // Visual bulging must not leak through side walls or the floor either.
        const theta = this.jellyAngle * Math.PI / 180;
        const ex = this.r * Math.hypot(sx * Math.cos(theta), sy * Math.sin(theta));
        const ey = this.r * Math.hypot(sx * Math.sin(theta), sy * Math.cos(theta));
        const visualLeft = -CONFIG.width / 2 + Math.max(0, boxOffset);
        const visualRight = CONFIG.width / 2 + Math.min(0, boxOffset);
        // Keep the contact-side edge planted while compressing instead of floating above the floor.
        const desiredX = this.x + this.jellyNormalX * this.r * squash;
        const planted=this.y-this.r<=CONFIG.bottom+1?Math.min(0,growth-1)*this.r:0;
        const desiredY = this.y + this.jellyNormalY * this.r * squash + planted;
        const x = Math.max(visualLeft + ex, Math.min(visualRight - ex, desiredX));
        const y = Math.max(CONFIG.bottom + ey, desiredY);
        const a = this.node.angle * Math.PI / 180, dx = x - this.x, dy = y - this.y;
        this.art.setPosition(dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a));
    }
    constrainToBox(): boolean {
        const inset = CONFIG.boundaryInset;
        const lo = -CONFIG.width / 2 + this.r, hi = CONFIG.width / 2 - this.r;
        const floor = CONFIG.bottom + this.r, tolerance = CONFIG.boundaryTolerance;
        // Let Box2D keep its tiny resting-contact slop; correcting it every step would prevent sleep.
        const x = this.x < lo - tolerance ? lo + inset : this.x > hi + tolerance ? hi - inset : this.x;
        const y = this.y < floor - tolerance ? floor + inset : this.y;
        if (x === this.x && y === this.y) return false;
        const v = this.body.linearVelocity;
        const vx = (this.x < lo && v.x < 0) || (this.x > hi && v.x > 0) ? 0 : v.x;
        const vy = this.y < y && v.y < 0 ? 0 : v.y;
        this.node.setPosition(x, y, this.node.position.z);
        this.body.linearVelocity = new Vec2(vx, vy);
        return true;
    }
    limitVelocity() {
        const v = this.body.linearVelocity; const max = CONFIG.width * CONFIG.maxSpeedRatio / CONFIG.pixelsPerMetre;
        const length = v.length(); if (length > max) this.body.linearVelocity = new Vec2(v.x * max / length, v.y * max / length);
        const angular = this.body.angularVelocity;
        // Writing an unchanged non-zero angular velocity can wake a sleeping Box2D body.
        if (Math.abs(angular) > CONFIG.maxAngularSpeed) this.body.angularVelocity = Math.sign(angular) * CONFIG.maxAngularSpeed;
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.locked = true;
        this.rig?.dispose();this.rig=undefined;this.supportContacts.clear();
        if (isValid(this.collider, true)) {
            this.collider.off(Contact2DType.BEGIN_CONTACT); this.collider.off(Contact2DType.END_CONTACT);
        }
        // Deactivate synchronously between steps; destroy is deferred by Cocos.
        if (isValid(this.node, true)) {
            this.node.active = false; this.node.removeFromParent(); this.node.destroy();
        }
    }
}
