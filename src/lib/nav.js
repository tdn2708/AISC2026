import {
  LayoutDashboard, ChartColumnBig, Siren, MessagesSquare, ScanSearch, ShieldCheck, FlaskConical,
  DatabaseZap, FileText, Settings, Palette, Radio, FolderKanban, ConciergeBell, ServerCog
} from 'lucide-react';

/**
 * Cấu trúc điều hướng DÙNG CHUNG cho thanh bên và bảng lệnh Ctrl+K — khai
 * báo một lần để hai nơi không bao giờ lệch nhau.
 *
 * Thanh bên chia ba nhóm (việc hằng ngày, phân tích, dữ liệu) để chủ shop
 * thấy ngay năm việc dùng mỗi ngày ở trên cùng. Ba trang còn lại vẫn
 * mở được, nhưng từ đúng chỗ người ta cần tới chúng:
 *   Báo cáo         — nút "Xuất báo cáo" trên thanh lọc, và Ctrl+K
 *   Cài đặt         — menu người dùng ở cuối thanh bên, và Ctrl+K
 *   Phòng thí nghiệm — dòng trạng thái mô hình ở cuối thanh bên, và Ctrl+K
 */
export const NAV = [
  // Nhóm đầu là việc chủ shop làm mỗi ngày: không cần nhãn, đứng ngay dưới ô chọn kho
  {
    group: 'Hằng ngày',
    hideLabel: true,
    items: [
      { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      { to: '/butler', label: 'Quản gia', icon: ConciergeBell },
      { to: '/feedbacks', label: 'Phản hồi', icon: MessagesSquare },
      { to: '/risk', label: 'Cảnh báo', icon: Siren, badge: 'alerts' },
      // Từ dữ liệu tới hành động: hồ sơ mở từ điểm đau phải tìm được ngay, không chỉ qua Ctrl+K
      { to: '/cases', label: 'Hồ sơ xử lý', icon: FolderKanban, advanced: true },
      { to: '/live', label: 'Livestream', icon: Radio }
    ]
  },
  {
    group: 'Phân tích',
    items: [
      { to: '/insights', label: 'Bảng số liệu', icon: ChartColumnBig, advanced: true },
      { to: '/analytics', label: 'Phân tích nguyên nhân', icon: ScanSearch, advanced: true }
    ]
  },
  {
    group: 'Dữ liệu',
    items: [
      { to: '/trust', label: 'Tin cậy dữ liệu', icon: ShieldCheck, badge: 'queue', advanced: true },
      { to: '/data', label: 'Nguồn dữ liệu', icon: DatabaseZap }
    ]
  }
];

/**
 * Chế độ chủ shop (lib/ownerMode.js): một nhóm việc hằng ngày gồm mọi trang không
 * đánh dấu `advanced`, rồi nhóm "Nâng cao" chỉ hiện khi người dùng mở ra.
 */
export function navFor(owner, advancedOpen) {
  if (!owner) return NAV;
  const all = NAV.flatMap((g) => g.items);
  const daily = all.filter((i) => !i.advanced);
  const advanced = all.filter((i) => i.advanced);
  return [
    { group: 'Hằng ngày', hideLabel: true, items: daily },
    ...(advancedOpen ? [{ group: 'Nâng cao', items: advanced }] : [])
  ];
}

/** Trang không nằm trên thanh bên nhưng vẫn tìm được qua bảng lệnh */
export const HIDDEN_PAGES = [
  { to: '/reports', label: 'Báo cáo', icon: FileText, group: 'Khác' },
  { to: '/settings', label: 'Cài đặt', icon: Settings, group: 'Khác' },
  { to: '/lab', label: 'Phòng thí nghiệm mô hình', icon: FlaskConical, group: 'Khác' },
  // Trang nội bộ cho người làm giao diện: chỉ hiện ở bản dev, giám khảo không thấy trong Ctrl+K
  ...(import.meta.env.DEV ? [{ to: '/ui-kit', label: 'Bộ giao diện (UI kit)', icon: Palette, group: 'Khác' }] : [])
];

/** Lối vào bàn điều khiển máy chủ — chỉ hiển thị khi tài khoản có vai trò quản trị */
export const ADMIN_PAGE = {
  to: '/admin',
  label: 'Bàn điều khiển máy chủ',
  icon: ServerCog,
  group: 'Quản trị'
};

export const findPage = (pathname) => {
  for (const g of NAV) {
    const item = g.items.find((i) => pathname.startsWith(i.to));
    if (item) return { ...item, group: g.group };
  }
  return HIDDEN_PAGES.find((p) => pathname.startsWith(p.to)) || null;
};
