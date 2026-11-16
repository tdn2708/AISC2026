import { createElement, lazy } from 'react';

/**
 * TRANG TẢI RIÊNG (đánh giá 16/11, mục 10)
 *
 * Mỗi trang ít dùng thành một gói JS riêng, gói chính nhẹ đi. Để bấm sang
 * trang không phải chờ mạng, preloadPages() tải ngầm mọi trang khi trình
 * duyệt rảnh. Trang đã tải xong thì render thẳng component thật (không qua
 * React.lazy), nên không có khung chờ nháy lên và View Transition chụp được
 * trang mới ngay.
 *
 * Sau một lần deploy, tên gói cũ trên Vercel không còn: import() lỗi. Khi đó
 * tải lại trang một lần (đánh dấu trong sessionStorage để không lặp vô hạn).
 */

const RELOAD_KEY = 'cr-chunk-reload';
const all = [];
const session = {
  get: () => { try { return window.sessionStorage.getItem(RELOAD_KEY); } catch { return null; } },
  set: (v) => { try { window.sessionStorage.setItem(RELOAD_KEY, v); } catch { /* không nhớ được thì thôi */ } }
};

function withRetry(loader) {
  return () =>
    loader().then(
      (mod) => {
        session.set('');
        return mod;
      },
      (err) => {
        if (session.get() !== '1') {
          session.set('1');
          window.location.reload();
          return new Promise(() => {}); // chờ trang tải lại, không hiện lỗi
        }
        throw err;
      }
    );
}

export function lazyPage(loader) {
  let Loaded = null;
  let promise = null;
  // Một lượt tải dùng chung cho tải ngầm và lúc mở trang; lỗi thì lần sau thử lại
  const fetchOnce = () => {
    if (!promise) {
      promise = loader().then((mod) => {
        Loaded = mod.default;
        return mod;
      });
      promise.catch(() => {
        promise = null;
      });
    }
    return promise;
  };
  // Chỉ lúc người dùng mở trang mới tải lại cả trang khi gói lỗi; tải ngầm lỗi thì im lặng
  const Lazy = lazy(withRetry(fetchOnce));
  const Page = (props) => createElement(Loaded || Lazy, props);
  Page.preload = fetchOnce;
  all.push(Page);
  return Page;
}

/** Tải ngầm mọi trang khi trình duyệt rảnh (gọi một lần sau khi vào app) */
let preloaded = false;
export function preloadPages() {
  if (preloaded || typeof window === 'undefined') return;
  preloaded = true;
  const run = () => all.forEach((p) => p.preload().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
