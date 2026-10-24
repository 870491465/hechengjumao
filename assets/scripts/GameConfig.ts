/** Distances and PhysicsSystem2D.gravity are pixels; RigidBody2D velocity uses metres (32 px/m). */
export const CONFIG = {
    width: 600, heightRatio: 1.10, bottom: -430, designWidth: 720, designHeight: 1280,
    radiusRatios: [0, .040, .055, .075, .100, .135, .180, .240, .310],
    scores: [0, 0, 10, 20, 40, 80, 160, 320, 640],
    colors: ['#FFFFFF', '#F5E4BC', '#CDDCE2', '#DAB394', '#A5B9A1', '#F5B46A', '#EB9065', '#CF7251', '#F3CD53'],
    names: ['', '奶团猫', '糯米猫', '面包猫', '围兜猫', '橘团猫', '肚兜猫', '猫老板', '镇箱大橘'],
    firstQueue: [1, 1, 2, 1], probabilities: [.55, .30, .10, .05],
    dropCooldown: .6, spawnOffsetRatio: .20, safeGapRatio: .01,
    mergeProtection: .10, mergeAnimation: .26, mergeGather: .065, mergeBirthScale: .86,
    mergeGhostLimit: 24, chainLabelDuration: .65, chainLabelLimit: 6, correctionSteps: 8,
    dropProtection: 1.2, dangerRatio: .93, dangerDuration: 3, dangerClear: .2,
    chainWindow: 1, multipliers: [1, 1.2, 1.4, 1.6, 1.8],
    shakeUses: 2, shakeDuration: .8, shakeCooldown: 3, shakeVisualRatio: .015,
    shakeVelocityRatio: .25, shakeAccelerationRatio: 3.5, shakeHalfPeriod: .15,
    fixedStep: 1 / 60, maxSubSteps: 6, pixelsPerMetre: 32,
    gravityRatio: -1.8, maxSpeedRatio: 1.5, maxAngularSpeed: 180, restitution: .10, friction: .35,
    linearDamping: .4, angularDamping: .8, density: 1, wallThickness: 24,
    velocityIterations: 12, positionIterations: 12, celebration: 1.5,
    boundaryInset: .5, boundaryTolerance: .75, contactTolerance: 1.5,
    jellyDuration: .65, jellyFrequency: 4.5, jellyDecay: 7,
    jellyMaxSquash: .30, jellyImpactThresholdRatio: .08, jellyImpactCooldown: .10,
    jellySpeedRatio: .9, jellyGain: .48, jellyMinSquash: .08,
};
export const radius = (level: number) => CONFIG.width * CONFIG.radiusRatios[level];
export const TOP = CONFIG.bottom + CONFIG.width * CONFIG.heightRatio;
export const DANGER_Y = CONFIG.bottom + CONFIG.width * CONFIG.heightRatio * CONFIG.dangerRatio;
export const SPAWN_Y = TOP + CONFIG.width * CONFIG.spawnOffsetRatio;
export const MAX_DROP_LEVEL = CONFIG.probabilities.length;
export const INPUT_TOP = SPAWN_Y + radius(MAX_DROP_LEVEL) + 12;
export const clampX = (x: number, r: number) => Math.max(-CONFIG.width / 2 + r + CONFIG.width * CONFIG.safeGapRatio,
    Math.min(CONFIG.width / 2 - r - CONFIG.width * CONFIG.safeGapRatio, x));
