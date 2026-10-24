import { AudioClip, AudioSource, isValid, Node, resources } from 'cc';
import { AUDIO, SoundKey, UiSound } from './AudioConfig';

interface Voice { source: AudioSource; key: SoundKey | null; end: number; gain: number; priority: number }

/** Three stoppable effect voices plus an independent loop source; no historical event replay. */
export class GameAudio {
    readonly node: Node;
    private clips = new Map<SoundKey,AudioClip>(); private voices: Voice[] = [];
    private muted = false; private suspended = false; private disposed = false;
    private hidden = false; private scene: 'home'|'game'|'result' = 'home';
    private music: AudioSource; private musicMuted = false; private musicRequested = false; private interacted = false;
    private lastAction = 0; private purrAt = AUDIO.purrDelay; private dangerStage = -1; private dangerActive = false;
    private clock = 0; private lastImpact = -Infinity; private duckUntil = -Infinity;
    private catTimes = new Map<number,number>();
    constructor(parent: Node) {
        this.node = new Node('GameplayAudio');this.node.setParent(parent);
        const musicNode=new Node('BackgroundMusic');musicNode.setParent(this.node);
        this.music=musicNode.addComponent(AudioSource);this.music.playOnAwake=false;this.music.loop=true;this.music.volume=0;
        for(let i=0;i<AUDIO.voices;i++) {
            const n=new Node(`Voice-${i}`);n.setParent(this.node);
            const source=n.addComponent(AudioSource);source.playOnAwake=false;source.loop=false;
            this.voices.push({source,key:null,end:0,gain:1,priority:0});
        }
    }
    async load() {
        await Promise.all((Object.keys(AUDIO.durations) as SoundKey[]).map(key=>new Promise<void>(resolve=>{
            resources.load(`audio/${key}`,AudioClip,(error,clip)=>{
                if(error||!clip)console.warn(`[Audio] Missing ${key}; skipping this effect.`);
                else if(!this.disposed)this.clips.set(key,clip);
                resolve();
            });
        })));
        if(!this.disposed){this.music.clip=this.clips.get('bgm_cozy_loop')||null;this.syncMusic();}
    }
    setMuted(value:boolean) {this.muted=value;if(value)this.stopAll();else this.purrAt=this.clock+AUDIO.purrDelay;}
    setMusicMuted(value:boolean) {this.musicMuted=value;this.syncMusic();}
    private syncMusic() {
        if(!isValid(this.music,true))return;
        const play=this.interacted&&!this.musicMuted&&!this.suspended&&!this.hidden&&!this.disposed&&!!this.music.clip;
        this.music.volume=play?AUDIO.musicGain:0;
        if(play&&!this.musicRequested){this.musicRequested=true;this.music.play();}
        else if(!play&&this.musicRequested){this.musicRequested=false;this.music.pause();}
    }
    suspend() {this.suspended=true;this.stopAll();this.syncMusic();}
    hide() {this.hidden=true;this.suspend();}
    show() {this.hidden=false; /* Explicit player input resumes music. */}
    resume() {if(!this.disposed){this.suspended=false;this.purrAt=Math.max(this.purrAt,this.clock+AUDIO.purrDelay);this.syncMusic();}}
    home() {this.stopAll();this.scene='home';this.lastAction=this.clock;this.purrAt=this.clock+AUDIO.purrDelay;this.resume();}
    reset() {this.stopAll();this.scene='game';this.lastImpact=-Infinity;this.catTimes.clear();this.lastAction=this.clock;this.purrAt=this.clock+AUDIO.purrDelay;this.resume();}
    ui(kind:UiSound) {
        this.interacted=true;if(this.scene==='home')this.resume();this.syncMusic();
        this.action();return this.play(kind==='tap'?'ui_tap':'ui_open',AUDIO.uiGain,3,true);
    }
    private action() {this.lastAction=this.clock;for(const v of this.voices)if(v.key==='cat_purr')this.stop(v);}
    private stop(v:Voice) {
        if(isValid(v.source,true)){v.source.volume=0;v.source.stop();v.source.clip=null;}
        v.key=null;v.end=0;
    }
    private stopAll() {for(const v of this.voices)this.stop(v);this.duckUntil=-Infinity;this.dangerStage=-1;this.dangerActive=false;}
    private play(key:SoundKey,gain:number,priority:number,ui=false) {
        const clip=this.clips.get(key);
        if(this.disposed||this.muted||this.hidden||(!ui&&this.suspended)||!clip)return false;
        let voice=this.voices.find(v=>!v.key||v.end<=this.clock);
        if(!voice)voice=this.voices.filter(v=>v.key!=='box_shake'&&v.priority<priority).sort((a,b)=>a.priority-b.priority||a.end-b.end)[0];
        if(!voice)return false;
        this.stop(voice);voice.key=key;voice.gain=gain;voice.priority=priority;
        voice.end=this.clock+AUDIO.durations[key]+(key==='box_shake'?0:AUDIO.loadMargin);
        voice.source.clip=clip;voice.source.volume=AUDIO.master*gain;voice.source.play();
        return true;
    }
    private impact(key:SoundKey,speed:number,ids:number[],gain=1) {
        if(speed<AUDIO.impactSpeed||this.clock-this.lastImpact<AUDIO.impactGap
            ||ids.some(id=>this.clock-(this.catTimes.get(id)??-Infinity)<AUDIO.catGap))return false;
        this.action();
        const volume=Math.min(1,Math.max(AUDIO.minImpactGain,speed/AUDIO.fullImpactSpeed))*gain;
        if(!this.play(key,volume,1))return false;
        this.lastImpact=this.clock;for(const id of ids)this.catTimes.set(id,this.clock);return true;
    }
    land(level:number,speed:number,ids:number[]) {return this.impact(level<=3?'land_soft':'land_heavy',speed,ids);}
    bump(speed:number,ids:number[]) {return this.impact('cat_bump',speed,ids,AUDIO.bumpGain);}
    release() {this.action();return this.play('cat_release',1,1);}
    merge(level:number,chain=1) {
        if(level>=8||this.muted||this.suspended||this.disposed||this.hidden)return false;
        this.action();this.duckUntil=this.clock+AUDIO.shakeDuckTime;
        for(const v of this.voices)if(v.key?.startsWith('chain_accent'))this.stop(v);
        for(const v of this.voices)if(v.key==='box_shake')v.source.volume=AUDIO.master*v.gain*Math.pow(10,AUDIO.shakeDuckDb/20);
        const played=this.play(level<=3?'merge_small':level<=5?'merge_medium':'merge_large',AUDIO.mergeGain,3);
        if(played&&chain>=2){const keys:SoundKey[]=['chain_accent_c','chain_accent_d','chain_accent_e','chain_accent_g'];this.play(keys[Math.min(chain-2,3)],AUDIO.chainGain,2);}
        return played;
    }
    startShake() {this.action();return this.play('box_shake',AUDIO.shakeGain,2);}
    danger(elapsed:number) {
        this.dangerActive=elapsed>0;
        if(!this.dangerActive){this.dangerStage=-1;for(const v of this.voices)if(v.key==='danger_tick')this.stop(v);return;}
        const stage=Math.min(2,Math.floor(elapsed));
        if(stage!==this.dangerStage){this.dangerStage=stage;this.action();this.play('danger_tick',AUDIO.dangerGain,2);}
    }
    result(won:boolean) {
        this.stopAll();this.scene='result';this.resume();this.action();
        return this.play(won?'game_win':'game_lose',1,5);
    }
    // Reserved for genuine future unlock/revive actions; do not invent those gameplay features.
    unlock() {return this.play('cat_unlock',.8,2);}
    revive() {return this.play('revive_success',1,4);}
    endShake() {for(const v of this.voices)if(v.key==='box_shake')v.end=Math.min(v.end,this.clock+AUDIO.fade);}
    tick(dt:number) {
        if(this.disposed||this.hidden)return;
        this.clock+=dt;
        for(const v of this.voices) {
            if(!v.key)continue;
            if(v.end<=this.clock){this.stop(v);continue;}
            const duck=v.key==='box_shake'&&this.clock<this.duckUntil?Math.pow(10,AUDIO.shakeDuckDb/20):1;
            const fade=v.key==='box_shake'?Math.min(1,(v.end-this.clock)/AUDIO.fade):1;
            v.source.volume=AUDIO.master*v.gain*duck*fade;
        }
        if(!this.suspended&&!this.muted&&this.interacted&&this.scene!=='result'&&!this.dangerActive
            &&this.clock>=this.purrAt&&this.clock-this.lastAction>=5&&!this.voices.some(v=>v.key)) {
            this.play('cat_purr',AUDIO.purrGain,0);this.purrAt=this.clock+AUDIO.purrInterval;
        }
    }
    forget(id:number) {this.catTimes.delete(id);}
    dispose() {
        if(this.disposed)return;this.stopAll();this.disposed=true;this.syncMusic();
        if(isValid(this.music,true)){this.music.stop();this.music.clip=null;}
        this.clips.clear();this.catTimes.clear();
        if(isValid(this.node,true))this.node.destroy();
    }
}
