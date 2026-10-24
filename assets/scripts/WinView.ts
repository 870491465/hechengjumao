import { BlockInputEvents, Color, EventTouch, isValid, LabelOutline, Node, ResolutionPolicy, UIOpacity, UITransform, view } from 'cc';
import { ART, ArtAssets } from './ArtAssets';
import { panel, text, uiNode } from './GameView';
import { UiSound } from './AudioConfig';

/** Shared result presentation consumes a committed result; it never awards points or creates physics. */
export class WinView {
    readonly node: Node; readonly replayButton: Node; readonly homeButton: Node;
    private background: Node | null; private hero: Node | null; private title: Node | null;
    private positions: Array<[Node,number]>; private pauseLayer: Node;
    private elapsed = 0; private awaitingContinue = false;
    constructor(root: Node, readonly score: number, readonly best: number, readonly newRecord: boolean,
        replay:()=>void, home:()=>void, readonly result:'won'|'lost'='won',private onUi:(kind:UiSound)=>void=()=>{},private onContinue:()=>void=()=>{}) {
        const won=result==='won';
        this.node=uiNode(won?'WinResult':'FailResult',root,0,0,720,1280);this.node.addComponent(BlockInputEvents);
        this.background=this.image('winBackground',720,0,0);
        if(won)this.image('winCelebration',680,0,110);
        this.hero=this.image(won?'winHero':'failHero',won?640:668,0,won?50:70);
        this.title=this.image(won?'winTitle':'failTitle',won?540:620,0,won?460:445);
        const subtitle=text(this.node,won?'最大的橘猫，诞生啦！':'差一点点，下次一定行！',0,347,34,650,54);subtitle.isBold=true;subtitle.color=new Color('#6A2E09');
        this.image('winScore',600,0,-250);
        for(const [x,label,value] of [[-120,'本局得分',score],[120,'最高分',best]] as Array<[number,string,number]>) {
            const caption=text(this.node,label,x,-207,25,230,38);caption.isBold=true;caption.color=new Color('#6A2E09');
            const number=text(this.node,String(value),x,-251,String(value).length>6?42:60,230,82);number.isBold=true;number.color=new Color('#6A2E09');
            number.node.name=x<0?'RoundScore':'BestScore';
        }
        if(won&&newRecord)this.image('winRecord',156,120,-300);
        this.replayButton=this.button('Replay','homeStart',500,0,-401,won?'再玩一次':'再试一次',56,replay);
        this.homeButton=this.button('Home','homeHelp',270,0,-514,'返回首页',32,home);
        this.pauseLayer=uiNode(won?'WinPause':'FailPause',this.node,0,0,720,1280);this.pauseLayer.addComponent(BlockInputEvents);this.pauseLayer.active=false;
        this.positions=this.node.children.filter(n=>n!==this.background&&n!==this.pauseLayer).map(n=>[n,n.position.y]);
        view.on('canvas-resize',this.layout,this);view.on('design-resolution-changed',this.layout,this);
        view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);this.layout();this.animate(0);
    }
    private image(key:string,width:number,x:number,y:number,parent=this.node) {
        const spec=ART.entries[key];return ArtAssets.sprite(parent,key,width,width*spec.crop[3]/spec.crop[2],x,y);
    }
    private button(name:string,key:string,width:number,x:number,y:number,label:string,size:number,action:()=>void,parent=this.node) {
        const spec=ART.entries[key],n=uiNode(name,parent,x,y,width,width*spec.crop[3]/spec.crop[2]);
        this.image(key,width,0,0,n);
        const l=text(n,label,0,0,size,width-20,Math.max(65,width*spec.crop[3]/spec.crop[2]));l.isBold=true;l.color=new Color(key==='homeStart'?'#FFF4D9':'#844A22');
        if(key==='homeStart'){const o=l.node.addComponent(LabelOutline);o.width=2;o.color=new Color('#C87836');}
        const opacity=n.addComponent(UIOpacity);let id:number|null=null;
        const reset=()=>{id=null;n.setScale(1,1,1);opacity.opacity=255;};
        n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;if(id!==null)return;id=e.getID();n.setScale(.96,.96,1);opacity.opacity=225;});
        n.on(Node.EventType.TOUCH_CANCEL,(e:EventTouch)=>{e.propagationStopped=true;if(id===e.getID())reset();});
        n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;if(id===e.getID()){reset();action();this.onUi('tap');}});return n;
    }
    private layout() {
        const height=view.getVisibleSize().height,spec=ART.entries.winBackground,scale=Math.max(720/spec.size[0],height/spec.size[1]);
        this.node.getComponent(UITransform)!.setContentSize(720,height);
        this.pauseLayer.getComponent(UITransform)!.setContentSize(720,height);
        this.background?.getComponent(UITransform)!.setContentSize(spec.size[0]*scale,spec.size[1]*scale);
        for(const [n,y]of this.positions)n.setPosition(n.position.x,y*height/1280);
    }
    animate(dt:number) {
        if(this.awaitingContinue)return;
        this.elapsed+=Math.min(dt,.1);
        if(this.result==='lost')return;
        const pop=1-.06*Math.exp(-7*this.elapsed)*Math.cos(12*this.elapsed);
        this.hero?.setScale(pop,pop,1);this.title?.setScale(pop,pop,1);
    }
    requireContinue() {
        if(this.awaitingContinue)return;this.awaitingContinue=true;
        this.pauseLayer.active=true;const h=view.getVisibleSize().height;
        panel(uiNode('Shade',this.pauseLayer,0,0,720,h),720,h,'#50311EBB',0);
        const box=uiNode('Dialog',this.pauseLayer,0,0,550,300);panel(box,550,300,'#FFF0D8',24);
        text(box,'已暂停',0,80,30,500,55);
        text(box,this.result==='won'?'点击继续查看通关结果':'点击继续查看结算结果',0,20,24,500,55);
        this.button('Continue','homeHelp',260,0,-85,'继续',26,()=>{
            this.awaitingContinue=false;this.pauseLayer.active=false;
            this.onContinue();
            for(const n of this.pauseLayer.children.slice()){n.removeFromParent();n.destroy();}
        },box);
    }
    dispose() {
        view.off('canvas-resize',this.layout,this);view.off('design-resolution-changed',this.layout,this);
        if(isValid(this.node,true))this.node.destroy();
        view.setDesignResolutionSize(720,1280,ResolutionPolicy.SHOW_ALL);
    }
}
