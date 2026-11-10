import { useSyncExternalStore } from 'react';

/**
 * PHIÊN BẢN DỮ LIỆU — tín hiệu "số liệu vừa đổi, tải lại đi"
 * ------------------------------------------------------------------
 * Sau một thao tác ghi (thu thập đánh giá mới, đưa khiếu nại từ live vào, duyệt
 * nhãn), máy chủ tính lại số liệu ở nền và vẫn phục vụ bản cũ trong lúc đó.
 * Thanh bên hỏi /nav/status; khi cờ `refreshing` tắt, nó gọi bumpDataVersion()
 * và mọi trang đang mở tự tải lại, người dùng không phải bấm F5.
 *
 *   useDataVersion()   số tăng dần; đặt vào mảng phụ thuộc của useEffect tải dữ liệu
 *   useRefreshing()    máy chủ có đang tính lại không (để hiện chỉ báo)
 */

let version = 0;
let refreshing = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const bumpDataVersion = () => {
  version += 1;
  emit();
};

/** Thanh bên báo trạng thái tính lại của máy chủ; chuyển từ đang tính sang xong thì tăng phiên bản */
export const reportRefreshing = (next) => {
  const value = Boolean(next);
  if (value === refreshing) return;
  const finished = refreshing && !value;
  refreshing = value;
  if (finished) version += 1;
  emit();
};

export const isServerRefreshing = () => refreshing;
export const useDataVersion = () => useSyncExternalStore(subscribe, () => version);
export const useRefreshing = () => useSyncExternalStore(subscribe, () => refreshing);
