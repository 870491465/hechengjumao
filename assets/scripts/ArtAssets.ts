import { director, gfx, ImageAsset, Layers, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec2 } from 'cc';
import { CONFIG, TOP } from './GameConfig';

type Crop = [number, number, number, number];
interface ArtEntry { file: string; size: [number, number]; crop: Crop }
interface CatBody { key: string; center: [number, number]; radius: number }

/** Source pixels, not gameplay geometry. Supplied PNG/WebP files are copied without editing. */
export const ART = {
    entries: {
        failTitle: { file: 'fail-title', size: [2172,724], crop: [55,115,2064,506] },
        failHero: { file: 'fail-hero', size: [1536,1024], crop: [52,53,1437,931] },
        winTitle: { file: 'win-title', size: [1983,793], crop: [41,93,1922,651] },
        winHero: { file: 'win-hero', size: [1536,1024], crop: [14,34,1511,974] },
        winScore: { file: 'win-score-panel', size: [2076,757], crop: [43,131,1990,487] },
        winRecord: { file: 'win-record-badge', size: [2087,754], crop: [158,152,1771,453] },
        winCelebration: { file: 'win-celebration', size: [941,1672], crop: [31,242,884,786] },
        winBackground: { file: 'game-background', size: [941,1672], crop: [0,0,941,1672] },
        homeBackground: { file: 'home-background', size: [941,1672], crop: [0,0,941,1672] },
        homeHero: { file: 'home-hero', size: [1536,1024], crop: [36,125,1463,846] },
        homeLogo: { file: 'home-logo', size: [2172,724], crop: [175,33,1902,669] },
        homeStart: { file: 'home-button-start', size: [2172,724], crop: [162,140,1848,432] },
        homeScore: { file: 'home-score-panel', size: [2142,734], crop: [119,207,1907,319] },
        homeSound: { file: 'home-icon-sound', size: [1254,1254], crop: [100,107,1054,1043] },
        homeHelp: { file: 'home-button-help', size: [2172,724], crop: [141,127,1890,466] },
        homeSettings: { file: 'home-icon-settings', size: [1254,1254], crop: [132,150,985,986] },

        cream: { file: 'cat_01_cream', size: [1254, 1254], crop: [178, 214, 898, 860] },
        grey: { file: 'cat_02_grey', size: [1254, 1254], crop: [168, 214, 918, 874] },
        bread: { file: 'cat_03_bread', size: [1254, 1254], crop: [177, 214, 901, 863] },
        calico: { file: 'cat_04_calico', size: [1254,1254], crop: [148,192,958,915] },
        tuxedo: { file: 'cat_05_tuxedo', size: [1254,1254], crop: [172,212,910,865] },
        brown: { file: 'cat_06_brown_tabby', size: [1254,1254], crop: [154,205,945,895] },
        orange: { file: 'cat_07_orange_white', size: [1254,1254], crop: [164,208,927,884] },
        golden: { file: 'cat_08_golden', size: [1254,1254], crop: [141,192,972,938] },
        background: { file: 'room_background', size: [941, 1672], crop: [0, 0, 941, 1672] },
        back: { file: 'box_back', size: [1079, 1457], crop: [37, 106, 1005, 1225] },
        rim: { file: 'box_front_rim', size: [1484, 1060], crop: [29, 480, 1428, 119] },
        shake: { file: 'button_shake_blank', size: [2167, 725], crop: [108, 74, 1947, 568] },
        logo: { file: 'game_logo', size: [2172, 724], crop: [171, 27, 1912, 682] },
    } as Record<string, ArtEntry>,
    // Least-squares fit to alpha>180 side/bottom contour, y>=400; excludes ears and canvas padding.
    cats: {
        1: { key: 'cream', center: [626.38, 646.04], radius: 443.90 },
        2: { key: 'grey', center: [625.97, 651.23], radius: 453.87 },
        3: { key: 'bread', center: [627.07, 646.83], radius: 444.86 },
        4: { key: 'calico', center: [626.28,650.58], radius: 471.43 },
        5: { key: 'tuxedo', center: [626.20,645.57], radius: 447.23 },
        6: { key: 'brown', center: [625.86,649.84], radius: 463.93 },
        7: { key: 'orange', center: [626.16,649.92], radius: 455.83 },
        8: { key: 'golden', center: [626.31,668.69], radius: 478.81 },
    } as Record<number, CatBody>,
    boxInner: { left: .092, right: .908, top: .03, floor: .938 },
    rimOverlap: 8, catMaxSquash: .16, mergeGrowth: .06,
    // A thin visual contact skin closes hand-painted contour insets without changing body geometry.
    contactSkin: 1.025,
};

