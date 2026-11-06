import React from 'react';
import { fmtInt } from '../../lib/format';

/**
 * THANH BẰNG CHỨNG
 * ------------------------------------------------------------------
 * Vạch mảnh dưới mỗi con số, chia theo nguồn gốc của các phản hồi đứng
 * sau nó. Ba nhóm được mã hoá bằng KIỂU TÔ, không thêm màu — người mù màu
 * vẫn phân biệt được, và không đụng vào thang màu mức độ:
 *   tô đặc     — đối soát được: có mã đơn, sàn xác nhận đã mua, tài khoản định danh
 *   viền rỗng  — người kiểm duyệt đã xác nhận
 *   gạch chéo  — chỉ dựa trên phán đoán của Trust Layer
 *
 * mix = { total, verified, human, inferred } từ /api/stats → evidence.*
 */
export const EVIDENCE_KINDS = [
  {
    key: 'verified',
    label: 'Đối soát được',
    hint: 'Có mã đơn hàng, được sàn xác nhận đã mua, hoặc gắn tài khoản đã định danh'
  },
  {
    key: 'human',
    label: 'Người đã duyệt',
    hint: 'Người kiểm duyệt đã đọc và xác nhận phản hồi là thật'
  },
  {
    key: 'inferred',
    label: 'AI suy luận',
    hint: 'Chưa có chứng từ; được tính vì Trust Layer không thấy dấu hiệu bất thường'
  }
];

const FILL = {
  verified: { background: 'var(--accent)' },
  human: { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--accent)' },
  inferred: {
    background:
      'repeating-linear-gradient(135deg, var(--accent) 0 1.5px, transparent 1.5px 4.5px)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)'
  }
};

/** Mẫu tô nhỏ dùng trong chú giải */
export const EvidenceSwatch = ({ kind, size = 10 }) => (
  <span aria-hidden="true" className="inline-block shrink-0 rounded-[2px]" style={{ width: size, height: size, ...FILL[kind] }} />
);

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/** Tỉ lệ ba nhóm cộng đúng 100: nhóm cuối có mặt nhận phần dư sau làm tròn */
const shares = (mix) => {
  const present = EVIDENCE_KINDS.filter((k) => mix[k.key] > 0);
  let used = 0;
  return present.map((k, i) => {
    const v = i === present.length - 1 ? 100 - used : pct(mix[k.key], mix.total);
    used += v;
    return { ...k, pct: v };
  });
};

const lowerLabel = (s) => (s.startsWith('AI') ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** Một câu mô tả cho trình đọc màn hình */
export const evidenceSentence = (mix) => {
  if (!mix?.total) return 'Chưa có phản hồi nào được tính';
  return `${fmtInt(mix.total)} phản hồi: ${shares(mix).map((s) => `${s.pct}% ${lowerLabel(s.label)}`).join(', ')}`;
};

export const EvidenceBar = ({ mix, height = 6, showCaption = true, className = '' }) => {
  const total = mix?.total || 0;
  const segments = EVIDENCE_KINDS.map((k) => ({ ...k, n: mix?.[k.key] || 0 })).filter((s) => s.n > 0);
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={evidenceSentence(mix)}
        className="flex w-full gap-[2px] overflow-hidden rounded-[3px] bg-raised"
        style={{ height }}
      >
        {segments.map((s) => (
          <span key={s.key} title={`${s.label}: ${fmtInt(s.n)} phản hồi`} className="h-full rounded-[2px]" style={{ flexGrow: s.n, ...FILL[s.key] }} />
        ))}
      </div>
      {showCaption && (
        <p className="mt-1.5 text-[0.75rem] leading-snug text-ink-lo">
          {total ? (
            <>
              <span className="font-mono font-medium text-ink-mid">{100 - pct(mix.inferred, total)}%</span> có chứng từ hoặc đã duyệt,{' '}
              <span className="font-mono">{pct(mix.inferred, total)}%</span> do AI suy luận
            </>
          ) : (
            'Chưa có phản hồi nào được tính'
          )}
        </p>
      )}
    </div>
  );
};

/** Chú giải đầy đủ: mẫu tô, tên, số lượng, tỉ lệ, giải thích — dùng trong ngăn kéo */
export const EvidenceLegend = ({ mix }) => (
  <ul className="flex list-none flex-col gap-3">
    {EVIDENCE_KINDS.map((k) => (
      <li key={k.key} className="flex items-start gap-3">
        <span className="mt-1.5"><EvidenceSwatch kind={k.key} size={12} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink-hi">{k.label}</span>
            <span className="font-mono text-sm text-ink-hi">
              {fmtInt(mix?.[k.key])} <span className="text-ink-lo">({pct(mix?.[k.key] || 0, mix?.total)}%)</span>
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-lo">{k.hint}</p>
        </div>
      </li>
    ))}
  </ul>
);
