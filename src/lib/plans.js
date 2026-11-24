/**
 * CÁC GÓI DÙNG (một nguồn duy nhất cho trang giới thiệu và trang /bang-gia)
 * ------------------------------------------------------------------
 * Giá dự kiến cho giai đoạn thử nghiệm với shop thật, CHƯA có khách trả tiền: mọi trang
 * hiện giá phải nói đúng như vậy. Đổi giá, đổi tên gói hay đổi tính năng chỉ sửa ở đây.
 *
 * `unlocks`: tính năng gói này mở thêm so với gói trước (trang bảng giá mở khóa theo bậc).
 * `items`: danh sách đầy đủ (trang giới thiệu); `brief`: bản ngắn cho thẻ chọn gói ở /bang-gia.
 * `matrix`: bảng so sánh đầy đủ; giá trị true, false hoặc một chữ ngắn.
 */

export const PRICE_NOTE = 'Giá dự kiến cho giai đoạn thử nghiệm với shop thật, chưa thu tiền.';

export const PLANS = [
  {
    id: 'try',
    name: 'Dùng thử',
    price: '0 đ',
    priceShort: '0',
    unit: '',
    for: 'Shop mới bắt đầu, muốn xem thử',
    items: ['Tới 500 phản hồi mỗi tháng', 'Cảnh báo và việc hôm nay', 'Bản tin Zalo buổi sáng'],
    brief: ['500 phản hồi mỗi tháng', 'Cảnh báo, việc hôm nay', 'Bản tin Zalo'],
    unlocks: ['Cảnh báo khi phàn nàn tăng', 'Việc hôm nay theo mức gấp', 'Bản tin Zalo mỗi sáng'],
    shot: { base: '/landing/tong-quan', w: 1600, h: 1000, alt: 'Trang Tổng quan: hôm nay có 4 việc cần làm, việc gấp nhất ở đầu, số liệu đứng trên phép trừ đối chiếu' }
  },
  {
    id: 'shop',
    name: 'Shop',
    price: '199.000 đ',
    priceShort: '199.000',
    unit: ' mỗi tháng',
    for: 'Shop bán trên nhiều sàn',
    items: ['Không giới hạn phản hồi', 'Nạp file đơn hàng Shopee, TikTok Shop, Lazada', 'Kế hoạch xử lý kèm bằng chứng', 'Quản gia Zalo báo sự cố và nhận lệnh'],
    brief: ['Không giới hạn phản hồi', 'Nạp đơn hàng từ sàn', 'Quản gia Zalo'],
    unlocks: ['Quản gia Zalo nhận lệnh từ xa', 'Nạp đơn từ Shopee, TikTok, Lazada', 'Không giới hạn phản hồi'],
    shot: { base: '/goi/quan-gia', w: 773, h: 716, alt: 'Trang Quản gia: danh sách việc đang chờ, mỗi việc có mức độ, nút xem kế hoạch và duyệt' }
  },
  {
    id: 'live',
    name: 'Shop có live',
    price: '499.000 đ',
    priceShort: '499.000',
    unit: ' mỗi tháng',
    for: 'Shop bán hàng qua livestream',
    items: ['Mọi thứ của gói Shop', 'Phân loại bình luận live ngay khi tới', 'Việc gấp trong phiên và báo cáo cuối phiên', 'Báo Zalo khi live gặp sự cố'],
    brief: ['Toàn bộ gói Shop', 'Đọc bình luận live', 'Việc gấp trong phiên'],
    unlocks: ['Đọc bình luận live ngay khi tới', 'Khách muốn mua gì, hỏi gì', 'Việc gấp trong phiên live'],
    pulse: { base: '/goi/live-pulse', w: 1153, h: 388 },
    shot: { base: '/goi/live', w: 1153, h: 747, alt: 'Bảng điều khiển phiên live: người xem, bình luận và lượt chốt theo phút, khách muốn mua gì, muốn biết gì' }
  }
];

/** Bảng so sánh: [tên dòng, Dùng thử, Shop, Shop có live] */
export const MATRIX = [
  ['Phản hồi mỗi tháng', 'Tới 500', 'Không giới hạn', 'Không giới hạn'],
  ['Cảnh báo, việc hôm nay', true, true, true],
  ['Bản tin Zalo sáng', true, true, true],
  ['Nạp đơn hàng từ sàn', false, true, true],
  ['Kế hoạch kèm bằng chứng', false, true, true],
  ['Quản gia Zalo', false, true, true],
  ['Đọc bình luận live', false, false, true],
  ['Khách muốn gì trong live', false, false, true],
  ['Báo cáo, báo sự cố live', false, false, true]
];

export const planById = (id) => PLANS.find((p) => p.id === id) || null;
