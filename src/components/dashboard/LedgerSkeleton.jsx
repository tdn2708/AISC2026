import React from 'react';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';

/**
 * Khung xương của sổ đối chiếu (F4-05): đúng hình tờ sổ của LedgerRun (tiêu
 * đề, năm dòng kẻ, gạch đôi, số được tính cỡ text-metric, dòng "khớp"), để
 * khi số thật về, tờ sổ thay vào mà bố cục không nhảy. Dùng ở Tổng quan và
 * Đăng nhập trong lúc chờ /trust/health.
 */
const ROWS = ['w-40', 'w-28', 'w-32', 'w-36'];

const LedgerSkeleton = ({ className = '' }) => (
  <SkeletonBlock label="Đang tải sổ đối chiếu" className={`rounded-lg border border-line bg-(--sheet) px-5 pt-4 pb-5 ${className}`}>
    <span className="flex items-center justify-between gap-3 py-1">
      <Skeleton className="h-4 w-44" />
    </span>
    <span className="mt-2 block">
      {ROWS.map((w, i) => (
        <span key={i} className="flex items-center justify-between gap-3 border-b border-(--sheet-rule) py-[0.6875rem]">
          <Skeleton className={`h-3 ${w}`} />
          <Skeleton className="h-3 w-14" />
        </span>
      ))}
    </span>
    <span className="mt-px flex items-center justify-between gap-3 border-0 border-t-[3px] border-double border-ink-lo pt-3">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-8 w-28" />
    </span>
    <Skeleton className="mt-4 h-3 w-4/5" />
  </SkeletonBlock>
);

export default LedgerSkeleton;
