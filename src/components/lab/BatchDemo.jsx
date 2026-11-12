import React, { useState } from 'react';
import axios from 'axios';
import { Play, Database, Gauge, ShieldAlert, EyeOff, Layers, AlertTriangle, XCircle } from 'lucide-react';
import { analyzeBatch } from '../../lib/analyze';
import ModelStatus from './ModelStatus';
import { GlassPanel, PanelHeader, Button, Segmented, TextArea } from '../ui';
import { fmtInt } from '../../lib/format';

// Số thập phân kiểu Việt: 6,1 phản hồi/giây, 165,3 ms
const dec = (v, d) => (v == null ? '—' : Number(v).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }));

/**
 * TRÌNH DIỄN XỬ LÝ HÀNG LOẠT
 * ==================================================================
 * Màn hình một câu trả lời câu hỏi "hệ thống có hiểu tiếng Việt không".
 * Màn hình này trả lời câu hỏi tiếp theo của doanh nghiệp: "mỗi ngày mười
 * nghìn phản hồi thì sao, và tốn bao nhiêu?"
 *
 * Mọi con số đều đo được trên chính lô vừa chạy: thời gian thật, tốc độ
 * thật, và bộ đệm bị tắt ở phía máy chủ nên không có chuyện đọc lại kết
 * quả cũ rồi khoe tốc độ ảo.
 */

const SIZES = [50, 100, 200, 500];
// Trần số phản hồi mỗi lượt, khớp BATCH_LIMIT của POST /analyze/batch
const BATCH_LIMIT = 500;

const TONE = { hi: 'text-ink-hi', accent: 'text-accent-hi', high: 'text-high', crit: 'text-crit', ok: 'text-ok' };
const BAR = { accent: 'bg-accent', crit: 'bg-crit', ok: 'bg-ok', neutral: 'bg-ink-lo' };

const Tile = ({ icon: Icon, label, value, unit, tone = 'hi' }) => (
  <div className="min-w-0 rounded-ctrl bg-raised px-4 py-3.5">
    <p className="flex items-center gap-1.5 text-xs text-ink-mid"><Icon size={13} aria-hidden="true" /> {label}</p>
    <p className={`mt-1.5 font-mono text-display font-semibold ${TONE[tone]}`}>
      {value}
      {unit && <span className="ml-1 font-sans text-xs font-medium text-ink-mid">{unit}</span>}
    </p>
  </div>
);

const Bar = ({ label, count, max, tone }) => (
  <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3rem] items-center gap-3">
    <span className="truncate text-sm text-ink-mid">{label}</span>
    <span className="h-2 overflow-hidden rounded-full bg-raised">
      <span className={`block h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.max(1, (count / max) * 100)}%` }} />
    </span>
    <span className="text-right font-mono text-sm text-ink-hi">{fmtInt(count)}</span>
  </div>
);

const SENT_TONE = { Negative: 'text-crit', Positive: 'text-ok' };
const SENT_LABEL = { Negative: 'Tiêu cực', Positive: 'Tích cực', Neutral: 'Trung tính' };

