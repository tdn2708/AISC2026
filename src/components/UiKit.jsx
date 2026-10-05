import React, { useState } from 'react';
import {
  Plus, Mail, Lock, Eye, Search, Bell, CheckCircle2, BellRing, Clock3, LayoutDashboard, Siren, MessagesSquare,
  ScanSearch, ShieldCheck, FlaskConical, DatabaseZap, FileText, Settings
} from 'lucide-react';
import {
  PageHeader, GlassPanel, Button, IconButton, TextField, TextArea, Select, Switch, Checkbox, ChipGroup, Segmented, Tabs,
  Modal, Badge, ProgressBar, Stepper, SentimentFace, SeverityBadge, EmptyState
} from './ui';
import { LogoMark } from './Logo';

/**
 * BỘ GIAO DIỆN — mọi thành phần của hệ thiết kế trên một trang, sắp theo
 * đúng các ô của UI-kit tham chiếu. Dùng để duyệt thiết kế và kiểm tra
 * nhanh khi đổi token, không cần đi qua từng màn hình.
 */

const Cell = ({ title, children, className = '' }) => (
  <GlassPanel className={`p-5 ${className}`}>
    <p className="eyebrow mb-4">{title}</p>
    {children}
  </GlassPanel>
);

// Dấu màu thay cho biểu tượng mặt cười — cùng màu với biểu đồ cảm xúc
const PosMark = () => <SentimentFace sentiment="Positive" size={24} />;
const NeuMark = () => <SentimentFace sentiment="Neutral" size={24} />;
const NegMark = () => <SentimentFace sentiment="Negative" size={24} />;

const PALETTE = [
  ['#5E8B7E', 'Sage', 'Nhấn'],
  ['#A7C7E7', 'Sky', 'Tích cực'],
  ['#2F3E46', 'Slate', 'Chữ'],
  ['#F1F5F4', 'Mist', 'Nền'],
  ['#E8AEB7', 'Blush', 'Tiêu cực']
];

