import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../Logo';

/**
 * ĐIỀU KHOẢN SỬ DỤNG (/dieu-khoan) VÀ CHÍNH SÁCH DỮ LIỆU (/chinh-sach-du-lieu)
 * Trang công khai, đọc được khi chưa đăng nhập (form đăng ký dẫn tới đây). Phiên bản
 * khớp TERMS_VERSION ở backend/services/auth.js: đổi nội dung thì tăng cả hai.
 * Liên hệ lấy từ VITE_CONTACT_EMAIL (Vercel); chưa đặt thì chỉ đường qua Quản gia.
 */
const VERSION = '2026-11-24';
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL || null;
const OPERATOR = 'Nhóm LDS, Trường Đại học Công nghệ Thông tin, ĐHQG TP.HCM';

const contactLine = CONTACT
  ? <>gửi email tới <a className="text-accent-hi underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a></>
  : 'nhắn cho đội vận hành qua trang Cài đặt của ứng dụng';

const TERMS = [
  ['Dịch vụ là gì', [
    'Customer Radar đọc phản hồi và bình luận livestream mà shop đưa vào, gắn độ tin cho từng phản hồi, báo khi khiếu nại tăng và đề xuất việc cần làm. Mọi đề xuất chờ shop duyệt; hệ thống không tự liên lạc với khách hay tự chi tiền.',
    `Đơn vị vận hành: ${OPERATOR}.`
  ]],
  ['Tài khoản', [
    'Mỗi tài khoản dùng cho một shop. Bạn giữ mật khẩu của mình và chịu trách nhiệm với thao tác trong tài khoản.',
    'Dữ liệu của shop nằm trong kho riêng của tài khoản; tài khoản khác không xem được.'
  ]],
  ['Gói và thanh toán', [
    'Trong giai đoạn thử nghiệm, mọi tính năng mở miễn phí cho mọi tài khoản. Đơn vị vận hành báo trước ít nhất 30 ngày qua email đăng ký trước khi bắt đầu thu phí; các điều dưới đây áp dụng từ lúc đó.',
    'Gói Dùng thử miễn phí, tối đa 500 phản hồi mỗi tháng. Gói Shop 199.000 đ và gói Shop có live 499.000 đ cho mỗi 30 ngày.',
    'Thanh toán bằng chuyển khoản ngân hàng theo mã đơn hiện trên trang Bảng giá. Gói bật khi đã nhận đủ tiền, kéo dài theo số tháng đã mua; hết hạn thì tài khoản về gói Dùng thử, dữ liệu vẫn giữ.',
    'Chuyển nhầm số tiền hoặc nội dung: liên hệ để được đối soát. Gói đã bật không hoàn tiền phần thời gian chưa dùng, trừ khi dịch vụ ngừng hoạt động do lỗi của đơn vị vận hành.'
  ]],
  ['Dữ liệu bạn đưa vào', [
    'Bạn chỉ đưa vào dữ liệu mà shop có quyền dùng: đánh giá, đơn hàng, bình luận trong phiên live của chính shop.',
    'Bạn là Bên Kiểm soát dữ liệu cá nhân của khách hàng mình; Customer Radar là Bên Xử lý dữ liệu và chỉ xử lý để làm các việc mô tả ở đây (Nghị định 13/2023/NĐ-CP).'
  ]],
  ['Giới hạn', [
    'Số liệu và đề xuất là hỗ trợ ra quyết định, có ghi rõ phần nào có chứng từ, phần nào do AI đoán. Quyết định cuối cùng thuộc về shop.',
    'Dịch vụ có thể tạm gián đoạn khi bảo trì hoặc khi nhà cung cấp hạ tầng gặp sự cố; đơn vị vận hành báo trước khi có thể.'
  ]],
  ['Chấm dứt', [
    `Bạn có thể ngừng dùng bất cứ lúc nào và yêu cầu xóa tài khoản cùng dữ liệu: ${CONTACT ? `gửi email tới ${CONTACT}` : 'nhắn cho đội vận hành qua trang Cài đặt'}.`,
    'Tài khoản dùng dịch vụ để gửi nội dung rác, dò quét hệ thống hoặc đưa dữ liệu không có quyền dùng có thể bị khóa.'
  ]]
];

