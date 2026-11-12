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

/**
 * M1 vào trang (PageEnter): các khối đầu trang đi từ opacity 0, translateY
 * ENTER_RISE px về 0, lệch ENTER_STEP ms, tối đa ENTER_MAX khối. Thời lượng
 * dùng MOTION.medium và EASE.out. M2 (reveal) và M4 (lift) ở tailwind.css,
 * khối K3: rise 16px, scale 0.985, nhấc 2px (cùng số trong CSS).
 */
export const ENTER_RISE = 12;
export const ENTER_STEP = 60;
export const ENTER_MAX = 4;
