import { CatEntity } from './CatEntity';
import { CONFIG, clampX, radius } from './GameConfig';
import { pairContacts } from './Rules';

export class MergeSystem {
    private contacts = new Map<string, [number, number]>();
    private key(a: number, b: number) { return `${Math.min(a, b)}:${Math.max(a, b)}`; }
    begin(a: number, b: number) { this.contacts.set(this.key(a, b), [a, b]); }
    end(a: number, b: number) { this.contacts.delete(this.key(a, b)); }
    remove(id: number) { for (const [key, pair] of this.contacts) if (pair.includes(id)) this.contacts.delete(key); }
    clear() { this.contacts.clear(); }
    pairs(cats: Map<number, CatEntity>, now: number) {
        const candidates: Array<[CatEntity, CatEntity]> = [];
        for (const [ai, bi] of this.contacts.values()) {
            const a = cats.get(ai), b = cats.get(bi);
            if (a && b && Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r + CONFIG.contactTolerance) candidates.push([a, b]);
        }
        return pairContacts(candidates, now);
    }
    position(a: CatEntity, b: CatEntity, others: Iterable<CatEntity>) {
        const r = radius(a.level + 1); const x = clampX((a.x + b.x) / 2, r);
        const y = Math.max(CONFIG.bottom + r, (a.y + b.y) / 2);
        const all = Array.from(others).filter(c => c !== a && c !== b && !c.locked);
        // Nearest clear point on a bounded upward search. If crowded, use the least penetrating candidate.
        let bestY = y, bestPenetration = Infinity;
        for (let i = 0; i <= CONFIG.correctionSteps; i++) {
            const py = y + r * i / CONFIG.correctionSteps;
            let penetration = 0;
            for (const c of all) penetration += Math.max(0, r + c.r - Math.hypot(x - c.x, py - c.y));
            if (penetration < bestPenetration) { bestPenetration = penetration; bestY = py; }
            if (penetration <= .01) return { x, y: py };
        }
        return { x, y: bestY };
    }
}
