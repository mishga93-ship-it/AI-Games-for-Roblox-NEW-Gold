// fittingRoomAngles.ts — Zero-Robux UGC Fitting Room angle presets (session 386).
//
// Pseudo-3D fitting room renders the user's avatar from 3 angles. Each angle
// is a flux img2img call with a specific camera-angle prompt suffix appended
// to the Outfit Generator aesthetic prompt.

export type FittingAngle = 'front' | 'three_quarter' | 'back';

/** Display order on the result screen (left → right swipe direction). */
export const FITTING_ANGLE_ORDER: FittingAngle[] = ['front', 'three_quarter', 'back'];

export interface FittingAngleSpec {
  id: FittingAngle;
  /** Short label shown above the preview. */
  labelEN: string;
  labelRU: string;
  /** Appended to the base aesthetic prompt to lock the camera. */
  promptSuffix: string;
}

export const FITTING_ANGLES: Record<FittingAngle, FittingAngleSpec> = {
  front: {
    id: 'front',
    labelEN: 'Front',
    labelRU: 'Спереди',
    promptSuffix:
      'STRAIGHT-ON FRONT view, camera at avatar chest height, full body centered, ' +
      'character facing directly toward camera, symmetric pose, both arms visible.',
  },
  three_quarter: {
    id: 'three_quarter',
    labelEN: '3/4 view',
    labelRU: '3/4',
    promptSuffix:
      'THREE-QUARTER hero angle, character rotated ~30° to camera-left, dynamic stance, ' +
      'camera slightly low for power-fantasy framing, dramatic studio rim-light.',
  },
  back: {
    id: 'back',
    labelEN: 'Back',
    labelRU: 'Сзади',
    promptSuffix:
      'STRAIGHT-ON BACK view, character with back fully toward camera, full body centered, ' +
      'back of head visible, hair / shoulder accessories / back items featured prominently.',
  },
};

/**
 * Compose final flux prompt: base outfit aesthetic + angle suffix +
 * "match the Roblox blocky proportions of the input image" cue so img2img
 * preserves the user's avatar shape.
 */
export function buildFittingPrompt(args: {
  basePrompt: string;
  angle: FittingAngle;
}): string {
  const angle = FITTING_ANGLES[args.angle];
  return [
    args.basePrompt,
    angle.promptSuffix,
    'Match the blocky Roblox character proportions and head shape from the input image.',
    'Plain neutral background, soft studio lighting, sharp clean stylized 3D cartoon render.',
    'Family-friendly, no horror, no gore, no text, no logos.',
  ].join(' ');
}

export function isFittingAngle(v: unknown): v is FittingAngle {
  return v === 'front' || v === 'three_quarter' || v === 'back';
}
