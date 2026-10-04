import {
  LayoutDashboard, Siren, MessagesSquare, ScanSearch, ShieldCheck, FlaskConical,
  DatabaseZap, FileText, Settings, Palette
} from 'lucide-react';

/**
 * Cấu trúc điều hướng DÙNG CHUNG cho thanh bên, thanh trên (tiêu đề trang)
 * và bảng lệnh Ctrl+K — khai báo một lần để ba nơi không bao giờ lệch nhau.
 * Nhóm theo việc người dùng cần làm, không theo cấu trúc mã nguồn.
 */
export const NAV = [
  {
    group: 'Giám sát',
    items: [
      { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      { to: '/risk', label: 'Cảnh báo & hành động', short: 'Cảnh báo', icon: Siren, badge: 'alerts' },
      { to: '/feedbacks', label: 'Phản hồi', icon: MessagesSquare }
    ]
  },
  {
    group: 'Phân tích',
    items: [
      { to: '/analytics', label: 'Phân tích nguyên nhân', icon: ScanSearch },
      { to: '/trust', label: 'Tin cậy dữ liệu', icon: ShieldCheck, badge: 'queue' },
      { to: '/lab', label: 'Phòng thí nghiệm', icon: FlaskConical }
    ]
  },
  {
    group: 'Hệ thống',
    items: [
      { to: '/data', label: 'Nguồn dữ liệu', icon: DatabaseZap },
      { to: '/reports', label: 'Báo cáo', icon: FileText },
      { to: '/settings', label: 'Cài đặt', icon: Settings }
    ]
  }
];

/** Trang không nằm trên thanh bên nhưng vẫn tìm được qua bảng lệnh */
export const HIDDEN_PAGES = [{ to: '/ui-kit', label: 'Bộ giao diện (UI kit)', icon: Palette, group: 'Hệ thống' }];

export const findPage = (pathname) => {
  for (const g of NAV) {
    const item = g.items.find((i) => pathname.startsWith(i.to));
    if (item) return { ...item, group: g.group };
  }
  return HIDDEN_PAGES.find((p) => pathname.startsWith(p.to)) || null;
};
