import React from 'react';
import { MessageSquare, Activity, ShieldCheck, Info } from 'lucide-react';

/**
 * THẺ CHỈ SỐ
 * ------------------------------------------------------------------
 * Bản trước đó hiển thị "NPS Score 42" và các mức tăng giảm viết cứng
 * trong mã nguồn — số minh họa nằm lẫn với số đo thật là kiểu sai nguy
 * hiểm nhất trên một dashboard phân tích. Bản đó đã được sửa: mọi con
 * số ở đây đều tính từ dữ liệu, và mỗi thẻ ghi kèm MẪU SỐ đang dùng.
 *
 * ------------------------------------------------------------------
 * LẦN SỬA NÀY GIẢI QUYẾT MỘT VẤN ĐỀ KHÁC: THỨ BẬC.
 *
 * Bốn thẻ ngang hàng nghĩa là không thẻ nào quan trọng. Khi mọi thứ
 * được nhấn mạnh như nhau thì không gì được nhấn mạnh, và người mở
 * dashboard mỗi sáng phải tự quét cả bốn để đoán xem nên nhìn cái nào.
 *
 * Nay một chỉ số chủ đạo — tỉ lệ khiếu nại có trọng số — chiếm nửa
 * hàng, có sparkline và mức thay đổi so với kỳ trước. Ba chỉ số còn
 * lại rút thành một dải gọn đọc lướt được.
 *
 * Phần chú thích mẫu số GIỮ NGUYÊN TINH THẦN, vì tính trung thực về
 * mẫu số là một giá trị thật của sản phẩm. Chỉ đổi chỗ: một dòng ngắn
 * hiển thị, phần phương pháp đầy đủ đưa vào tooltip ở biểu tượng (i).
 */

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n ?? 0);

/** Đường xu hướng nhỏ. Không trục, không nhãn — nó chỉ trả lời "đang lên hay đang xuống". */
const Sparkline = ({ series = [], tone = 'var(--sev-ok)' }) => {
  const pts = series.filter((v) => typeof v === 'number');
  if (pts.length < 2) return null;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const W = 240;
  const H = 32;

  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - 3 - ((v - min) / span) * (H - 6);
    return [x, y];
  });

  const d = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height: 32, maxWidth: '100%' }}
      aria-label={`Xu hướng ${pts.length} kỳ gần nhất`}
    >
      <polyline
        points={d}
        fill="none"
        stroke={tone}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lx} cy={ly} r="2.6" fill={tone} />
    </svg>
  );
};

/** Chỉ số chủ đạo */
const HeroStat = ({ title, value, unavailable, delta, deltaTone, method, footer, series, seriesTone }) => (
  <div className="glass-panel" style={{
    height: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1.35rem'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <p style={{
        margin: 0, fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-lo)', lineHeight: 1.4
      }}>
        {title}
      </p>
      {/* Phương pháp tính không biến mất, nó chỉ thôi chiếm chỗ của con số */}
      <span
        title={method}
        tabIndex={0}
        role="img"
        aria-label={method}
        style={{
          display: 'grid', placeItems: 'center', width: 20, height: 20, flexShrink: 0,
          borderRadius: '999px', border: '1px solid var(--border)', color: 'var(--text-lo)', cursor: 'help'
        }}
      >
        <Info size={11} />
      </span>
    </div>

    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' }}>
      <span className="data-num" style={{
        fontSize: unavailable ? '1.15rem' : '2.3rem',
        fontWeight: 600, lineHeight: 1,
        color: unavailable ? 'var(--text-lo)' : 'var(--text-hi)'
      }}>
        {value}
      </span>
      {delta && (
        <span className="data-num" style={{ fontSize: '0.8rem', color: deltaTone || 'var(--text-mid)' }}>
          {delta}
        </span>
      )}
    </div>

    <Sparkline series={series} tone={seriesTone} />

    <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-mid)', lineHeight: 1.5 }}>
      {footer}
    </p>
  </div>
);

/** Chỉ số phụ — một dòng, đọc lướt */
const CompactStat = ({ icon, title, value, tone, note, method }) => (
  <div className="glass-panel" style={{
    padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.85rem'
  }}>
    <span style={{
      display: 'grid', placeItems: 'center', width: 34, height: 34, flexShrink: 0,
      borderRadius: 'var(--r-ctrl)', background: 'var(--raised)', color: 'var(--text-lo)'
    }}>
      {icon}
    </span>

    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{
        display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-lo)', lineHeight: 1.4
      }}>
        {title}
      </span>
      <span
        title={method}
        style={{
          display: 'block', fontSize: '0.74rem', color: 'var(--text-mid)', lineHeight: 1.45,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}
      >
        {note}
      </span>
    </span>

    <span className="data-num" style={{
      fontSize: '1.15rem', fontWeight: 600, color: tone || 'var(--text-hi)',
      flexShrink: 0, lineHeight: 1.1
    }}>
      {value}
    </span>
  </div>
);

