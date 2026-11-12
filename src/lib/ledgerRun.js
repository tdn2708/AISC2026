/**
 * PHÉP TRỪ CHẠY (F2-04), phần tính thuần, không React, không DOM.
 *
 * Sổ đối chiếu: thu thập - rác - nghi ảo - chờ duyệt chưa tính - quá cũ
 * = được tính vào chỉ số (countedForMetrics). Component LedgerRun
 * (components/motion/LedgerRun.jsx) dựng nó thành chuyển động; trang giới
 * thiệu điều khiển bằng thanh cuộn qua cùng hàm ledgerStateAt.
 *
 * Bất biến: số còn lại ở bước cuối LUÔN là số được tính lấy từ API. Nếu dữ
 * liệu không khớp phép trừ, không sửa dòng nào cho "đẹp": vẫn hiện đúng số
 * API, và run.matches = false, run.diff = phần lệch, để giao diện nói lệch.
 *
 * Test: node --test src/lib/ledgerRun.test.mjs
 */

const num = (v) => (Number.isFinite(v) ? v : 0);
const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Đưa hai dạng đầu vào về một dạng phẳng.
 * - Dạng API /trust/health: { rawCollected, spamRemoved: {count}, inauthenticFlagged: {count},
 *   pendingReview: {count}, validForAnalysis, countedForMetrics, ledger: { pendingNotCounted,
 *   pendingCounted, aged, ... } } — đọc y như Ledger trong dashboard/SummaryHeader.jsx.
 * - Dạng phẳng (trang giới thiệu, ảnh chụp số tĩnh, test): { raw, spam, inauthentic,
 *   pendingNotCounted, pendingCounted, aged, counted }.
 * Trả null khi không có số thu thập.
 */
export function normalizeLedger(input) {
  if (!input || typeof input !== 'object') return null;
  if ('rawCollected' in input) {
    const counted = input.countedForMetrics ?? input.validForAnalysis;
    // ledger (máy chủ mới): phản hồi chờ duyệt còn trọng số được tính tạm, không trừ
    const split = input.ledger;
    return {
      raw: num(input.rawCollected),
      spam: num(input.spamRemoved?.count),
      inauthentic: num(input.inauthenticFlagged?.count),
      pending: num(split ? split.pendingNotCounted : input.pendingReview?.count),
      pendingCounted: num(split?.pendingCounted),
      hasSplit: Boolean(split),
      aged: num(split ? split.aged : Math.max(0, num(input.validForAnalysis) - num(counted))),
      counted: num(counted)
    };
  }
  if (!('raw' in input)) return null;
  return {
    raw: num(input.raw),
    spam: num(input.spam),
    inauthentic: num(input.inauthentic),
    pending: num(input.pendingNotCounted ?? input.pending),
    pendingCounted: num(input.pendingCounted),
    hasSplit: true,
    aged: num(input.aged),
    counted: num(input.counted ?? input.countedForMetrics)
  };
}

/**
 * Danh sách bước của phép trừ.
 * steps: [{ key, label, value, sign, after }] theo thứ tự hiện; `after` là số
 * còn lại SAU bước đó. Bước đầu là thu thập, bước cuối là "Được tính vào chỉ
 * số" với after = counted (số API). Dòng chờ duyệt và quá cũ chỉ có khi > 0,
 * như sổ đang có; rác và nghi ảo luôn có.
 */
export function buildLedgerRun(input) {
  const l = normalizeLedger(input);
  if (!l) return null;
  const subs = [
    { key: 'spam', label: 'Rác, quảng cáo', value: l.spam },
    { key: 'inauthentic', label: 'Nghi đánh giá ảo', value: l.inauthentic }
  ];
  if (l.pending > 0) subs.push({ key: 'pending', label: l.pendingCounted > 0 ? 'Chờ duyệt, chưa tính' : 'Chờ người duyệt', value: l.pending });
  if (l.aged > 0) subs.push({ key: 'aged', label: 'Quá cũ, không còn trọng số', value: l.aged });

  const steps = [{ key: 'raw', label: 'Phản hồi thu thập được', value: l.raw, sign: null, after: l.raw }];
  let left = l.raw;
  for (const s of subs) {
    left -= s.value;
    steps.push({ ...s, sign: '−', after: left });
  }
  const removed = l.raw - left;
  steps.push({ key: 'counted', label: 'Được tính vào chỉ số', value: l.counted, sign: null, after: l.counted });

  const diff = left - l.counted;
  return {
    steps,
    raw: l.raw,
    removed,
    arithmetic: left, // thu thập trừ mọi dòng, đúng phép tính
    counted: l.counted, // số API, số cuối cùng hiện ra
    diff,
    matches: diff === 0,
    pendingCounted: l.pendingCounted
  };
}

