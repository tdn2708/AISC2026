import React, { useState } from 'react';
import {
  Plus, Mail, Lock, Eye, Search, Bell, CheckCircle2, BellRing, Clock3, LayoutDashboard, Siren, MessagesSquare,
  ScanSearch, ShieldCheck, FlaskConical, DatabaseZap, FileText, Settings, Trash2, Loader2, RotateCcw, Download, Filter
} from 'lucide-react';
import {
  PageHeader, GlassPanel, Button, IconButton, TextField, TextArea, Select, Switch, Checkbox, ChipGroup, Chip, Segmented, Tabs,
  Modal, Drawer, Badge, ProgressBar, Stepper, SentimentFace, SeverityBadge, EmptyState, Popover, MenuItem, ChartTooltip, Pager, Toast
} from './ui';
import { LogoMark } from './Logo';
import MotionDemo from './motion/MotionDemo';

/**
 * BỘ GIAO DIỆN: mọi thành phần của hệ thiết kế trên một trang, để duyệt thiết kế và kiểm tra
 * nhanh khi đổi token, không cần đi qua từng màn hình.
 *
 * F1-05: mỗi control có bảng tám trạng thái (mặc định, rê, nhấn, focus bàn phím, tắt, đang tải,
 * lỗi, đã chọn). Rê, nhấn, focus được ép bằng lớp kit-hover, kit-active, kit-focus trên ô bọc
 * (styles/tailwind.css, index.css), nên xem được không cần chuột. "—" là trạng thái không áp dụng.
 */

const Cell = ({ title, note, children, className = '' }) => (
  <GlassPanel className={`min-w-0 p-5 ${className}`}>
    <h2 className="text-heading font-semibold text-ink-hi">{title}</h2>
    {note && <p className="mt-0.5 mb-4 text-sm text-ink-mid">{note}</p>}
    {!note && <div className="mb-4" />}
    {children}
  </GlassPanel>
);

const STATES = [
  ['default', 'Mặc định'],
  ['hover', 'Rê'],
  ['active', 'Nhấn'],
  ['focus', 'Focus'],
  ['disabled', 'Tắt'],
  ['loading', 'Đang tải'],
  ['error', 'Lỗi'],
  ['selected', 'Đã chọn']
];
const FORCE = { hover: 'kit-hover', active: 'kit-active kit-hover', focus: 'kit-focus' };
const NA = <span className="text-xs text-ink-lo" title="Không áp dụng">—</span>;

