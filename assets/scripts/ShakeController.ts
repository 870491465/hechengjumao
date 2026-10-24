import { CONFIG } from './GameConfig';

/** Fixed-step alternating acceleration, bounded independent shake contribution per body. */
export class ShakeController {
    remaining = CONFIG.shakeUses;
    elapsed = 0; active = false; readyAt = 0;
    private contributions = new Map<number, number>();
    start(now: number, allowed: boolean): boolean {
        if (!allowed || this.active || !this.remaining || now + 1e-8 < this.readyAt) return false;
        this.remaining--; this.active = true; this.elapsed = 0; this.contributions.clear(); return true;
    }
    tick(dt: number, now: number, apply: (id: number, dv: number) => void, ids: number[]) {
        if (!this.active) return;
        const sign = Math.floor((this.elapsed + 1e-8) / CONFIG.shakeHalfPeriod) % 2 === 0 ? 1 : -1;
        const limit = CONFIG.width * CONFIG.shakeVelocityRatio;
        for (const id of ids) {
            const old = this.contributions.get(id) || 0;
            const value = Math.max(-limit, Math.min(limit, old + sign * CONFIG.width * CONFIG.shakeAccelerationRatio * dt));
            apply(id, value - old); this.contributions.set(id, value);
        }
        this.elapsed += dt;
        if (this.elapsed + 1e-8 >= CONFIG.shakeDuration) {
            this.stop(); this.readyAt = now + CONFIG.shakeCooldown;
        }
    }
    get visualX() { return this.active ? Math.sin(this.elapsed * Math.PI / CONFIG.shakeHalfPeriod)
        * CONFIG.width * CONFIG.shakeVisualRatio : 0; }
    stop() { this.active = false; this.contributions.clear(); }
}
