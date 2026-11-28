/**
 * Đọc CSV trong trình duyệt (RFC 4180: ngoặc kép, dấu phẩy và xuống dòng trong ô,
 * "" là một dấu ngoặc). Tự nhận dấu phân cách phẩy, chấm phẩy (Excel bản Việt) hoặc tab.
 * Bỏ BOM đầu file. Trả { header, rows } với rows là mảng đối tượng theo tên cột.
 */
export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
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

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

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

/** Ngày kiểu Việt dd/mm/yyyy (có thể kèm giờ), yyyy-mm-dd HH:mm (giờ VN +07:00), hoặc chuỗi ISO; không đọc được thì null */
export function parseVnDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const pad2 = (x) => String(Number(x)).padStart(2, '0');
  const mVn = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mVn) {
    const iso = `${mVn[3]}-${pad2(mVn[2])}-${pad2(mVn[1])}T${pad2(mVn[4] ?? 12)}:${pad2(mVn[5] ?? 0)}:${pad2(mVn[6] ?? 0)}+07:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const mIsoLocal = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mIsoLocal) {
    const iso = `${mIsoLocal[1]}-${pad2(mIsoLocal[2])}-${pad2(mIsoLocal[3])}T${pad2(mIsoLocal[4] ?? 0)}:${pad2(mIsoLocal[5] ?? 0)}:${pad2(mIsoLocal[6] ?? 0)}+07:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Danh sách cột thông tin cá nhân khách hàng bị CẤM lưu (Luật 0.2):
 * Bị loại bỏ ngay trong trình duyệt trước khi gửi lên máy chủ, kể cả khi chọn nhầm cột.
 */
export const FORBIDDEN_ORDER_COLUMNS = [
  'Tên Người nhận',
  'Số điện thoại',
  'Địa chỉ nhận hàng',
  'TP / Quận / Huyện',
  'Quận',
  'Email',
  'Họ & Tên',
  'Mã số thuế',
  'Địa chỉ',
  'Nhận xét từ Người mua',
  'Ghi chú'
];

const FORBIDDEN_EXACT = new Set(FORBIDDEN_ORDER_COLUMNS.map((c) => fold(c).replace(/\s+/g, ' ').trim()));
const FORBIDDEN_PATTERNS = [
  /\b(ten nguoi nhan|recipient name|receiver name)\b/,
  /\b(so dien thoai|dien thoai|phone|mobile|sdt)\b/,
  /\b(dia chi nhan hang|dia chi giao hang|shipping address|recipient address)\b/,
  /^dia chi$|^address$/,
  /\b(tp\s*\/\s*quan\s*\/\s*huyen|quan\s*\/\s*huyen|phuong\s*\/\s*xa|district|ward)\b/,
  /^quan$|^huyen$|^phuong$/,
  /\b(email|e-mail|thu dien tu)\b/,
  /\b(ho\s*&\s*ten|ho va ten|ho ten|full name)\b/,
  /\b(ma so thue|tax code|tax id|mst)\b/,
  /\b(nhan xet tu nguoi mua|buyer comment|buyer note)\b/,
  /^ghi chu$|^note$/
];

export function isForbiddenOrderColumn(colName) {
  const f = fold(colName).replace(/\s+/g, ' ').trim();
  if (!f) return false;
  if (FORBIDDEN_EXACT.has(f)) return true;
  return FORBIDDEN_PATTERNS.some((re) => re.test(f));
}

export function stripForbiddenOrderColumns(rawRow) {
  if (!rawRow || typeof rawRow !== 'object') return {};
  const clean = {};
  for (const [k, v] of Object.entries(rawRow)) {
    if (!isForbiddenOrderColumn(k)) clean[k] = v;
  }
  return clean;
}

/**
 * FILE ĐƠN HÀNG XUẤT TỪ TRANG NGƯỜI BÁN (Shopee, TikTok Shop, Lazada)
 * Tên cột khác nhau giữa các sàn và giữa bản tiếng Việt / tiếng Anh, nên đoán
 * theo từ khóa có ưu tiên: từ khóa cụ thể đứng trước, kèm danh sách loại trừ
 * (ví dụ "Mã vận đơn" không phải mã đơn, "Thời gian giao hàng" là bàn giao vận chuyển chứ không phải deliveredAt).
 */
const ORDER_GUESS = [
  ['orderId', ['ma don hang', 'order id', 'order no', 'order number', 'order sn', 'ma don'], ['van don', 'tracking', 'hoan tra', 'return', 'kien hang']],
  ['orderedAt', ['ngay dat hang', 'thoi gian dat hang', 'ngay dat', 'created time', 'order date', 'order created', 'ngay tao don', 'paid time', 'thoi gian thanh toan'], []],
  ['deliveredAt', ['ngay giao hang noi dia', 'ngay giao hang', 'delivered time', 'delivery time', 'ngay giao', 'ngay nhan hang'], ['du kien', 'estimated', 'gui hang', 'shipped', 'thoi gian giao hang', 'hoan thanh', 'completed', 'phuong thuc']],
  ['shippedAt', ['thoi gian giao hang', 'shipped time', 'ship time', 'handover time'], ['du kien', 'estimated', 'noi dia', 'hoan thanh', 'phuong thuc']],
  ['completedAt', ['thoi gian hoan thanh don hang', 'thoi gian hoan thanh', 'completed time', 'complete time', 'ngay hoan thanh'], []],
  ['amount', ['tong gia tri don hang', 'tong so tien nguoi mua thanh toan', 'tong so tien', 'tong tien', 'thanh tien', 'order amount', 'total amount', 'order total', 'doanh thu', 'so tien'], ['phi', 'fee', 'giam', 'voucher', 'discount', 'hoan', 'refund', 'shipping', 'tro gia', 'subsidy', 'ghi no']],
  ['unitPrice', ['gia uu dai', 'deal price', 'discounted price', 'don gia', 'unit price', 'gia ban', 'gia goc', 'original price'], ['tro gia', 'tong', 'giam', 'combo']],
  ['quantity', ['so luong', 'quantity', 'qty'], ['tra', 'hoan', 'return']],
  ['returnQty', ['so luong san pham duoc hoan tra', 'so luong hoan tra', 'so luong tra', 'return quantity', 'returned quantity'], []],
  ['sku', ['sku san pham', 'parent sku', 'product sku', 'ma sku', 'sku'], ['phan loai', 'variation', 'ten san pham']],
  ['product', ['ten san pham', 'product name', 'ten hang', 'san pham', 'product', 'item name', 'sku name'], ['ma san pham', 'product id', 'sku id', 'sku san pham', 'sku phan loai', 'ten phan loai', 'can nang', 'ban chay', 'hoan tra']],
  ['category', ['nganh hang', 'danh muc', 'nhom hang', 'category'], []],
  ['region', ['tinh/thanh pho', 'tinh/thanh', 'tinh thanh', 'province', 'tinh', 'thanh pho', 'city', 'khu vuc', 'region'], ['dia chi', 'address', 'quan', 'huyen', 'phuong', 'district', 'ward']],
  ['status', ['trang thai don hang', 'trang thai', 'order status', 'status'], ['tra hang', 'return', 'hoan']],
  ['cancelReason', ['ly do huy', 'li do huy', 'cancel reason', 'cancellation reason'], []],
  ['cancelledAt', ['ngay huy thanh cong', 'thoi gian huy', 'ngay huy', 'cancelled time', 'cancel time', 'cancelled at'], []],
  ['returnStatus', ['trang thai tra hang/hoan tien', 'trang thai tra hang', 'tra hang/hoan tien', 'return/refund status', 'return status'], []],
  ['carrier', ['don vi van chuyen', 'nha van chuyen', 'hang van chuyen', 'shipping provider', 'carrier', 'courier'], ['phuong thuc', 'phi']],
  ['orderType', ['loai don hang', 'order type', 'pre-order', 'hang dat truoc'], ['hoa don']],
  ['shopVoucher', ['ma giam gia cua shop', 'voucher cua shop', 'seller voucher', 'shop voucher'], ['shopee', 'combo']],
  ['buyer', ['nguoi mua', 'buyer username', 'ten tai khoan nguoi mua', 'buyer'], ['nhan xet', 'thanh toan', 'nguoi nhan', 'recipient']]
];

export const ORDER_FIELDS = [
  { key: 'orderId', label: 'Mã đơn hàng', required: true },
  { key: 'orderedAt', label: 'Ngày đặt hàng' },
  { key: 'deliveredAt', label: 'Ngày giao hàng nội địa' },
  { key: 'shippedAt', label: 'Thời gian bàn giao vận chuyển' },
  { key: 'completedAt', label: 'Thời gian hoàn thành đơn' },
  { key: 'amount', label: 'Tổng giá trị đơn hàng' },
  { key: 'unitPrice', label: 'Giá ưu đãi (hoặc giá gốc)' },
  { key: 'quantity', label: 'Số lượng' },
  { key: 'sku', label: 'SKU sản phẩm' },
  { key: 'product', label: 'Tên sản phẩm' },
  { key: 'category', label: 'Ngành hàng' },
  { key: 'region', label: 'Tỉnh, thành phố' },
  { key: 'status', label: 'Trạng thái đơn' },
  { key: 'cancelReason', label: 'Lý do hủy' },
  { key: 'cancelledAt', label: 'Ngày hủy thành công' },
  { key: 'returnStatus', label: 'Trạng thái trả hàng / hoàn tiền' },
  { key: 'returnQty', label: 'Số lượng hoàn trả' },
  { key: 'carrier', label: 'Đơn vị vận chuyển' },
  { key: 'orderType', label: 'Loại đơn hàng' },
  { key: 'shopVoucher', label: 'Mã giảm giá của Shop' },
  { key: 'buyer', label: 'Tài khoản người mua (sẽ băm ẩn danh)' }
];

export function guessOrderMapping(header) {
  const safeHeader = (header || []).filter((h) => !isForbiddenOrderColumn(h));
  const used = new Set();
  const map = {};
  for (const [field, words, not] of ORDER_GUESS) {
    for (const w of words) {
      const hit = safeHeader.find((h) => !used.has(h) && fold(h).includes(w) && !not.some((x) => fold(h).includes(x)));
      if (hit) { map[field] = hit; used.add(hit); break; }
    }
  }
  return map;
}

/**
 * Dựng 1 dòng payload đơn hàng sạch để gửi lên máy chủ:
 * các cột cấm bị xóa trước khi đọc, nên dù người dùng chọn nhầm cột cũng không lọt thông tin cá nhân.
 */
export function buildOrderPayloadRow(rawRow, map = {}, rowNumber = 0) {
  const r = stripForbiddenOrderColumns(rawRow);
  const pick = (field) => {
    const col = map[field];
    if (!col || isForbiddenOrderColumn(col)) return null;
    const v = r[col];
    return v == null || String(v).trim() === '' ? null : String(v).trim();
  };
  const orderId = pick('orderId') || '';
  return {
    row: rowNumber,
    orderId,
    orderedAt: map.orderedAt ? parseVnDate(pick('orderedAt')) : null,
    deliveredAt: map.deliveredAt ? parseVnDate(pick('deliveredAt')) : null,
    shippedAt: map.shippedAt ? parseVnDate(pick('shippedAt')) : null,
    completedAt: map.completedAt ? parseVnDate(pick('completedAt')) : null,
    cancelledAt: map.cancelledAt ? parseVnDate(pick('cancelledAt')) : null,
    amount: map.amount ? parseMoney(pick('amount')) : null,
    unitPrice: map.unitPrice ? parseMoney(pick('unitPrice')) : null,
    quantity: map.quantity ? parseMoney(pick('quantity')) : null,
    returnQty: map.returnQty ? parseMoney(pick('returnQty')) : null,
    sku: pick('sku'),
    product: pick('product'),
    category: pick('category'),
    region: pick('region'),
    status: pick('status'),
    cancelReason: pick('cancelReason'),
    returnStatus: pick('returnStatus'),
    carrier: pick('carrier'),
    orderType: pick('orderType'),
    shopVoucher: pick('shopVoucher'),
    buyer: pick('buyer')
  };
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
