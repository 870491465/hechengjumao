import { CONFIG } from './GameConfig';

export type PlayState = 'playing' | 'paused' | 'won' | 'lost';
export interface PairEntity { id: number; level: number; x: number; y: number; locked: boolean; mergeAt: number }
/** Pure deterministic pairing, independent of callbacks and rendering. */
export function pairContacts<T extends PairEntity>(contacts: Array<[T, T]>, now: number): Array<[T, T]> {
    const seen = new Set<string>();
    const sorted = contacts.filter(([a, b]) => {
        const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
        if (seen.has(key) || a.id === b.id || a.locked || b.locked || a.level !== b.level || a.level >= 8
            || now + 1e-8 < a.mergeAt || now + 1e-8 < b.mergeAt) return false;
        seen.add(key); return true;
    }).map(([a, b]) => a.id < b.id ? [a, b] as [T, T] : [b, a] as [T, T]);
    sorted.sort((p, q) => {
        const dist = (v: [T, T]) => (v[0].x - v[1].x) ** 2 + (v[0].y - v[1].y) ** 2;
        return dist(p) - dist(q) || p[0].id - q[0].id || p[1].id - q[1].id;
    });
    const used = new Set<number>();
    return sorted.filter(([a, b]) => {
        if (used.has(a.id) || used.has(b.id)) return false;
        used.add(a.id); used.add(b.id); return true;
    });
}

/** In-memory session seam: later persistence can serialize this and the entities. */
export class Session {
    state: PlayState = 'playing'; time = 0; score = 0; chain = 0; maxChain = 0;
    lastMerge = -Infinity; dropReady = 0; danger = 0; clearTime = 0; maxLevel = 1;
    private queueIndex = 0;
    randomState: number;
    current: number; next: number;
    constructor(seed = Date.now()) {
        this.randomState = (seed >>> 0) || 1;
        this.current = this.draw(); this.next = this.draw();
    }
    draw(): number {
        const index = this.queueIndex++;
        if (index < CONFIG.firstQueue.length) return CONFIG.firstQueue[index];
        let x = this.randomState;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.randomState = x >>> 0;
        const p = this.randomState / 4294967296;
        let sum = 0;
        for (let i = 0; i < CONFIG.probabilities.length; i++) {
            sum += CONFIG.probabilities[i]; if (p < sum) return i + 1;
        }
        return CONFIG.probabilities.length;
    }
    breakChain() { this.chain = 0; this.lastMerge = -Infinity; }
    acceptDrop() {
        this.breakChain(); this.dropReady = this.time + CONFIG.dropCooldown;
        this.maxLevel = Math.max(this.maxLevel, this.current);
        this.current = this.next; this.next = this.draw();
    }
    merge(level: number): number {
        this.chain = this.time - this.lastMerge <= CONFIG.chainWindow + 1e-8 ? this.chain + 1 : 1;
        this.lastMerge = this.time; this.maxChain = Math.max(this.maxChain, this.chain);
        this.maxLevel = Math.max(this.maxLevel, level);
        const points = Math.round(CONFIG.scores[level] * CONFIG.multipliers[Math.min(this.chain - 1, 4)]);
        this.score += points; return points;
    }
    updateDanger(hasDanger: boolean, dt: number): boolean {
        if (hasDanger) { this.clearTime = 0; this.danger += dt; }
        else {
            this.clearTime += dt;
            if (this.clearTime + 1e-8 >= CONFIG.dangerClear) this.danger = 0;
        }
        return this.danger + 1e-8 >= CONFIG.dangerDuration;
    }
    settle(result: 'won' | 'lost'): boolean {
        if (this.state !== 'playing') return false;
        this.state = result; return true;
    }
}
