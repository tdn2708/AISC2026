/**
 * KHỐI DỮ LIỆU CHO TRANG "BẢNG SỐ LIỆU"
 * ------------------------------------------------------------------
 * Trang Bảng số liệu lọc chéo ngay trên trình duyệt: bấm một kênh thì mọi
 * biểu đồ khác lọc theo, không chờ máy chủ. Muốn vậy trình duyệt cần từng
 * phản hồi, nhưng bản đầy đủ nặng cả chục MB. Ở đây mỗi phản hồi được tính
 * (trọng số > 0) chỉ còn một hàng số nguyên, các chuỗi lặp lại (kênh, nhóm
 * vấn đề, sản phẩm) gom vào từ điển dùng chung:
 *
 *   rows[i] = [ngàyLùi, kênh, nhóm, cảmXúc, bằngChứng, sảnPhẩm, nguyênNhân, sao, trọngSố×10000]
 *
 *   ngàyLùi    số ngày tính lùi từ mốc asOf (0 = ngày mới nhất)
 *   cảmXúc     0 tiêu cực, 1 trung tính, 2 tích cực
 *   bằngChứng  0 có chứng từ, 1 người duyệt, 2 AI đoán
 *   sao        1 đến 5, 0 khi không có
 *   -1         không có giá trị (vd. phản hồi không gắn sản phẩm)
 *
 * Hàm thuần, không đọc DB: route gọi với ctx.items đã qua Trust Layer.
 */

const SENTIMENTS = ['Negative', 'Neutral', 'Positive'];
const EVIDENCE = ['verified', 'human', 'inferred'];
const DAY_MS = 86400000;

function buildCube(items, { asOf, evidenceKind, categoryLabel, causeLabel, isCountable }) {
  const anchor = new Date(asOf || Date.now()).getTime();
  const dicts = { source: [], category: [], product: [], cause: [] };
  const index = { source: new Map(), category: new Map(), product: new Map(), cause: new Map() };
  const idOf = (dim, key, make) => {
    if (key == null || key === '') return -1;
    let i = index[dim].get(key);
    if (i === undefined) {
      i = dicts[dim].length;
      index[dim].set(key, i);
      dicts[dim].push(make ? make(key) : key);
    }
    return i;
  };

  const rows = [];
  for (const f of items) {
    if (!isCountable(f)) continue;
    const t = new Date(f.timestamp).getTime();
    if (!Number.isFinite(t)) continue;
    const back = Math.max(0, Math.floor((anchor - t) / DAY_MS));
    const s = SENTIMENTS.indexOf(f.sentiment);
    const cat = f.category && f.category !== 'Other' ? f.category : null;
    const causeKey = cat && f.subCategory ? `${cat}|${f.subCategory}` : null;
    const rating = Number.isInteger(f.rating) && f.rating >= 1 && f.rating <= 5 ? f.rating : 0;
    rows.push([
      back,
      idOf('source', f.source || 'Khác'),
      idOf('category', cat, (k) => ({ key: k, label: categoryLabel(k) })),
      s < 0 ? 1 : s,
      EVIDENCE.indexOf(evidenceKind(f)),
      idOf('product', f.productName && f.productName.trim() ? f.productName.trim() : null),
      idOf('cause', causeKey, (k) => {
        const [c, sub] = k.split('|');
        return { key: k, category: c, label: causeLabel(c, sub) };
      }),
      rating,
      Math.round((f.trust?.weight ?? 0) * 10000)
    ]);
  }
  return {
    asOf: new Date(anchor).toISOString(),
    columns: ['back', 'source', 'category', 'sentiment', 'evidence', 'product', 'cause', 'rating', 'weight'],
    sentiments: SENTIMENTS,
    evidence: EVIDENCE,
    dicts,
    rows
  };
}

module.exports = { buildCube };
