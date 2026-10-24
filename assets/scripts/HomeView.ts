import { BlockInputEvents, Color, EventTouch, Graphics, isValid, LabelOutline, Node, ResolutionPolicy, sys, UIOpacity, UITransform, view } from 'cc';
import { ART, ArtAssets } from './ArtAssets';
import { panel, text, uiNode } from './GameView';
import { UiSound } from './AudioConfig';

/** Only the homepage record and sound preference persist; no unfinished game is saved. */
export class HomeRecord {
    best = 0; muted = false; musicMuted = false;
    constructor() {
        try {
            const value = Number(sys.localStorage.getItem('catbox.best.v1'));
            this.best = Number.isSafeInteger(value) && value >= 0 ? value : 0;
            this.muted = sys.localStorage.getItem('catbox.muted.v1') === '1';
            const musicPreference=sys.localStorage.getItem('catbox.musicMuted.v1');
            this.musicMuted=musicPreference===null?this.muted:musicPreference==='1';
            if(musicPreference===null)sys.localStorage.setItem('catbox.musicMuted.v1',this.musicMuted?'1':'0');
        } catch { /* Storage can be unavailable in restricted preview contexts. */ }
    }
    record(score: number) {
        if (score <= this.best) return;
        this.best = score;
        try { sys.localStorage.setItem('catbox.best.v1', String(this.best)); } catch { /* Keep memory record. */ }
    }
    toggleSound() {
        this.muted = !this.muted;
        try { sys.localStorage.setItem('catbox.muted.v1', this.muted ? '1' : '0'); } catch { /* Keep preference. */ }
    }
    toggleMusic() {this.musicMuted=!this.musicMuted;try{sys.localStorage.setItem('catbox.musicMuted.v1',this.musicMuted?'1':'0');}catch{/* Keep preference. */}}
}

