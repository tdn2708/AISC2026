/**
 * Tính toán cho trang Bảng số liệu, trên khối dữ liệu của GET /bi/cube
 * (backend/services/bi_cube.js). Hàm thuần: không React, không gọi mạng.
 *
 * Lọc chéo theo cách của các công cụ BI: mỗi biểu đồ chịu mọi lựa chọn TRỪ
 * lựa chọn trên chính chiều của nó, để vẫn thấy các cột còn lại và cột đang
 * chọn được tô đậm, thay vì chỉ còn trơ một cột.
 */

export const COL = { back: 0, source: 1, category: 2, sentiment: 3, evidence: 4, product: 5, cause: 6, rating: 7, weight: 8 };
export const SENT = { neg: 0, neu: 1, pos: 2 };
const W = 10000;

/** Các chiều lọc được: tên tham số URL -> cột */
export const DIMS = { src: COL.source, cat: COL.category, prod: COL.product, sent: COL.sentiment };

/**
 * rows trong khoảng [from, to) ngày lùi, qua mọi lựa chọn trừ `except`.
 * sel: { src, cat, prod, sent } là chỉ số trong từ điển, hoặc null.
 */
export function slice(rows, sel, { from = 0, to = Infinity, except = null } = {}) {
  const checks = Object.entries(DIMS).filter(([k]) => k !== except && sel[k] != null).map(([k, c]) => [c, sel[k]]);
  const out = [];
  for (const r of rows) {
    const b = r[COL.back];
    if (b < from || b >= to) continue;
    let ok = true;
    for (const [c, v] of checks) if (r[c] !== v) { ok = false; break; }
    if (ok) out.push(r);
  }
  return out;
}

/** Bốn chỉ số chính của một tập hàng */
export function kpis(rows) {
  let n = 0, w = 0, wNeg = 0, starSum = 0, starN = 0, proof = 0;
  for (const r of rows) {
    n += 1;
    const rw = r[COL.weight] / W;
    w += rw;
    if (r[COL.sentiment] === SENT.neg) wNeg += rw;
    if (r[COL.rating] > 0) { starSum += r[COL.rating]; starN += 1; }
    if (r[COL.evidence] !== 2) proof += 1;
  }
  return {
    count: n,
    negRate: w > 0 ? wNeg / w : null,
    stars: starN ? starSum / starN : null,
    proofShare: n ? proof / n : null
  };
}

/** Gom theo một cột: [{ id, n, neg, w, wNeg, starSum, starN, proof }] */
export function groupBy(rows, col) {
  const m = new Map();
  for (const r of rows) {
    const id = r[col];
    if (id < 0) continue;
    let g = m.get(id);
    if (!g) { g = { id, n: 0, neg: 0, w: 0, wNeg: 0, starSum: 0, starN: 0, proof: 0 }; m.set(id, g); }
    const rw = r[COL.weight] / W;
    g.n += 1; g.w += rw;
    if (r[COL.sentiment] === SENT.neg) { g.neg += 1; g.wNeg += rw; }
    if (r[COL.rating] > 0) { g.starSum += r[COL.rating]; g.starN += 1; }
    if (r[COL.evidence] !== 2) g.proof += 1;
  }
  return [...m.values()].map((g) => ({
    ...g,
    negRate: g.w > 0 ? g.wNeg / g.w : null,
    stars: g.starN ? g.starSum / g.starN : null,
    proofShare: g.n ? g.proof / g.n : null
  }));
}

/** Bảng chéo hai cột, đếm phản hồi tiêu cực: Map("a|b" -> số) */
export function crossNeg(rows, colA, colB) {
  const m = new Map();
  for (const r of rows) {
    if (r[COL.sentiment] !== SENT.neg || r[colA] < 0 || r[colB] < 0) continue;
    const k = `${r[colA]}|${r[colB]}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * Chia khoảng thời gian thành các kỳ đều nhau, cũ trước mới sau. Độ dài kỳ
 * theo độ dài khoảng: tới 45 ngày thì từng ngày, tới 200 ngày từng tuần,
 * dài hơn thì từng tháng (30 ngày), tối đa 60 kỳ.
 */
export function buckets(span) {
  const size = span <= 45 ? 1 : span <= 200 ? 7 : Math.max(30, Math.ceil(span / 60));
  const count = Math.max(1, Math.ceil(span / size));
  return { size, count };
}

/** Chuỗi theo kỳ: [{ i, from, neg, neu, pos, n, wNeg, w, starSum, starN, proof }] với i = 0 là kỳ cũ nhất */
export function series(rows, span) {
  const { size, count } = buckets(span);
  const out = Array.from({ length: count }, (_, k) => ({ i: k, from: (count - 1 - k) * size, size, neg: 0, neu: 0, pos: 0, n: 0, w: 0, wNeg: 0, starSum: 0, starN: 0, proof: 0 }));
  for (const r of rows) {
    const k = count - 1 - Math.floor(r[COL.back] / size);
    if (k < 0 || k >= count) continue;
    const o = out[k];
    const rw = r[COL.weight] / W;
    o.n += 1; o.w += rw;
    const s = r[COL.sentiment];
    if (s === SENT.neg) { o.neg += 1; o.wNeg += rw; } else if (s === SENT.neu) o.neu += 1; else o.pos += 1;
    if (r[COL.rating] > 0) { o.starSum += r[COL.rating]; o.starN += 1; }
    if (r[COL.evidence] !== 2) o.proof += 1;
  }
  return out;
}

/** Độ dài khoảng thật của dữ liệu (ngày), để "Toàn bộ" không vẽ cả nghìn kỳ rỗng */
export function dataSpan(rows) {
  let max = 0;
  for (const r of rows) if (r[COL.back] > max) max = r[COL.back];
  return max + 1;
}
