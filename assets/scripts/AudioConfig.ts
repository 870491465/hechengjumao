/** V0.3 set with V0.4 release/contact replacements; preserve supplied relative loudness. */
export const AUDIO = {
    master: .85, voices: 3, impactSpeed: 72, fullImpactSpeed: 720,
    impactGap: .065, catGap: .16, minImpactGain: .35,
    mergeGain: 1, shakeGain: 1, shakeDuration: .8,
    shakeDuckDb: -5, shakeDuckTime: .3, fade: .06, loadMargin: .03,
    musicGain: .65, bumpGain: .65, purrGain: .4, purrDelay: 12, purrInterval: 20,
    uiGain: .85, chainGain: .8, dangerGain: .9,
    durations: {
        ui_tap: .075, ui_open: .165, cat_release: .085,
        land_soft: .145, land_heavy: .190, cat_bump: .085,
        merge_small: .250, merge_medium: .300, merge_large: .350, box_shake: .800,
        chain_accent: .105, chain_accent_c: .09910, chain_accent_d: .08829, chain_accent_e: .07866, chain_accent_g: .06614,
        danger_tick: .105, cat_unlock: .340, game_win: 1.450, game_lose: .650,
        revive_success: .560, cat_purr: 3.200, bgm_cozy_loop: 64,
    },
};
export type SoundKey = keyof typeof AUDIO.durations;
export type UiSound = 'tap'|'open';
