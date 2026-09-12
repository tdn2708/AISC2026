import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Sparkles, Loader2, ShieldAlert, EyeOff, Languages,
  FlaskConical, AlertTriangle, CheckCircle2, XCircle, Info
} from 'lucide-react';

/**
 * PHÒNG THÍ NGHIỆM
 * ------------------------------------------------------------------
 * Hai tab, phục vụ hai câu hỏi khác nhau của người xem:
 *
 *   1. "Nó có chạy thật không?"  -> Phân tích trực tiếp một câu
 *   2. "Nó chính xác bao nhiêu?" -> Kết quả thực nghiệm có số
 *
 * Tab thứ nhất là khoảnh khắc thuyết phục rẻ nhất trong cả phần demo:
 * trong ba mươi giây nó chứng minh cùng lúc ba điều — pipeline chạy
 * thật, xử lý được teencode, và tách được nhiều khía cạnh trong một câu.
 */

const SAMPLES = [
  'shipper dth thương mà hàng móp méo quá sốp ơi, app thì lag, thanh toán toàn báo lỗi',
  'Đặt từ thứ hai mà tới giờ vẫn chưa thấy tăm hơi đâu cả',
  'Cần tuyển CTV bán hàng sỉ lẻ toàn quốc, hoa hồng cao, ib mình 0912345678 nhé',
  'Không hề bị móp méo gì như mọi người nói, hàng về nguyên vẹn'
];

const Pill = ({ children, tone = 'neutral', title }) => {
  const tones = {
    neutral: { bg: 'var(--raised)', bd: 'var(--border)', fg: 'var(--text-mid)' },
    danger: { bg: 'var(--sev-crit-dim)', bd: 'var(--sev-crit)', fg: 'var(--sev-crit)' },
    warn: { bg: 'var(--sev-high-dim)', bd: 'var(--sev-high)', fg: 'var(--sev-high)' },
    ok: { bg: 'var(--sev-ok-dim)', bd: 'var(--sev-ok)', fg: 'var(--sev-ok)' },
    info: { bg: 'var(--accent-dim)', bd: 'var(--accent)', fg: 'var(--accent-hi)' }
  }[tone];
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '0.74rem', padding: '4px 10px', borderRadius: 99,
      background: tones.bg, border: `1px solid ${tones.bd}`, color: tones.fg, fontWeight: 500
    }}>
      {children}
    </span>
  );
};

/**
 * SƠ ĐỒ PIPELINE
 * ------------------------------------------------------------------
 * Bản cũ để trống cả nửa dưới màn hình khi chưa bấm phân tích, còn kết
 * quả trả về thì đổ ra thành một dải khối rời rạc không có cấu trúc.
 * Người xem vì thế không thấy được điều đáng thấy nhất: câu văn phải đi
 * qua BAO NHIÊU TẦNG trước khi trở thành một con số trên dashboard.
 *
 * Sơ đồ này hiển thị ngay cả khi chưa chạy, nên màn hình không bao giờ
 * rỗng, và nó sáng dần theo từng tầng khi có kết quả. Đây chính là luận
 * điểm kiến trúc của sản phẩm, vẽ ra thành hình.
 *
 * Chỉ bốn tầng được vẽ, đúng bằng số tầng mà API /analyze thật sự trả
 * về. Vẽ thêm một tầng không có dữ liệu đứng sau thì là bịa.
 */
