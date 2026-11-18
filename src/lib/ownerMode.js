import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';

/**
 * CHẾ ĐỘ CHỦ SHOP
 * Mặc định bật: thanh bên chỉ còn các trang dùng hằng ngày, trang phân tích gom vào
 * "Nâng cao"; Tổng quan chỉ còn việc hôm nay, tiền và livestream. Lưu riêng trên
 * máy này; mọi nơi đang mở được báo qua sự kiện cửa sổ để đổi cùng lúc.
 */
const KEY = 'cr-owner-mode';
const EVENT = 'cr-owner-mode';

export const isOwnerMode = () => String(readStorage(KEY, 'true')) !== 'false';

export function setOwnerMode(on) {
  writeStorage(KEY, Boolean(on));
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: Boolean(on) })); } catch { /* môi trường không có window */ }
}

export function useOwnerMode() {
  const [on, setOn] = useState(isOwnerMode);
  useEffect(() => {
    const sync = () => setOn(isOwnerMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [on, setOwnerMode];
}
