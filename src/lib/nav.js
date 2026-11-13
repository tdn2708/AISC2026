import {
  LayoutDashboard, ChartColumnBig, Siren, MessagesSquare, ScanSearch, ShieldCheck, FlaskConical,
  DatabaseZap, FileText, Settings, Palette, Radio, FolderKanban
} from 'lucide-react';

/**
 * Cấu trúc điều hướng DÙNG CHUNG cho thanh bên và bảng lệnh Ctrl+K — khai
 * báo một lần để hai nơi không bao giờ lệch nhau.
 *
 * Thanh bên chỉ giữ tám việc người dùng làm hằng ngày. Ba trang còn lại vẫn
 * mở được, nhưng từ đúng chỗ người ta cần tới chúng:
 *   Báo cáo         — nút "Xuất báo cáo" trên thanh lọc, và Ctrl+K
 *   Cài đặt         — menu người dùng ở cuối thanh bên, và Ctrl+K
 *   Phòng thí nghiệm — dòng trạng thái mô hình ở cuối thanh bên, và Ctrl+K
 */
export const NAV = [
  {
    group: 'Chính',
    items: [
      { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      { to: '/insights', label: 'Bảng số liệu', icon: ChartColumnBig },
      { to: '/risk', label: 'Cảnh báo', icon: Siren, badge: 'alerts' },
      { to: '/feedbacks', label: 'Phản hồi', icon: MessagesSquare },
      { to: '/live', label: 'Livestream', icon: Radio },
      { to: '/analytics', label: 'Phân tích nguyên nhân', icon: ScanSearch },
      { to: '/trust', label: 'Tin cậy dữ liệu', icon: ShieldCheck, badge: 'queue' },
      { to: '/data', label: 'Nguồn dữ liệu', icon: DatabaseZap }
    ]
  }
];

/** Trang không nằm trên thanh bên nhưng vẫn tìm được qua bảng lệnh */
export const HIDDEN_PAGES = [
  { to: '/cases', label: 'Hồ sơ xử lý', icon: FolderKanban, group: 'Khác' },
  { to: '/reports', label: 'Báo cáo', icon: FileText, group: 'Khác' },
  { to: '/settings', label: 'Cài đặt', icon: Settings, group: 'Khác' },
  { to: '/lab', label: 'Phòng thí nghiệm mô hình', icon: FlaskConical, group: 'Khác' },
  { to: '/ui-kit', label: 'Bộ giao diện (UI kit)', icon: Palette, group: 'Khác' }
];

export const findPage = (pathname) => {
  for (const g of NAV) {
    const item = g.items.find((i) => pathname.startsWith(i.to));
    if (item) return { ...item, group: g.group };
  }
  return HIDDEN_PAGES.find((p) => pathname.startsWith(p.to)) || null;
};
