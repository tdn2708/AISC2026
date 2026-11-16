import { useEffect, useState } from 'react';
import axios from 'axios';
import { useDataVersion } from './dataVersion';
import { getWorkspace } from './workspace';

/**
 * KHO ĐANG XEM CÓ DỮ LIỆU CHƯA (đánh giá 16/11, mục 6)
 *
 * Tài khoản mới, hoặc kho thật chưa thu thập lần nào, có 0 phản hồi. Khi đó
 * mọi trang ra số 0 và vài câu dễ hiểu sai ("không có việc nào cần làm, mọi
 * chỉ số bình thường"). Hook này cho trang biết kho đang trống để nói thật:
 * chưa có dữ liệu, và chỉ cách có dữ liệu.
 *
 * Đọc /trust/health (rawCollected = số phản hồi thu thập được của cả kho,
 * không theo bộ lọc). Một lượt hỏi dùng chung cho mọi trang trong cùng phiên
 * bản dữ liệu; dữ liệu đổi (useDataVersion) thì hỏi lại.
 *
 *   true  = kho chưa có phản hồi nào
 *   false = có dữ liệu
 *   null  = đang hỏi hoặc không hỏi được (trang cứ hiện như bình thường)
 */

let cache = { key: null, value: null, promise: null };

function load(key) {
  if (cache.key === key && (cache.value !== null || cache.promise)) return cache.promise || Promise.resolve(cache.value);
  const promise = axios
    .get('/trust/health')
    .then((r) => {
      const n = r.data?.rawCollected;
      const value = typeof n === 'number' ? n === 0 : null;
      if (cache.key === key) cache = { key, value, promise: null };
      return value;
    })
    .catch(() => {
      if (cache.key === key) cache = { key, value: null, promise: null };
      return null;
    });
  cache = { key, value: null, promise };
  return promise;
}

export function useWorkspaceEmpty() {
  const version = useDataVersion();
  const key = `${getWorkspace()}|${version}`;
  const [state, setState] = useState(() => (cache.key === key ? cache.value : null));
  useEffect(() => {
    let alive = true;
    load(key).then((v) => alive && setState(v));
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}
