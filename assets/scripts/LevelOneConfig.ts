/** Visual-only V1.1 tuning. Distances below are source-art pixels, not physics pixels. */
export const LEVEL_ONE = {
    canvas: 512,
    // Same alpha silhouette as V1.0, resampled from 1254 to 512. Use its fitted body,
    // not the 512 canvas or the artist's approximate 176px reference circle.
    center: [626.38 * 512 / 1254, 646.04 * 512 / 1254],
    bodyRadius: 443.90 * 512 / 1254,
    skin: 1.025,
    contactDuration: .25, poseBlend: .08,
    waitScale: [.98, 1.015], fallScale: [.97, 1.045], contactScale: [1.045, .955],
    rebound: .025,
    breathPeriod: 2.8, breathX: .003, breathY: .008,
    stableLinear: 12, stableAngular: 12, stableDuration: .5,
    wakeLinear: 28, wakeAngular: 25,
    blinkMin: 4, blinkMax: 8, blinkDuration: .28,
    stretchMin: 10, stretchMax: 16, stretchDuration: 1.2,
    quietContactSpeed: 8,
    stretchScale: [.975, 1.04],
    frontStretch: [[-4,-5,4],[4,-5,-4]], backStretch: [[2,-1,0],[-2,-1,0]],
    lightImpact: .035, lightDuration: .22,
    frontWait: [[4,-4,-3],[-4,-4,3]], frontFall: [[-4,6,5],[4,6,-5]],
    frontContact: [[2,2,-2],[-2,2,2]],
    backWait: [[4,-5,0],[-4,-5,0]], backFall: [[2,-1,0],[-2,-1,0]],
    pivots: {
        body: [256,272], paw_left_back: [155,343], paw_right_back: [357,343],
        paw_left_front: [143,262], paw_right_front: [369,262],
        mouth_normal: [255,202], eye_left: [201,187], eye_right: [310,187],
    } as Record<string,number[]>,
};
