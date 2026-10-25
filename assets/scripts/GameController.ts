import { _decorator, BoxCollider2D, Collider2D, Component, ERigidBody2DType, game, Game,
    IPhysics2DContact, isValid, Node, PhysicsSystem2D, profiler, ResolutionPolicy, RigidBody2D, Vec2, view } from 'cc';
import { DEBUG } from 'cc/env';
import { CatEntity } from './CatEntity';
import { CONFIG, clampX, DANGER_Y, radius, SPAWN_Y, TOP } from './GameConfig';
import { DropInput } from './DropInput';
import { GameView, text, uiNode } from './GameView';
import { ArtAssets } from './ArtAssets';
import { MergeSystem } from './MergeSystem';
import { Session } from './Rules';
import { ShakeController } from './ShakeController';
import { HomeRecord, HomeView } from './HomeView';
import { WinView } from './WinView';
import { GameAudio } from './GameAudio';
import { LevelOneVisual } from './LevelOneVisual';
const { ccclass, property } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
    @property({ tooltip: '显示真实物理圆心、圆形碰撞轮廓和箱内边界（默认关闭）' })
    showCollisionOutlines = false;
    @property({ tooltip: '开发验证：1级猫分层动画；发布版本默认启用。也可用 ?catAnim=0 对照旧版' })
    enableLevelOneAnimation = true;
    session = new Session();
    cats = new Map<number, CatEntity>();
    shake = new ShakeController();
    private mergeSystem = new MergeSystem();
    private colliders = new Map<Collider2D, CatEntity>();
    private ui!: GameView; private controls!: DropInput;
    private nextId = 1; private accumulator = 0; private committing = false;
    private celebration = 0; private resultShown = false; private hidden = false;
    private foregroundBlocked = false;
    private oldAuto = true; private walls: Node[] = [];
    private backgroundDuringLoad = false;
    private shuttingDown = false;
    private loadingNode: Node | null = null;
    private home!: HomeView;
    private atHome = true;
    private homeRecord = new HomeRecord();
    private win: WinView | null = null;
    private fail: WinView | null = null;
    private wonNewRecord = false;
    private audio!: GameAudio;
    private impacts = new Map<string,{ids:number[];level:number;speed:number;kind:'land'|'bump'}>();

    async start() {
        view.setDesignResolutionSize(CONFIG.designWidth, CONFIG.designHeight, ResolutionPolicy.SHOW_ALL);
        profiler.hideStats();
        const physics = PhysicsSystem2D.instance;
        this.oldAuto = physics.autoSimulation; physics.enable = true; physics.autoSimulation = false;
        physics.fixedTimeStep = CONFIG.fixedStep;
        physics.gravity = new Vec2(0, CONFIG.width * CONFIG.gravityRatio);
        physics.velocityIterations = CONFIG.velocityIterations; physics.positionIterations = CONFIG.positionIterations;
        game.on(Game.EVENT_HIDE, this.onHide, this); game.on(Game.EVENT_SHOW, this.onShow, this);
        const loading = text(this.node, '正在整理小猫…', 0, 0, 26);
        this.loadingNode = loading.node;
        this.audio = new GameAudio(this.node); this.audio.setMuted(this.homeRecord.muted);
        this.audio.setMusicMuted(this.homeRecord.musicMuted);
        if(DEBUG){
            const query=typeof window!=='undefined'?new URLSearchParams(window.location.search):null;
            LevelOneVisual.enabled=query?.has('catAnim')?query.get('catAnim')!=='0':this.enableLevelOneAnimation;
        }
        await Promise.all([ArtAssets.load(),LevelOneVisual.load(),this.audio.load()]);
        if (this.shuttingDown || !isValid(this, true) || !isValid(this.node, true)) return;
        if (isValid(this.loadingNode, true)) this.loadingNode.destroy();
        this.loadingNode = null;
        this.ui = new GameView(this.node, () => this.pause(), () => this.useShake(),kind=>this.audio.ui(kind));
        this.createWalls();
        this.controls = new DropInput(this.ui, () => this.session.current, () => this.canDrop(), x => this.drop(x));
        if (DEBUG && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('colliders') === '1') {
            this.showCollisionOutlines = true;
        }
        this.setCollisionOutlines(this.showCollisionOutlines);
        this.ui.refresh(this.session, this.shake);
        this.home = new HomeView(this.node, this.homeRecord, () => this.restart(), muted=>this.audio.setMuted(muted),muted=>this.audio.setMusicMuted(muted),kind=>this.audio.ui(kind));
        this.ui.setVisible(false);
        this.audio.home();
        // Dev-only test seam. No UI cheats or test hooks in release builds.
        if (DEBUG && typeof window !== 'undefined') {
            (window as any).__catGame = this;
            if(new URLSearchParams(window.location.search).get('catTest')==='1')this.singleCatTest();
        }
    }
    private createWalls() {
        const t = CONFIG.wallThickness;
        // No ceiling: side walls extend beyond visible UI so high merges cannot roll over their ends.
        const wallTop = CONFIG.designHeight / 2 + radius(8) + t;
        const h = wallTop - CONFIG.bottom;
        const make = (name: string, x: number, y: number, w: number, height: number) => {
            const n = uiNode(name, this.node, x, y, w, height); n.active = false;
            const body = n.addComponent(RigidBody2D); body.type = ERigidBody2DType.Static;
            const c = n.addComponent(BoxCollider2D); c.size.set(w, height); c.friction = CONFIG.friction;
            c.restitution = CONFIG.restitution; n.active = true; this.walls.push(n);
        };
        make('WallLeft', -CONFIG.width / 2 - t / 2, CONFIG.bottom + h / 2, t, h);
        make('WallRight', CONFIG.width / 2 + t / 2, CONFIG.bottom + h / 2, t, h);
        make('Floor', 0, CONFIG.bottom - t / 2, CONFIG.width + 2 * t, t);
    }
    canDrop() { return !this.shuttingDown && !this.atHome && !!this.ui && this.session.state === 'playing' && !this.hidden && !this.shake.active && !this.committing
        && this.session.time + 1e-8 >= this.session.dropReady; }
    drop(requestedX: number): boolean {
        if (!this.canDrop()) return false;
        const level = this.session.current, r = radius(level), x = clampX(requestedX, r);
        for (const c of this.cats.values()) if (!c.locked && Math.hypot(c.x - x, c.y - SPAWN_Y) < c.r + r + 1) {
            this.ui.message('这里有点挤，换个位置试试', this.session.time); return false;
        }
        // Input has no Y argument: every released cat starts at this one fixed parent-local height.
        const cat = this.spawn(level, x, SPAWN_Y);
        cat.body.linearVelocity = new Vec2(0, 0);
        this.session.acceptDrop();
        this.audio.release();
        this.ui.showGuide(x, this.session.current);
        this.ui.refresh(this.session, this.shake); return true;
    }
    private spawn(level: number, x: number, y: number): CatEntity {
        const cat = new CatEntity(this.ui.cats, this.nextId++, level, x, y, this.session.time,
            (self, other, contact) => this.contactBegin(self, other, contact), (self, other) => this.contactEnd(self, other));
        this.cats.set(cat.id, cat); this.colliders.set(cat.collider, cat); return cat;
    }
    private contactBegin(self: CatEntity, other: Collider2D, contact?: IPhysics2DContact) {
        const peer = this.colliders.get(other);
        if (contact && !self.locked) {
            const n = contact.getWorldManifold().normal;
            const sign = contact.colliderA === self.collider ? 1 : -1;
            const nx = n.x * sign, ny = n.y * sign;
            const closing = ((self.incomingX - (peer?.incomingX || 0)) * nx
                + (self.incomingY - (peer?.incomingY || 0)) * ny) * CONFIG.pixelsPerMetre;
            self.contactVisual(other,other.node.name==='Floor'||!!peer&&ny<-.35&&peer.y<self.y,closing);
            const animated = self.impact(closing, nx, ny, this.session.time);
            // A merge contact owns the feedback. Defer other impacts until the step's merges commit.
            if (animated && !(peer && peer.level === self.level && self.level < 8)) {
                const ids=peer?[Math.min(self.id,peer.id),Math.max(self.id,peer.id)]:[self.id];
                const key=ids.join(':'); const previous=this.impacts.get(key);
                const kind=other.node.name==='Floor'||(peer&&Math.abs(ny)>.65)?'land':'bump';
                if(!previous || closing>previous.speed)this.impacts.set(key,{ids,level:Math.max(self.level,peer?.level||0),speed:closing,kind});
            }
        }
        if (peer && !peer.locked && !self.locked) {
            // Only contact involving the interior counts; wall contact alone never arms danger.
            if (self.y - self.r <= TOP || peer.y - peer.r <= TOP) { self.touched = true; peer.touched = true; }
            this.mergeSystem.begin(self.id, peer.id);
        } else if (other.node.name === 'Floor') self.touched = true;
    }
    private contactEnd(self: CatEntity, other: Collider2D) {
        self.endContactVisual(other);
        const peer = this.colliders.get(other); if (peer) this.mergeSystem.end(self.id, peer.id);
    }
    private remove(cat: CatEntity) {
        this.audio?.forget(cat.id);
        this.mergeSystem.remove(cat.id); this.colliders.delete(cat.collider); this.cats.delete(cat.id); cat.dispose();
    }
    useShake(): boolean {
        if (this.shuttingDown || this.atHome || !this.ui) return false;
        const s = this.session;
        if (!this.shake.start(s.time, s.state === 'playing' && !this.hidden && !this.committing && s.time + 1e-8 >= s.dropReady)) return false;
        this.audio.startShake();
        s.breakChain(); this.controls.cancel(); this.ui.refresh(s, this.shake); return true;
    }
    update(dt: number) {
        if(this.shuttingDown||this.hidden)return;
        this.audio?.tick(Math.min(dt,.1));
        if (this.atHome || !this.ui || this.foregroundBlocked) return;
        const s = this.session;
        if (s.state === 'won' && !this.resultShown) {
            this.celebration += Math.min(dt, .1);
            if (this.celebration >= CONFIG.celebration) this.showResult();
        }
        if (this.win) { this.win.animate(dt); return; }
        if (this.fail) { this.fail.animate(dt); return; }
        if (s.state === 'playing') {
            this.accumulator += Math.min(dt, CONFIG.fixedStep * CONFIG.maxSubSteps);
            let steps = 0;
            while (this.accumulator + 1e-8 >= CONFIG.fixedStep && steps++ < CONFIG.maxSubSteps && s.state === 'playing') {
                this.accumulator -= CONFIG.fixedStep; this.fixedTick(CONFIG.fixedStep);
            }
        }
        const visualDt=s.state==='playing'||s.state==='won'?Math.min(dt,.1):0;
        this.ui.effects.tick(visualDt);
        this.ui.animatePreviews(s.state==='playing'?visualDt:0);
        for (const cat of this.cats.values()) cat.animate(s.time, this.shake.visualX,visualDt);
        this.ui.refresh(s, this.shake);
        this.ui.setCollisionOutlines(this.showCollisionOutlines);
        this.ui.refreshCollisionOutlines(this.cats.values());
    }
    setCollisionOutlines(enabled: boolean) {
        this.showCollisionOutlines = enabled;
        this.ui?.setCollisionOutlines(enabled); this.ui?.refreshCollisionOutlines(this.cats.values());
    }
    private fixedTick(dt: number) {
        this.impacts.clear();
        const s = this.session; s.time += dt;
        this.shake.tick(dt, s.time, (id, dv) => {
            const c = this.cats.get(id); if (!c) return;
            const v = c.body.linearVelocity;
            c.body.wakeUp(); c.body.linearVelocity = new Vec2(v.x + dv / CONFIG.pixelsPerMetre, v.y);
        }, Array.from(this.cats.keys()));
        for (const cat of this.cats.values()) {
            cat.constrainToBox(); cat.limitVelocity(); cat.captureMotion();
        }
        // Use public world sync API around explicit fixed steps. No body mutation in contact callbacks.
        const p = PhysicsSystem2D.instance;
        p.physicsWorld.syncSceneToPhysics(); p.step(dt); p.physicsWorld.syncPhysicsToScene();
        for (const cat of this.cats.values()) { cat.constrainToBox(); cat.limitVelocity(); }
        this.commitMerges();
        for(const cat of this.cats.values())cat.updateVisualState(dt,this.shake.active);
        if(s.state==='playing')for(const hit of Array.from(this.impacts.values()).sort((a,b)=>b.speed-a.speed)) {
            if(hit.ids.every(id=>this.cats.has(id))) {
                if(hit.kind==='land')this.audio.land(hit.level,hit.speed,hit.ids);else this.audio.bump(hit.speed,hit.ids);
            }
        }
        this.impacts.clear();
        // All merge transactions (and level-8 victory) precede danger in this exact physical step.
        if (s.state !== 'playing') return;
        let danger = false;
        for (const c of this.cats.values()) {
            if (c.touched && s.time + 1e-8 >= c.protectionUntil && c.y + c.r > DANGER_Y) { danger = true; break; }
        }
        if (s.updateDanger(danger, dt)) this.finish('lost');
        else this.audio.danger(danger?s.danger:0);
    }
    private commitMerges() {
        this.committing = true;
        try {
            for (const [a, b] of this.mergeSystem.pairs(this.cats, this.session.time)) {
                if (this.session.state !== 'playing' || a.locked || b.locked || !this.cats.has(a.id) || !this.cats.has(b.id)) continue;
                a.locked = b.locked = true;
                const position = this.mergeSystem.position(a, b, this.cats.values());
                const protection = Math.min(a.protectionUntil, b.protectionUntil);
                const touched = a.touched || b.touched;
                const va = a.body.linearVelocity, vb = b.body.linearVelocity;
                const level = a.level + 1;
                a.stopOwnAnimation();b.stopOwnAnimation();
                this.ui.effects.gather([a,b],position.x,position.y);
                this.remove(a); this.remove(b);
                const product = this.spawn(level, position.x, position.y);
                product.protectionUntil = protection; product.touched = touched;
                product.mergeAt = this.session.time + CONFIG.mergeProtection;
                // Conservative inherited velocity; no explosive outward merge impulse.
                product.body.linearVelocity = new Vec2((va.x + vb.x) * .25, Math.min(0, (va.y + vb.y) * .25));
                product.limitVelocity(); product.pop(this.session.time);
                this.session.merge(level);
                this.ui.effects.chain(product,this.session.chain);
                if (level === 8) this.finish('won');
                else this.audio.merge(level,this.session.chain);
            }
        } finally { this.committing = false; }
    }
    pause() {
        if (this.atHome || this.session.state !== 'playing') return;
        this.session.state = 'paused'; this.accumulator = 0; this.controls.cancel();
        this.audio.suspend(); this.impacts.clear();
        this.ui.modal('休息一下', '物理与所有局内计时已暂停', [['继续装猫', () => this.resume()], ['重新开始', () => this.restart()], ['返回首页', () => this.returnHome()]]);
    }
    /** Developer-only console/URL entry, never a release button. Uses real drop/physics. */
    singleCatTest(){
        if(!DEBUG)return;
        this.restart();this.session.current=1;this.session.next=1;this.ui.refresh(this.session,this.shake);
    }
    setLevelOneAnimation(enabled:boolean){
        if(!DEBUG)return;
        LevelOneVisual.enabled=enabled;this.enableLevelOneAnimation=enabled;
        for(const cat of this.cats.values())if(cat.level===1)cat.rebuildVisual();
        this.ui.resetCatPreviews();this.ui.refresh(this.session,this.shake);
    }
    resume() {
        if (this.hidden || this.session.state !== 'paused') return;
        this.session.state = 'playing'; this.accumulator = 0; this.ui.closeModal();
        this.audio.resume();
    }
    private onHide() {
        this.audio?.hide();
        if (!this.ui) { this.hidden = true; this.backgroundDuringLoad = true; return; }
        this.pause(); this.hidden = true; this.controls.cancel();
    }
    private onShow() {
        this.hidden = false;
        this.audio?.show();
        if (!this.ui) return;
        if (this.win) { this.win.requireContinue(); return; }
        if (this.fail) { this.fail.requireContinue(); return; }
        if (this.session.state === 'won' && !this.resultShown) {
            this.foregroundBlocked = true;
            this.ui.modal('已暂停', '点击继续查看通关结果', [['继续', () => {
                this.foregroundBlocked = false; this.ui.closeModal();
                this.audio.resume();
            }]]);
        }
        /* Playing sessions stay paused until the player explicitly presses continue. */
    }
    private finish(result: 'won' | 'lost') {
        if (!this.session.settle(result)) return;
        this.wonNewRecord = result === 'won' && this.session.score > this.homeRecord.best;
        this.homeRecord.record(this.session.score);
        this.controls.cancel(); this.shake.stop(); this.accumulator = 0;
        for(const cat of this.cats.values())cat.stopOwnAnimation();
        this.audio.result(result==='won');
        if (result === 'won') {
            this.celebration = 0;
            this.ui.message('镇箱大橘，接回家啦！', this.session.time);
        } else this.showResult();
    }
    private showResult() {
        if (this.resultShown) return; this.resultShown = true;
        const s = this.session;
        if (s.state === 'won') {
            this.ui.setVisible(false);
            this.win = new WinView(this.node,s.score,this.homeRecord.best,this.wonNewRecord,()=>this.restart(),()=>this.returnHome(),'won',kind=>this.audio.ui(kind),()=>this.audio.resume());
            return;
        }
        this.ui.setVisible(false);
        this.fail = new WinView(this.node,s.score,this.homeRecord.best,false,()=>this.restart(),()=>this.returnHome(),'lost',kind=>this.audio.ui(kind),()=>this.audio.resume());
    }
    returnHome() {
        if (this.shuttingDown || !this.home) return;
        this.restart(); this.atHome = true; this.accumulator = 0;
        this.ui.setVisible(false); this.home.show();
        this.audio.home(); this.impacts.clear();
    }
    restart() {
        if (this.shuttingDown || !this.ui) return;
        this.audio.reset(); this.impacts.clear();
        this.win?.dispose(); this.win = null; this.wonNewRecord = false;
        this.fail?.dispose(); this.fail = null;
        this.homeRecord.record(this.session.score);
        this.atHome = false; this.home?.hide(); this.ui.setVisible(true);
        this.controls.cancel(); this.shake.stop();
        for (const c of Array.from(this.cats.values())) this.remove(c);
        this.mergeSystem.clear(); this.colliders.clear();
        this.session = new Session(); this.shake = new ShakeController(); this.nextId = 1;
        this.accumulator = 0; this.committing = false; this.celebration = 0; this.resultShown = false; this.foregroundBlocked = false;
        this.ui.reset(); this.ui.refresh(this.session, this.shake);
        if (this.hidden) this.pause();
    }
    onDestroy() {
        if (this.shuttingDown) return;
        this.shuttingDown = true;
        game.off(Game.EVENT_HIDE, this.onHide, this); game.off(Game.EVENT_SHOW, this.onShow, this);
        this.controls?.dispose();
        this.audio?.dispose(); this.impacts.clear();
        for (const c of Array.from(this.cats.values())) this.remove(c);
        this.mergeSystem.clear(); this.shake.stop();
        for (const wall of this.walls) if (isValid(wall, true)) wall.destroy();
        this.walls.length = 0;
        this.ui?.dispose();
        this.win?.dispose(); this.win = null;
        this.fail?.dispose(); this.fail = null;
        this.home?.dispose();
        if (isValid(this.loadingNode, true)) this.loadingNode.destroy();
        this.loadingNode = null;
        PhysicsSystem2D.instance.autoSimulation = this.oldAuto;
        if (typeof window !== 'undefined' && (window as any).__catGame === this) delete (window as any).__catGame;
    }
}
