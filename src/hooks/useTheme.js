import { useSyncExternalStore } from 'react';

/**
 * Theme là trạng thái TOÀN CỤC, không phải trạng thái của từng component.
 * Bản cũ gọi useState trong mỗi nơi dùng, nên Cài đặt và thanh trên giữ
 * hai bản sao có thể lệch nhau. Một store nhỏ ở cấp module giải quyết
 * việc đó, và áp theme ngay lúc tải module để không nháy màn hình.
 *
 * Khoá lưu đổi từ 'app-theme' sang 'cr-theme': bản thiết kế mới lấy theme
 * sáng làm mặc định, người dùng cũ không bị kẹt lại ở theme tối cũ.
 */
const KEY = 'cr-theme';
const listeners = new Set();

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'light';
  } catch {
    return 'light';
  }
};

let current = read();
const apply = (t) => document.documentElement.setAttribute('data-theme', t);
apply(current);

export const setTheme = (t) => {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* trình duyệt chặn lưu trữ: theme vẫn áp dụng trong phiên */
  }
  apply(t);
  listeners.forEach((l) => l());
};

const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, () => current);
  return { theme, setTheme, toggleTheme: setTheme };
};

/**
 * Hiệu ứng kính có thể tắt: backdrop-filter tốn GPU trên máy yếu, và một
 * số người đọc thấy nền xuyên thấu gây mỏi mắt. Tắt thì mọi panel về nền đặc.
 */
const GLASS_KEY = 'cr-glass';
let glass = (() => {
  try {
    return localStorage.getItem(GLASS_KEY) !== 'off';
  } catch {
    return true;
  }
})();
const glassListeners = new Set();
const applyGlass = (on) => document.documentElement.setAttribute('data-glass', on ? 'on' : 'off');
applyGlass(glass);

export const setGlass = (on) => {
  glass = on;
  try {
    localStorage.setItem(GLASS_KEY, on ? 'on' : 'off');
  } catch {
    /* bỏ qua */
  }
  applyGlass(on);
  glassListeners.forEach((l) => l());
};

export const useGlass = () => {
  const on = useSyncExternalStore((cb) => {
    glassListeners.add(cb);
    return () => glassListeners.delete(cb);
  }, () => glass);
  return { glass: on, setGlass };
};
