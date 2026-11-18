import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileUp, Upload, ArrowRight } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, Select, ProgressBar, Badge, Segmented } from '../ui';
import { parseCsv, guessMapping, parseVnDate, guessOrderMapping, parseMoney, rowsFromSheet, ORDER_FIELDS } from '../../lib/csv';
import { fmtInt } from '../../lib/format';
import { getWorkspace } from '../../lib/workspace';

/**
 * NẠP FILE CỦA SHOP: PHẢN HỒI HOẶC ĐƠN HÀNG (CSV, Excel)
 * ------------------------------------------------------------------
 * Phản hồi: file đánh giá xuất từ sàn, Google Form, bảng tự ghi. Máy chủ gán
 * nhãn, che tên và số điện thoại, bỏ dòng trùng. Chỉ cột nội dung là bắt buộc.
 * Đơn hàng: file xuất từ trang người bán (Shopee, TikTok Shop, Lazada). Là mẫu
 * số của tỉ lệ khiếu nại trên đơn và sổ đối soát cho phản hồi có mã đơn. Ghi đè
 * theo mã đơn, đơn đã hủy bỏ qua. Chỉ cột mã đơn là bắt buộc.
 * Đọc ngay trong trình duyệt; file Excel đọc bằng read-excel-file (tải khi cần).
 */

const FIELDS = [
  { key: 'text', label: 'Nội dung phản hồi', required: true },
  { key: 'rating', label: 'Số sao (1 đến 5)' },
  { key: 'date', label: 'Ngày' },
  { key: 'product', label: 'Tên sản phẩm' },
  { key: 'category', label: 'Danh mục, mảng hàng' },
  { key: 'orderId', label: 'Mã đơn hàng' },
  { key: 'customer', label: 'Tên hoặc mã khách' },
  { key: 'source', label: 'Nguồn từng dòng' }
];
const SOURCES = ['Shopee', 'Lazada', 'Tiki', 'TikTok', 'Facebook', 'Zalo', 'Website', 'CSKH', 'Email', 'Hotline', 'Form', 'Khác'];
const CHUNK = { feedbacks: 50, orders: 200 };
const MAX_ROWS = { feedbacks: 2000, orders: 20000 };

