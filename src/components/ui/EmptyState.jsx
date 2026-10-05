import React from 'react';
import { CircleCheck, Inbox, TriangleAlert } from 'lucide-react';

/**
 * Trạng thái rỗng: một ô biểu tượng, tiêu đề và một dòng giải thích.
 * Cố ý không dùng hình minh hoạ — trên một công cụ phân tích, trạng thái
 * rỗng cần nói rõ nó là gì, không cần trang trí.
 *   calm  — mọi thứ ổn (không có cảnh báo)
 *   empty — chưa có dữ liệu
 *   error — không tải được
 */
const VARIANT = {
  calm: { Icon: CircleCheck, cls: 'bg-ok/10 text-ok' },
  empty: { Icon: Inbox, cls: 'bg-raised text-ink-mid' },
  error: { Icon: TriangleAlert, cls: 'bg-crit/10 text-crit' }
};

export const EmptyState = ({ variant = 'empty', title, description, action, compact = false, className = '' }) => {
  const v = VARIANT[variant] || VARIANT.empty;
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} ${className}`}>
      <span className={`grid size-10 place-items-center rounded-lg ${v.cls}`}>
        <v.Icon size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-[0.95rem] font-semibold text-ink-hi">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-mid">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
