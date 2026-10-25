import { director, gfx, ImageAsset, Layers, Node, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec2, Rect, isValid } from 'cc';
import { LEVEL_ONE as C } from './LevelOneConfig';

type State = 'wait'|'fall'|'contact'|'round'|'idle'|'stretch'|'stopped';
const parts=['body','paw_left_back','paw_right_back','paw_left_front','paw_right_front','mouth_normal',
    'eye_left_open','eye_left_half','eye_left_closed','eye_right_open','eye_right_half','eye_right_closed'];
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const wrap=(angle:number)=>((angle+180)%360+360)%360-180;
function node(name:string,parent:Node){const n=new Node(name);n.layer=Layers.Enum.UI_2D;n.setParent(parent);n.addComponent(UITransform);return n;}

/** Owns visual properties only. No scheduled callbacks, gameplay RNG, rigid bodies or listeners. */
export class LevelOneVisual {
    static enabled=true;
    private static frames=new Map<string,SpriteFrame>();
    private static rigs=new WeakMap<Node,LevelOneVisual>();
    private static task:Promise<void>|null=null;
    static missing:string[]=[];
    static load(){
        if(!this.task)this.task=Promise.all(parts.map(key=>new Promise<void>(resolve=>{
            resources.load(`cat-level-01-v11/${key}`,ImageAsset,(error,image)=>{
                if(error||!image){this.missing.push(key);console.warn(`[Cat V1.1] Missing ${key}; using complete V1.0 cat.`);resolve();return;}
                const texture=new Texture2D();
                const api=director.root?.device.gfxAPI;
                if(api!==undefined&&api!==gfx.API.WEBGL)texture.setMipFilter(Texture2D.Filter.LINEAR);
                texture.image=image;
                const f=new SpriteFrame();f.name=key;f.texture=texture;
                // Full original canvas: atlas trimming cannot shift individual parts.
                f.rect=new Rect(0,0,texture.width,texture.height);f.originalSize=new Size(texture.width,texture.height);f.offset=new Vec2();
                this.frames.set(key,f);resolve();
            });
        }))).then(()=>undefined);
        return this.task;
    }
    static create(parent:Node,r:number){
        if(!this.enabled||this.frames.size!==parts.length)return false;
        this.rigs.set(parent,new LevelOneVisual(parent,r));return true;
    }
    static of(parent:Node){return this.rigs.get(parent);}
    state:State='wait'; firstContact=false; stableTime=0; age=0; clock=0;
    blinkAt=0; blinkAge=-1; eye='half'; contactCount=0;
    quietTime=0; stretchAt=0; stretchCount=0;
    private phase=Math.random()*Math.PI*2;
    private fallAge=0; private contactFrom=1;
    private contactRoll=0; private previousBodyAngle=0;
    private lightAge=Infinity;
    private limbs:Node[]=[]; private eyes:Node[][]=[];
    private sx=1;private sy=1;private angle=0;
    private constructor(readonly art:Node,readonly r:number){
        const picture=node('CatPicture',art);picture.setScale(C.skin,C.skin,1);
        const canvas=node('LevelOneRig',picture);canvas.setScale(r/C.bodyRadius,r/C.bodyRadius,1);
        for(const key of ['body','paw_left_back','paw_right_back','paw_left_front','paw_right_front','mouth_normal']){
            const p=this.part(canvas,key,C.pivots[key]);
            if(key.startsWith('paw'))this.limbs.push(p);
        }
        for(const side of ['left','right']){
            this.eyes.push(['open','half','closed'].map(state=>this.part(canvas,`eye_${side}_${state}`,C.pivots[`eye_${side}`])));
        }
        this.resetBlink();this.resetStretch();this.advance(0,0);
    }
    private part(parent:Node,key:string,pivot:number[]){
        const p=node(key,parent);p.setPosition(pivot[0]-C.center[0],C.center[1]-pivot[1]);
        const image=node(`Sprite-${key}`,p);image.setPosition(256-pivot[0],pivot[1]-256);
        image.getComponent(UITransform)!.setContentSize(512,512);
        const sprite=image.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=LevelOneVisual.frames.get(key)!;
        return p;
    }
    private resetBlink(){this.blinkAt=C.blinkMin+Math.random()*(C.blinkMax-C.blinkMin);this.blinkAge=-1;}
    private resetStretch(){this.quietTime=0;this.stretchAt=C.stretchMin+Math.random()*(C.stretchMax-C.stretchMin);}
    fall(){this.state='fall';this.age=0;this.fallAge=0;this.firstContact=false;this.contactCount=0;this.stableTime=0;this.lightAge=Infinity;this.stretchCount=0;this.resetBlink();this.resetStretch();this.advance(0,0);}
    contact(bodyAngle:number){
        if(this.firstContact||this.state==='stopped')return;
        this.firstContact=true;this.contactCount++;this.state='contact';this.age=0;
        this.contactFrom=smooth(this.fallAge/C.poseBlend);this.lightAge=Infinity;
        this.contactRoll=wrap(bodyAngle);this.previousBodyAngle=bodyAngle;
    }
    interrupt(){
        if(this.state==='stopped')return;
        this.stableTime=0;this.resetStretch();
        if(this.state==='idle'||this.state==='stretch'){this.state='round';this.age=0;this.resetBlink();}
    }
    /** New contact, including a gentle one, restarts the no-collision rest interval. */
    touch(){if(this.firstContact)this.interrupt();}
    impact(){if(this.firstContact&&this.state!=='contact'&&this.state!=='stopped'){this.interrupt();this.lightAge=0;}}
    motion(dt:number,speed:number,angular:number,supported:boolean,shaking:boolean){
        if(this.state==='stopped'||!this.firstContact)return;
        if(shaking||!supported||speed>C.wakeLinear||Math.abs(angular)>C.wakeAngular){this.interrupt();return;}
        if(this.state==='contact')return;
        if(supported&&speed<C.stableLinear&&Math.abs(angular)<C.stableAngular){
            this.stableTime+=dt;
            if(this.stableTime>=C.stableDuration&&this.state!=='idle'&&this.state!=='stretch'){this.state='idle';this.age=0;this.resetBlink();}
            if(this.state==='idle'||this.state==='stretch')this.quietTime+=dt;
        }else {
            this.quietTime=0;
            if(this.state==='stretch')this.interrupt();
            else if(this.state!=='idle')this.stableTime=0;
        }
    }
    stop(){this.state='stopped';this.blinkAge=-1;}
    advance(dt:number,bodyAngle:number){
        if(this.state==='stopped'||!isValid(this.art,true))return;
        this.age+=dt;this.clock+=dt;this.lightAge+=dt;
        if(this.state==='fall')this.fallAge+=dt;
        if(this.state==='contact'&&this.age>=C.contactDuration){this.state='round';this.age=0;}
        // Exclusive pose owner: finish a blink first; no breath/blink/jelly amplification.
        if(dt>0&&this.state==='idle'&&this.quietTime>=this.stretchAt&&this.blinkAge<0){this.state='stretch';this.age=0;this.stretchCount++;}
        if(this.state==='stretch'&&this.age>=C.stretchDuration){this.state='idle';this.age=0;this.resetStretch();this.resetBlink();}
        let sx=1,sy=1,eye='closed',front=[[0,0,0],[0,0,0]],back=[[0,0,0],[0,0,0]];
        this.angle=bodyAngle;
        if(this.state==='wait'){
            sx=C.waitScale[0];sy=C.waitScale[1];front=C.frontWait;back=C.backWait;eye='half';this.angle=0;
        }else if(this.state==='fall'){
            const t=smooth(this.fallAge/C.poseBlend);
            sx=mix(C.waitScale[0],C.fallScale[0],t);sy=mix(C.waitScale[1],C.fallScale[1],t);
            front=C.frontWait.map((a,i)=>a.map((v,j)=>mix(v,C.frontFall[i][j],t)));
            back=C.backWait.map((a,i)=>a.map((v,j)=>mix(v,C.backFall[i][j],t)));eye='open';this.angle=0;
        }else if(this.state==='contact'){
            this.contactRoll+=wrap(bodyAngle-this.previousBodyAngle);this.previousBodyAngle=bodyAngle;
            const t=this.age/C.contactDuration;
            const startX=mix(C.waitScale[0],C.fallScale[0],this.contactFrom),startY=mix(C.waitScale[1],C.fallScale[1],this.contactFrom);
            if(t<.28){const p=smooth(t/.28);sx=mix(startX,C.contactScale[0],p);sy=mix(startY,C.contactScale[1],p);}
            else if(t<.65){const p=smooth((t-.28)/.37);sx=mix(C.contactScale[0],1-C.rebound,p);sy=mix(C.contactScale[1],1+C.rebound,p);}
            else {const p=smooth((t-.65)/.35);sx=mix(1-C.rebound,1,p);sy=mix(1+C.rebound,1,p);}
            const retract=smooth(t/.55);
            front=C.frontFall.map(a=>a.map(v=>v*(1-retract)));back=C.backFall.map(a=>a.map(v=>v*(1-retract)));
            this.angle=this.contactRoll*smooth(t);
        }else if(this.state==='stretch'){
            const t=this.age/C.stretchDuration;
            const reach=t<.45?smooth(t/.45):t<.6?1:1-smooth((t-.6)/.4);
            sx=mix(1,C.stretchScale[0],reach);sy=mix(1,C.stretchScale[1],reach);
            front=C.frontStretch.map(a=>a.map(v=>v*reach));back=C.backStretch.map(a=>a.map(v=>v*reach));
        }
        if(this.state==='wait'||this.state==='idle'){
            // Subtract initial phase so entering idle never jumps to a different breath scale.
            const breath=(Math.sin(this.age*Math.PI*2/C.breathPeriod+this.phase)-Math.sin(this.phase))*.5;
            sx*=1+C.breathX*breath;sy*=1+C.breathY*breath;
        }
        if(this.state==='idle'){
            this.blinkAt-=dt;
            if(this.blinkAge<0&&this.blinkAt<=0)this.blinkAge=0;
            if(this.blinkAge>=0){
                this.blinkAge+=dt;const t=this.blinkAge/C.blinkDuration;
                // Artwork rests closed: briefly half-open, micro-open, half, then closed.
                eye=t<.22?'half':t<.58?'open':t<.82?'half':'closed';
                if(t>=1)this.resetBlink();
            }
        }
        if(this.state==='round'&&this.lightAge<C.lightDuration){const t=this.lightAge/C.lightDuration,s=C.lightImpact*Math.sin(t*Math.PI*2)*(1-t);sx*=1+s;sy*=1-s;}
        this.sx=sx;this.sy=sy;this.eye=eye;
        this.limbs.forEach((p,i)=>{
            const v=(i<2?back:front)[i%2],base=C.pivots[p.name];
            p.setPosition(base[0]-C.center[0]+v[0],C.center[1]-base[1]-v[1]);p.angle=-v[2];
        });
        this.eyes.forEach(states=>states.forEach((n,i)=>n.active=['open','half','closed'][i]===eye));
    }
    get pose(){return {sx:this.sx,sy:this.sy,angle:this.angle};}
    preview(dt:number){this.advance(dt,0);this.art.setScale(this.sx,this.sy,1);this.art.angle=0;}
    dispose(){this.stop();LevelOneVisual.rigs.delete(this.art);this.limbs=[];this.eyes=[];}
}