/** Mốc thời gian trong tiến độ 0..1: thu thập hiện tới RAW_END, các dòng trừ tới SUB_END, rồi chốt. */
export const RUN_PHASES = { rawEnd: 0.1, subEnd: 0.84 };

/**
 * Trạng thái ở tiến độ p (0 đến 1).
 * Trả { reveal: { [key]: 0..1 }, remaining (số thực, để trục chữ số trượt
 * mượt), shown (số nguyên đang hiện), settle: 0..1 (nhịp chốt và dòng "phép
 * trừ khớp"), done }.
 * - 0 tới rawEnd: dòng thu thập và dòng tổng hiện ra, tổng = thu thập.
 * - rawEnd tới subEnd: chia đều cho các dòng trừ; mỗi dòng hiện vào rồi số
 *   còn lại đếm lùi đúng bằng giá trị dòng đó.
 * - subEnd tới 1: chốt. Khớp thì số đứng yên; lệch thì trượt từ kết quả phép
 *   tính về số API (và giao diện báo lệch).
 * Tại p = 1: remaining = shown = counted, mọi reveal = 1.
 */
export function ledgerStateAt(run, p) {
  if (!run) return null;
  const t = clamp01(Number.isFinite(p) ? p : 1);
  const { rawEnd, subEnd } = RUN_PHASES;
  const subs = run.steps.slice(1, -1);
  const reveal = {};
  const head = clamp01(t / rawEnd);
  reveal.raw = head;
  reveal.counted = head;

  let remaining = run.raw;
  const seg = (subEnd - rawEnd) / Math.max(1, subs.length);
  subs.forEach((s, i) => {
    const local = (t - rawEnd - i * seg) / seg;
    reveal[s.key] = clamp01(local / 0.45);
    // Dòng hiện vào trước, số còn lại bắt đầu trừ khi dòng đã hiện được một phần
    if (local <= 0.2) return;
    const before = s.after + s.value;
    remaining = before - s.value * easeInOut(clamp01((local - 0.2) / 0.8));
  });

  const settle = clamp01((t - subEnd) / (1 - subEnd));
  if (t >= subEnd) remaining = run.arithmetic + (run.counted - run.arithmetic) * easeInOut(settle);
  if (t >= 1) remaining = run.counted;

  return { reveal, remaining, shown: Math.round(remaining), settle, done: t >= 1 };
}

/**
 * Vị trí trục chữ số cho bộ đếm kiểu công tơ (mỗi cột là một dải 0..9
 * trượt dọc bằng transform). value là số thực ≥ 0; slots là số cột.
 * Trả { positions, visible } từ cột cao nhất tới hàng đơn vị:
 * - positions[i] trong [0, 10): hàng đơn vị trượt liên tục; cột cao hơn chỉ
 *   nhích khi mọi cột thấp hơn đang qua 9 sang 0, như công tơ cơ.
 * - visible[i]: cột có nghĩa (không hiện số 0 vô nghĩa ở đầu).
 * Với số nguyên, positions đúng bằng các chữ số.
 */
export function rollerPositions(value, slots) {
  const v = Math.max(0, Number.isFinite(value) ? value : 0);
  const positions = [];
  const visible = [];
  for (let i = slots - 1; i >= 0; i -= 1) {
    const place = 10 ** i;
    let pos;
    if (i === 0) pos = v % 10;
    else {
      const base = Math.floor(v / place) % 10;
      const lower = v % place; // phần do các cột thấp hơn tạo ra
      pos = base + Math.max(0, lower - (place - 1));
    }
    positions.push(pos >= 10 ? pos - 10 : pos);
    visible.push(i === 0 || v >= place - 0.5);
  }
  return { positions, visible };
}

/** Số cột cần cho một số nguyên dương */
export const digitCount = (n) => Math.max(1, String(Math.floor(Math.abs(num(n)))).length);
