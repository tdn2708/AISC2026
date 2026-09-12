import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  ShieldCheck, Loader2, Copy, Zap, UserX, Star, Receipt,
  ToggleLeft, ToggleRight, CheckCircle2, XCircle, HelpCircle, Layers
} from 'lucide-react';

/**
 * MÀN HÌNH TẦNG KIỂM SOÁT TIN CẬY DỮ LIỆU
 * ------------------------------------------------------------------
 * Toàn bộ hoạt động của Trust Layer được hiển thị công khai dưới dạng
 * một phễu, thay vì ẩn trong hệ thống. Lý do: chỉ số Sức khỏe Dữ liệu
 * trả lời trực tiếp câu hỏi mà mọi người dùng doanh nghiệp đều có khi
 * nhìn một dashboard phân tích — "tôi có nên tin những con số này không?"
 */

const SIGNAL_ICONS = {
  'Trùng lặp gần về nội dung': Copy,
  'Đột biến thời gian': Zap,
  'Bất thường hành vi tài khoản': UserX,
  'Bất nhất điểm sao và nội dung': Star,
  'Bất nhất với dữ liệu giao dịch': Receipt
};

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);

/** Vòng tròn hiển thị điểm sức khỏe dữ liệu */
const HealthDial = ({ score }) => {
  const color = score >= 75 ? 'var(--risk-low)' : score >= 50 ? 'var(--risk-medium)' : 'var(--risk-critical)';
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(0, Math.min(100, score)) / 100)}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1, color }}>{score}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>/ 100</div>
      </div>
    </div>
  );
};

/** Một bậc của phễu dữ liệu */
const FunnelStep = ({ label, count, pct, tone, note, isResult }) => {
  const color = {
    neutral: 'var(--text-secondary)',
    spam: 'var(--risk-high)',
    fake: 'var(--risk-critical)',
    pending: 'var(--risk-medium)',
    ok: 'var(--risk-low)'
  }[tone] || 'var(--text-secondary)';

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: '1rem', padding: '0.8rem 0',
      borderTop: isResult ? '1px solid rgba(148,163,184,0.25)' : 'none',
      marginTop: isResult ? '0.35rem' : 0
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: isResult ? '0.95rem' : '0.9rem',
          fontWeight: isResult ? 700 : 500,
          color: isResult ? 'var(--text-primary)' : 'var(--text-secondary)'
        }}>
          {label}
        </div>
        {note && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{note}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: isResult ? '1.4rem' : '1.1rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(count)}
        </span>
        {pct != null && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pct}%</span>}
      </div>
    </div>
  );
};

