/** Press feedback (brief §6): a slight 0.98 scale, none when the system asks for reduced motion. */
export const PRESS_SCALE = 0.98;

export function pressScale(pressed: boolean, reduceMotion: boolean): number {
  return pressed && !reduceMotion ? PRESS_SCALE : 1;
}
