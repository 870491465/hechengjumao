import { BlockInputEvents, Color, EventTouch, Graphics, isValid, Label, LabelOutline, Layers, Mask, Node, UITransform, UIOpacity, Vec3 } from 'cc';
import { clampX, CONFIG, DANGER_Y, INPUT_TOP, radius, SPAWN_Y, TOP } from './GameConfig';
import { Session } from './Rules';
import { ShakeController } from './ShakeController';
import { ART, ArtAssets } from './ArtAssets';
import { MergeEffects } from './MergeEffects';
import { UiSound } from './AudioConfig';

export function uiNode(name: string, parent: Node, x = 0, y = 0, w = 1, h = 1): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; n.setParent(parent); n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(w, h); return n;
}
export function text(parent: Node, value: string, x: number, y: number, size = 24, w = 650, h = 50): Label {
    const n = uiNode('Text', parent, x, y, w, h); const l = n.addComponent(Label);
    l.string = value; l.fontSize = size; l.lineHeight = size + 8; l.color = new Color('#443B36');
    l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
}
export function panel(n: Node, w: number, h: number, color: string, rounded = 16): Graphics {
    const g = n.addComponent(Graphics); g.fillColor = new Color(color);
    g.roundRect(-w / 2, -h / 2, w, h, rounded); g.fill(); return g;
}
export function ball(parent: Node, level: number, r: number): Node {
    // Only this child is animated; never scale its rigid-body parent.
    const n = uiNode('CatArtwork', parent, 0, 0, r * 2, r * 2);
    if (ArtAssets.cat(n, level, r)) return n;
    const g = n.addComponent(Graphics); g.fillColor = new Color(CONFIG.colors[level]);
    g.circle(0, 0, r); g.fill(); g.strokeColor = new Color('#6C5545'); g.lineWidth = 2; g.stroke();
    g.fillColor = new Color(255, 255, 255, 105);
    g.ellipse(-r * .28, r * .35, r * .25, r * .13); g.fill();
    text(n, `${level}`, 0, 0, Math.min(48, r), r * 2, r * 2); return n;
}
function outlined(label: Label, width = 3) {
    label.isBold = true; label.color = new Color('#FFE2A5');
    const o = label.node.addComponent(LabelOutline); o.color = new Color('#663619'); o.width = width;
}
function card(parent: Node, name: string, x: number, y: number, w: number, h: number) {
    const n = uiNode(name, parent, x, y, w, h), g = n.addComponent(Graphics);
    g.fillColor = new Color('#80502B28'); g.roundRect(-w/2,-h/2-4,w,h,20); g.fill();
    g.fillColor = new Color('#FFF0D8F4'); g.strokeColor = new Color('#C69A70'); g.lineWidth = 2;
    g.roundRect(-w/2,-h/2,w,h,20); g.fill(); g.stroke();
    g.strokeColor = new Color('#FFFCED'); g.roundRect(-w/2+3,-h/2+3,w-6,h-6,17); g.stroke(); return n;
}
function paw(parent: Node, x: number, y: number, scale: number) {
    const n = uiNode('Paw',parent,x,y,40,40); n.setScale(scale,scale,1);
    const g = n.addComponent(Graphics); g.fillColor = new Color('#B98159');
    g.ellipse(0,-3,10,8); g.fill();
    for (const [px,py] of [[-12,7],[-5,15],[5,15],[12,7]]) { g.ellipse(px,py,4,5); g.fill(); }
    return n;
}
export class GameView {
    readonly box: Node; readonly front: Node; readonly cats: Node; readonly inputArea: Node;
    readonly hud: Node; readonly debugLayer: Node;
    readonly guide: Node; readonly overlay: Node;
    private score: Label; private preview: Node; private previewKey = '';
    private shakeLabel: Label; private dangerLabel: Label;
    readonly effects: MergeEffects;
    private hint: Label; private hintUntil = 0; private dangerGraphics: Graphics;
    private pauseButton: Node; private shakeButton: Node; private guideBall: Node | null = null;
    private aimX = 0; private waitingLabel: Label;
    private scoreDetail: Label; private shakeCount: Label; private shakeStatus: Label;
    private aimGraphics: Graphics; private footerPaws: Node[];
    private ownedNodes: Node[] = [];
    constructor(readonly root: Node, onPause: () => void, onShake: () => void,private onUi:(kind:UiSound)=>void=()=>{}) {
        // Explicit render order: room -> box back -> cats/waiting -> front rim -> debug -> HUD.
        const room = uiNode('RoomBackground', root);
        if (!ArtAssets.background(room)) panel(uiNode('Background', room, 0, 0, 720, 1280), 720, 1280, '#F4EDE2', 0);
        this.box = uiNode('BoxBackLayer', root);
        if (!ArtAssets.box(this.box)) {
            const g = this.box.addComponent(Graphics);
            g.fillColor = new Color('#E9D8BC'); g.rect(-300, CONFIG.bottom, 600, TOP - CONFIG.bottom); g.fill();
            g.strokeColor = new Color('#A38159'); g.lineWidth = CONFIG.wallThickness;
            g.moveTo(-312, TOP); g.lineTo(-312, CONFIG.bottom - 12); g.lineTo(312, CONFIG.bottom - 12); g.lineTo(312, TOP); g.stroke();
        }
        this.cats = uiNode('Cats', root);
        // Clip visual skin/ears to the inner walls and floor; the open mouth and spawn area stay visible.
        // Anchor-relative coordinates remain unchanged for physics and screen-to-local input conversion.
        const catArea=this.cats.getComponent(UITransform)!,clipHeight=CONFIG.designHeight/2-CONFIG.bottom;
        catArea.setContentSize(CONFIG.width,clipHeight);catArea.setAnchorPoint(.5,-CONFIG.bottom/clipHeight);
        this.cats.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        this.guide = uiNode('DropGuide', root); this.guide.active = false;
        this.front = uiNode('BoxFrontLayer', root); ArtAssets.front(this.front);
        this.debugLayer = uiNode('CollisionOutlines', root); this.debugLayer.addComponent(Graphics); this.debugLayer.active = false;
        this.hud = uiNode('HUD', root, 0, 0, CONFIG.designWidth, CONFIG.designHeight);
        this.aimGraphics = uiNode('AimLine',this.hud).addComponent(Graphics);
        const logo = ART.entries.logo;
        if (!ArtAssets.sprite(this.hud,'logo',176,176*logo.crop[3]/logo.crop[2],-239,608)) {
            outlined(text(this.hud,'猫箱挤挤',-204,609,45,280,60),4);
        }
        const sc = card(this.hud,'ScoreCard',-203,522,248,104);
        text(sc,'本局得分',0,29,22,220,30).isBold = true;
        this.score = text(sc,'0',0,-5,49,220,58); this.score.isBold = true; this.score.color = new Color('#59290F');
        this.scoreDetail = text(sc,'最高连锁 0',0,-38,16,220,24); this.scoreDetail.color = new Color('#AC8057');
        const goal = card(this.hud,'GoalCard',-203,442,248,40);
        text(goal,'目标：镇箱大橘',-18,0,19,200,32).isBold = true;
        const target = uiNode('TargetLevel',goal,103,0,30,30); ball(target,8,16);
        this.pauseButton = this.button(this.hud,'',307,603,64,64,onPause);
        const pg = this.pauseButton.getComponent(Graphics)!; pg.clear();
        pg.fillColor = new Color('#FFF0D5'); pg.strokeColor = new Color('#794723'); pg.lineWidth = 3;
        pg.circle(0,0,30); pg.fill(); pg.stroke();
        pg.strokeColor = new Color('#FFFCED'); pg.lineWidth = 2; pg.circle(0,0,26); pg.stroke();
        pg.fillColor = new Color('#85532B'); pg.roundRect(-11,-12,7,24,3); pg.roundRect(4,-12,7,24,3); pg.fill();
        const nc = card(this.hud,'NextCard',257,492,146,136);
        text(nc,'下一只',0,44,24,138,36).isBold = true;
        this.preview = uiNode('Previews',this.hud);
        this.waitingLabel = text(this.hud,'',40,437,16,180,28);
        this.inputArea = uiNode('DropInput', this.hud, 0, (INPUT_TOP + CONFIG.bottom) / 2, CONFIG.width, INPUT_TOP - CONFIG.bottom);
        this.inputArea.addComponent(BlockInputEvents);
        const d = uiNode('DangerLine', this.hud); this.dangerGraphics = d.addComponent(Graphics);
        const dangerMarker = text(this.hud, '危险线', -251, DANGER_Y + 20, 17, 90, 26);
        dangerMarker.isBold = true; dangerMarker.color = new Color('#85431E');
        const markerOutline = dangerMarker.node.addComponent(LabelOutline);
        markerOutline.color = new Color('#FFF0CF'); markerOutline.width = 2;
        this.dangerLabel = text(this.hud, '', 0, TOP + 28, 23, 600, 42);
        this.shakeButton = this.button(this.hud, '晃一晃', 0, -550, 380, 111, onShake, true);
        this.shakeLabel = this.shakeButton.getChildByName('Text')!.getComponent(Label)!;
        this.shakeLabel.fontSize = 44; this.shakeLabel.lineHeight = 54;
        this.shakeLabel.node.setPosition(40,5); this.shakeLabel.node.getComponent(UITransform)!.setContentSize(230,70); outlined(this.shakeLabel,4);
        this.shakeStatus = text(this.shakeButton,'',40,-33,16,240,24);
        const icon = uiNode('ShakeBoxIcon',this.shakeButton,-109,3,90,80), ig = icon.addComponent(Graphics);
        ig.lineWidth = 3; ig.strokeColor = new Color('#78401A'); ig.fillColor = new Color('#FFD591');
        ig.moveTo(-28,12); ig.lineTo(0,27); ig.lineTo(28,13); ig.lineTo(0,-2); ig.close(); ig.fill(); ig.stroke();
        ig.fillColor = new Color('#E9A34D'); ig.moveTo(-28,12); ig.lineTo(0,-2); ig.lineTo(0,-32); ig.lineTo(-27,-16); ig.close(); ig.fill(); ig.stroke();
        ig.fillColor = new Color('#F6BB66'); ig.moveTo(0,-2); ig.lineTo(28,13); ig.lineTo(27,-17); ig.lineTo(0,-32); ig.close(); ig.fill(); ig.stroke();
        ig.moveTo(-14,19); ig.lineTo(14,5); ig.lineTo(14,-11); ig.stroke();
        for (const d of [-1,1]) { ig.moveTo(d*37,12); ig.bezierCurveTo(d*46,5,d*46,-7,d*37,-14); ig.stroke(); }
        const badge = uiNode('RemainingBadge',this.shakeButton,171,42,50,50), bg = badge.addComponent(Graphics);
        bg.fillColor = new Color('#FFF0D2'); bg.strokeColor = new Color('#8B5126'); bg.lineWidth = 3;
        bg.circle(0,0,24); bg.fill(); bg.stroke(); bg.lineWidth = 1; bg.strokeColor = new Color('#FFFFFF'); bg.circle(0,0,20); bg.stroke();
        this.shakeCount = text(badge,'2',0,0,29,44,44); this.shakeCount.isBold = true;
        this.hint = text(this.hud,'挤一挤，大橘有望',0,-625,20,650,28); this.hint.isBold = true; this.hint.color = new Color('#89532E');
        this.footerPaws = [paw(this.hud,-174,-625,.58),paw(this.hud,174,-625,.58)];
        this.effects = new MergeEffects(root,this.hud,this.front);
        this.overlay = uiNode('Modal', this.hud, 0, 0, 720, 1280); this.overlay.addComponent(BlockInputEvents);
        this.overlay.active = false;
        this.ownedNodes = [room, this.box, this.cats, this.guide, this.effects.sources, this.front, this.debugLayer, this.hud];
    }
    button(parent: Node, label: string, x: number, y: number, w: number, h: number, action: () => void, shakeArt = false): Node {
        const n = uiNode('Button', parent, x, y, w, h);
        if (!shakeArt || !ArtAssets.shakeButton(n, w, h)) panel(n, w, h, '#DDC3A0');
        text(n, label, 0, 0, 24, w, h);
        let id: number | null = null;
        n.on(Node.EventType.TOUCH_START, (e: EventTouch) => { e.propagationStopped = true; if (id === null) id = e.getID(); });
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true;
            if (id === e.getID()) { id = null; action(); this.onUi('tap'); } });
        n.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { e.propagationStopped = true; if (id === e.getID()) id = null; });
        return n;
    }
    showGuide(x: number, level: number) {
        this.aimX = clampX(x, radius(level));
        if (!this.guideBall || this.guideBall.name !== String(level)) {
            this.guide.removeAllChildren(); this.guideBall?.destroy();
            this.guideBall = ball(this.guide, level, CONFIG.width * CONFIG.radiusRatios[level]);
            this.guideBall.name = String(level); this.guideBall.addComponent(UIOpacity).opacity = 220;
        }
        // Use the same parent-space spawn point as the real cat, even if the board is translated.
        const world = this.cats.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(this.aimX, SPAWN_Y, 0));
        const local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(world);
        this.guide.setPosition(local); this.guide.active = true;
    }
    message(value: string, now: number) { this.hint.string = value; this.hintUntil = now + 2; }
    refresh(s: Session, shake: ShakeController) {
        this.score.string = `${s.score}`;
        this.scoreDetail.string = `最高连锁 ${s.maxChain}`;
        const playing = s.state === 'playing';
        if (playing) {
            this.showGuide(this.aimX, s.current);
            const ready = !shake.active && s.time + 1e-8 >= s.dropReady;
            this.guideBall!.getComponent(UIOpacity)!.opacity = ready ? 255 : 145;
            this.waitingLabel.string = shake.active ? '晃箱中…' : ready ? '' : '准备中…';
        }
        this.guide.active = playing; this.waitingLabel.node.active = playing;
        const key = `${s.current}:${s.next}`;
        if (key !== this.previewKey) {
            for (const n of this.preview.children.slice()) { n.removeFromParent(); n.destroy(); }
            // The waiting cat is the current preview, matching the actual spawn size and position.
            const next = uiNode('Next', this.preview, 257, 470); ball(next, s.next, 38);
            this.previewKey = key;
        }
        const cooldown = Math.max(0, shake.readyAt - s.time);
        this.shakeCount.string = `${shake.remaining}`;
        this.shakeStatus.string = shake.active ? '晃动中…' : shake.remaining === 0 ? '本局已用完'
            : cooldown > 0 ? `冷却 ${cooldown.toFixed(1)}s` : '';
        const available = s.state === 'playing' && !shake.active && shake.remaining > 0 && cooldown <= 0 && s.time + 1e-8 >= s.dropReady;
        const opacity = this.shakeButton.getComponent(UIOpacity) || this.shakeButton.addComponent(UIOpacity);
        opacity.opacity = available ? 255 : 145;
        this.box.setPosition(shake.visualX, 0);
        this.front.setPosition(shake.visualX, 0);
        const danger = s.danger > 0;
        this.dangerLabel.string = danger ? `空间紧张 · ${(Math.max(0, CONFIG.dangerDuration - s.danger)).toFixed(1)} 秒` : '';
        const g = this.dangerGraphics; g.clear();
        // Opaque outlined dashes remain legible against the textured cardboard at phone scale.
        for (const border of [true, false]) {
            g.lineWidth = border ? 8 : 4;
            g.strokeColor = border ? new Color(danger ? '#8B2D20' : '#98552D')
                : danger ? new Color(255, 104, 80, 210 + Math.round(45 * Math.abs(Math.sin(s.time * 6)))) : new Color('#FFE0A3');
            for (let x = -292; x < 292; x += 32) {
                g.moveTo(x, DANGER_Y); g.lineTo(Math.min(x + 22, 292), DANGER_Y);
            }
            g.stroke();
        }
        if (s.time >= this.hintUntil) this.hint.string = '挤一挤，大橘有望';
        for (const n of this.footerPaws) n.active = s.time >= this.hintUntil;
        const aim = this.aimGraphics; aim.clear();
        if (playing) {
            const start = this.guide.position.y - radius(s.current) - 12, end = TOP - 180;
            for (let y = start; y > end; y -= 18) {
                const fade = (y-end)/(start-end); aim.fillColor = new Color(255,235,196,Math.round(210*fade*fade));
                aim.roundRect(this.guide.position.x-2,y-9,4,9,2); aim.fill();
            }
        }
    }
    modal(title: string, body: string, actions: Array<[string, () => void]>) {
        this.onUi('open');
        for (const n of this.overlay.children.slice()) { n.removeFromParent(); n.destroy(); }
        this.overlay.active = true;
        panel(uiNode('Shade', this.overlay, 0, 0, 720, 1280), 720, 1280, '#6E6257CC', 0);
        const height = actions.length > 2 ? 560 : 450;
        const p = uiNode('Dialog', this.overlay, 0, 20, 620, height); panel(p, 620, height, '#FFF5E6', 28);
        text(p, title, 0, 145, 30, 590, 70); text(p, body, 0, 50, 24, 590, 115);
        actions.forEach(([label, action], i) => this.button(p, label, 0, -65 - i * 85, 400, 65, action));
        this.guide.active = false;
    }
    closeModal() { this.overlay.active = false; }
    setVisible(visible: boolean) { for (const n of this.ownedNodes) n.active = visible; if (visible) this.debugLayer.active = false; }
    setCollisionOutlines(enabled: boolean) { this.debugLayer.active = enabled; }
    refreshCollisionOutlines(cats: Iterable<{ node: Node; r: number }>) {
        if (!this.debugLayer.active) return;
        const g = this.debugLayer.getComponent(Graphics)!; g.clear();
        g.lineWidth = 2; g.strokeColor = new Color('#26AA92');
        g.rect(-CONFIG.width / 2, CONFIG.bottom, CONFIG.width, TOP - CONFIG.bottom); g.stroke();
        const ui = this.root.getComponent(UITransform)!;
        for (const c of cats) {
            const p = ui.convertToNodeSpaceAR(c.node.worldPosition);
            g.circle(p.x, p.y, c.r); g.moveTo(p.x - 3, p.y); g.lineTo(p.x + 3, p.y);
            g.moveTo(p.x, p.y - 3); g.lineTo(p.x, p.y + 3);
        }
        g.stroke();
    }
    reset() { this.effects.clear(); this.hintUntil = 0; this.aimX = 0; this.guide.active = false; this.box.setPosition(0, 0); this.front.setPosition(0, 0); this.closeModal(); }
    dispose() {
        this.effects.dispose();
        const nodes = this.ownedNodes; this.ownedNodes = [];
        for (const node of nodes) if (isValid(node, true)) node.destroy();
    }
}