const TrustLayerPage = () => {
  const [health, setHealth] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [queue, setQueue] = useState([]);
  const [impact, setImpact] = useState(null);
  const [trustOn, setTrustOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCluster, setOpenCluster] = useState(null);
  const [labelling, setLabelling] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [h, c, q, i] = await Promise.all([
        axios.get('/trust/health'),
        axios.get('/trust/clusters'),
        axios.get('/trust/queue?limit=20'),
        axios.get('/trust/impact')
      ]);
      setHealth(h.data);
      setClusters(c.data);
      setQueue(q.data);
      setImpact(i.data);
      setError(null);
    } catch (e) {
      console.error('Loi tai Trust Layer:', e);
      setError('Không tải được dữ liệu Trust Layer. Kiểm tra xem máy chủ đã chạy chưa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitLabel = async (feedbackId, label) => {
    try {
      setLabelling(feedbackId);
      await axios.post('/trust/label', { feedbackId, label });
      setQueue((prev) => prev.filter((q) => q._id !== feedbackId));
      load();
    } catch (e) {
      alert('Không lưu được nhãn: ' + e.message);
    } finally {
      setLabelling(null);
    }
  };

  if (loading && !health) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <Loader2 size={40} color="var(--accent-cyan)" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Đang chạy tầng kiểm soát tin cậy dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--risk-critical)', background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239,68,68,0.2)' }}>
        {error}
      </div>
    );
  }

  const shown = trustOn ? impact?.withTrustLayer : impact?.withoutTrustLayer;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: '0 0 0.4rem 0', fontSize: '1.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <ShieldCheck size={26} color="var(--accent-cyan)" />
          Tầng Kiểm soát Tin cậy Dữ liệu
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '65ch', lineHeight: 1.6 }}>
          Tầng này không loại bỏ dữ liệu một cách nhị phân, mà gán cho mỗi phản hồi một
          trọng số tin cậy. Mọi chỉ số phía sau được tính trên tổng trọng số thay vì đếm thô.
        </p>
      </header>

      {/* --- Phễu dữ liệu + điểm sức khỏe --- */}
      <div className="dashboard-grid">
        <div className="col-span-8">
          <div className="glass-panel" style={{ height: '100%' }}>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 600 }}>Phễu dữ liệu</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', margin: '0 0 0.5rem 0' }}>
              Đường đi của dữ liệu từ lúc thu thập tới lúc được đưa vào phân tích
            </p>

            <FunnelStep label="Phản hồi thô thu thập được" count={health.rawCollected} tone="neutral" />
            <FunnelStep
              label="− Loại vì nội dung rác / quảng cáo"
              count={health.spamRemoved.count} pct={health.spamRemoved.pct} tone="spam"
            />
            <FunnelStep
              label="− Gắn cờ nghi ngờ không xác thực"
              count={health.inauthenticFlagged.count} pct={health.inauthenticFlagged.pct} tone="fake"
              note={`Trong đó ${health.inauthenticFlagged.duplicateClusters} cụm trùng lặp gần`}
            />
            <FunnelStep
              label="− Đang chờ kiểm duyệt"
              count={health.pendingReview.count} pct={health.pendingReview.pct} tone="pending"
              note="Vùng xám, xếp theo độ bất định của mô hình"
            />
            <FunnelStep
              label="= Phản hồi hợp lệ đưa vào phân tích"
              count={health.validForAnalysis} tone="ok" isResult
              note={`Tổng trọng số hiệu dụng: ${health.effectiveWeight}`}
            />

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '1.25rem',
              marginTop: '1.1rem', paddingTop: '1rem',
              borderTop: '1px solid rgba(148,163,184,0.12)',
              fontSize: '0.8rem', color: 'var(--text-muted)'
            }}>
              <span>Độ phủ kênh: <strong style={{ color: 'var(--text-secondary)' }}>{health.channelCoverage.covered}/{health.channelCoverage.expected}</strong></span>
              <span>Đối soát được giao dịch: <strong style={{ color: 'var(--text-secondary)' }}>{health.reconciliationRate}%</strong></span>
              <span>Độ trễ thu thập: <strong style={{ color: 'var(--text-secondary)' }}>{health.ingestionLagMinutes != null ? `${fmt(health.ingestionLagMinutes)} phút` : 'chưa rõ'}</strong></span>
              <span>Từ điển chuẩn hóa: <strong style={{ color: 'var(--text-secondary)' }}>{health.dictionarySize} mục</strong></span>
            </div>
          </div>
        </div>

        <div className="col-span-4">
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: 600 }}>Sức khỏe dữ liệu</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
              Tôi có nên tin những con số này không?
            </p>
            <HealthDial score={health.dataHealthScore} />
            <div style={{ width: '100%', marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {[
                ['Dữ liệu vượt Trust Layer', health.components.passRate],
                ['Độ phủ kênh', health.components.channelCoverage],
                ['Độ tươi dữ liệu', health.components.freshness],
                ['Đối soát giao dịch', health.components.reconciliation]
              ].map(([label, v]) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}%</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(148,163,184,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${v}%`, background: 'linear-gradient(90deg,#22d3ee,#3b82f6)', borderRadius: 99, transition: 'width 0.6s' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- Công tắc Tắt Trust Layer --- */}
      {impact && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
          <div className="flex-wrap-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.05rem', fontWeight: 600 }}>
                Nếu tắt Trust Layer thì sao?
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: 0, maxWidth: '60ch', lineHeight: 1.55 }}>
                Cùng một tập dữ liệu, tính lại như một hệ thống không có tầng kiểm soát tin
                cậy: mỗi phản hồi đều được đếm đủ một điểm.
              </p>
            </div>

            <button
              onClick={() => setTrustOn(!trustOn)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                background: trustOn ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${trustOn ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
                color: trustOn ? 'var(--risk-low)' : 'var(--risk-critical)',
                padding: '0.65rem 1.1rem', borderRadius: 99, cursor: 'pointer',
                fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >
              {trustOn ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              {trustOn ? 'Trust Layer: BẬT' : 'Trust Layer: TẮT'}
            </button>
          </div>

          <div className="dashboard-grid" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            {[
              { label: 'Số cảnh báo sinh ra', value: shown?.alertCount ?? 0, danger: !trustOn },
              { label: 'Tỉ lệ khiếu nại (WCR)', value: trustOn ? impact.wcrWithTrustLayer : impact.wcrWithoutTrustLayer, danger: !trustOn },
              { label: 'Phản hồi bị loại', value: trustOn ? fmt(impact.excludedFeedbacks) : '0', danger: !trustOn },
              { label: 'Cảnh báo ma biến mất sau lọc', value: impact.phantomAlerts, danger: false }
            ].map((m) => (
              <div key={m.label} className="col-span-3">
                <div style={{
                  padding: '1rem',
                  background: m.danger ? 'rgba(239,68,68,0.07)' : 'rgba(148,163,184,0.06)',
                  border: `1px solid ${m.danger ? 'rgba(239,68,68,0.2)' : 'rgba(148,163,184,0.14)'}`,
                  borderRadius: 'var(--radius-md)'
                }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: m.danger ? 'var(--risk-critical)' : 'var(--text-primary)' }}>
                    {m.value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {impact.phantomAlerts > 0 && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Nếu không có tầng này, hệ thống sẽ báo cho doanh nghiệp{' '}
              <strong style={{ color: 'var(--risk-critical)' }}>{impact.phantomAlerts} vấn đề không có thật</strong>
              {impact.phantomExamples?.length > 0 && (
                <> — ví dụ: {impact.phantomExamples.map((p) => `${p.category}${p.cause ? ' → ' + p.cause : ''}`).join('; ')}</>
              )}.
            </p>
          )}
        </div>
      )}

      {/* --- Phân hạng nguồn gốc --- */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem', padding: 0 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>T0 — Phân hạng nguồn gốc</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
            Phản hồi hạng P5 dùng để quan sát xu hướng nhưng không đủ điều kiện kích hoạt cảnh báo mức Cao / Nghiêm trọng
          </p>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hạng</th><th>Mô tả nguồn</th><th>Đối soát giao dịch</th><th>Trọng số</th><th>Số phản hồi</th>
              </tr>
            </thead>
            <tbody>
              {health.tierBreakdown.map((t) => (
                <tr key={t.tier}>
                  <td><span className="cat-badge" style={{ fontWeight: 700 }}>{t.tier}</span></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.label}</td>
                  <td style={{ fontSize: '0.85rem' }}>{t.reconciliation}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{t.weight.toFixed(2)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(t.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Cụm trùng lặp gần --- */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={18} color="var(--risk-critical)" />
          Cụm trùng lặp gần bị đánh dấu nghi vấn
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 1rem 0' }}>
          Nội dung giống nhau và dồn cục trong thời gian ngắn — dấu vết của đánh giá được đặt hàng
        </p>

        {clusters.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>
            Không phát hiện cụm trùng lặp nào trong dữ liệu hiện tại.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {clusters.map((c) => (
              <div key={c.clusterId} style={{
                border: '1px solid rgba(239,68,68,0.22)',
                background: 'rgba(239,68,68,0.05)',
                borderRadius: 'var(--radius-md)', overflow: 'hidden'
              }}>
                <button
                  onClick={() => setOpenCluster(openCluster === c.clusterId ? null : c.clusterId)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: '1rem', padding: '0.9rem 1.1rem',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-primary)', textAlign: 'left'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {c.size} đánh giá gần như giống hệt nhau · đăng trong {c.spanMinutes} phút
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.productName} — “{c.sampleText}”
                    </div>
                  </div>
                  <span className="badge badge-critical" style={{ flexShrink: 0 }}>
                    tương đồng {(c.avgSimilarity * 100).toFixed(0)}%
                  </span>
                </button>

                {openCluster === c.clusterId && (
                  <div style={{ padding: '0 1.1rem 1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {c.members.map((m) => (
                      <div key={m._id} style={{
                        padding: '0.7rem 0.85rem', background: 'rgba(0,0,0,0.18)',
                        borderRadius: 'var(--radius-sm)', fontSize: '0.82rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>@{m.author}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {new Date(m.timestamp).toLocaleString('vi-VN')} · hạng {m.trust?.tier}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{m.originalText}</div>
                        {m.trust?.triggeredSignals?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                            {m.trust.triggeredSignals.map((s, i) => {
                              const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
                              return (
                                <span key={i} title={s.detail || ''} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  fontSize: '0.72rem', padding: '3px 8px', borderRadius: 99,
                                  background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
                                  border: '1px solid rgba(239,68,68,0.25)'
                                }}>
                                  <Icon size={11} /> {s.signal} ({s.value})
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Hàng đợi kiểm duyệt --- */}
      <div className="glass-panel">
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 600 }}>
          T4 — Hàng đợi kiểm duyệt và học chủ động
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 1rem 0' }}>
          Sắp xếp theo độ bất định của mô hình, không theo thời gian — mỗi thao tác của bạn
          mang lại nhiều thông tin huấn luyện nhất có thể.
          {health.humanLabelCount > 0 && ` Đã có ${health.humanLabelCount} nhãn do người kiểm duyệt xác nhận.`}
        </p>

        {queue.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--risk-low)', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 'var(--radius-md)' }}>
            <CheckCircle2 size={28} style={{ marginBottom: '0.5rem' }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Không còn phản hồi nào nằm trong vùng xám cần kiểm duyệt.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {queue.map((q) => (
              <div key={q._id} style={{
                padding: '0.9rem 1rem', background: 'rgba(234,179,8,0.06)',
                border: '1px solid rgba(234,179,8,0.22)', borderRadius: 'var(--radius-md)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                  <strong style={{ fontSize: '0.86rem' }}>@{q.author} · {q.source}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    Điểm xác thực A = {q.authenticityScore} · độ bất định {q.uncertainty}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {q.originalText}
                </p>
                {q.triggeredSignals?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.7rem' }}>
                    {q.triggeredSignals.map((s, i) => {
                      const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
                      return (
                        <span key={i} title={s.detail || ''} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '0.72rem', padding: '3px 8px', borderRadius: 99,
                          background: 'rgba(234,179,8,0.12)', color: '#fde68a',
                          border: '1px solid rgba(234,179,8,0.25)'
                        }}>
                          <Icon size={11} /> {s.signal} ({s.value})
                        </span>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Hợp lệ', value: 'valid', Icon: CheckCircle2, color: 'var(--risk-low)' },
                    { label: 'Không xác thực', value: 'inauthentic', Icon: XCircle, color: 'var(--risk-critical)' },
                    { label: 'Nội dung rác', value: 'spam', Icon: UserX, color: 'var(--risk-high)' }
                  ].map((b) => (
                    <button
                      key={b.value}
                      disabled={labelling === q._id}
                      onClick={() => submitLabel(q._id, b.value)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.42rem 0.85rem', borderRadius: 'var(--radius-sm)',
                        background: 'transparent', border: `1px solid ${b.color}`,
                        color: b.color, cursor: labelling === q._id ? 'wait' : 'pointer',
                        fontSize: '0.8rem', fontWeight: 600
                      }}
                    >
                      <b.Icon size={13} /> {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrustLayerPage;
