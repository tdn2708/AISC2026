/**
 * MẢNG HÀNG CỦA MỘT PHẢN HỒI — hàm thuần
 * ==================================================================
 * Điểm đau phải tìm theo từng mảng hàng (chuột không dây hỏng một kiểu, máy
 * xay hỏng kiểu khác), nhưng không phải nguồn dữ liệu nào cũng ghi mảng hàng.
 * Thứ tự lấy, mạnh tới yếu, và luôn trả kèm nguồn để giao diện nói thật:
 *   1. `productCategory` có sẵn trên bản ghi (máy tự thu thập gán theo từ khóa
 *      tìm; dán link Tiki thì lấy danh mục lá trong breadcrumb của sàn; file
 *      shop nạp lên có cột danh mục);
 *   2. suy từ tên sản phẩm: cụm chữ đầu dài nhất (2 đến 4 âm tiết) mà ít nhất
 *      một sản phẩm KHÁC trong kho cũng bắt đầu bằng nó ("Máy xay sinh tố
 *      Toshiba..." và "Máy xay sinh tố Philips..." chung "máy xay sinh tố");
 *   3. còn lại: chính tên sản phẩm (một sản phẩm là một mảng);
 *   4. không có tên sản phẩm: "Toàn shop".
 * KHÔNG có danh sách mảng hàng hay sản phẩm nào viết cứng ở đây.
 */

const SOURCE_LABEL = {
  field: 'danh mục ghi trên dữ liệu',
  name: 'suy từ tên sản phẩm',
  product: 'từng sản phẩm riêng',
  shop: 'cả shop (dữ liệu không có tên sản phẩm)'
};

const ALL_SHOP = 'Toàn shop';

/** Chữ mở đầu tên sản phẩm không nói lên mảng hàng ("Combo 2", "Thùng 48 Hộp") */
const LEAD_NOISE = new Set(['combo', 'set', 'bộ', 'thùng', 'hộp', 'túi', 'lốc', 'cặp', 'đôi', 'gói', 'chai', 'lọ', 'tuýp', 'mới', 'new', 'hot', 'sale', 'freeship', 'chính', 'hãng']);

/** Âm tiết thường của tên: bỏ ngoặc, dấu câu; giữ chữ và số */
function nameTokens(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function cleanLead(tokens) {
  let i = 0;
  while (i < tokens.length && (LEAD_NOISE.has(tokens[i]) || /^\d+[a-z]*$/.test(tokens[i]))) i += 1;
  return tokens.slice(i);
}

const tidy = (s) => {
  const t = String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

/**
 * Dựng hàm tra mảng hàng cho cả một tập phản hồi (cần cả tập vì bước 2 so tên
 * các sản phẩm với nhau).
 * @returns {(f) => { key: string, label: string, source: keyof SOURCE_LABEL }}
 */
function buildGrouper(items) {
  const names = new Set();
  for (const f of items) if (f.productName && !f.productCategory) names.add(f.productName);

  // Đếm mỗi tiền tố (2 đến 4 âm tiết) xuất hiện ở bao nhiêu tên KHÁC NHAU
  const prefixCount = new Map();
  const tokensOf = new Map();
  for (const n of names) {
    const t = cleanLead(nameTokens(n));
    tokensOf.set(n, t);
    for (let k = 2; k <= Math.min(4, t.length); k += 1) {
      const p = t.slice(0, k).join(' ');
      prefixCount.set(p, (prefixCount.get(p) || 0) + 1);
    }
  }
  const byName = new Map();
  for (const n of names) {
    const t = tokensOf.get(n);
    let best = null;
    for (let k = Math.min(4, t.length); k >= 2; k -= 1) {
      const p = t.slice(0, k).join(' ');
      if ((prefixCount.get(p) || 0) >= 2) { best = p; break; }
    }
    byName.set(n, best
      ? { key: `name:${best}`, label: tidy(best), source: 'name' }
      : { key: `product:${n}`, label: n, source: 'product' });
  }

  return (f) => {
    if (f.productCategory) {
      const label = tidy(f.productCategory);
      return { key: `field:${label.toLowerCase()}`, label, source: 'field' };
    }
    if (f.productName) return byName.get(f.productName);
    return { key: 'shop', label: ALL_SHOP, source: 'shop' };
  };
}

/** Danh mục lá từ breadcrumb Tiki: [..., "Nồi chiên", "<tên sản phẩm>"] -> "Nồi chiên" */
function leafFromBreadcrumbs(breadcrumbs, productName) {
  const names = (Array.isArray(breadcrumbs) ? breadcrumbs : [])
    .map((b) => (typeof b === 'string' ? b : b?.name))
    .filter(Boolean);
  if (names.length && productName && names[names.length - 1] === productName) names.pop();
  return names.length ? names[names.length - 1] : null;
}

module.exports = { buildGrouper, leafFromBreadcrumbs, nameTokens, SOURCE_LABEL, ALL_SHOP };
