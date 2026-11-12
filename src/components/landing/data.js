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
 * lúc 20:53 ngày 12/11/2026, `computedAt` 2026-11-12T13:51:51Z. Chỉ giữ
 * các trường trang này đọc, đúng tên trường của API.
 */
export const SNAPSHOT_DATE = '12/11/2026';

export const SNAPSHOT = {
  rawCollected: 15112,
  spamRemoved: { count: 567 },
  inauthenticFlagged: { count: 69 },
  pendingReview: { count: 14 },
  validForAnalysis: 14462,
  countedForMetrics: 14314,
  ledger: { spam: 567, inauthentic: 69, pendingNotCounted: 12, pendingCounted: 2, aged: 150, counted: 14314 },
  reconciliationRate: 60,
  humanLabelCount: 0,
  tierBreakdown: [
    { tier: 'P1', count: 8277 },
    { tier: 'P2', count: 794 },
    { tier: 'P3', count: 3081 },
    { tier: 'P4', count: 2904 },
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

/**
 * BÌNH LUẬN MẪU TRONG KHO MÔ PHỎNG (K5-03, K5-05)
 * ------------------------------------------------------------------
 * Chép TĨNH từ kho Mô phỏng (workspace demo) qua API local chỉ đọc
 * `GET /api/feedbacks?include=all` lúc 01:44 ngày 13/11/2026, chọn theo
 * `trust.band` mà Trust Layer đã gán: SPAM, LIKELY_INAUTHENTIC, GRAY_ZONE,
 * ACCEPTED trọng số 0 (quá cũ), ACCEPTED trọng số trên 0,9 (khách thật).
 * Trang không gọi thêm API. `id` là `_id` trong kho để đối chiếu lại.
 * Tên người không đưa vào trang (kho chỉ để tên hiển thị, trang chỉ cần lời bình);
 * số điện thoại của tin quảng cáo thì cắt thành "…" để trang không phát số lạ.
 */
export const SAMPLE_NOTE = 'Ví dụ trong kho Mô phỏng';

/** Mỗi dòng trừ của sổ có đúng một bình luận mẫu (khóa trùng khóa bước của LedgerRun) */
export const LEDGER_SAMPLES = {
  spam: { id: '6ad4f80b38249ce6c0e41921', source: 'Facebook', date: '12/11/2026', text: 'Xả kho giá sốc, ib nhận mã giảm giá SALE50K, freeship toàn quốc' },
  inauthentic: { id: '6ad4f80a38249ce6c0e40cf2', source: 'Shopee', rating: 5, date: '16/10/2026', text: 'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ ủng hộ tiếp' },
  pending: { id: '6ad626071932fa02427a8a49', source: 'Tiki', rating: 5, date: '31/08/2023', text: 'hàng ko như mong đợi đồ rởm' },
  aged: { id: '6ad96e23c5596153763f793c', source: 'Tiki', rating: 2, date: '25/08/2025', text: 'Mùi nhựa và hóa chất còn hôi rất rất nhiều' }
};

/**
 * Danh sách cho "khung ngắm" ở nhịp Cái giá. `kind` là kết luận của Trust Layer:
 * spam = Rác, fake = Nghi ảo, real = Khách thật.
 */
export const SCAN_LABELS = { spam: 'Rác', fake: 'Nghi ảo', real: 'Khách thật' };
export const SCAN_SAMPLES = [
  { id: '6ad4f80b38249ce6c0e41950', kind: 'real', source: 'Shopee', rating: 2, date: '12/11/2026', text: 'Chán quá, thùng carton bên ngoài rất nát, bên trong cũng không còn nguyên lần sau chắc không dám mua nữa' },
  { id: '6ad4f80b38249ce6c0e4194f', kind: 'spam', source: 'TikTok', date: '12/11/2026', text: 'Việc nhẹ lương cao làm tại nhà, thu nhập 500k mỗi ngày, ib mình …' },
  { id: '6ad4f80b38249ce6c0e4194b', kind: 'real', source: 'Shopee', rating: 5, date: '12/11/2026', text: 'Shop hỗ trợ đổi size rất nhanh, không phải chờ lâu, sẽ ủng hộ shop tiếp. Form chuẩn, mặc lên đẹp.' },
  { id: '6ad4f80a38249ce6c0e40cf4', kind: 'fake', source: 'Shopee', rating: 5, date: '16/10/2026', text: 'Sản phẩm rất tốt, shop giao hàng nhanh, đóng gói kỹ, mình rất hài lòng sẽ ủng hộ tiếp' },
  { id: '6ad4f80a38249ce6c0e40cf3', kind: 'fake', source: 'Shopee', rating: 5, date: '16/10/2026', text: 'Sản phẩm tốt lắm, shop giao hàng nhanh, đóng gói đẹp, mình rất hài lòng sẽ mua tiếp' },
  { id: '6ad4f80b38249ce6c0e41953', kind: 'real', source: 'Tiki', rating: 1, date: '12/11/2026', text: 'Shop ơi, đội giá lên rồi treo biển giảm sâu, ai mà không biết' },
  { id: '6ad4f80b38249ce6c0e41912', kind: 'spam', source: 'Shopee', rating: 5, date: '12/11/2026', text: '👍' },
  { id: '6ad4f80b38249ce6c0e41951', kind: 'real', source: 'Shopee', rating: 5, date: '12/11/2026', text: 'dat cho vo dung. pin dung ca ngay van con. may chay em, pin trau hon cai cu nhieu!' }
];
