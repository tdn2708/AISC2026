import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Loader2, FlaskConical, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';
import PipelineDemo from './lab/PipelineDemo';

/**
 * PHÒNG THÍ NGHIỆM
 * ------------------------------------------------------------------
 * Hai tab, phục vụ hai câu hỏi khác nhau của người xem:
 *
 *   1. "Hệ thống có thật sự xử lý được tiếng Việt không?"
 *        -> Trình diễn xử lý ngôn ngữ: tám bước với dữ liệu trung gian thật
 *   2. "Nó chính xác bao nhiêu?"
 *        -> Kết quả thực nghiệm có số, đo trên tập kiểm tra giữ riêng
 *
 * Tab thứ nhất nằm ở components/lab/PipelineDemo.jsx.
 */

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
  const mRow = data.models.find((m) => m.id === 'M' && m.available);
  const h2h = data.headToHead?.available ? data.headToHead : null;
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
          {mRow && (
            <li>
              Dòng M train trên nhãn cảm xúc do người gán của UIT-ViSFD cộng tập chuyên ngành{' '}
              <strong>sinh từ khung câu</strong> (nhãn theo cấu trúc sinh, không phải người gán trên phản hồi thật),
              đã lọc trùng mặt chữ với tập kiểm tra. F1 phát triển của M không độc lập vì tập này dùng để chọn epoch.
            </li>
          )}
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

      {/* Đối đầu từng câu: luật và ViSoBERT, liệt kê đủ cả hai chiều */}
      {h2h && (
        <div className="glass-panel" style={{ padding: 0 }}>
          <div style={{ padding: '1.1rem 1.35rem', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Luật từ khóa và ViSoBERT trên từng câu</h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {h2h.total} câu kiểm tra giữ riêng · cả hai đúng {h2h.bothCorrect} · chỉ ViSoBERT đúng{' '}
              {h2h.onlyModelCorrect.length} · chỉ luật đúng {h2h.onlyRulesCorrect.length} · cả hai sai {h2h.bothWrong}
            </p>
          </div>
          {[
            ['Chỉ ViSoBERT đúng', h2h.onlyModelCorrect],
            ['Chỉ luật từ khóa đúng', h2h.onlyRulesCorrect]
          ].map(([title, rows]) => (
            <div key={title} style={{ padding: '0.9rem 1.35rem', borderTop: '1px solid rgba(148,163,184,0.12)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.86rem', marginBottom: '0.5rem' }}>{title} ({rows.length})</div>
              {rows.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Không có câu nào.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr><th>Câu</th><th>Đáp án</th><th>Luật từ khóa</th><th>ViSoBERT</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: '0.82rem', minWidth: 220 }}>{r.text}</td>
                          <td style={{ fontSize: '0.8rem' }}>{r.gold}</td>
                          <td style={{ fontSize: '0.8rem', color: r.rulesCorrect ? 'var(--risk-low)' : 'var(--risk-critical)' }}>{r.rules}</td>
                          <td style={{ fontSize: '0.8rem', color: r.modelCorrect ? 'var(--risk-low)' : 'var(--risk-critical)' }}>{r.model}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {mRow?.checkpoint && (
            <p style={{ margin: 0, padding: '0.8rem 1.35rem', borderTop: '1px solid rgba(148,163,184,0.12)', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Checkpoint train lúc {new Date(mRow.checkpoint.trainedAt).toLocaleString('vi-VN')} · epoch tốt nhất {mRow.checkpoint.bestEpoch} ·
              số nhãn: cảm xúc {mRow.checkpoint.trainCounts?.sentiment}, danh mục {mRow.checkpoint.trainCounts?.category}, rác {mRow.checkpoint.trainCounts?.spam} ·
              loại {mRow.checkpoint.testOverlapRemoved} câu trùng tập kiểm tra
            </p>
          )}
        </div>
      )}

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
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.75rem', color: 'var(--text-lo)', whiteSpace: 'nowrap'
          }}>
            <FlaskConical size={12} />
            <span className="data-num">8 bước · ViSoBERT</span>
          </span>
        </div>
      </header>

      <div style={{
        display: 'inline-flex', gap: '0.25rem', marginBottom: '1.5rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-ctrl)', padding: '0.25rem'
      }}>
        {[
          { id: 'live', label: 'Trình diễn xử lý ngôn ngữ' },
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

      {tab === 'live' ? <PipelineDemo /> : <Experiments />}
    </div>
  );
};

export default Lab;
