import { useSyncExternalStore } from 'react';

/**
 * Người dùng có bật "giảm chuyển động" không (prefers-reduced-motion).
 * Nơi DUY NHẤT trong app đọc media query này bằng JS: hook nghe thay đổi
 * (bật tắt trong cài đặt hệ điều hành thì app đổi theo ngay, không cần tải
 * lại), hàm prefersReducedMotion() đọc một lần cho chỗ ngoài React.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

const mql = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

/** Đọc một lần, không nghe thay đổi. Không có matchMedia thì coi như không giảm. */
export const prefersReducedMotion = () => Boolean(mql()?.matches);

const subscribe = (onChange) => {
  const m = mql();
  if (!m) return () => {};
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
};

export const useReducedMotion = () => useSyncExternalStore(subscribe, prefersReducedMotion, () => false);

export default useReducedMotion;