const KPICards = ({ stats, trend = [] }) => {
  const total = stats?.totalFeedbacks;
  const wcr = stats?.weightedComplaintRate;
  const son = stats?.shareOfNegative;
  const health = stats?.dataHealthScore;

  const healthTone =
    health == null ? undefined
      : health >= 75 ? 'var(--sev-ok)'
        : health >= 50 ? 'var(--sev-high)'
          : 'var(--sev-crit)';

  // Sparkline lấy từ chính chuỗi khiếu nại đang vẽ trên biểu đồ diễn
  // biến — không có nguồn số nào khác được bịa thêm ở đây.
  const series = (trend || []).map((d) => Number(d?.complaints ?? 0));

  // Xu hướng: so nửa kỳ gần nhất với nửa kỳ trước đó. Với khiếu nại
  // thì GIẢM là tốt, nên màu phải đảo so với trực giác thông thường.
  let delta = null;
  let deltaTone;
  let sparkTone = 'var(--text-lo)';
  if (series.length >= 4) {
    const half = Math.floor(series.length / 2);
    const older = series.slice(0, half);
    const newer = series.slice(half);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const diff = avg(newer) - avg(older);
    const improving = diff <= 0;
    deltaTone = improving ? 'var(--sev-ok)' : 'var(--sev-crit)';
    sparkTone = deltaTone;
    // Nói rõ ĐƠN VỊ của con số này. "▲ 34.1" trần trụi thì người đọc
    // không biết đó là phần trăm, là điểm phần trăm, hay là số phản hồi.
    delta = `${improving ? '▼' : '▲'} ${Math.abs(diff).toFixed(1).replace('.', ',')} phản hồi/kỳ so với nửa trước`;
  }

  return (
    <div className="dashboard-grid">
      <div className="col-span-6">
        <HeroStat
          title="Tỉ lệ khiếu nại có trọng số"
          value={wcr?.display || '—'}
          unavailable={wcr && !wcr.available}
          delta={delta}
          deltaTone={deltaTone}
          series={series}
          seriesTone={sparkTone}
          method={
            wcr?.available
              ? `Mẫu số: ${fmt(wcr.denominator)} giao dịch đối soát được. Độ phủ đối soát ${Math.round((wcr.coverage || 0) * 100)}%. Chỉ tính trên kênh gắn được mã đơn hàng; khiếu nại được cộng theo trọng số tin cậy thay vì đếm thô.`
              : 'Chưa kết nối dữ liệu giao dịch nên không tồn tại mẫu số. Hệ thống báo không khả dụng thay vì trả về một con số không có cơ sở.'
          }
          footer={
            wcr?.available
              ? <>Trên <span className="data-num">{fmt(wcr.denominator)}</span> giao dịch đối soát được · độ phủ <span className="data-num">{Math.round((wcr.coverage || 0) * 100)}%</span></>
              : 'Chưa kết nối dữ liệu giao dịch nên không tính được mẫu số'
          }
        />
      </div>

      <div className="col-span-6">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
          <CompactStat
            icon={<MessageSquare size={16} />}
            title="Phản hồi hợp lệ"
            value={fmt(total?.valid)}
            note={
              total?.excluded > 0
                ? `Đã loại ${fmt(total.excluded)} trên ${fmt(total?.value)} phản hồi thô`
                : `Trên ${fmt(total?.value)} phản hồi thô thu thập được`
            }
            method="Số phản hồi còn trọng số lớn hơn 0 sau khi qua Trust Layer."
          />
          <CompactStat
            icon={<Activity size={16} />}
            title="Tỉ trọng phản hồi tiêu cực"
            value={son?.display || '—'}
            note="Chỉ số thay thế cho kênh không đối soát được"
            method="Mẫu số là tổng phản hồi hợp lệ cùng kênh, tính theo trọng số tin cậy."
          />
          <CompactStat
            icon={<ShieldCheck size={16} />}
            title="Sức khỏe dữ liệu"
            value={health != null ? `${health}/100` : '—'}
            tone={healthTone}
            note="Tỉ lệ qua Trust Layer, độ phủ kênh, độ tươi, đối soát"
            method="Điểm tổng hợp bốn thành phần: tỉ lệ phản hồi qua được Trust Layer, độ phủ kênh thu thập, độ tươi của dữ liệu, và tỉ lệ đối soát được với giao dịch."
          />
        </div>
      </div>
    </div>
  );
};

export default KPICards;