/** Bảng trạng thái xoay ngang: mỗi hàng một trạng thái, mỗi cột một control (cho control rộng như ô nhập) */
const StateColumns = ({ rows, label }) => (
  <div className="-mx-5 overflow-x-auto px-5" role="region" aria-label={label} tabIndex={0}>
    <table className="w-full min-w-[720px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line-soft text-xs text-ink-mid">
          <th scope="col" className="w-24 py-2 pr-3 font-medium">Trạng thái</th>
          {rows.map(([name]) => <th key={name} scope="col" className="px-2 py-2 font-medium">{name}</th>)}
        </tr>
      </thead>
      <tbody>
        {STATES.map(([k, l]) => (
          <tr key={k} className="border-b border-line-soft last:border-0">
            <th scope="row" className="py-3 pr-3 text-xs font-medium text-ink-mid">{l}</th>
            {rows.map(([name, render]) => (
              <td key={name} className="px-2 py-3 align-middle">
                <div className={`${FORCE[k] || ''}`}>{render(k) ?? NA}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Bảng trạng thái: mỗi hàng một control, mỗi cột một trạng thái. Hẹp thì cuộn ngang trong khung. */
const StateMatrix = ({ rows, label }) => (
  <div className="-mx-5 overflow-x-auto px-5" role="region" aria-label={label} tabIndex={0}>
    <table className="w-full min-w-[760px] border-collapse text-left">
      <thead>
        <tr className="border-b border-line-soft text-xs text-ink-mid">
          <th scope="col" className="w-28 py-2 pr-3 font-medium">Control</th>
          {STATES.map(([k, l]) => <th key={k} scope="col" className="px-2 py-2 font-medium">{l}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, render]) => (
          <tr key={name} className="border-b border-line-soft last:border-0">
            <th scope="row" className="py-3 pr-3 text-xs font-medium text-ink-mid">{name}</th>
            {STATES.map(([k]) => {
              const node = render(k);
              return (
                <td key={k} className="px-2 py-3 align-middle">
                  <div className={`inline-flex ${FORCE[k] || ''}`}>{node ?? NA}</div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Mỗi hàm nhận tên trạng thái, trả control ở trạng thái đó (null = không áp dụng)
const btn = (variant, label, icon) => (s) => {
  if (s === 'error') {
    return variant === 'primary' ? (
      <span className="flex flex-col items-start gap-1">
        <Button size="sm" icon={RotateCcw}>Thử lại</Button>
        <span className="text-xs text-crit">Gửi chưa được</span>
      </span>
    ) : null;
  }
  return (
    <Button size="sm" variant={variant} icon={icon} disabled={s === 'disabled'} loading={s === 'loading'} pressed={s === 'selected' ? true : undefined}>
      {label}
    </Button>
  );
};
const iconBtn = (variant) => (s) =>
  s === 'error' ? null : (
    <IconButton icon={variant === 'danger' ? Trash2 : Bell} label="Ví dụ" variant={variant} size="sm" disabled={s === 'disabled'} loading={s === 'loading'} pressed={s === 'selected' ? true : undefined} />
  );

const BUTTON_ROWS = [
  ['Chính (primary)', btn('primary', 'Lưu')],
  ['Phụ (secondary)', btn('secondary', 'Xuất', Download)],
  ['Trơn (ghost)', btn('ghost', 'Bỏ qua')],
  ['Nguy hiểm (danger)', btn('danger', 'Xoá')],
  ['Chữ (link)', btn('link', 'Xem chi tiết')],
  ['Biểu tượng', iconBtn('glass')],
  ['Biểu tượng xoá', iconBtn('danger')]
];

const field = (kind) => (s) => {
  const common = { disabled: s === 'disabled', error: s === 'error' ? 'Chưa đúng định dạng' : undefined, className: 'w-full max-w-56' };
  const filled = s === 'selected';
  const spinner = s === 'loading' ? <Loader2 size={16} className="keep-motion mr-2 animate-spin text-ink-lo" aria-hidden="true" /> : null;
  if (kind === 'select') {
    return <Select {...common} size="sm" aria-label="Ví dụ chọn" defaultValue={filled ? '2' : '1'} options={[{ value: '1', label: 'Mọi nguồn' }, { value: '2', label: 'Shopee' }]} />;
  }
  if (kind === 'area') {
    return <TextArea {...common} aria-label="Ví dụ nhiều dòng" rows={2} value={filled ? 'Giao chậm 5 ngày' : ''} onChange={() => {}} placeholder="Ghi chú" />;
  }
  return (
    <TextField
      {...common}
      size={kind === 'sm' ? 'sm' : 'md'}
      aria-label="Ví dụ ô nhập"
      icon={Mail}
      placeholder="Email"
      value={filled ? 'shop@example.vn' : s === 'error' ? 'shop@example' : ''}
      onChange={() => {}}
      trailing={spinner}
    />
  );
};
const FIELD_ROWS = [
  ['Ô nhập md 40px', field('md')],
  ['Ô nhập sm 32px', field('sm')],
  ['Chọn (sm)', field('select')],
  ['Nhiều dòng', field('area')]
];

const SELECT_ROWS = [
  ['Chip', (s) => (s === 'loading' || s === 'error' ? null : <Chip active={s === 'selected'} disabled={s === 'disabled'} icon={Filter} count={128}>Tiêu cực</Chip>)],
  ['Phân đoạn', (s) => (s === 'loading' || s === 'error' ? null : <Segmented label="Ví dụ" value={s === 'selected' ? 'w' : null} onChange={() => {}} options={[{ value: 'w', label: 'Tuần', disabled: s === 'disabled' }]} />)],
  ['Tab', (s) => (s === 'loading' || s === 'error' || s === 'disabled' ? null : <Tabs value={s === 'selected' ? 'a' : null} onChange={() => {}} tabs={[{ value: 'a', label: 'Tổng quan', count: 12 }]} />)],
  ['Công tắc', (s) => (s === 'loading' || s === 'error' ? null : <Switch label="Ví dụ" checked={s === 'selected'} disabled={s === 'disabled'} onChange={() => {}} />)],
  ['Hộp kiểm', (s) => (s === 'loading' || s === 'error' ? null : <span className="w-36"><Checkbox label="Báo qua email" checked={s === 'selected'} disabled={s === 'disabled'} onChange={() => {}} /></span>)],
  ['Mục menu', (s) => (s === 'loading' || s === 'error' ? null : <span className="w-36"><MenuItem active={s === 'selected'} disabled={s === 'disabled'} icon={Settings}>Cài đặt</MenuItem></span>)]
];

// Bảng màu B, đọc thẳng token ngữ nghĩa (src/index.css) nên tự đổi theo chế độ sáng, tối
const PALETTE = [
  ['--accent', 'Xanh polo', 'Nhấn'],
  ['--text-hi', 'Navy', 'Chữ'],
  ['--canvas', 'Nền', 'Nền trang'],
  ['--coral', 'San hô', 'Điểm nhấn đồ họa'],
  ['--sev-crit', 'Đỏ', 'Xấu'],
  ['--sev-ok', 'Xanh lá', 'Tốt']
];

const TYPE_SCALE = [
  ['text-metric', '32px', 'Con số chính', 'text-metric font-semibold tabular-nums', '14.279'],
  ['text-display', '26px', 'Tiêu đề trang', 'text-display font-semibold', 'Tin cậy dữ liệu'],
  ['text-heading', '18px', 'Tiêu đề khối', 'text-heading font-semibold', 'Việc hôm nay'],
  ['text-base', '16px', 'Đoạn đọc chính', 'text-base', 'Khách chê giao hàng chậm'],
  ['text-sm', '14px', 'Chữ thân, bảng', 'text-sm', 'Ăn Ằ Ẳ Ẵ Ặ ữ, 2,45%'],
  ['text-xs', '13px', 'Chú thích, nhãn', 'text-xs', 'Cập nhật 5 phút trước']
];

const UiKit = () => {
  const [sw1, setSw1] = useState(true);
  const [cb1, setCb1] = useState(true);
  const [chip, setChip] = useState('all');
  const [seg, setSeg] = useState('week');
  const [tab, setTab] = useState('all');
  const [text, setText] = useState('');
  const [modal, setModal] = useState(null);
  const [page, setPage] = useState(3);
  const [toast, setToast] = useState(false);

  return (
    <div className="cx">
      <PageHeader
        title="Bộ giao diện"
        subtitle="Thành phần giao diện của Customer Radar: nền đặc, viền 1px, chữ Be Vietnam Pro, bo 6px cho điều khiển và 10px cho bề mặt."
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <Cell title="Thương hiệu và màu" className="lg:col-span-7">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <LogoMark size={56} />
              <div>
                <p className="text-display leading-none font-semibold text-ink-hi">Customer Radar</p>
                <p className="mt-1 text-xs text-ink-lo">Radar khách hàng</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {PALETTE.map(([token, name, role]) => (
                <div key={token} className="text-center">
                  <span className="mx-auto block size-12 rounded-ctrl border border-line" style={{ background: `var(${token})` }} />
                  <p className="mt-1.5 text-xs font-medium text-ink-hi">{name}</p>
                  <p className="text-xs text-ink-lo">{token}</p>
                  <p className="text-xs text-ink-lo">{role}</p>
                </div>
              ))}
            </div>
          </div>
        </Cell>

        <Cell title="Thang chữ" note="Be Vietnam Pro, sáu bậc, không bậc nào dưới 13px. Số dùng chữ số đều cột." className="lg:col-span-5">
          <dl className="flex flex-col divide-y divide-line-soft">
            {TYPE_SCALE.map(([cls, px, role, sample, text]) => (
              <div key={cls} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <dt className="min-w-0 truncate text-ink-hi"><span className={sample}>{text}</span></dt>
                <dd className="shrink-0 text-right text-xs text-ink-lo">{cls}, {px}<br />{role}</dd>
              </div>
            ))}
          </dl>
        </Cell>

        <Cell
          title="Nút: tám trạng thái"
          note="Năm biến thể Button (cỡ sm 32px, md 40px) và IconButton. Rê đổi màu sang accent-hi, nhấn lún 1px, focus là viền ngoài 2px. Lỗi hiện bằng chữ cạnh nút, nút đổi thành Thử lại."
          className="lg:col-span-12"
        >
          <StateMatrix rows={BUTTON_ROWS} label="Bảng trạng thái nút" />
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            <span className="mr-2 text-xs text-ink-mid">Cỡ md, dùng thật:</span>
            <Button>Bắt đầu</Button>
            <Button variant="secondary" icon={Download}>Xuất dữ liệu</Button>
            <Button variant="ghost">Để sau</Button>
            <Button variant="danger" icon={Trash2}>Xoá</Button>
            <Button variant="link">Mở trang kiểm tra</Button>
            <IconButton icon={Plus} label="Thêm" />
          </div>
        </Cell>

        <Cell
          title="Ô nhập: tám trạng thái"
          note="Một họ, hai cỡ. Viền --border-field đủ 3:1; rê đậm một bước; focus là viền ngoài 2px lõm vào trong, viền không đổi bề dày. Đã chọn ở đây là ô đã điền."
          className="lg:col-span-12"
        >
          <StateColumns rows={FIELD_ROWS} label="Bảng trạng thái ô nhập" />
        </Cell>

        <Cell
          title="Chọn và lọc: tám trạng thái"
          note="Chip, phân đoạn, tab, công tắc, hộp kiểm, mục menu dùng chung một ngôn ngữ đang chọn: nền accent-dim, viền nhấn, chữ accent-hi."
          className="lg:col-span-12"
        >
          <StateMatrix rows={SELECT_ROWS} label="Bảng trạng thái chọn và lọc" />
        </Cell>

        <Cell title="Ô nhập dùng thật" className="lg:col-span-7">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Mặc định" icon={Mail} placeholder="Địa chỉ email" />
            <form onSubmit={(e) => e.preventDefault()}>
              <TextField label="Đã điền" icon={Lock} type="password" autoComplete="off" defaultValue="matkhau123" trailing={<IconButton icon={Eye} label="Hiện" variant="ghost" size="sm" />} />
            </form>
            <TextField label="Lỗi" icon={Mail} defaultValue="anna@example" error="Email chưa đúng định dạng" />
            <Select label="Chọn" options={[{ value: '1', label: 'Shopee' }, { value: '2', label: 'TikTok Shop' }]} />
            <TextArea className="md:col-span-2" label="Ghi chú" value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Bạn thấy hôm nay thế nào?" />
          </div>
        </Cell>

        <Cell title="Công tắc và hộp kiểm" className="lg:col-span-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-ink-hi">Tự đồng bộ hằng đêm</span><Switch checked={sw1} onChange={setSw1} label="Tự đồng bộ" /></div>
            <div className="h-px bg-line-soft" />
            <Checkbox checked={cb1} onChange={setCb1} label="Nhận bản tóm tắt hằng ngày" description="Gửi lúc 8:00 sáng" />
          </div>
        </Cell>

        <Cell title="Chip, phân đoạn, tab, phân trang" className="lg:col-span-7">
          <ChipGroup
            label="Lọc theo cảm xúc"
            value={chip}
            onChange={setChip}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'pos', label: 'Tích cực', count: 3444 },
              { value: 'neu', label: 'Trung tính', count: 620 },
              { value: 'neg', label: 'Tiêu cực', count: 1806 }
            ]}
          />
          <div className="mt-4">
            <Segmented label="Khoảng thời gian" value={seg} onChange={setSeg} options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
          </div>
          <Tabs className="mt-5" value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Tất cả', count: 24 }, { value: 'mine', label: 'Của tôi' }, { value: 'saved', label: 'Đã lưu' }]} />
          <Pager className="-mx-5 mt-4 -mb-5" page={page} pages={12} total={230} pageSize={20} onChange={setPage} />
        </Cell>

        <Cell title="Lớp nổi" note="Popover cho menu và bộ lọc thả xuống, ChartTooltip cho biểu đồ. Một bề mặt, một bóng." className="lg:col-span-5">
          <div className="flex flex-wrap items-start gap-4">
            <Popover className="w-56 animate-none">
              <MenuItem icon={Settings}>Cài đặt</MenuItem>
              <MenuItem active>Shopee</MenuItem>
              <MenuItem hint="JSONL, không có tên tài khoản">Bình luận đã chuẩn hóa</MenuItem>
            </Popover>
            <ChartTooltip title="Kỳ 12/11">
              <p><span className="font-semibold text-ink-hi">1.204</span> tích cực</p>
              <p><span className="font-semibold text-ink-hi">318</span> tiêu cực</p>
            </ChartTooltip>
          </div>
        </Cell>

        <Cell title="Hộp thoại" note="Modal cho câu hỏi ngắn và xác nhận, Drawer cho xem chi tiết. Lỗi hiện bằng Toast đỏ." className="lg:col-span-7">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal('ok')}>Hoàn tất</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal('remind')}>Nhắc nhở</Button>
            <Button size="sm" variant="danger" onClick={() => setModal('confirm')}>Xác nhận xoá</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal('drawer')}>Ngăn kéo</Button>
            <Button size="sm" variant="secondary" onClick={() => { setToast(true); setTimeout(() => setToast(false), 4000); }}>Toast lỗi</Button>
          </div>
        </Cell>

        <Cell title="Huy hiệu và mức độ" className="lg:col-span-5">
          <div className="flex flex-wrap gap-2">
            <Badge>Mới</Badge><Badge tone="accent">Đề xuất</Badge><Badge tone="blush">Phổ biến</Badge><Badge tone="sky">Mẫu</Badge>
            <Badge tone="ok" icon={CheckCircle2}>Ổn định</Badge><Badge tone="crit">Khẩn</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SeverityBadge level="Critical" /><SeverityBadge level="High" /><SeverityBadge level="Medium" /><SeverityBadge level="Low" />
          </div>
          <div className="mt-4 flex gap-6">
            {[['Positive', 'Tích cực'], ['Neutral', 'Trung tính'], ['Negative', 'Tiêu cực']].map(([k, l]) => (
              <span key={k} className="inline-flex items-center gap-2 text-xs text-ink-mid"><SentimentFace sentiment={k} size={28} />{l}</span>
            ))}
          </div>
        </Cell>

        <Cell title="Các bước và tiến trình" className="lg:col-span-7">
          <Stepper steps={[{ label: 'Chọn nền tảng', value: '01' }, { label: 'Cấp quyền', value: '02' }, { label: 'Đồng bộ', value: '03' }]} />
          <div className="mt-6 flex flex-col gap-4">
            <ProgressBar label="Vượt qua Trust Layer" value={0.82} showValue />
            <ProgressBar label="Đang đồng bộ" value={0.3} showValue height={4} />
          </div>
        </Cell>

        <Cell title="Biểu tượng" note="lucide-react, cỡ 14 trong nút nhỏ, 16 mặc định, 20 trong ô trạng thái rỗng." className="lg:col-span-5">
          <div className="grid grid-cols-5 gap-3">
            {[LayoutDashboard, Siren, MessagesSquare, ScanSearch, ShieldCheck, FlaskConical, DatabaseZap, FileText, Settings, Search].map((I, i) => (
              <span key={i} className="grid aspect-square place-items-center rounded-ctrl bg-raised text-ink-mid"><I size={20} strokeWidth={1.6} aria-hidden="true" /></span>
            ))}
          </div>
        </Cell>

        <Cell title="Trạng thái rỗng" className="lg:col-span-12">
          <div className="grid gap-4 md:grid-cols-3">
            <EmptyState compact variant="calm" title="Mọi thứ ổn định" description="Không có cảnh báo nào." />
            <EmptyState compact variant="empty" title="Chưa có dữ liệu" description="Kết nối nguồn để bắt đầu." />
            <EmptyState compact variant="error" title="Không tải được" description="Kiểm tra kết nối máy chủ." />
          </div>
        </Cell>
      </div>

      {/* Bộ chuyển động dùng chung (F2), xem components/motion */}
      <MotionDemo />

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
      <Modal
        open={modal === 'confirm'}
        onClose={() => setModal(null)}
        icon={Trash2}
        tone="crit"
        size="sm"
        title="Xoá mục này?"
        description="Thao tác không hoàn tác được."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Hủy</Button>
            <Button variant="danger" icon={Trash2} onClick={() => setModal(null)}>Xoá</Button>
          </>
        }
      />
      <Drawer open={modal === 'drawer'} onClose={() => setModal(null)} title="Chi tiết phản hồi" subtitle="Ngăn kéo bên phải, xem mà không rời danh sách" footer={<Button onClick={() => setModal(null)}>Đóng</Button>}>
        <p className="text-sm leading-relaxed text-ink-mid">Nội dung chi tiết nằm ở đây. Bên trong ngăn kéo dùng hàng kẻ phân cách, không dùng khung viền lồng nhau.</p>
      </Drawer>
      <Toast show={toast} tone="crit">Lỗi khi tạo PDF: mạng bị ngắt</Toast>
    </div>
  );
};

export default UiKit;
