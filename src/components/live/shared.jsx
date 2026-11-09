import React from 'react';
import { Badge } from '../ui';

/**
 * Màu theo ý định bình luận. Mỗi loại một màu cố định trên mọi chỗ của trang
 * (huy hiệu, cột biểu đồ nhịp bình luận), luôn đi kèm chữ, không chỉ dựa vào màu.
 */
export const INTENTS = [
  { key: 'complaint', label: 'Khiếu nại', tone: 'crit', color: 'var(--color-crit)' },
  { key: 'question', label: 'Câu hỏi', tone: 'accent', color: 'var(--color-accent)' },
  { key: 'order', label: 'Chốt đơn', tone: 'ok', color: 'var(--color-ok)' },
  { key: 'praise', label: 'Khen', tone: 'sky', color: 'var(--color-sky)' },
  { key: 'chatter', label: 'Tương tác', tone: 'neutral', color: 'var(--color-ink-lo)' }
];
export const INTENT_MAP = Object.fromEntries(INTENTS.map((i) => [i.key, i]));

export const IntentBadge = ({ intent, className = '' }) => {
  const m = INTENT_MAP[intent] || INTENT_MAP.chatter;
  return <Badge tone={m.tone} className={className}>{m.label}</Badge>;
};

export const PLATFORM_LABEL = {
  tiktok: 'TikTok Live',
  youtube: 'YouTube Live',
  manual: 'Nhập tay',
  simulator: 'Mô phỏng'
};

export const STATUS = {
  connecting: { label: 'Đang kết nối', tone: 'med' },
  reconnecting: { label: 'Đang nối lại', tone: 'med' },
  live: { label: 'Đang live', tone: 'crit' },
  ended: { label: 'Đã kết thúc', tone: 'neutral' },
  error: { label: 'Lỗi kết nối', tone: 'crit' },
  interrupted: { label: 'Bị ngắt', tone: 'high' }
};

export const StatusPill = ({ status }) => {
  const s = STATUS[status] || STATUS.ended;
  return (
    <Badge tone={s.tone} className="gap-1.5">
      {status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-crit" aria-hidden="true" />}
      {s.label}
    </Badge>
  );
};

export const vnd = (n) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('vi-VN')}đ`);

export const clock = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const duration = (from, to) => {
  if (!from) return '—';
  const s = Math.max(0, Math.round(((to ? new Date(to) : new Date()) - new Date(from)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h} giờ ${String(m).padStart(2, '0')} phút` : `${m}:${String(sec).padStart(2, '0')}`;
};

export const variantText = (v = {}) => [v.size && `size ${v.size}`, v.color].filter(Boolean).join(', ');
