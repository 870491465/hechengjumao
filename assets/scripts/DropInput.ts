import { EventTouch, isValid, Node, UITransform, Vec3 } from 'cc';
import { clampX, CONFIG, INPUT_TOP, radius } from './GameConfig';
import { GameView } from './GameView';

export class DropInput {
    private touch: number | null = null;
    private inputNode: Node | null;
    private disposed = false;
    constructor(private view: GameView, private level: () => number, private canDrop: () => boolean,
        private drop: (x: number) => void) {
        const n = view.inputArea;
        this.inputNode = n;
        n.on(Node.EventType.TOUCH_START, this.start, this);
        n.on(Node.EventType.TOUCH_MOVE, this.move, this);
        n.on(Node.EventType.TOUCH_END, this.end, this);
        n.on(Node.EventType.TOUCH_CANCEL, this.cancelEvent, this);
        n.once(Node.EventType.NODE_DESTROYED, this.dispose, this);
    }
    private position(e: EventTouch) {
        const p = e.getUILocation();
        // Coordinates are always local to the actual rigid-body parent, never the canvas or screen.
        return this.view.cats.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    }
    private start(e: EventTouch) {
        e.propagationStopped = true;
        if (this.disposed || this.touch !== null || !this.canDrop()) return;
        this.touch = e.getID(); this.move(e);
    }
    private move(e: EventTouch) {
        if (this.disposed || e.getID() !== this.touch) return;
        const p = this.position(e); this.view.showGuide(clampX(p.x, radius(this.level())), this.level());
    }
    private end(e: EventTouch) {
        e.propagationStopped = true;
        if (this.disposed || e.getID() !== this.touch) return;
        const p = this.position(e); this.cancel();
        if (this.canDrop() && Math.abs(p.x) <= CONFIG.width / 2 && p.y >= CONFIG.bottom && p.y <= INPUT_TOP) this.drop(p.x);
    }
    private cancelEvent(e: EventTouch) { if (e.getID() === this.touch) this.cancel(); }
    cancel() { this.touch = null; }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.cancel();
        const n = this.inputNode; this.inputNode = null;
        // Parent scene teardown destroys child event processors BEFORE the Canvas component.
        // A non-null Node reference alone does not mean targetOff is still safe to call.
        if (isValid(n, true)) n.targetOff(this);
    }
}
