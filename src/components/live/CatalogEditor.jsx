import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, TextArea, fieldClass } from '../ui';

/**
 * SẢN PHẨM VÀ CHÍNH SÁCH CỦA PHIÊN LIVE
 * ------------------------------------------------------------------
 * Gợi ý trả lời chỉ dùng đúng những gì khai báo ở đây. Bỏ trống ô nào thì
 * câu hỏi về ô đó được gợi ý "shop kiểm tra rồi báo lại", không bịa.
 *
 * Tồn kho nhập một số ("120") hoặc theo size ("S:40, M:85"). Bảng size dạng
 * "S:50kg/160cm, M:60kg/168cm" để tự tư vấn size theo chiều cao, cân nặng.
 */

const POLICY_FIELDS = [
  ['shipping', 'Giao hàng', 'Freeship đơn trong live; nội thành 1-2 ngày, tỉnh 3-5 ngày'],
  ['payment', 'Thanh toán', 'COD và chuyển khoản'],
  ['returns', 'Đổi trả, bảo hành', 'Đổi size trong 7 ngày'],
  ['promo', 'Khuyến mãi', 'Mã LIVE1111 giảm 11%, tối đa 50.000đ'],
  ['authenticity', 'Nguồn gốc, chính hãng', 'Hàng xưởng của shop, có hóa đơn'],
  ['howToOrder', 'Cách đặt hàng', 'Bấm giỏ hàng, chọn đúng số sản phẩm'],
  ['complaint', 'Khi khách khiếu nại', 'Nhắn mã đơn cho shop, xử lý trong 24 giờ']
];

export const stockToText = (s) => (s == null ? '' : typeof s === 'number' ? String(s) : Object.entries(s).map(([k, v]) => `${k}:${v}`).join(', '));
export const textToStock = (t) => {
  const s = String(t || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const out = {};
  for (const part of s.split(',')) {
    const [k, v] = part.split(':').map((x) => x.trim());
    if (k && v !== undefined && /^\d+$/.test(v)) out[k] = Number(v);
  }
  return Object.keys(out).length ? out : null;
};
const guideToText = (g = []) => g.map((x) => `${x.size}:${x.maxKg ?? ''}kg/${x.maxCm ?? ''}cm`).join(', ');
const textToGuide = (t) => String(t || '').split(',').map((p) => {
  const m = p.trim().match(/^([\w]+)\s*:\s*(\d+)?\s*kg?\s*\/?\s*(\d+)?/i);
  return m ? { size: m[1].toUpperCase(), maxKg: m[2] ? Number(m[2]) : null, maxCm: m[3] ? Number(m[3]) : null } : null;
}).filter(Boolean);

const inputCls = `px-2.5 ${fieldClass({ size: 'sm' })}`;

/** Dạng nhập liệu (chuỗi) của một sản phẩm */
export const toRow = (p) => ({
  ...p,
  sizesText: (p.sizes || []).join(', '),
  colorsText: (p.colors || []).join(', '),
  stockText: stockToText(p.stock),
  keywordsText: (p.keywords || []).join(', '),
  guideText: guideToText(p.sizeGuide)
});

/** Từ dạng nhập liệu về dạng gửi máy chủ */
export const fromRow = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  price: r.price === '' ? null : r.price,
  salePrice: r.salePrice === '' ? null : r.salePrice,
  sizes: r.sizesText.split(',').map((x) => x.trim()).filter(Boolean),
  colors: r.colorsText.split(',').map((x) => x.trim()).filter(Boolean),
  stock: textToStock(r.stockText),
  keywords: r.keywordsText.split(',').map((x) => x.trim()).filter(Boolean),
  material: r.material || '',
  usage: r.usage || '',
  sizeGuide: textToGuide(r.guideText)
});

const Field = ({ label, children, className = '' }) => (
  <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
    <span className="text-xs font-medium text-ink-lo">{label}</span>
    {children}
  </label>
);

const CatalogEditor = ({ rows, onRows, policy, onPolicy }) => {
  const set = (i, key, value) => onRows(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)));
  const add = () => onRows([...rows, toRow({ code: String(rows.length + 1), name: '', sizes: [], colors: [], keywords: [] })]);
  const remove = (i) => onRows(rows.filter((_, k) => k !== i));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-hi">Sản phẩm trong phiên</h3>
          <Button size="sm" variant="secondary" icon={Plus} onClick={add}>Thêm sản phẩm</Button>
        </div>
        {rows.length === 0 && <p className="text-sm text-ink-lo">Chưa có sản phẩm. Không có danh mục thì vẫn phân loại được bình luận, nhưng không gợi ý được giá, size, tồn kho.</p>}
        <ol className="flex list-none flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id || i} className="rounded-ctrl bg-raised p-3">
              <div className="grid grid-cols-[4rem_1fr_auto] gap-2">
                <Field label="Số giỏ"><input className={inputCls} value={r.code || ''} onChange={(e) => set(i, 'code', e.target.value)} /></Field>
                <Field label="Tên sản phẩm"><input className={inputCls} value={r.name || ''} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Áo thun cotton basic" /></Field>
                <IconButton icon={Trash2} variant="danger" size="sm" label={`Xóa ${r.name || 'sản phẩm'}`} onClick={() => remove(i)} className="mt-6" />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Giá gốc"><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={r.price ?? ''} onChange={(e) => set(i, 'price', e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="Giá live"><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={r.salePrice ?? ''} onChange={(e) => set(i, 'salePrice', e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="Size"><input className={inputCls} value={r.sizesText} onChange={(e) => set(i, 'sizesText', e.target.value)} placeholder="S, M, L" /></Field>
                <Field label="Màu"><input className={inputCls} value={r.colorsText} onChange={(e) => set(i, 'colorsText', e.target.value)} placeholder="đen, trắng" /></Field>
                <Field label="Tồn kho"><input className={`${inputCls} tabular-nums`} value={r.stockText} onChange={(e) => set(i, 'stockText', e.target.value)} placeholder="S:40, M:85" /></Field>
                <Field label="Từ khóa khách hay gọi" className="sm:col-span-3"><input className={inputCls} value={r.keywordsText} onChange={(e) => set(i, 'keywordsText', e.target.value)} placeholder="áo thun, áo phông" /></Field>
                <Field label="Chất liệu" className="col-span-2"><input className={inputCls} value={r.material || ''} onChange={(e) => set(i, 'material', e.target.value)} /></Field>
                <Field label="Bảng size (cân nặng, chiều cao tối đa)" className="col-span-2"><input className={`${inputCls} tabular-nums`} value={r.guideText} onChange={(e) => set(i, 'guideText', e.target.value)} placeholder="S:50kg/160cm, M:60kg/168cm" /></Field>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink-hi">Chính sách bán hàng</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICY_FIELDS.map(([key, label, ph]) => (
            <TextArea key={key} label={label} rows={2} maxLength={400} value={policy[key] || ''} placeholder={ph} onChange={(e) => onPolicy({ ...policy, [key]: e.target.value })} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default CatalogEditor;