const PipelineStages = ({ result, loading }) => {
  const blocked = Boolean(result?.spam?.isSpam);

  const stages = [
    {
      id: 'T0',
      name: 'Chuẩn hoá và che PII',
      hint: 'Tách âm tiết, bỏ ký tự thừa, che số điện thoại và địa chỉ',
      state: loading ? 'running' : result ? 'done' : 'idle',
      detail: result
        ? (result.piiMasked ? 'đã che ' + result.piiTypes.join(', ') : 'không phát hiện PII')
        : null
    },
    {
      id: 'T1',
      name: 'Dịch teencode',
      hint: 'Đưa cách viết tắt trên mạng xã hội về tiếng Việt chuẩn',
      state: loading ? 'running' : result ? 'done' : 'idle',
      detail: result ? result.slangHits + ' mục đã dịch · ' + result.syllables + ' âm tiết' : null
    },
    {
      id: 'T2',
      name: 'Lọc nội dung rác',
      hint: 'Ưu tiên Precision, vì loại nhầm một khiếu nại thật là mất đúng thứ cần nghe',
      state: loading ? 'running' : !result ? 'idle' : blocked ? 'blocked' : 'done',
      detail: result ? (blocked ? 'bị chặn là nội dung rác' : 'qua được bộ lọc') : null
    },
    {
      id: 'T3',
      name: 'Bóc tách khía cạnh',
      hint: 'Một câu có thể chứa nhiều khiếu nại thuộc nhiều danh mục khác nhau',
      state: loading ? 'running' : !result ? 'idle' : blocked ? 'skipped' : 'done',
      detail: result && !blocked ? result.aspects.length + ' khía cạnh' : null
    }
  ];

  const toneOf = (st) => ({
    idle: { fg: 'var(--text-lo)', bd: 'var(--border)', bg: 'transparent' },
    running: { fg: 'var(--accent-hi)', bd: 'var(--accent)', bg: 'var(--accent-dim)' },
    done: { fg: 'var(--sev-ok)', bd: 'var(--sev-ok)', bg: 'var(--sev-ok-dim)' },
    blocked: { fg: 'var(--sev-high)', bd: 'var(--sev-high)', bg: 'var(--sev-high-dim)' },
    skipped: { fg: 'var(--text-lo)', bd: 'var(--border)', bg: 'var(--raised)' }
  }[st]);

  return (
    <div className="glass-panel" style={{ height: '100%' }}>
      <div style={{ marginBottom: '1.15rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>Đường đi của câu văn</h3>
        <p style={{ color: 'var(--text-lo)', fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.45 }}>
          Bốn tầng xử lý trước khi một câu trở thành một con số
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stages.map((st, i) => {
          const t = toneOf(st.state);
          const last = i === stages.length - 1;
          return (
            <div key={st.id} style={{ display: 'flex', gap: '0.85rem' }}>
              {/* Cột chỉ báo: chấm tầng và đường nối dọc */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <span
                  className="data-num"
                  style={{
                    width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    border: '1px solid ' + t.bd, background: t.bg, color: t.fg,
                    fontSize: '0.68rem', fontWeight: 600,
                    transition: 'background-color 180ms var(--ease), border-color 180ms var(--ease), color 180ms var(--ease)'
                  }}
                >
                  {st.id}
                </span>
                {!last && (
                  <span style={{
                    width: 1, flex: 1, minHeight: 26,
                    background: st.state === 'idle' ? 'var(--border)' : t.bd,
                    transition: 'background-color 180ms var(--ease)'
                  }} />
                )}
              </div>

              <div style={{ paddingBottom: last ? 0 : '1.1rem', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.88rem', fontWeight: 600,
                    color: st.state === 'idle' ? 'var(--text-mid)' : 'var(--text-hi)'
                  }}>
                    {st.name}
                  </span>
                  {st.detail && (
                    <span className="data-num" style={{ fontSize: '0.72rem', color: t.fg }}>
                      {st.detail}
                    </span>
                  )}
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--text-lo)', lineHeight: 1.5 }}>
                  {st.hint}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================================================================
// TAB 1 — PHÂN TÍCH TRỰC TIẾP
// ==================================================================

const LiveAnalysis = () => {
  const [text, setText] = useState(SAMPLES[0]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyze = async (input) => {
    const value = (input ?? text).trim();
    if (!value) return;
    try {
      setLoading(true);
      setError(null);
      const res = await axios.post('/analyze', { text: value });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Không gọi được API phân tích. Kiểm tra máy chủ.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Hai cột: ô nhập bên trái, sơ đồ pipeline bên phải. Sơ đồ có mặt
          ngay từ đầu nên màn hình không còn nửa dưới trống trơn như bản cũ. */}
      <div className="dashboard-grid">
        <div className="col-span-7">
          <div className="glass-panel" style={{ height: '100%' }}>
            <div style={{ marginBottom: '1.15rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>Thử một câu bất kỳ</h3>
              <p style={{ color: 'var(--text-lo)', fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.5, maxWidth: '62ch' }}>
                Gõ một câu phản hồi tiếng Việt. Hệ thống che thông tin cá nhân, chuẩn hoá teencode,
                rồi bóc tách các khía cạnh được nhắc tới.
              </p>
            </div>

            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{
                fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-lo)', marginBottom: '0.55rem'
              }}>
                Câu mẫu
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {SAMPLES.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setText(s); analyze(s); }}
                    title={s}
                    style={{
                      fontSize: '0.76rem', padding: '5px 11px', borderRadius: 99,
                      background: text === s ? 'var(--accent-dim)' : 'var(--raised)',
                      border: '1px solid ' + (text === s ? 'var(--accent)' : 'var(--border)'),
                      color: text === s ? 'var(--accent-hi)' : 'var(--text-mid)',
                      cursor: 'pointer', maxWidth: '300px', fontFamily: 'inherit',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      transition: 'background-color 120ms var(--ease), border-color 120ms var(--ease), color 120ms var(--ease)'
                    }}
                  >
                    {i + 1}. {s.slice(0, 34)}…
                  </button>
                ))}
              </div>
            </div>

            <label
              htmlFor="lab-input"
              style={{
                display: 'block', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-lo)', marginBottom: '0.45rem'
              }}
            >
              Câu phản hồi
            </label>
            <textarea
              id="lab-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Ví dụ: giao hàng lâu quá shop ơi, hộp còn bị móp nữa"
              style={{
                width: '100%', padding: '0.9rem 1rem', resize: 'vertical',
                background: 'var(--canvas)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-ctrl)', color: 'var(--text-hi)',
                fontSize: '0.92rem', fontFamily: 'inherit', lineHeight: 1.6,
                transition: 'border-color 120ms var(--ease)'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => analyze()}
                disabled={loading || !text.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  background: 'var(--accent)', color: '#04171D', border: '1px solid var(--accent)',
                  padding: '0.6rem 1.25rem', borderRadius: 'var(--r-ctrl)',
                  fontWeight: 600, fontSize: '0.86rem', fontFamily: 'inherit',
                  cursor: loading ? 'wait' : 'pointer', opacity: loading || !text.trim() ? 0.6 : 1,
                  transition: 'background-color 120ms var(--ease), border-color 120ms var(--ease)'
                }}
              >
                {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={15} />}
                {loading ? 'Đang chạy pipeline…' : 'Phân tích'}
              </button>
              <span className="data-num" style={{ fontSize: '0.74rem', color: 'var(--text-lo)' }}>
                {text.trim().length} ký tự
              </span>
            </div>

            {error && (
              <div style={{
                marginTop: '1rem', padding: '0.85rem 1rem', fontSize: '0.84rem',
                background: 'var(--sev-crit-dim)', border: '1px solid var(--sev-crit)',
                borderRadius: 'var(--r-ctrl)', color: 'var(--sev-crit)', lineHeight: 1.55
              }}>{error}</div>
            )}
          </div>
        </div>

        <div className="col-span-5">
          <PipelineStages result={result} loading={loading} />
        </div>
      </div>

      {result && (
        <div className="dashboard-grid">
          {/* Các bước tiền xử lý */}
          <div className="col-span-6 glass-panel">
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.85rem' }}>
              Tiền xử lý
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
              {result.piiMasked
                ? <Pill tone="ok" title={result.piiTypes.join(', ')}><EyeOff size={12} /> Đã che PII: {result.piiTypes.join(', ')}</Pill>
                : <Pill><EyeOff size={12} /> Không phát hiện PII</Pill>}
              <Pill tone={result.slangHits > 0 ? 'info' : 'neutral'}>
                <Languages size={12} /> {result.slangHits} mục teencode được dịch
              </Pill>
              <Pill>{result.syllables} âm tiết</Pill>
            </div>

            <div style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>Sau chuẩn hóa:</div>
              <div className="data-num" style={{
                color: 'var(--text-hi)', fontSize: '0.8rem', lineHeight: 1.65,
                background: 'var(--canvas)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-ctrl)', padding: '0.6rem 0.75rem'
              }}>
                {result.normalized}
              </div>
            </div>
          </div>

          {/* Bộ lọc rác */}
          {result.spam?.isSpam && (
            <div className="col-span-12 glass-panel" style={{ borderColor: 'var(--sev-high)', background: 'var(--sev-high-dim)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--risk-high)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                <ShieldAlert size={16} /> Trust Layer chặn câu này là nội dung rác
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.65 }}>
                {result.spam.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {/* Khía cạnh bóc tách được */}
          <div className="col-span-6 glass-panel">
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.85rem' }}>
              Khía cạnh bóc tách được
            </div>

            {result.aspects.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                Không tìm thấy khía cạnh khiếu nại nào thuộc taxonomy. Câu này được coi là không
                phải khiếu nại.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {result.aspects.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '1rem', flexWrap: 'wrap',
                    padding: '0.65rem 0.85rem', background: 'var(--raised)',
                    borderLeft: '2px solid var(--sev-crit)', borderRadius: '0 var(--r-ctrl) var(--r-ctrl) 0'
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                        {a.categoryLabel} → {a.causeLabel}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Bộ phận xử lý: {a.owner}
                      </div>
                    </div>
                    <Pill tone="danger">độ tin cậy {a.confidence}</Pill>
                  </div>
                ))}
              </div>
            )}

            <p style={{
              margin: '0.9rem 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)',
              lineHeight: 1.6, display: 'flex', gap: '0.45rem'
            }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
              {result.note}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================================================================
// TAB 2 — KẾT QUẢ THỰC NGHIỆM
// ==================================================================

const Experiments = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/evaluation');
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.hint || 'Chưa có kết quả đánh giá. Chạy `npm run eval` trong thư mục backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', color: 'var(--text-secondary)', padding: '2rem 0' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Đang tải kết quả thực nghiệm...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '1.5rem', background: 'rgba(234,179,8,0.07)',
        border: '1px solid rgba(234,179,8,0.25)', borderRadius: 'var(--radius-md)',
        color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.65
      }}>
        {error}
      </div>
    );
  }

  const b1 = data.models.find((m) => m.id === 'B1');
  const gap = b1 && b1.devCategoryMacroF1 != null
    ? b1.devCategoryMacroF1 - b1.categoryMacroF1
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Cảnh báo về giới hạn của tập dữ liệu — đặt TRƯỚC mọi con số */}
      <div style={{
        padding: '1rem 1.1rem', background: 'rgba(234,179,8,0.07)',
        border: '1px solid rgba(234,179,8,0.25)', borderRadius: 'var(--radius-md)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--risk-medium)', fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.5rem' }}>
          <AlertTriangle size={15} /> Giới hạn của các con số dưới đây
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.7 }}>
          <li>Tập do nhóm tự soạn và tự gán nhãn ({data.dataset.aspectSamples} câu), <strong>chưa phải UIT-ViSFD</strong>.</li>
          <li>Mới có {data.dataset.annotators} người gán nhãn, nên <strong>chưa tính được Cohen&apos;s kappa</strong>.</li>
          <li>Cỡ mẫu nhỏ nên khoảng tin cậy rộng. Con số là tín hiệu về hướng đi, chưa phải kết quả công bố được.</li>
        </ul>
      </div>

      {/* Kiểm tra rò rỉ */}
      {data.leakageAudit && (
        <div style={{
          padding: '0.85rem 1.1rem', borderRadius: 'var(--radius-md)',
          background: data.leakageAudit.clean ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
          border: `1px solid ${data.leakageAudit.clean ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.3)'}`,
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
          fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6
        }}>
          {data.leakageAudit.clean
            ? <CheckCircle2 size={16} color="var(--risk-low)" style={{ flexShrink: 0, marginTop: '1px' }} />
            : <XCircle size={16} color="var(--risk-critical)" style={{ flexShrink: 0, marginTop: '1px' }} />}
          <span>{data.leakageAudit.verdict}</span>
        </div>
      )}

      {/* Bảng mô hình */}
      <div className="glass-panel" style={{ padding: 0 }}>
        <div style={{ padding: '1.1rem 1.35rem', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Phân loại danh mục (Level 1)</h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Macro-F1 trên tập kiểm tra giữ riêng, so với tập phát triển
          </p>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã</th><th>Mô hình</th><th>Vai trò</th>
                <th>F1 (kiểm tra)</th><th>F1 (phát triển)</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 700 }}>{m.id}</td>
                  <td style={{ fontSize: '0.85rem' }}>{m.name}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.role || '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {!m.available
                      ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>chưa có số</span>
                      : m.canDetectAspect
                        ? m.categoryMacroF1.toFixed(4)
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>không bóc tách được</span>}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    {m.devCategoryMacroF1 != null ? m.devCategoryMacroF1.toFixed(4) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lý do các mô hình chưa có số */}
        <div style={{ padding: '1rem 1.35rem', borderTop: '1px solid rgba(148,163,184,0.12)' }}>
          {data.models.filter((m) => !m.available).map((m) => (
            <p key={m.id} style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>{m.id}:</strong> {m.reason}
            </p>
          ))}
        </div>
      </div>

      {/* Phát hiện quan trọng nhất: khoảng cách dev/test */}
      {gap != null && (
        <div className="glass-panel" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>
            Phát hiện chính: bộ phân loại luật không khái quát hóa được
          </h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.7 }}>
            Cùng một bộ phân loại luật đạt Macro-F1{' '}
            <strong style={{ color: 'var(--risk-low)' }}>{b1.devCategoryMacroF1.toFixed(2)}</strong>{' '}
            trên tập đã dùng để tinh chỉnh từ khóa, nhưng chỉ còn{' '}
            <strong style={{ color: 'var(--risk-critical)' }}>{b1.categoryMacroF1.toFixed(2)}</strong>{' '}
            trên tập kiểm tra giữ riêng — chênh lệch {gap.toFixed(2)}.
            Nói cách khác, thêm từ khóa chỉ giúp khớp đúng những câu đã thấy, không giúp hiểu
            câu mới. Đây là lập luận định lượng cho việc cần một mô hình ngôn ngữ được tinh
            chỉnh, thay vì tiếp tục mở rộng danh sách từ khóa.
          </p>
        </div>
      )}

      {/* Trust Layer */}
      {data.trustLayer && (
        <div className="glass-panel">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>Tầng kiểm soát tin cậy dữ liệu</h3>
          <div className="dashboard-grid" style={{ marginBottom: '0.75rem' }}>
            {[
              ['Precision bộ lọc rác', data.trustLayer.report.perClass.spam.precision, data.targets.spamPrecision],
              ['Precision phát hiện không xác thực', data.trustLayer.report.perClass.inauthentic.precision, data.targets.inauthenticPrecision],
              ['Tỉ lệ loại nhầm phản hồi thật', data.trustLayer.falseRejectRate, data.targets.falseRejectRate, true]
            ].map(([label, value, target, lowerIsBetter]) => {
              const pass = lowerIsBetter ? value <= target : value >= target;
              return (
                <div key={label} className="col-span-4">
                  <div style={{ padding: '0.9rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '0.35rem', lineHeight: 1.4 }}>{label}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: pass ? 'var(--risk-low)' : 'var(--risk-critical)', fontVariantNumeric: 'tabular-nums' }}>
                      {lowerIsBetter ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      mục tiêu {lowerIsBetter ? `≤ ${(target * 100).toFixed(0)}%` : `≥ ${target}`} · {pass ? 'ĐẠT' : 'CHƯA ĐẠT'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: '0.79rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
            {data.trustLayer.methodNote}
          </p>
        </div>
      )}

      {/* Ablation */}
      {data.ablations?.trustLayer && (
        <div className="glass-panel">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>Thí nghiệm loại bỏ thành phần</h3>
          <div style={{ fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Chuẩn hóa teencode:</strong>{' '}
              Macro-F1 {data.ablations.slangNormalization.categoryMacroF1_off.toFixed(4)} (tắt) →{' '}
              {data.ablations.slangNormalization.categoryMacroF1_on.toFixed(4)} (bật)
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Trust Layer:</strong>{' '}
              WCR {data.ablations.trustLayer.wcrWithoutTrustLayer} (tắt) →{' '}
              {data.ablations.trustLayer.wcrWithTrustLayer} (bật), loại{' '}
              {data.ablations.trustLayer.excludedFeedbacks} phản hồi trên{' '}
              {data.ablations.trustLayer.datasetSize}
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
        Sinh lúc {new Date(data.generatedAt).toLocaleString('vi-VN')} bằng lệnh <code>npm run eval</code>
      </p>
    </div>
  );
};

// ==================================================================

const Lab = () => {
  const [tab, setTab] = useState('live');

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        {/* Cùng cỡ chữ và cùng nhịp với màn hình Tổng quan. Bản cũ đặt
            1.75rem kèm một biểu tượng lớn nên mỗi trang một kiểu mở đầu. */}
        <h2 style={{ margin: '0 0 0.3rem 0', fontSize: '1.6rem', fontWeight: 700 }}>
          Phòng thí nghiệm
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ color: 'var(--text-mid)', margin: 0, fontSize: '0.85rem' }}>
            Thử pipeline trên câu bất kỳ, và xem kết quả đo được của mô hình
          </p>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.75rem', color: 'var(--text-lo)', whiteSpace: 'nowrap'
          }}>
            <FlaskConical size={12} />
            <span className="data-num">4 tầng xử lý</span>
          </span>
        </div>
      </header>

      <div style={{
        display: 'inline-flex', gap: '0.25rem', marginBottom: '1.5rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-ctrl)', padding: '0.25rem'
      }}>
        {[
          { id: 'live', label: 'Phân tích trực tiếp' },
          { id: 'eval', label: 'Kết quả thực nghiệm' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.5rem 1rem', border: 'none', fontFamily: 'inherit',
              background: tab === t.id ? 'var(--accent-dim)' : 'transparent',
              borderRadius: 'calc(var(--r-ctrl) - 2px)',
              color: tab === t.id ? 'var(--accent-hi)' : 'var(--text-mid)',
              cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600,
              transition: 'background-color 120ms var(--ease), color 120ms var(--ease)'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'live' ? <LiveAnalysis /> : <Experiments />}
    </div>
  );
};

export default Lab;