export default function BatchDemo() {
  const [text, setText] = useState('');
  // 100 câu: khoảng 25 giây khi mô hình chạy trên trình duyệt, đủ nhanh để trình diễn
  const [size, setSize] = useState(100);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const loadSample = async () => {
    setLoading('sample');
    setError(null);
    try {
      const res = await axios.get(`/analyze/batch/sample?n=${size}`);
      setText(res.data.texts.join('\n'));
      setResult(null);
    } catch (e) {
      setError(e.response?.data?.error || 'Không lấy được phản hồi mẫu. Kiểm tra kết nối tới máy chủ rồi thử lại.');
    } finally {
      setLoading(null);
    }
  };

  const run = async () => {
    if (lines.length === 0) return;
    // Báo ngay ở trình duyệt thay vì gửi lô lớn lên rồi mới nhận lỗi 400
    if (lines.length > BATCH_LIMIT) {
      setError(`Lô có ${lines.length} dòng, tối đa ${BATCH_LIMIT} phản hồi mỗi lượt.`);
      return;
    }
    setLoading('run');
    setError(null);
    try {
      // Máy chủ không có mô hình thì trình duyệt tự chạy ViSoBERT cho cả lô
      const status = await axios.get('/nlp/status').then((r) => r.data).catch(() => null);
      const startedAt = performance.now();
      setProgress({ done: 0, total: lines.length, startedAt });
      setResult(await analyzeBatch(lines, {
        serverHasModel: Boolean(status?.canLabel),
        onProgress: (done, total) => setProgress({ done, total, startedAt })
      }));
    } catch (e) {
      setError(e.response?.data?.error || 'Không chạy được lô này.');
      setResult(null);
    } finally {
      setLoading(null);
      setProgress(null);
    }
  };

  // Thời gian còn lại ước theo tốc độ của chính lô đang chạy
  const eta = progress && progress.done > 0
    ? Math.max(0, Math.round(((performance.now() - progress.startedAt) / progress.done) * (progress.total - progress.done) / 1000))
    : null;

  const maxCat = result ? Math.max(1, ...result.summary.byCategory.map((c) => c.count)) : 1;
  const sentimentRows = result
    ? [['Tiêu cực', result.summary.sentiment.Negative || 0, 'crit'],
       ['Tích cực', result.summary.sentiment.Positive || 0, 'ok'],
       ['Trung tính', result.summary.sentiment.Neutral || 0, 'neutral']]
    : [];
  const maxSent = result ? Math.max(1, ...sentimentRows.map((r) => r[1])) : 1;

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel tone="strong" className="p-5">
        <PanelHeader
          title="Chạy cả lô phản hồi, đo tốc độ thật"
          subtitle="Mỗi phản hồi đi qua đúng đường chạy thật: che thông tin cá nhân, lọc rác, rồi ViSoBERT phân loại đa nhãn. Thời gian là thời gian đo được của chính lô này; máy chủ tắt bộ đệm cho phép đo nên không đọc lại kết quả cũ."
        />

        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Số phản hồi" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: String(s) }))} />
          <Button variant="secondary" size="sm" icon={Database} loading={loading === 'sample'} disabled={loading !== null} onClick={loadSample}>
            Nạp {size} phản hồi thật từ kho
          </Button>
          <Button size="sm" icon={Play} loading={loading === 'run'} disabled={loading !== null || lines.length === 0} onClick={run}>
            {loading === 'run' && progress ? `Đang chạy ${progress.done}/${progress.total}` : `Chạy ${lines.length > 0 ? fmtInt(lines.length) : ''} phản hồi`}
          </Button>
        </div>

        {loading === 'run' && (
          <div role="status" aria-live="polite" className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress?.total ? (progress.done / progress.total) * 100 : 3}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-mid">
              {!progress || progress.done === 0
                ? 'Đang chuẩn bị mô hình và che thông tin cá nhân…'
                : `Đã phân tích ${progress.done} trên ${progress.total} phản hồi${eta != null ? `, còn khoảng ${eta} giây` : ''}. Mô hình chạy trên máy của bạn nên tốc độ phụ thuộc vào máy.`}
            </p>
          </div>
        )}

        <TextArea
          className="mt-4"
          label="Phản hồi cần chạy"
          hint="Mỗi dòng là một phản hồi. Nạp phản hồi thật bằng nút phía trên, hoặc dán dữ liệu của bạn vào đây."
          rows={6}
          maxLength={200000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <ModelStatus className="mt-3" />

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-2 rounded-ctrl bg-crit/10 px-4 py-2.5 text-sm text-crit">
            <XCircle size={15} aria-hidden="true" /> {error}
          </p>
        )}
      </GlassPanel>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Layers} label="Phản hồi đã xử lý" value={fmtInt(result.count)} />
            <Tile icon={Gauge} label="Tốc độ" value={dec(result.timings.itemsPerSecond, 1)} unit="phản hồi/giây" tone="accent" />
            <Tile icon={Gauge} label="Thời gian mỗi phản hồi" value={dec(result.timings.msPerItem, 1)} unit="ms" />
            <Tile icon={Gauge} label="Tổng thời gian" value={dec(result.timings.totalMs / 1000, 2)} unit="giây" />
            <Tile icon={AlertTriangle} label="Có khiếu nại" value={fmtInt(result.summary.complaints)} tone="high" />
            <Tile icon={Layers} label="Nhiều vấn đề trong một câu" value={fmtInt(result.summary.multiIssue)} tone="high" />
            <Tile icon={ShieldAlert} label="Bị chặn là rác" value={fmtInt(result.summary.spam)} tone="crit" />
            <Tile icon={EyeOff} label="Đã che thông tin cá nhân" value={fmtInt(result.summary.piiMasked)} tone="ok" />
          </div>

          <GlassPanel tone="strong" className="p-5">
            <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
              <div className="min-w-0">
                <h3 className="mb-3 text-sm font-semibold text-ink-hi">Khiếu nại theo danh mục</h3>
                <div className="flex flex-col gap-2.5">
                  {result.summary.byCategory.length === 0
                    ? <p className="text-sm text-ink-mid">Lô này không có khiếu nại nào.</p>
                    : result.summary.byCategory.map((c) => <Bar key={c.category} label={c.label} count={c.count} max={maxCat} tone="accent" />)}
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="mb-3 text-sm font-semibold text-ink-hi">Cảm xúc</h3>
                <div className="flex flex-col gap-2.5">
                  {sentimentRows.map(([label, count, tone]) => <Bar key={label} label={label} count={count} max={maxSent} tone={tone} />)}
                </div>
              </div>
            </div>
            <p className="mt-5 border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-mid">
              Nguồn nhãn: {result.source === 'visobert' ? (result.modelRuntime === 'browser' ? 'ViSoBERT chạy trên trình duyệt của bạn' : 'ViSoBERT tinh chỉnh') : 'luật từ khóa (ViSoBERT chưa sẵn sàng)'}.
              Chuẩn hóa và che thông tin cá nhân {dec(result.timings.normalizeMs, 0)} ms, mô hình {dec(result.timings.modelMs / 1000, 1)} giây, chạy trên CPU một tiến trình.
              Một phản hồi có thể nêu nhiều vấn đề nên tổng theo danh mục lớn hơn số phản hồi có khiếu nại.
            </p>
          </GlassPanel>

          <GlassPanel tone="strong" className="overflow-hidden">
            <h3 className="border-b border-line-soft px-5 py-3.5 text-sm font-semibold text-ink-hi">{Math.min(result.items.length, 60)} phản hồi đầu của lô</h3>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line-soft text-xs text-ink-mid">
                    <th scope="col" className="px-5 py-2.5 font-semibold">Phản hồi</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Cảm xúc</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Vấn đề phát hiện</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => (
                    <tr key={i} className="border-b border-line-soft last:border-0 align-top">
                      <td className="min-w-[260px] px-5 py-2.5 text-ink-hi">
                        {it.text.length > 120 ? `${it.text.slice(0, 120)}…` : it.text}
                        {it.piiMasked && <span className="ml-1 text-xs text-ok">(đã che thông tin cá nhân)</span>}
                      </td>
                      <td className={`px-3 py-2.5 ${it.spam ? 'text-ink-lo' : SENT_TONE[it.sentiment] || 'text-ink-mid'}`}>
                        {it.spam ? '—' : SENT_LABEL[it.sentiment] || it.sentiment}
                      </td>
                      <td className="px-5 py-2.5">
                        {it.spam
                          ? <span className="text-crit">Bị chặn là rác</span>
                          : it.aspects.length === 0
                            ? <span className="text-ink-lo">Không phải khiếu nại</span>
                            : <span className="text-ink-mid">{it.aspects.map((a) => (a.causeLabel ? `${a.categoryLabel}: ${a.causeLabel}` : a.categoryLabel)).join('; ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
