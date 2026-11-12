import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound, Palette, Database, ShieldCheck, Save, Mail, KeyRound, FlaskConical, FileText } from 'lucide-react';
import { useTheme, useGlass } from '../hooks/useTheme';
import { PageHeader, GlassPanel, PanelHeader, Button, TextField, Select, RadioCards, Toast } from './ui';
import { DEFAULT_USER, currentUser } from '../hooks/useDecisions';
import { PageEnter } from './motion';

/**
 * CÀI ĐẶT
 * ------------------------------------------------------------------
 * Chỉ giữ tuỳ chọn có tác dụng thật. Bản trước có công tắc thông báo
 * Email/Slack/SMS, chu kỳ đồng bộ và thời gian lưu trữ — bật lên không có
 * gì xảy ra, nên đã bỏ: một nút không làm gì còn tệ hơn không có nút.
 */

const KEY = 'crSettings';
const DEFAULTS = {
  name: DEFAULT_USER,
  email: 'admin@company.com',
  timezone: 'Asia/Ho_Chi_Minh'
};

const load = () => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}'), name: currentUser() };
  } catch {
    return DEFAULTS;
  }
};

const TABS = [
  { id: 'general', label: 'Hồ sơ', icon: UserRound },
  { id: 'appearance', label: 'Giao diện', icon: Palette },
  { id: 'data', label: 'Dữ liệu và mô hình', icon: Database },
  { id: 'security', label: 'Bảo mật', icon: ShieldCheck }
];

const Row = ({ icon: Icon, title, description, children }) => (
  <div className="flex items-center justify-between gap-4 border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
    <div className="flex min-w-0 items-center gap-3.5">
      {Icon && <Icon size={18} className="shrink-0 text-ink-lo" aria-hidden="true" />}
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-hi">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-lo">{description}</p>}
      </div>
    </div>
    {children}
  </div>
);

// Ô xem trước đọc token của đúng chủ đề đó: data-theme trên khối con làm
// tầng ngữ nghĩa của index.css tính lại, nên màu luôn khớp bảng màu đang dùng
const Swatches = ({ theme, colors = ['--canvas', '--surface', '--accent', '--text-hi'] }) => (
  <span data-theme={theme} className="mt-3 flex gap-1.5">
    {colors.map((c) => <span key={c} className="size-6 rounded-full border border-line" style={{ background: `var(${c})` }} />)}
  </span>
);

const PRIVACY = [
  'Tên người mua được che ngay khi thu thập, ví dụ “Quang D. H.”.',
  'Mã khách hàng của sàn được băm một chiều với khoá bí mật trước khi lưu.',
  'Số điện thoại, email trong nội dung được che trước khi văn bản tới mô hình.',
  'Theo Nghị định 13/2023/NĐ-CP, doanh nghiệp là Bên Kiểm soát dữ liệu, Customer Radar là Bên Xử lý dữ liệu.'
];

const Settings = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { glass, setGlass } = useGlass();
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState(load);
  const [saved, setSaved] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...form }));
    // Thanh bên đọc tên/email từ đây — báo cho nó cập nhật ngay
    window.dispatchEvent(new Event('cr-settings'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <PageEnter className="cx">
      <PageHeader
        title="Cài đặt"
        actions={tab === 'general' && <Button icon={Save} onClick={save}>Lưu thay đổi</Button>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col" aria-label="Mục cài đặt">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id || undefined}
              className={`flex shrink-0 items-center gap-3 rounded-ctrl px-3 py-2.5 text-left text-sm transition-colors ${
                tab === t.id ? 'bg-accent-dim font-semibold text-ink-hi' : 'text-ink-mid hover:bg-raised hover:text-ink-hi'
              }`}
            >
              <t.icon size={17} className={tab === t.id ? 'text-accent' : 'text-ink-lo'} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </nav>

        <GlassPanel tone="strong" className="p-6" key={tab}>
          {tab === 'general' && (
            <>
              <PanelHeader title="Hồ sơ" subtitle="Tên của bạn được ghi vào nhật ký quyết định." />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Họ và tên" value={form.name} onChange={set('name')} />
                <TextField label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} />
                <TextField label="Vai trò" value="Quản lý trải nghiệm khách hàng" disabled hint="Do quản trị viên tổ chức cấp" />
                <Select
                  label="Múi giờ"
                  value={form.timezone}
                  onChange={set('timezone')}
                  options={[{ value: 'Asia/Ho_Chi_Minh', label: '(GMT+07:00) Giờ Việt Nam' }, { value: 'UTC', label: 'UTC' }]}
                />
              </div>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <PanelHeader title="Giao diện" subtitle="Áp dụng ngay, lưu riêng trên máy này." />
              <RadioCards
                name="Chủ đề"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Sáng', description: 'Mặc định, dễ đọc trong văn phòng', preview: <Swatches theme="light" /> },
                  { value: 'dark', label: 'Tối', description: 'Dịu mắt khi làm việc buổi tối', preview: <Swatches theme="dark" /> }
                ]}
              />
              <PanelHeader title="Hiệu ứng kính" subtitle="Thanh bên, lớp nổi và panel mờ nhẹ trên nền không khí. Tắt thì mọi bề mặt về nền đặc, nhẹ hơn cho máy yếu." className="mt-8" />
              <RadioCards
                name="Hiệu ứng kính"
                value={glass ? 'on' : 'off'}
                onChange={(v) => setGlass(v === 'on')}
                options={[
                  { value: 'on', label: 'Bật', description: 'Kính mờ ở thanh bên và lớp nổi' },
                  { value: 'off', label: 'Tắt', description: 'Nền đặc, không lớp không khí' }
                ]}
              />
            </>
          )}

          {tab === 'data' && (
            <>
              <PanelHeader title="Quyền riêng tư" />
              <ul className="mb-8 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-ink-mid">
                {PRIVACY.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <PanelHeader title="Mô hình và báo cáo" />
              <div className="flex flex-col gap-3">
                <Row icon={FlaskConical} title="Phòng thí nghiệm mô hình" description="Thử bộ phân loại tiếng Việt với câu của bạn, so sánh mô hình với bộ luật.">
                  <Button size="sm" variant="secondary" onClick={() => navigate('/lab')}>Mở</Button>
                </Row>
                <Row icon={FileText} title="Báo cáo" description="Xuất báo cáo tổng hợp dạng PDF cho cấp quản lý.">
                  <Button size="sm" variant="secondary" onClick={() => navigate('/reports')}>Mở</Button>
                </Row>
              </div>
            </>
          )}

          {tab === 'security' && (
            <>
              <PanelHeader title="Bảo mật" />
              {/* Bản này dùng tài khoản dùng thử cố định, chưa có máy chủ xác thực */}
              <p className="mb-5 rounded-ctrl bg-raised px-4 py-3 text-sm text-ink-mid">
                Bản demo dùng tài khoản dùng thử cố định. Đổi mật khẩu và xác thực hai lớp sẽ mở khi có máy chủ xác thực.
              </p>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
                <input type="text" name="username" autoComplete="username" value={form.email} readOnly hidden />
                <TextField label="Mật khẩu hiện tại" type="password" icon={KeyRound} placeholder="••••••••" autoComplete="current-password" disabled />
                <TextField label="Mật khẩu mới" type="password" icon={KeyRound} placeholder="Tối thiểu 10 ký tự" autoComplete="new-password" disabled />
              </form>
            </>
          )}
        </GlassPanel>
      </div>

      <Toast show={saved}>Đã lưu cài đặt</Toast>
    </PageEnter>
  );
};

export default Settings;
