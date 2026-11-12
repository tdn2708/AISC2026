/**
 * Token chuyển động bản JS, cùng số với --motion-* và --ease-* trong
 * src/index.css (đổi bên này thì đổi bên kia). Dùng cho chỗ CSS không với
 * tới: vòng requestAnimationFrame, Web Animations API.
 */
export const MOTION = {
  instant: 0,
  micro: 120,
  short: 220,
  medium: 420,
  long: 900,
  story: 1600
};

export const EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  in: 'cubic-bezier(0.7, 0, 0.84, 0)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)'
};

/** Lệch nhịp giữa các dòng của một danh sách (Stagger) */
export const STAGGER_STEP = 40;
