import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileUp, Upload, ArrowRight } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, Select, ProgressBar, Badge } from '../ui';
import { parseCsv, guessMapping, parseVnDate } from '../../lib/csv';
import { fmtInt } from '../../lib/format';
import { getWorkspace } from '../../lib/workspace';

/**
 * NẠP FILE PHẢN HỒI CỦA SHOP (CSV)
 * ------------------------------------------------------------------
 * File xuất từ sàn, Google Form, bảng Excel tự ghi: đọc ngay trong trình
 * duyệt, chọn cột nào là nội dung, số sao, ngày..., rồi gửi lên từng lô
 * 50 dòng. Máy chủ gán nhãn bằng cùng tầng nhãn với thu thập sàn, che tên
 * và số điện thoại, bỏ dòng trùng. Chỉ cột nội dung là bắt buộc.
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
const CHUNK = 50;
const MAX_ROWS = 2000;

const ImportCsv = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [map, setMap] = useState({});
  const [source, setSource] = useState('Khác');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const real = getWorkspace() === 'real';

  const pick = async (f) => {
    setResult(null);
    setError(null);
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setError('File lớn hơn 8 MB. Tách nhỏ file rồi nạp từng phần.'); return; }
    const text = await f.text();
    const p = parseCsv(text);
    if (!p.header.length || !p.rows.length) { setError('Không đọc được dòng nào. File cần dòng tiêu đề và ít nhất một dòng dữ liệu, lưu dạng CSV.'); return; }
    setFile(f);
    setParsed(p);
    setMap(guessMapping(p.header));
  };

  const rows = useMemo(() => {
    if (!parsed || !map.text) return [];
    return parsed.rows.slice(0, MAX_ROWS).map((r, i) => ({
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
  }, [parsed, map]);
  const badDates = map.date ? rows.filter((r) => !r.date).length : 0;

  const run = async () => {
    setError(null);
    setResult(null);
    const total = { inserted: 0, duplicates: 0, skipped: 0, negatives: 0, labelledBy: new Set() };
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data } = await axios.post('/import/feedbacks', { rows: rows.slice(i, i + CHUNK), source, fileName: file?.name }, { timeout: 180000 });
        total.inserted += data.inserted;
        total.duplicates += data.duplicates;
        total.skipped += data.skipped.length;
        total.negatives += data.negatives || 0;
        (data.labelledBy || []).forEach((l) => total.labelledBy.add(l));
        setProgress({ done: Math.min(rows.length, i + CHUNK), total: rows.length });
      }
      setResult({ ...total, labelledBy: [...total.labelledBy] });
    } catch (e) {
      setError(e?.response?.data?.error || 'Nạp dở dang: máy chủ không trả lời. Các lô đã gửi vẫn được lưu; nạp lại cả file, dòng trùng sẽ tự bỏ.');
      setResult({ ...total, labelledBy: [...total.labelledBy], partial: true });
    } finally {
      setProgress(null);
    }
  };

  return (
    <GlassPanel tone="strong" className="max-w-4xl p-6">
      <PanelHeader
        title="Nạp file phản hồi của shop"
        subtitle="File CSV xuất từ sàn, Google Form hay bảng tự ghi. Tên khách và số điện thoại được che trước khi lưu; dòng đã nạp rồi sẽ tự bỏ qua."
      />
      {!real && (
        <p className="paper mb-4 px-3 py-3 text-sm leading-relaxed text-ink-mid">
          Đang ở Kho Mô phỏng. File của shop chỉ nạp vào Kho Dữ liệu thật: đổi kho ở góc trên thanh bên rồi quay lại đây.
        </p>
      )}
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={FileUp} onClick={() => inputRef.current?.click()} disabled={!!progress}>Chọn file CSV</Button>
        {file && <span className="text-sm text-ink-mid">{file.name}: {fmtInt(parsed.rows.length)} dòng</span>}
      </div>
      {parsed && parsed.rows.length > MAX_ROWS && (
        <p className="mt-2 text-xs text-ink-lo">Mỗi lần nạp tối đa {fmtInt(MAX_ROWS)} dòng đầu; phần còn lại nạp ở lần sau.</p>
      )}

      {parsed && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-ink-hi">Cột nào là gì</h3>
          <p className="mt-1 text-xs text-ink-lo">Máy đoán theo tên cột; sửa nếu sai. Chỉ nội dung là bắt buộc, cột nào không có thì để trống.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Select
                key={f.key}
                label={f.label}
                value={map[f.key] || ''}
                onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                options={[{ value: '', label: f.required ? 'Chọn cột' : 'Không có' }, ...parsed.header.map((h) => ({ value: h, label: h }))]}
              />
            ))}
            <Select label="Nguồn của cả file" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES.map((x) => ({ value: x, label: x }))} />
          </div>

          {rows.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-ink-hi">Xem trước 3 dòng</h3>
              <ul className="paper mt-2 flex list-none flex-col divide-y divide-line-soft px-3 py-1">
                {rows.slice(0, 3).map((r) => (
                  <li key={r.row} className="py-2">
                    <p className="line-clamp-2 text-sm text-ink-hi">{r.text}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-lo">
                      <span>{r.rating ? `${r.rating} sao` : 'không có sao'}</span>
                      <span>{r.date ? new Date(r.date).toLocaleDateString('vi-VN') : 'không có ngày (lấy ngày nạp)'}</span>
                      <span className="max-w-[30ch] truncate">{r.product || 'không có tên sản phẩm'}</span>
                    </p>
                  </li>
                ))}
              </ul>
              {badDates > 0 && <p className="mt-2 text-xs text-ink-lo">{fmtInt(badDates)} dòng không đọc được ngày: sẽ lấy ngày nạp.</p>}
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button icon={Upload} onClick={run} loading={!!progress} disabled={!real || !rows.length || !!progress}>
              Nạp {fmtInt(rows.length)} dòng
            </Button>
            <span className="text-xs text-ink-lo">Mỗi 50 dòng mất khoảng 30 giây vì từng câu được gán nhãn.</span>
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
          <p className="text-sm text-ink-hi">
            {result.partial ? 'Đã nạp một phần: ' : 'Xong: '}
            <span className="tabular-nums font-semibold">{fmtInt(result.inserted)}</span> dòng mới,{' '}
            {fmtInt(result.duplicates)} dòng trùng bỏ qua, {fmtInt(result.skipped)} dòng trống, {fmtInt(result.negatives)} câu chê.
          </p>
          {result.labelledBy.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{result.labelledBy.map((l) => <Badge key={l}>Gán nhãn: {l}</Badge>)}</div>}
          {result.inserted > 0 && (
            <Button className="mt-3" size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => navigate('/analytics?tab=pain')}>
              Xem điểm đau
            </Button>
          )}
        </div>
      )}
    </GlassPanel>
  );
};

export default ImportCsv;
