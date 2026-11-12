import { useEffect, useState } from 'react';
import axios from 'axios';

/**
 * SỐ LIỆU CỦA TRANG GIỚI THIỆU
 * ------------------------------------------------------------------
 * Mọi con số trên trang đến từ ĐÚNG MỘT lần gọi `/trust/health` của kho
 * mô phỏng (demo). Máy chủ Render ngủ thì lần gọi đầu có thể mất cả phút,
 * nên quá 4 giây hoặc lỗi là dùng ảnh chụp số tĩnh bên dưới, và trang ghi
 * rõ "Số liệu ngày 12/11/2026". Số về muộn hơn 4 giây bị bỏ qua: không để
 * con số nhảy khi người xem đang đọc.
 *
 * SNAPSHOT: chụp từ backend local (cùng cụm Atlas với prod, kho demo)
 * lúc 15:17 ngày 12/11/2026, `computedAt` 2026-11-12T08:17:41Z. Chỉ giữ
 * các trường trang này đọc, đúng tên trường của API.
 */
export const SNAPSHOT_DATE = '12/11/2026';

export const SNAPSHOT = {
  rawCollected: 15076,
  spamRemoved: { count: 566 },
  inauthenticFlagged: { count: 69 },
  pendingReview: { count: 14 },
  validForAnalysis: 14427,
  countedForMetrics: 14279,
  ledger: { spam: 566, inauthentic: 69, pendingNotCounted: 12, pendingCounted: 2, aged: 150, counted: 14279 },
  reconciliationRate: 60,
  humanLabelCount: 0,
  tierBreakdown: [
    { tier: 'P1', count: 8256 },
    { tier: 'P2', count: 793 },
    { tier: 'P3', count: 3076 },
    { tier: 'P4', count: 2895 },
    { tier: 'P5', count: 56 }
  ]
};

export const WAIT_MS = 4000;

/**
 * Gọi `/trust/health` một lần.
 * Trả { health, source }: source 'loading' (chưa có gì), 'live' (số vừa
 * lấy), 'snapshot' (quá 4 giây hoặc lỗi).
 */
// Một lời hứa cho cả lần tải trang: StrictMode chạy effect hai lần, mở lại
// trang giới thiệu trong cùng phiên cũng không gọi lại máy chủ.
let once = null;
const loadOnce = () => {
  if (once) return once;
  once = new Promise((resolve) => {
    let done = false;
    const finish = (health, source) => {
      if (done) return;
      done = true;
      resolve({ health, source });
    };
    setTimeout(() => finish(SNAPSHOT, 'snapshot'), WAIT_MS);
    axios
      // Kho mô phỏng cố định: trang công khai không đọc lựa chọn kho của người đã đăng nhập
      .get('/trust/health', { headers: { 'X-Workspace': 'demo' }, timeout: WAIT_MS })
      .then((r) => (r.data?.rawCollected > 0 ? finish(r.data, 'live') : finish(SNAPSHOT, 'snapshot')))
      .catch(() => finish(SNAPSHOT, 'snapshot'));
  });
  return once;
};

export function useLandingHealth() {
  const [state, setState] = useState({ health: null, source: 'loading' });
  useEffect(() => {
    let alive = true;
    loadOnce().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Số phản hồi có chứng từ (nguồn hạng P1, P2: khớp mã đơn hoặc tài khoản định danh) */
export const verifiedCount = (h) =>
  (h?.tierBreakdown || []).filter((t) => t.tier === 'P1' || t.tier === 'P2').reduce((s, t) => s + (t.count || 0), 0);
