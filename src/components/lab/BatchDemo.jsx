import React, { useState } from 'react';
import axios from 'axios';
import {
  Loader2, Play, Database, Gauge, ShieldAlert, EyeOff, Layers, AlertTriangle, XCircle
} from 'lucide-react';

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

const Tile = ({ icon, label, value, unit, tone = 'var(--text-hi)' }) => (
  <div style={{
    flex: '1 1 150px', minWidth: 0, padding: '0.85rem 1rem',
    background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-lo)' }}>
      {icon} {label}
    </div>
    <div className="data-num" style={{ fontSize: '1.5rem', fontWeight: 700, color: tone, marginTop: '0.3rem', lineHeight: 1.2 }}>
      {value}
      {unit && <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-lo)', marginLeft: 4 }}>{unit}</span>}
    </div>
  </div>
);

const Bar = ({ label, count, max, tone }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 11rem) minmax(0, 1fr) 3rem', gap: '0.6rem', alignItems: 'center' }}>
    <span style={{ fontSize: '0.82rem', color: 'var(--text-mid)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    <div style={{ height: 8, background: 'var(--raised)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(1, (count / max) * 100)}%`, height: '100%', background: tone, borderRadius: 99, transition: 'width 600ms var(--ease)' }} />
    </div>
    <span className="data-num" style={{ fontSize: '0.78rem', textAlign: 'right', color: 'var(--text-hi)' }}>{count}</span>
  </div>
);

export default function BatchDemo() {
  const [text, setText] = useState('');
  const [size, setSize] = useState(200);
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
      setError(e.response?.data?.error || 'Không lấy được phản hồi mẫu. Kiểm tra backend và cơ sở dữ liệu.');
    } finally {
      setLoading(null);
    }
  };

  const run = async () => {
    if (lines.length === 0) return;
    setLoading('run');
    setError(null);
    try {
      const res = await axios.post('/analyze/batch', { texts: lines });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Không chạy được lô này.');
      setResult(null);
    } finally {
      setLoading(null);
    }
  };

  const maxCat = result ? Math.max(1, ...result.summary.byCategory.map((c) => c.count)) : 1;
  const sentimentRows = result
    ? [['Tiêu cực', result.summary.sentiment.Negative || 0, 'var(--sev-crit)'],
       ['Tích cực', result.summary.sentiment.Positive || 0, 'var(--sev-ok)'],
       ['Trung tính', result.summary.sentiment.Neutral || 0, 'var(--text-lo)']]
    : [];
  const maxSent = result ? Math.max(1, ...sentimentRows.map((r) => r[1])) : 1;

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Chạy cả lô phản hồi, đo tốc độ thật</h3>
        <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.84rem', color: 'var(--text-mid)', lineHeight: 1.55, maxWidth: '72ch' }}>
          Mỗi phản hồi vẫn đi qua đúng đường chạy nóng: che thông tin cá nhân, lọc rác, rồi ViSoBERT phân loại đa nhãn.
          Thời gian hiển thị là thời gian đo được của chính lô này; máy chủ tắt bộ đệm cho phép đo này nên không có
          chuyện đọc lại kết quả cũ.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)', padding: '0.2rem' }}>
            {SIZES.map((s) => (
              <button key={s} onClick={() => setSize(s)} style={{
                padding: '0.35rem 0.7rem', border: 'none', fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer',
                borderRadius: 'calc(var(--r-ctrl) - 2px)', fontWeight: 600,
                background: size === s ? 'var(--accent-dim)' : 'transparent',
                color: size === s ? 'var(--accent-hi)' : 'var(--text-mid)'
              }}>{s}</button>
            ))}
          </div>
          <button onClick={loadSample} disabled={loading !== null} style={btn('ghost', loading !== null)}>
            {loading === 'sample' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Database size={15} />}
            Nạp {size} phản hồi thật từ kho dữ liệu
          </button>
          <button onClick={run} disabled={loading !== null || lines.length === 0} style={btn('primary', loading !== null || lines.length === 0)}>
            {loading === 'run' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={15} />}
            Chạy {lines.length > 0 ? lines.length : ''} phản hồi
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Mỗi dòng là một phản hồi. Bấm nút bên trên để nạp phản hồi thật, hoặc dán dữ liệu của bạn vào đây."
          style={{
            width: '100%', marginTop: '0.85rem', padding: '0.8rem 0.95rem', resize: 'vertical', boxSizing: 'border-box',
            background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)',
            color: 'var(--text-hi)', fontSize: '0.84rem', fontFamily: 'inherit', lineHeight: 1.6
          }}
        />

        {error && (
          <div style={{
            marginTop: '0.8rem', padding: '0.7rem 0.9rem', fontSize: '0.84rem', borderRadius: 'var(--r-ctrl)',
            background: 'var(--sev-crit-dim)', border: '1px solid var(--sev-crit)', color: 'var(--sev-crit)'
          }}>
            <XCircle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />{error}
          </div>
        )}
      </div>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Tile icon={<Layers size={12} />} label="Phản hồi đã xử lý" value={result.count} />
            <Tile icon={<Gauge size={12} />} label="Tốc độ" value={result.timings.itemsPerSecond} unit="phản hồi/giây" tone="var(--accent-hi)" />
            <Tile icon={<Gauge size={12} />} label="Thời gian mỗi phản hồi" value={result.timings.msPerItem} unit="ms" />
            <Tile icon={<Gauge size={12} />} label="Tổng thời gian" value={(result.timings.totalMs / 1000).toFixed(2)} unit="giây" />
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Tile icon={<AlertTriangle size={12} />} label="Có khiếu nại" value={result.summary.complaints} tone="var(--sev-high)" />
            <Tile icon={<Layers size={12} />} label="Nhiều vấn đề trong một câu" value={result.summary.multiIssue} tone="var(--sev-high)" />
            <Tile icon={<ShieldAlert size={12} />} label="Bị chặn là rác" value={result.summary.spam} tone="var(--sev-crit)" />
            <Tile icon={<EyeOff size={12} />} label="Đã che thông tin cá nhân" value={result.summary.piiMasked} tone="var(--sev-ok)" />
          </div>

          <div className="glass-panel">
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 320px', minWidth: 0 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-lo)', marginBottom: '0.7rem' }}>
                  Khiếu nại theo danh mục
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {result.summary.byCategory.length === 0
                    ? <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-lo)' }}>Lô này không có khiếu nại nào.</p>
                    : result.summary.byCategory.map((c) => (
                        <Bar key={c.category} label={c.label} count={c.count} max={maxCat} tone="var(--accent)" />
                      ))}
                </div>
              </div>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-lo)', marginBottom: '0.7rem' }}>
                  Cảm xúc
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sentimentRows.map(([label, count, tone]) => (
                    <Bar key={label} label={label} count={count} max={maxSent} tone={tone} />
                  ))}
                </div>
              </div>
            </div>
            <p style={{ margin: '1rem 0 0', fontSize: '0.78rem', color: 'var(--text-lo)', lineHeight: 1.6 }}>
              Nguồn nhãn: {result.source === 'visobert' ? 'ViSoBERT tinh chỉnh' : 'luật từ khóa (ViSoBERT chưa sẵn sàng)'} ·
              {' '}chuẩn hóa và che PII {result.timings.normalizeMs} ms · mô hình {result.timings.modelMs} ms.
              Chạy trên CPU, một tiến trình. Một phản hồi có thể nêu nhiều vấn đề nên tổng theo danh mục lớn hơn số phản hồi có khiếu nại.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: 0 }}>
            <div style={{ padding: '0.9rem 1.2rem', borderBottom: '1px solid var(--border-soft)', fontSize: '0.86rem', fontWeight: 600 }}>
              {Math.min(result.items.length, 60)} phản hồi đầu của lô
            </div>
            <div className="table-responsive" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Phản hồi</th><th>Cảm xúc</th><th>Khía cạnh phát hiện</th></tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: '0.8rem', minWidth: 260 }}>
                        {it.text.length > 120 ? it.text.slice(0, 120) + '…' : it.text}
                        {it.piiMasked && <span style={{ color: 'var(--sev-ok)', fontSize: '0.72rem' }}> · đã che PII</span>}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: it.sentiment === 'Negative' ? 'var(--sev-crit)' : it.sentiment === 'Positive' ? 'var(--sev-ok)' : 'var(--text-lo)' }}>
                        {it.spam ? '—' : it.sentiment}
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {it.spam
                          ? <span style={{ color: 'var(--sev-crit)' }}>bị chặn là rác</span>
                          : it.aspects.length === 0
                            ? <span style={{ color: 'var(--text-lo)' }}>không phải khiếu nại</span>
                            : it.aspects.map((a) => `${a.categoryLabel} → ${a.causeLabel || '?'}`).join(' ; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btn(kind, disabled) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'inherit',
    padding: '0.55rem 1rem', borderRadius: 'var(--r-ctrl)', fontSize: '0.84rem', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1
  };
  return kind === 'primary'
    ? { ...base, background: 'var(--accent)', color: '#04171D', border: '1px solid var(--accent)' }
    : { ...base, background: 'transparent', color: 'var(--text-hi)', border: '1px solid var(--border)', fontWeight: 500 };
}