const PRIVACY = [
  ['Thu thập gì', [
    'Thông tin tài khoản: họ tên, tên cửa hàng, email, mật khẩu (chỉ lưu dạng băm scrypt, không ai đọc lại được).',
    'Dữ liệu shop đưa vào: nội dung đánh giá, số sao, sản phẩm, đơn hàng (mã đơn, số tiền, tỉnh thành, ngày), bình luận livestream.',
    'Nhật ký kỹ thuật: thời điểm đăng nhập, loại trình duyệt, địa chỉ IP đã băm, để chống truy cập trái phép.'
  ]],
  ['Bảo vệ thế nào', [
    'Tên người mua được che ngay khi thu thập, ví dụ "Quang D. H.". Số điện thoại, email trong nội dung được che trước khi văn bản tới mô hình AI.',
    'Mã khách hàng của sàn được băm một chiều với khóa bí mật trước khi lưu.',
    'Mỗi shop một kho dữ liệu riêng. Kết nối mã hóa (HTTPS), phiên đăng nhập có hạn, khóa tạm khi sai mật khẩu nhiều lần.'
  ]],
  ['Dùng để làm gì', [
    'Chỉ để phân tích cho chính shop: chỉ số, cảnh báo, đề xuất, báo cáo, tin Zalo shop đã bật.',
    'Không bán, không chia sẻ dữ liệu của shop cho bên thứ ba. Không dùng dữ liệu của shop này để huấn luyện mô hình phục vụ shop khác khi chưa có đồng ý bằng văn bản.'
  ]],
  ['Bên xử lý phụ', [
    'Lưu trữ: MongoDB Atlas. Máy chủ: Render, Vercel. Gán nhãn văn bản: Google Gemini và Groq (chỉ nhận văn bản đã che thông tin cá nhân). Tin nhắn: Zalo Bot (chỉ khi shop nối Zalo). Thanh toán: ngân hàng nhận chuyển khoản, và SePay hoặc Casso nếu bật đối soát tự động.'
  ]],
  ['Giữ bao lâu', [
    'Dữ liệu shop giữ tới khi shop xóa hoặc yêu cầu xóa tài khoản. Nhật ký quản trị giữ 180 ngày, tin nhắn Quản gia 30 ngày.'
  ]],
  ['Quyền của bạn', [
    'Xem, sửa thông tin tài khoản trong trang Cài đặt; xuất dữ liệu phản hồi ra CSV; yêu cầu xóa tài khoản và toàn bộ dữ liệu.',
    'Khách hàng của shop muốn thực hiện quyền với dữ liệu của họ thì liên hệ shop (Bên Kiểm soát); đơn vị vận hành hỗ trợ shop xử lý.'
  ]]
];

const DOCS = {
  terms: { title: 'Điều khoản sử dụng', sections: TERMS },
  privacy: { title: 'Chính sách dữ liệu', sections: PRIVACY }
};

const Legal = ({ kind = 'terms' }) => {
  const doc = DOCS[kind] || DOCS.terms;
  useEffect(() => { document.title = `${doc.title} | Customer Radar`; }, [doc.title]);
  return (
    <div className="min-h-screen bg-canvas text-ink-mid">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
        <Link to="/" className="rounded-ctrl focus-visible:outline-2 focus-visible:outline-accent" aria-label="Customer Radar, trang chủ"><Logo size="md" showTagline={false} /></Link>
        <nav className="flex gap-5 text-sm">
          <Link to="/dieu-khoan" className={`rounded-ctrl focus-visible:outline-2 focus-visible:outline-accent ${kind === 'terms' ? 'text-ink-hi' : 'hover:text-ink-hi'}`}>Điều khoản</Link>
          <Link to="/chinh-sach-du-lieu" className={`rounded-ctrl focus-visible:outline-2 focus-visible:outline-accent ${kind === 'privacy' ? 'text-ink-hi' : 'hover:text-ink-hi'}`}>Chính sách dữ liệu</Link>
          <Link to="/bang-gia" className="rounded-ctrl hover:text-ink-hi focus-visible:outline-2 focus-visible:outline-accent">Bảng giá</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h1 className="text-display font-semibold text-ink-hi">{doc.title}</h1>
        <p className="mt-2 text-sm text-ink-lo">Phiên bản {VERSION.split('-').reverse().join('/')}. Áp dụng cho mọi tài khoản tạo từ ngày này.</p>
        {doc.sections.map(([h, paras]) => (
          <section key={h} className="mt-10">
            <h2 className="text-heading font-semibold text-ink-hi">{h}</h2>
            {paras.map((t) => <p key={t} className="mt-3 max-w-[68ch] text-base leading-relaxed">{t}</p>)}
          </section>
        ))}
        <section className="mt-10">
          <h2 className="text-heading font-semibold text-ink-hi">Liên hệ</h2>
          <p className="mt-3 max-w-[68ch] text-base leading-relaxed">Câu hỏi về điều khoản hay dữ liệu: {contactLine}.</p>
        </section>
      </main>
    </div>
  );
};

export default Legal;
