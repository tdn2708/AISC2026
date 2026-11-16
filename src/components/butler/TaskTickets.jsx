import React from 'react';
import { Link } from 'react-router-dom';
import { Button, SeverityBadge } from '../ui';

const LEVEL_MAP = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  Critical: 'Critical',
  High: 'High',
  Medium: 'Medium'
};

/**
 * PHIẾU VIỆC CÓ SỐ (TaskTickets)
 * ==================================================================
 * Danh sách có thứ tự thật (<ol>) vì con số đầu mỗi dòng là tay cầm của lệnh
 * ("xem 2", "duyệt 2" trên cả Zalo và web). Chia bằng đường kẻ border-line-soft,
 * không đóng thẻ lồng thẻ.
 */
const TaskTickets = ({ items = [], onCommand, disabled = false }) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <ol className="mt-3 list-none divide-y divide-line-soft border-y border-line-soft">
      {items.map((it, idx) => {
        const n = it.n ?? idx + 1;
        const level = LEVEL_MAP[it.severity] || 'Medium';
        const isAlert = it.kind === 'alert';

        return (
          <li key={`${n}-${it.id || idx}`} className="flex items-start gap-3.5 py-3.5">
            <span
              className="min-w-7 pt-0.5 text-heading font-semibold tabular-nums text-ink-hi"
              aria-label={`Việc số ${n}`}
            >
              {n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge level={level} />
                <p className="text-base font-semibold text-ink-hi">{it.title}</p>
              </div>
              {it.why && (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-mid">
                  {it.why}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onCommand?.(`xem ${n}`)}
                >
                  Xem kế hoạch
                </Button>
                {isAlert ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onCommand?.(`duyệt ${n}`)}
                  >
                    Duyệt
                  </Button>
                ) : (
                  <Button
                    as={Link}
                    to={it.to || '/dashboard'}
                    variant="link"
                    size="sm"
                  >
                    Mở trang
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default TaskTickets;
