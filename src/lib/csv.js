/**
 * Đọc CSV trong trình duyệt (RFC 4180: ngoặc kép, dấu phẩy và xuống dòng trong ô,
 * "" là một dấu ngoặc). Tự nhận dấu phân cách phẩy, chấm phẩy (Excel bản Việt) hoặc tab.
 * Bỏ BOM đầu file. Trả { header, rows } với rows là mảng đối tượng theo tên cột.
 */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => (firstLine.match(new RegExp(ch === '\t' ? '\t' : `\\${ch}`, 'g')) || []).length;
  const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];

  const out = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) out.push(row);

  const header = (out.shift() || []).map((h, i) => h.trim() || `Cột ${i + 1}`);
  const rows = out.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { header, rows, delimiter: delim };
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Đoán cột theo tên tiêu đề thường gặp trong file xuất từ sàn, Google Form, Excel tự làm */
const GUESS = {
  text: ['noi dung', 'binh luan', 'danh gia', 'nhan xet', 'phan hoi', 'comment', 'review', 'content', 'text', 'feedback', 'y kien'],
  rating: ['so sao', 'sao', 'diem', 'rating', 'star', 'score'],
  date: ['ngay', 'thoi gian', 'date', 'time', 'created'],
  product: ['san pham', 'ten hang', 'mat hang', 'product', 'item', 'sku'],
  category: ['danh muc', 'nganh hang', 'nhom hang', 'loai hang', 'category'],
  orderId: ['ma don', 'don hang', 'order'],
  customer: ['khach', 'nguoi mua', 'ten', 'customer', 'buyer', 'user', 'author'],
  source: ['nguon', 'kenh', 'san', 'source', 'channel', 'platform']
};

export function guessMapping(header) {
  const used = new Set();
  const map = {};
  for (const [field, words] of Object.entries(GUESS)) {
    const hit = header.find((h) => !used.has(h) && words.some((w) => fold(h).includes(w)));
    if (hit) { map[field] = hit; used.add(hit); }
  }
  return map;
}

/** Ngày kiểu Việt dd/mm/yyyy (có thể kèm giờ), yyyy-mm-dd, hoặc chuỗi ISO; không đọc được thì null */
export function parseVnDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0), Number(m[6] || 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * FILE ĐƠN HÀNG XUẤT TỪ TRANG NGƯỜI BÁN (Shopee, TikTok Shop, Lazada)
 * Tên cột khác nhau giữa các sàn và giữa bản tiếng Việt / tiếng Anh, nên đoán
 * theo từ khóa có ưu tiên: từ khóa cụ thể đứng trước, kèm danh sách loại trừ
 * (ví dụ "Mã vận đơn" không phải mã đơn, "Phí vận chuyển" không phải tổng tiền).
 */
const ORDER_GUESS = [
  ['orderId', ['ma don hang', 'order id', 'order no', 'order number', 'order sn', 'ma don'], ['van don', 'tracking', 'hoan tra', 'return']],
  ['orderedAt', ['ngay dat hang', 'thoi gian dat hang', 'ngay dat', 'created time', 'order date', 'order created', 'ngay tao don', 'paid time', 'thoi gian thanh toan'], []],
  ['deliveredAt', ['ngay giao hang', 'thoi gian giao hang', 'delivered time', 'delivery time', 'thoi gian hoan thanh', 'completed time', 'ngay giao', 'ngay nhan hang'], ['du kien', 'estimated', 'gui hang', 'shipped']],
  ['amount', ['tong gia tri don hang', 'tong so tien', 'tong tien', 'thanh tien', 'order amount', 'total amount', 'order total', 'doanh thu', 'so tien'], ['phi', 'fee', 'giam', 'voucher', 'discount', 'hoan', 'refund', 'shipping']],
  ['quantity', ['so luong', 'quantity', 'qty'], ['tra', 'return']],
  ['product', ['ten san pham', 'product name', 'ten hang', 'san pham', 'product', 'item name', 'sku name'], ['ma san pham', 'product id', 'sku id']],
  ['category', ['nganh hang', 'danh muc', 'nhom hang', 'category'], []],
  ['region', ['tinh/thanh pho', 'tinh/thanh', 'tinh thanh', 'province', 'tinh', 'thanh pho', 'city', 'khu vuc', 'region'], ['dia chi', 'address', 'quan', 'phuong', 'district', 'ward']],
  ['status', ['trang thai don hang', 'trang thai', 'order status', 'status'], ['tra hang', 'return', 'hoan']]
];

export const ORDER_FIELDS = [
  { key: 'orderId', label: 'Mã đơn hàng', required: true },
  { key: 'orderedAt', label: 'Ngày đặt hàng' },
  { key: 'deliveredAt', label: 'Ngày giao hàng' },
  { key: 'amount', label: 'Tổng tiền đơn' },
  { key: 'quantity', label: 'Số lượng' },
  { key: 'product', label: 'Tên sản phẩm' },
  { key: 'category', label: 'Ngành hàng' },
  { key: 'region', label: 'Tỉnh, thành phố' },
  { key: 'status', label: 'Trạng thái đơn' }
];

export function guessOrderMapping(header) {
  const used = new Set();
  const map = {};
  for (const [field, words, not] of ORDER_GUESS) {
    for (const w of words) {
      const hit = header.find((h) => !used.has(h) && fold(h).includes(w) && !not.some((x) => fold(h).includes(x)));
      if (hit) { map[field] = hit; used.add(hit); break; }
    }
  }
  return map;
}

/** Số tiền kiểu Việt hoặc quốc tế: "1.234.000 ₫", "₫1,234,000", "1234000.00"; không đọc được thì null */
export function parseMoney(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  let t = String(s || '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  const dec = Math.max(lastDot, lastComma);
  // Phần sau dấu cuối dài đúng 3 chữ số là phân cách nghìn, ngắn hơn là phần thập phân
  if (dec >= 0 && t.length - dec - 1 !== 3) t = `${t.slice(0, dec).replace(/[.,]/g, '')}.${t.slice(dec + 1)}`;
  else t = t.replace(/[.,]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Bảng đọc từ file Excel (mảng các dòng) về cùng dạng với parseCsv */
export function rowsFromSheet(matrix) {
  const rows = (matrix || []).filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''));
  const header = (rows.shift() || []).map((h, i) => (h == null || String(h).trim() === '' ? `Cột ${i + 1}` : String(h).trim()));
  const cell = (v) => (v instanceof Date ? v.toISOString() : v == null ? '' : String(v).trim());
  return { header, rows: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, cell(r[i])]))) };
}
