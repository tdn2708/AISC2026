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
