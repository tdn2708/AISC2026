/**
 * Lớp CSS dùng chung cho mọi ô nhập (tách khỏi Field.jsx để file component chỉ export component, K7-02 lỗi 27).
 * Xem mô tả diện mạo ở đầu Field.jsx.
 */
const FIELD_BASE =
  'w-full rounded-ctrl border bg-surface text-sm text-ink-hi placeholder:text-ink-lo transition-[border-color,background-color] duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55';
const FIELD_H = { sm: 'h-8', md: 'h-10' };

export const fieldClass = ({ size = 'md', error = false, multiline = false } = {}) =>
  `${FIELD_BASE} ${error ? 'border-crit' : 'border-field hover:border-ink-lo disabled:hover:border-field'} ${multiline ? '' : FIELD_H[size] || FIELD_H.md}`;