const isExcel = (f) => /\.xlsx$/i.test(f.name) || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ImportCsv = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [kind, setKind] = useState('feedbacks');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [map, setMap] = useState({});
  const [source, setSource] = useState('Khác');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const real = getWorkspace() === 'real';
  const orders = kind === 'orders';

  const reset = () => {
    setFile(null);
    setParsed(null);
    setMap({});
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = async (f) => {
    setResult(null);
    setError(null);
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setError('File lớn hơn 15 MB. Tách nhỏ file rồi nạp từng phần.'); return; }
    let p;
    try {
      if (isExcel(f)) {
        const { default: readXlsxFile } = await import('read-excel-file');
        p = rowsFromSheet(await readXlsxFile(f));
      } else {
        p = parseCsv(await f.text());
      }
    } catch {
      setError('Không đọc được file. Dùng file .xlsx hoặc .csv xuất từ sàn hay Excel.');
      return;
    }
    if (!p.header.length || !p.rows.length) { setError('Không đọc được dòng nào. File cần dòng tiêu đề và ít nhất một dòng dữ liệu.'); return; }
    setFile(f);
    setParsed(p);
    setMap(orders ? guessOrderMapping(p.header) : guessMapping(p.header));
  };

  const rows = useMemo(() => {
    if (!parsed) return [];
    const list = parsed.rows.slice(0, MAX_ROWS[kind]);
    if (orders) {
      if (!map.orderId) return [];
      return list.map((r, i) => ({
        row: i + 2,
        orderId: r[map.orderId] || '',
        orderedAt: map.orderedAt ? parseVnDate(r[map.orderedAt]) : null,
        deliveredAt: map.deliveredAt ? parseVnDate(r[map.deliveredAt]) : null,
        amount: map.amount ? parseMoney(r[map.amount]) : null,
        quantity: map.quantity ? parseMoney(r[map.quantity]) : null,
        product: map.product ? r[map.product] : null,
        category: map.category ? r[map.category] : null,
        region: map.region ? r[map.region] : null,
        status: map.status ? r[map.status] : null
      })).filter((r) => String(r.orderId).trim());
    }
    if (!map.text) return [];
    return list.map((r, i) => ({
      row: i + 2,
      text: r[map.text] || '',
      rating: map.rating ? r[map.rating] : null,
      date: map.date ? parseVnDate(r[map.date]) : null,
      product: map.product ? r[map.product] : null,
      category: map.category ? r[map.category] : null,
      orderId: map.orderId ? r[map.orderId] : null,
      customer: map.customer ? r[map.customer] : null,
      source: map.source ? r[map.source] : null
    })).filter((r) => r.text.trim());
  }, [parsed, map, kind, orders]);
  const badDates = !orders && map.date ? rows.filter((r) => !r.date).length : 0;

  const run = async () => {
    setError(null);
    setResult(null);
    const total = { inserted: 0, updated: 0, duplicates: 0, skipped: 0, cancelled: 0, negatives: 0, labelledBy: new Set() };
    const size = CHUNK[kind];
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += size) {
        const batch = rows.slice(i, i + size);
        if (orders) {
          const { data } = await axios.post('/import/orders', { rows: batch, source, fileName: file?.name }, { timeout: 120000 });
          total.inserted += data.upserted;
          total.updated += data.updated;
          total.cancelled += data.skipped.filter((s) => s.reason === 'Đơn đã hủy').length;
          total.skipped += data.skipped.filter((s) => s.reason !== 'Đơn đã hủy').length;
        } else {
          const { data } = await axios.post('/import/feedbacks', { rows: batch, source, fileName: file?.name }, { timeout: 180000 });
          total.inserted += data.inserted;
          total.duplicates += data.duplicates;
          total.skipped += data.skipped.length;
          total.negatives += data.negatives || 0;
          (data.labelledBy || []).forEach((l) => total.labelledBy.add(l));
        }
        setProgress({ done: Math.min(rows.length, i + size), total: rows.length });
      }
      setResult({ ...total, labelledBy: [...total.labelledBy] });
    } catch (e) {
      setError(e?.response?.data?.error || 'Nạp dở dang: máy chủ không trả lời. Các lô đã gửi vẫn được lưu; nạp lại cả file, dòng trùng sẽ tự bỏ.');
      setResult({ ...total, labelledBy: [...total.labelledBy], partial: true });
    } finally {
      setProgress(null);
    }
  };

  const fields = orders ? ORDER_FIELDS : FIELDS;

  return (
    <GlassPanel tone="strong" className="max-w-4xl p-6">
      <PanelHeader
        title="Nạp file của shop"
        subtitle={orders
          ? 'File đơn hàng xuất từ trang người bán Shopee, TikTok Shop, Lazada (.xlsx hoặc .csv).'
          : 'File đánh giá xuất từ sàn, Google Form hay bảng tự ghi (.xlsx hoặc .csv). Tên và số điện thoại được che trước khi lưu.'}
      />
      <div className="mb-4">
        <Segmented
          label="Loại file"
          options={[{ value: 'feedbacks', label: 'Phản hồi' }, { value: 'orders', label: 'Đơn hàng' }]}
          value={kind}
          onChange={(v) => { setKind(v); reset(); }}
        />
      </div>
      {!real && (
        <p className="paper mb-4 px-3 py-3 text-sm leading-relaxed text-ink-mid">
          Đang ở Kho Mô phỏng. File của shop chỉ nạp vào Kho Dữ liệu thật: đổi kho ở góc trên thanh bên rồi quay lại đây.
        </p>
      )}
      <input ref={inputRef} type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={FileUp} onClick={() => inputRef.current?.click()} disabled={!!progress}>Chọn file</Button>
        {file && <span className="text-sm text-ink-mid">{file.name}: {fmtInt(parsed.rows.length)} dòng</span>}
      </div>
      {parsed && parsed.rows.length > MAX_ROWS[kind] && (
        <p className="mt-2 text-xs text-ink-lo">Mỗi lần nạp tối đa {fmtInt(MAX_ROWS[kind])} dòng đầu; phần còn lại nạp ở lần sau.</p>
      )}

      {parsed && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-ink-hi">Cột nào là gì</h3>
          <p className="mt-1 text-xs text-ink-lo">{orders ? 'Chỉ cột mã đơn là bắt buộc.' : 'Chỉ cột nội dung là bắt buộc.'}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <Select
                key={f.key}
                label={f.label}
                value={map[f.key] || ''}
                onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                options={[{ value: '', label: f.required ? 'Chọn cột' : 'Không có' }, ...parsed.header.map((h) => ({ value: h, label: h }))]}
              />
            ))}
            <Select label={orders ? 'Sàn của file' : 'Nguồn của cả file'} value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES.map((x) => ({ value: x, label: x }))} />
          </div>

          {rows.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-ink-hi">Xem trước 3 dòng</h3>
              <ul className="paper mt-2 flex list-none flex-col divide-y divide-line-soft px-3 py-1">
                {rows.slice(0, 3).map((r) => (
                  <li key={r.row} className="py-2">
                    {orders ? (
                      <>
                        <p className="text-sm text-ink-hi">Đơn {r.orderId}{r.product ? `, ${r.product}` : ''}</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-lo">
                          <span>{r.amount ? `${fmtInt(r.amount)} đ` : 'không có tổng tiền'}</span>
                          <span>{r.orderedAt ? `đặt ${new Date(r.orderedAt).toLocaleDateString('vi-VN')}` : 'không có ngày đặt'}</span>
                          <span>{r.deliveredAt ? `giao ${new Date(r.deliveredAt).toLocaleDateString('vi-VN')}` : 'chưa có ngày giao'}</span>
                          {r.region && <span>{r.region}</span>}
                          {r.status && <span>{r.status}</span>}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="line-clamp-2 text-sm text-ink-hi">{r.text}</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-lo">
                          <span>{r.rating ? `${r.rating} sao` : 'không có sao'}</span>
                          <span>{r.date ? new Date(r.date).toLocaleDateString('vi-VN') : 'không có ngày (lấy ngày nạp)'}</span>
                          <span className="max-w-[30ch] truncate">{r.product || 'không có tên sản phẩm'}</span>
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {badDates > 0 && <p className="mt-2 text-xs text-ink-lo">{fmtInt(badDates)} dòng không đọc được ngày: sẽ lấy ngày nạp.</p>}
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button icon={Upload} onClick={run} loading={!!progress} disabled={!real || !rows.length || !!progress}>
              Nạp {fmtInt(rows.length)} {orders ? 'đơn' : 'dòng'}
            </Button>
            {!orders && <span className="text-xs text-ink-lo">Mỗi 50 dòng mất khoảng 30 giây vì từng câu được gán nhãn.</span>}
          </div>
          {progress && (
            <div className="mt-4">
              <ProgressBar value={progress.done / progress.total} label={`Đã nạp ${fmtInt(progress.done)} trên ${fmtInt(progress.total)} dòng`} showValue />
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-crit">{error}</p>}
      {result && (
        <div className="mt-5 border-t border-line-soft pt-4">
          {orders ? (
            <p className="text-sm text-ink-hi">
              {result.partial ? 'Đã nạp một phần: ' : 'Xong: '}
              <span className="tabular-nums font-semibold">{fmtInt(result.inserted)}</span> đơn mới, {fmtInt(result.updated)} đơn cập nhật,{' '}
              {fmtInt(result.cancelled)} đơn hủy bỏ qua{result.skipped ? `, ${fmtInt(result.skipped)} dòng thiếu mã đơn` : ''}.
            </p>
          ) : (
            <p className="text-sm text-ink-hi">
              {result.partial ? 'Đã nạp một phần: ' : 'Xong: '}
              <span className="tabular-nums font-semibold">{fmtInt(result.inserted)}</span> dòng mới,{' '}
              {fmtInt(result.duplicates)} dòng trùng bỏ qua, {fmtInt(result.skipped)} dòng trống, {fmtInt(result.negatives)} câu chê.
            </p>
          )}
          {result.labelledBy.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{result.labelledBy.map((l) => <Badge key={l}>Gán nhãn: {l}</Badge>)}</div>}
          {!orders && result.inserted > 0 && (
            <Button className="mt-3" size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => navigate('/analytics?tab=pain')}>
              Xem điểm đau
            </Button>
          )}
          {orders && result.inserted + result.updated > 0 && (
            <Button className="mt-3" size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => navigate('/dashboard')}>
              Xem tỉ lệ khiếu nại trên đơn
            </Button>
          )}
        </div>
      )}
    </GlassPanel>
  );
};

export default ImportCsv;
