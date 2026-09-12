import React, { useState } from 'react';
import { TrendingUp, ShieldAlert, Activity, Clock, CheckCircle2 } from 'lucide-react';

/**
 * Danh sách cảnh báo trên trang tổng quan.
 * Mỗi thẻ hiển thị BẰNG CHỨNG THỐNG KÊ (z, p, cỡ mẫu) và số phản hồi đã
 * bị Trust Layer loại trong cùng phạm vi. Dòng "đã loại N phản hồi" là
 * chi tiết nhỏ nhưng có sức nặng: nó cho thấy tầng kiểm soát tin cậy
 * không phải một màn hình riêng để trưng bày, mà thật sự chạy trong mọi
 * con số.
 */

const severityStyle = (level) => {
  switch (level) {
    case 'Critical': return { color: 'var(--risk-critical)', badge: 'badge-critical', label: 'NGHIÊM TRỌNG' };
    case 'High': return { color: 'var(--risk-high)', badge: 'badge-high', label: 'CAO' };
    case 'Medium': return { color: 'var(--risk-medium)', badge: 'badge-medium', label: 'TRUNG BÌNH' };
    default: return { color: 'var(--risk-low)', badge: 'badge-low', label: 'THẤP' };
  }
};

const RiskAlerts = ({ risks = [] }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? risks : risks.slice(0, 3);

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.25rem' }}>
        <ShieldAlert size={22} color="var(--risk-critical)" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Cảnh báo đang mở</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Đã qua kiểm định thống kê và hiệu chỉnh đa kiểm định
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {risks.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '2rem 1rem', color: 'var(--risk-low)',
            background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)',
            borderRadius: 'var(--radius-md)'
          }}>
            <CheckCircle2 size={26} style={{ marginBottom: '0.5rem' }} />
            <p style={{ margin: 0, fontSize: '0.86rem' }}>
              Không có biến động nào đạt ngưỡng ý nghĩa thống kê trong kỳ này.
            </p>
          </div>
        ) : (
          visible.map((alert, index) => {
            const s = severityStyle(alert.severity);
            const st = alert.statistics || {};
            const isDrift = alert.type === 'SUSTAINED_DRIFT';

            return (
              <div key={alert.id || index} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '1rem 1.1rem 1rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                position: 'relative', overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: s.color }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.35 }}>
                    {alert.issue}
                  </h4>
                  <span className={`badge ${s.badge}`} style={{ flexShrink: 0 }}>{s.label}</span>
                </div>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.7rem 0', lineHeight: 1.55 }}>
                  {alert.insight}
                </p>

                {/* Bằng chứng thống kê */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.9rem',
                  fontSize: '0.74rem', color: 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  {isDrift ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Activity size={11} /> EWMA {st.ewmaCurrent} vượt giới hạn {st.controlLimit}, {st.consecutiveBreaches} chu kỳ
                    </span>
                  ) : (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: s.color }}>
                        <TrendingUp size={11} /> {alert.increase}
                      </span>
                      <span>z = {st.z}</span>
                      <span>{st.pValueDisplay}</span>
                      <span>n = {st.sampleCurrent}</span>
                    </>
                  )}
                  {alert.sla && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} /> SLA {alert.sla}
                    </span>
                  )}
                </div>

                {alert.excludedByTrust > 0 && (
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.72rem', color: 'var(--accent-cyan)', fontStyle: 'italic' }}>
                    Dựa trên {alert.evidenceCount} phản hồi hợp lệ — đã loại {alert.excludedByTrust} phản hồi không đạt ngưỡng tin cậy
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {risks.length > 3 && (
        <div style={{ paddingTop: '1rem', textAlign: 'center' }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-secondary)', padding: '0.4rem 1.25rem',
              borderRadius: '99px', cursor: 'pointer', fontSize: '0.8rem'
            }}
          >
            {showAll ? 'Thu gọn' : `Xem tất cả (${risks.length})`}
          </button>
        </div>
      )}
    </div>
  );
};

export default RiskAlerts;