export class ArtAssets {
    private static frames = new Map<string, SpriteFrame>();
    private static task: Promise<void> | null = null;
    static missing: string[] = [];
    static load(): Promise<void> {
        if (!this.task) this.task = Promise.all(Object.keys(ART.entries).map(key => new Promise<void>(resolve => {
            const spec = ART.entries[key];
            resources.load(`art/${spec.file}`, ImageAsset, (error, image) => {
                if (error || !image) {
                    this.missing.push(spec.file); console.warn(`[Art] Missing ${spec.file}; retaining its explicit greybox fallback.`);
                    resolve(); return;
                }
                const texture = new Texture2D();
                // Body sprites shrink by 10–40x on phones. Prefilter where NPOT mipmaps are supported.
                const api = director.root?.device.gfxAPI;
                if ((key.startsWith('home') || key.startsWith('win') || key.startsWith('fail') || key === 'logo' || Object.values(ART.cats).some(cat => cat.key === key)) && api !== undefined && api !== gfx.API.WEBGL) {
                    texture.setMipFilter(Texture2D.Filter.LINEAR);
                }
                texture.image = image;
                const [x, y, w, h] = spec.crop;
                const scaleX = texture.width / spec.size[0], scaleY = texture.height / spec.size[1];
                const frame = new SpriteFrame(); frame.name = spec.file; frame.texture = texture;
                frame.rect = new Rect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
                frame.originalSize = new Size(w * scaleX, h * scaleY); frame.offset = new Vec2();
                this.frames.set(key, frame); resolve();
            });
        }))).then(() => undefined);
        return this.task;
    }
    static hasCat(level: number) { return !!ART.cats[level] && this.frames.has(ART.cats[level].key); }
    private static node(name: string, parent: Node, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name); n.layer = Layers.Enum.UI_2D; n.setParent(parent); n.setPosition(x, y);
        n.addComponent(UITransform).setContentSize(w, h); return n;
    }
    static sprite(parent: Node, key: string, w: number, h: number, x = 0, y = 0): Node | null {
        const frame = this.frames.get(key); if (!frame) return null;
        const n = this.node(`Art-${key}`, parent, w, h, x, y); const sprite = n.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame; return n;
    }
    static cat(parent: Node, level: number, r: number): boolean {
        const body = ART.cats[level]; if (!body || !this.hasCat(level)) return false;
        const [x, y, w, h] = ART.entries[body.key].crop, scale = r / body.radius;
        // Picture rotates around the BODY origin; the cropped bitmap centre can differ from that origin.
        const pivot = this.node('CatPicture', parent, 2 * r, 2 * r);
        pivot.setScale(ART.contactSkin,ART.contactSkin,1);
        this.sprite(pivot, body.key, w * scale, h * scale,
            (x + w / 2 - body.center[0]) * scale, (body.center[1] - y - h / 2) * scale);
        return true;
    }
    static background(parent: Node): boolean {
        const spec = ART.entries.background;
        const s = Math.max(CONFIG.designWidth / spec.size[0], CONFIG.designHeight / spec.size[1]);
        return !!this.sprite(parent, 'background', spec.size[0] * s, spec.size[1] * s);
    }
    static box(parent: Node): boolean {
        const frame = this.frames.get('back'); if (!frame) return false;
        const [, , w, h] = ART.entries.back.crop, inner = ART.boxInner;
        const scale = CONFIG.width / ((inner.right - inner.left) * w);
        const topBorder = inner.top * h, bottomBorder = (1 - inner.floor) * h;
        const height = (TOP - CONFIG.bottom) / scale + topBorder + bottomBorder;
        frame.insetLeft = inner.left * frame.rect.width;
        frame.insetRight = (1 - inner.right) * frame.rect.width;
        frame.insetTop = inner.top * frame.rect.height;
        frame.insetBottom = (1 - inner.floor) * frame.rect.height;
        const n = this.sprite(parent, 'back', w, height, 0,
            (TOP + topBorder * scale + CONFIG.bottom - bottomBorder * scale) / 2)!;
        n.setScale(scale, scale, 1); n.getComponent(Sprite)!.type = Sprite.Type.SLICED;
        return true;
    }
    static front(parent: Node): boolean {
        const w = CONFIG.width / (ART.boxInner.right - ART.boxInner.left);
        const h = w * ART.entries.rim.crop[3] / ART.entries.rim.crop[2];
        return !!this.sprite(parent, 'rim', w, h, 0, CONFIG.bottom + ART.rimOverlap - h / 2);
    }
    static shakeButton(parent: Node, w: number, h: number): boolean {
        const spec = ART.entries.shake, scale = Math.min(w / spec.crop[2], h / spec.crop[3]);
        return !!this.sprite(parent, 'shake', spec.crop[2] * scale, spec.crop[3] * scale);
    }
}
