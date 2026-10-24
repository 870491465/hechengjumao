import { Color, instantiate, isValid, Label, LabelOutline, Layers, Node, UIOpacity, UITransform, Vec3 } from 'cc';
import { CONFIG } from './GameConfig';

interface Source { node: Node; art: Node; r: number }
interface Product { node: Node; r: number }
interface Ghost { node: Node; from: Vec3; to: Vec3; age: number }
interface Bubble { node: Node; product: Product; anchor: Vec3; age: number }
function make(name:string,parent:Node,w=1,h=1) {
    const n=new Node(name);n.layer=Layers.Enum.UI_2D;n.setParent(parent);
    n.addComponent(UITransform).setContentSize(w,h);return n;
}

/** Cosmetic snapshots only. Physics, pairing, scoring and cooldowns never wait for this layer. */
export class MergeEffects {
    readonly sources: Node;
    private labels: Node; private ghosts: Ghost[]=[]; private bubbles: Bubble[]=[];
    constructor(root:Node,hud:Node,front:Node) {
        this.sources=make('MergeSources',root);
        this.sources.setSiblingIndex(root.children.indexOf(front));
        this.labels=make('MergeLabels',hud);
    }
    private local(parent:Node,world:Vec3) {return parent.getComponent(UITransform)!.convertToNodeSpaceAR(world);}
    private remove(n:Node) {if(isValid(n,true)){n.active=false;n.removeFromParent();n.destroy();}}
    gather(pair:Source[],x:number,y:number) {
        for(const source of pair) {
            while(this.ghosts.length>=CONFIG.mergeGhostLimit)this.remove(this.ghosts.shift()!.node);
            const n=make('MergeSource',this.sources),from=this.local(this.sources,source.node.worldPosition);
            const world=source.node.parent!.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(x,y));
            const target=this.local(this.sources,world);
            // A short inward motion rather than pulling the whole picture across neighbouring cats.
            const to=new Vec3(from.x+(target.x-from.x)*.3,from.y+(target.y-from.y)*.3,0);
            n.setPosition(from);n.angle=source.node.angle;
            const picture=instantiate(source.art);picture.setParent(n);
            const opacity=picture.getComponent(UIOpacity);if(opacity)opacity.opacity=255;
            n.addComponent(UIOpacity);this.ghosts.push({node:n,from,to,age:0});
        }
    }
    private anchor(product:Product) {
        const point=this.local(this.labels,product.node.worldPosition);
        point.x=Math.max(-260,Math.min(260,point.x));
        point.y=Math.min(300,point.y+product.r+26);return point;
    }
    chain(product:Product,count:number) {
        if(count<2)return;
        const anchor=this.anchor(product);
        // Replace nearby earlier chain text so a cascade reads as an increasing count.
        this.bubbles=this.bubbles.filter(b=>{
            if(Math.abs(b.anchor.x-anchor.x)<95&&Math.abs(b.anchor.y-anchor.y)<90){this.remove(b.node);return false;}return true;
        });
        while(this.bubbles.length>=CONFIG.chainLabelLimit)this.remove(this.bubbles.shift()!.node);
        const n=make('ChainAtMerge',this.labels,210,56),label=n.addComponent(Label);
        label.string=`${count}连合`;label.fontSize=34;label.lineHeight=44;label.isBold=true;
        label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
        label.color=new Color('#FFF4D1');const o=n.addComponent(LabelOutline);o.color=new Color('#713510');o.width=4;
        n.addComponent(UIOpacity);n.setPosition(anchor);this.bubbles.push({node:n,product,anchor,age:0});
    }
    tick(dt:number) {
        if(dt<=0)return;
        this.ghosts=this.ghosts.filter(g=>{
            g.age+=dt;if(g.age>=CONFIG.mergeGather){this.remove(g.node);return false;}
            const t=g.age/CONFIG.mergeGather,ease=1-(1-t)*(1-t);
            g.node.setPosition(g.from.x+(g.to.x-g.from.x)*ease,g.from.y+(g.to.y-g.from.y)*ease);
            g.node.setScale(1-.14*ease,1-.08*ease,1);
            g.node.getComponent(UIOpacity)!.opacity=Math.round(255*(1-t*t));return true;
        });
        this.bubbles=this.bubbles.filter(b=>{
            b.age+=dt;if(b.age>=CONFIG.chainLabelDuration){this.remove(b.node);return false;}
            if(isValid(b.product.node,true))b.anchor=this.anchor(b.product);
            const t=b.age/CONFIG.chainLabelDuration;
            b.node.setPosition(b.anchor.x,b.anchor.y+22*t);
            const pop=1+.08*Math.sin(Math.min(1,b.age/.18)*Math.PI);
            b.node.setScale(pop,pop,1);
            b.node.getComponent(UIOpacity)!.opacity=Math.round(255*Math.min(1,(1-t)/.6));return true;
        });
    }
    clear() {for(const g of this.ghosts)this.remove(g.node);for(const b of this.bubbles)this.remove(b.node);this.ghosts=[];this.bubbles=[];}
    dispose() {this.clear();this.remove(this.sources);this.remove(this.labels);}
}
