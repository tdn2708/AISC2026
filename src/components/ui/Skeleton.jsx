import React from 'react';

/**
 * KHUNG XƯƠNG (F4-05): chỗ giữ đúng hình của nội dung sắp về, thay chữ
 * "Đang tải". Mỗi khối dữ liệu có bốn trạng thái: đang tải (khung xương),
 * rỗng (EmptyState), lỗi (EmptyState variant="error" + nút thử lại), đủ.
 *
 *   <Skeleton className="h-4 w-2/3" />              một vạch chữ
 *   <SkeletonLines lines={3} />                     một đoạn chữ, dòng cuối ngắn
 *   <SkeletonBlock label="Đang tải việc hôm nay">…</SkeletonBlock>
 *
 * - Skeleton: một khối nền --raised, bo --r-ctrl, thở nhẹ bằng opacity
 *   (animate-skeleton, --motion-story, lặp). Giảm chuyển động: đứng yên.
 *   aria-hidden: trình đọc màn hình không đọc từng vạch.
 * - SkeletonLines: lines dòng cao bằng một dòng chữ text-sm, dòng cuối 60%.
 * - SkeletonBlock: bọc cả vùng đang tải, đặt role="status" + aria-busy và
 *   một câu ẩn (label) để trình đọc màn hình biết vùng này đang tải.
 * Kích thước do nơi gọi đặt (cùng cỡ với nội dung thật) để khi số về,
 * bố cục không nhảy.
 */
export const Skeleton = ({ as: Tag = 'span', className = '', style }) => (
  <Tag aria-hidden="true" className={`block animate-skeleton rounded-ctrl bg-raised ${className}`} style={style} />
);

export const SkeletonLines = ({ lines = 3, className = '', lineClassName = 'h-3.5' }) => (
  <span aria-hidden="true" className={`flex flex-col gap-2.5 ${className}`}>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={lineClassName} style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }} />
    ))}
  </span>
);

export const SkeletonBlock = ({ as: Tag = 'div', label = 'Đang tải', className = '', children }) => (
  <Tag role="status" aria-busy="true" className={className}>
    <span className="sr-only">{label}</span>
    {children}
  </Tag>
);

export default Skeleton;