export class HomeView {
    readonly node: Node; readonly startButton: Node; readonly helpButton: Node;
    readonly settingsButton: Node; readonly soundButton: Node;
    private score: ReturnType<typeof text>; private modal: Node; private mutedMark: Graphics;
    private background: Node | null;
    private layoutNodes: Array<[Node,number]>;
    constructor(root: Node, readonly record: HomeRecord, start: () => void, private onSound: (muted:boolean)=>void = ()=>{},private onMusic:(muted:boolean)=>void=()=>{},private onUi:(kind:UiSound)=>void=()=>{}) {
        this.node = uiNode('Home', root, 0, 0, 720, 1280); this.node.addComponent(BlockInputEvents);
        // Cover only the background; all transparent illustrations keep their visible-body aspect.
        const spec = ART.entries.homeBackground, scale = Math.max(720/spec.size[0],1280/spec.size[1]);
        this.background = ArtAssets.sprite(this.node,'homeBackground',spec.size[0]*scale,spec.size[1]*scale);
        this.image(this.node,'homeLogo',540,0,415);
        this.image(this.node,'homeHero',840,0,10);
        this.image(this.node,'homeScore',258,0,-273);
        this.score = text(this.node,`最高分 ${record.best}`,0,-273,25,260,42); this.score.isBold = true; this.score.color = new Color('#8C4E24');
        this.startButton = this.button('Start','homeStart',520,0,-386,()=>start());
        const label = text(this.startButton,'开始游戏',0,1,51,480,80); label.isBold = true; label.color = new Color('#FFF1C9');
        const outline = label.node.addComponent(LabelOutline); outline.color = new Color('#B86F32'); outline.width = 2;
        const tagline = text(this.node,'轻点落猫，合成快乐',0,-489,24,500,40); tagline.isBold = true; tagline.color = new Color('#985F33');
        this.helpButton = this.button('Help','homeHelp',174,0,-568,()=>this.help());
        const helpText = text(this.helpButton,'玩法说明',0,0,22,170,40); helpText.isBold = true; helpText.color = new Color('#945C34');
        this.soundButton = this.button('Sound','homeSound',70,-285,574,()=>{record.toggleSound();this.onSound(record.muted);this.refresh();});
        this.mutedMark = uiNode('MutedMark',this.soundButton).addComponent(Graphics);
        this.mutedMark.strokeColor = new Color('#A94F34'); this.mutedMark.lineWidth = 4;
        this.mutedMark.moveTo(-22,-23);this.mutedMark.lineTo(22,23);this.mutedMark.stroke();
        this.settingsButton = this.button('Settings','homeSettings',70,285,574,()=>this.settings());
        this.modal = uiNode('HomeModal',this.node,0,0,720,1280);this.modal.addComponent(BlockInputEvents);this.modal.active=false;
        this.layoutNodes = this.node.children.filter(n=>n!==this.background&&n!==this.modal).map(n=>[n,n.position.y]);
        view.on('canvas-resize',this.layout,this);
        view.on('design-resolution-changed',this.layout,this);
        view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);
        this.layout();
        this.refresh();
    }
    private image(parent: Node, key: string, width: number, x=0,y=0) {
        const spec=ART.entries[key]; return ArtAssets.sprite(parent,key,width,width*spec.crop[3]/spec.crop[2],x,y);
    }
    private button(name: string,key: string,width: number,x: number,y: number,action:()=>void) {
        const spec=ART.entries[key],height=width*spec.crop[3]/spec.crop[2];
        const n=uiNode(name,this.node,x,y,width,height); this.image(n,key,width);
        this.bind(n,action);return n;
    }
    private bind(n: Node,action:()=>void) {
        const opacity=n.addComponent(UIOpacity);let id: number|null=null;
        const reset=()=>{id=null;n.setScale(1,1,1);opacity.opacity=255;};
        n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;if(id!==null)return;id=e.getID();n.setScale(.96,.96,1);opacity.opacity=225;});
        n.on(Node.EventType.TOUCH_CANCEL,(e:EventTouch)=>{e.propagationStopped=true;if(id===e.getID())reset();});
        n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;if(id===e.getID()){reset();action();this.onUi('tap');}});
    }
    refresh() { this.score.string=`最高分 ${this.record.best}`;this.mutedMark.node.active=this.record.muted; }
    show() {this.close();this.refresh();this.node.active=true;view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);this.layout();}
    hide() {this.close();const active=this.node.active;this.node.active=false;if(active)view.setDesignResolutionSize(720,1280,ResolutionPolicy.SHOW_ALL);}
    private layout() {
        if(!this.node.active)return;
        const height=view.getVisibleSize().height, spec=ART.entries.homeBackground;
        this.node.getComponent(UITransform)!.setContentSize(720,height);
        this.modal.getComponent(UITransform)!.setContentSize(720,height);
        const scale=Math.max(720/spec.size[0],height/spec.size[1]);
        this.background?.getComponent(UITransform)!.setContentSize(spec.size[0]*scale,spec.size[1]*scale);
        for(const [n,y]of this.layoutNodes)n.setPosition(n.position.x,y*height/1280);
    }
    private close() {this.modal.active=false;for(const n of this.modal.children.slice()){n.removeFromParent();n.destroy();}}
    private dialog(title:string,body:string,actions:Array<[string,()=>void]>) {
        this.onUi('open');
        this.close();this.modal.active=true;
        const height=view.getVisibleSize().height;
        panel(uiNode('Shade',this.modal,0,0,720,height),720,height,'#50311EBB',0);
        const tall=actions.length>2,heightCard=tall?640:520;
        const box=uiNode('Dialog',this.modal,0,0,580,heightCard);panel(box,580,heightCard,'#FFF0D8',28);
        const t=text(box,title,0,tall?255:195,32,540,55);t.isBold=true;t.color=new Color('#80502A');
        text(box,body,0,tall?95:65,23,510,180);
        actions.forEach(([value,action],i)=>{
            const n=uiNode('DialogButton',box,0,(tall?-65:-100)-i*85,390,65);panel(n,390,65,'#F1CE9B',20);
            text(n,value,0,0,24,370,60);this.bind(n,action);
        });
    }
    private help() {
        this.dialog('玩法说明','点击箱内选择横向落点，小猫从箱口落下。\n同级相碰合成，首次合成8级即可通关。\n每局可免费晃箱两次，帮助小猫滚动。\n持续越过危险线3秒，本局结束。',[['知道啦',()=>this.close()]]);
    }
    private settings() {
        this.dialog('设置','音效（含呼噜）与背景音乐独立开关。\n开关设置会保留在本机。\n最高分在本机保存，不包含本局进度。',[[this.record.muted?'开启音效':'关闭音效',()=>{this.record.toggleSound();this.onSound(this.record.muted);this.refresh();this.settings();}],[this.record.musicMuted?'开启音乐':'关闭音乐',()=>{this.record.toggleMusic();this.onMusic(this.record.musicMuted);this.settings();}],['完成',()=>this.close()]]);
    }
    dispose() {view.off('canvas-resize',this.layout,this);view.off('design-resolution-changed',this.layout,this);if(isValid(this.node,true))this.node.destroy();}
}