const UiKit = () => {
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [cb1, setCb1] = useState(true);
  const [cb2, setCb2] = useState(false);
  const [chip, setChip] = useState('all');
  const [seg, setSeg] = useState('week');
  const [tab, setTab] = useState('all');
  const [text, setText] = useState('');
  const [modal, setModal] = useState(null);

  return (
    <div className="cx">
      <PageHeader
        section="Hệ thiết kế"
        title="UI kit"
        subtitle="Bộ thành phần của Customer Radar — bề mặt gần đặc, viền mảnh, font Geist và Geist Mono. Mọi cặp màu chữ/nền đã đo đạt WCAG AA."
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <Cell title="Thương hiệu & màu" className="lg:col-span-7">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <LogoMark size={56} />
              <div>
                <p className="text-2xl leading-none font-semibold text-ink-hi">Customer <span className="font-semibold text-accent">Radar</span></p>
                <p className="mt-1 text-xs text-ink-lo">Radar khách hàng</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {PALETTE.map(([hex, name, role]) => (
                <div key={hex} className="text-center">
                  <span className="mx-auto block size-12 rounded-full border border-white/70 shadow-sm" style={{ background: hex }} />
                  <p className="mt-1.5 text-xs font-medium text-ink-hi">{name}</p>
                  <p className="font-mono text-[0.62rem] text-ink-lo">{hex}</p>
                  <p className="text-[0.62rem] text-ink-lo">{role}</p>
                </div>
              ))}
            </div>
          </div>
        </Cell>

        <Cell title="Chữ" className="lg:col-span-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-semibold text-ink-hi">Geist</p>
              <p className="text-xs text-ink-lo">Tiêu đề · giao diện</p>
              <p className="mt-2 text-sm text-ink-mid">Ăn Ằ Ẳ Ẵ Ặ ữ</p>
            </div>
            <div>
              <p className="text-2xl text-ink-hi">Geist 400</p>
              <p className="text-xs text-ink-lo">Nội dung</p>
              <p className="mt-2 text-sm text-ink-mid">vận hành · dữ liệu</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-ink-hi">Mono</p>
              <p className="text-xs text-ink-lo">Số liệu đơn cách</p>
              <p className="mt-2 font-mono text-sm text-ink-mid">1.234 · 12,5%</p>
            </div>
          </div>
        </Cell>

        <Cell title="Nút" className="lg:col-span-7">
          <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] items-center gap-x-4 gap-y-3 text-xs text-ink-lo">
            <span />
            <span>Mặc định</span><span>Đang tải</span><span>Vô hiệu</span>
            <span>Chính</span>
            <Button size="sm">Bắt đầu</Button><Button size="sm" loading>Bắt đầu</Button><Button size="sm" disabled>Bắt đầu</Button>
            <span>Phụ</span>
            <Button size="sm" variant="secondary">Tiếp tục</Button><Button size="sm" variant="soft">Tiếp tục</Button><Button size="sm" variant="secondary" disabled>Tiếp tục</Button>
            <span>Chữ</span>
            <Button size="sm" variant="ghost">Chi tiết</Button><Button size="sm" variant="outline">Chi tiết</Button><Button size="sm" variant="danger">Xoá</Button>
            <span>Biểu tượng</span>
            <div><IconButton icon={Plus} label="Thêm" variant="primary" /></div>
            <div><IconButton icon={Bell} label="Thông báo" /></div>
            <div><IconButton icon={Plus} label="Thêm" disabled /></div>
          </div>
        </Cell>

        <Cell title="Công tắc & hộp kiểm" className="lg:col-span-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between"><span className="text-sm text-ink-hi">Tự đồng bộ hằng đêm</span><Switch checked={sw1} onChange={setSw1} label="Tự đồng bộ" /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-ink-hi">Gửi cảnh báo qua Slack</span><Switch checked={sw2} onChange={setSw2} label="Slack" /></div>
            <div className="h-px bg-line-soft" />
            <Checkbox checked={cb1} onChange={setCb1} label="Nhận bản tóm tắt hằng ngày" description="Gửi lúc 8:00 sáng" />
            <Checkbox checked={cb2} onChange={setCb2} label="Chỉ báo mức Nghiêm trọng" />
          </div>
        </Cell>

        <Cell title="Ô nhập" className="lg:col-span-7">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Mặc định" icon={Mail} placeholder="Địa chỉ email" />
            <form onSubmit={(e) => e.preventDefault()}>
              <TextField label="Đã điền" icon={Lock} type="password" autoComplete="off" defaultValue="matkhau123" trailing={<IconButton icon={Eye} label="Hiện" variant="ghost" size={32} />} />
            </form>
            <TextField label="Lỗi" icon={Mail} defaultValue="anna@example" error="Email chưa đúng định dạng" />
            <Select label="Chọn" options={[{ value: '1', label: 'Shopee' }, { value: '2', label: 'TikTok Shop' }]} />
            <TextArea className="md:col-span-2" label="Ghi chú" value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Bạn thấy hôm nay thế nào?" />
          </div>
        </Cell>

        <Cell title="Thang cảm xúc" className="lg:col-span-5">
          <p className="mb-4 text-sm text-ink-mid">Khách hàng cảm thấy thế nào?</p>
          <div className="flex justify-between">
            {[['Positive', 'Tích cực'], ['Neutral', 'Trung tính'], ['Negative', 'Tiêu cực']].map(([k, l]) => (
              <div key={k} className="flex flex-col items-center gap-2">
                <SentimentFace sentiment={k} size={52} />
                <span className="text-xs text-ink-mid">{l}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <SeverityBadge level="Critical" /><SeverityBadge level="High" /><SeverityBadge level="Medium" /><SeverityBadge level="Low" />
          </div>
        </Cell>

        <Cell title="Chip & điều khiển phân đoạn" className="lg:col-span-7">
          <ChipGroup
            value={chip}
            onChange={setChip}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'pos', label: 'Tích cực', icon: PosMark, count: 3444 },
              { value: 'neu', label: 'Trung tính', icon: NeuMark, count: 620 },
              { value: 'neg', label: 'Tiêu cực', icon: NegMark, count: 1806 }
            ]}
          />
          <div className="mt-4">
            <Segmented value={seg} onChange={setSeg} options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
          </div>
        </Cell>

        <Cell title="Huy hiệu" className="lg:col-span-5">
          <div className="flex flex-wrap gap-2">
            <Badge>Mới</Badge><Badge tone="accent">Đề xuất</Badge><Badge tone="blush">Phổ biến</Badge><Badge tone="sky">Mẫu</Badge>
            <Badge tone="ok" icon={CheckCircle2}>Ổn định</Badge><Badge tone="crit">Khẩn</Badge><Badge tone="accent" mono>12</Badge>
          </div>
        </Cell>

        <Cell title="Điều hướng" className="lg:col-span-7">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Tất cả', count: 24 }, { value: 'mine', label: 'Của tôi' }, { value: 'saved', label: 'Đã lưu' }]} />
          <div className="mt-6">
            <Stepper steps={[{ label: 'Chọn nền tảng', value: '01', tone: 'accent', marker: '✓' }, { label: 'Cấp quyền', value: '02', tone: 'accent' }, { label: 'Đồng bộ', value: '03' }]} />
          </div>
        </Cell>

        <Cell title="Tiến trình" className="lg:col-span-5">
          <div className="flex flex-col gap-4">
            <ProgressBar label="Vượt qua Trust Layer" value={0.82} showValue />
            <ProgressBar label="Độ tin cậy đề xuất" value={0.64} showValue tone="pos" />
            <ProgressBar label="Đang đồng bộ" value={0.3} showValue height={4} />
          </div>
        </Cell>

        <Cell title="Biểu tượng" className="lg:col-span-7">
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
            {[LayoutDashboard, Siren, MessagesSquare, ScanSearch, ShieldCheck, FlaskConical, DatabaseZap, FileText, Settings, Search].map((I, i) => (
              <span key={i} className="grid aspect-square place-items-center rounded-lg bg-surface/60 text-ink-mid"><I size={20} strokeWidth={1.6} /></span>
            ))}
          </div>
        </Cell>

        <Cell title="Hộp thoại" className="lg:col-span-5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal('ok')}>Hoàn tất</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal('remind')}>Nhắc nhở</Button>
          </div>
        </Cell>

        <Cell title="Minh hoạ" className="lg:col-span-12">
          <div className="grid gap-4 md:grid-cols-3">
            <EmptyState compact variant="calm" title="Mọi thứ ổn định" description="Không có cảnh báo nào." />
            <EmptyState compact variant="empty" title="Chưa có dữ liệu" description="Kết nối nguồn để bắt đầu." />
            <EmptyState compact variant="error" title="Không tải được" description="Kiểm tra kết nối máy chủ." />
          </div>
        </Cell>
      </div>

      <Modal
        open={modal === 'ok'}
        onClose={() => setModal(null)}
        icon={CheckCircle2}
        tone="ok"
        size="sm"
        title="Làm tốt lắm!"
        description="Bạn đã xử lý xong mọi cảnh báo trong hôm nay."
        footer={<Button block onClick={() => setModal(null)}>Tiếp tục</Button>}
      />
      <Modal
        open={modal === 'remind'}
        onClose={() => setModal(null)}
        icon={BellRing}
        size="sm"
        title="Nhắc nhở"
        description="Còn 3 khuyến nghị chờ bạn quyết định trước 17:00."
        footer={
          <>
            <Button variant="ghost" icon={Clock3} onClick={() => setModal(null)}>Để sau</Button>
            <Button onClick={() => setModal(null)}>Xem ngay</Button>
          </>
        }
      />
    </div>
  );
};

export default UiKit;
