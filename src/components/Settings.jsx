import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { UserRound, Palette, Database, Save, Mail, FlaskConical, FileText, Store, Gem, Check, Minus } from 'lucide-react';
import { currentAccount, updateAccount, authError } from '../lib/auth';
import { useTheme, useGlass } from '../hooks/useTheme';
import { PageHeader, GlassPanel, PanelHeader, Button, TextField, Select, RadioCards, Toast } from './ui';
import { PasswordChangeForm } from './auth/ForcePasswordChange';
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
  email: 'demo@customerradar.vn',
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
  { id: 'plan', label: 'Gói dùng', icon: Gem },
  { id: 'appearance', label: 'Giao diện', icon: Palette },
  { id: 'data', label: 'Dữ liệu và mô hình', icon: Database }
  // Tab "Bảo mật" đã bỏ: chưa có máy chủ xác thực, hai ô mật khẩu bị khóa không làm gì
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

const FEATURE_WORDS = {
  orders_import: 'Nạp đơn hàng từ sàn',
  butler_commands: 'Lệnh Quản gia từ xa',
  live: 'Đọc bình luận livestream'
};
const ORDER_STATUS = { pending: 'Chờ chuyển khoản', paid: 'Đã nhận tiền', cancelled: 'Đã hủy' };
const day = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');

/** Gói đang dùng, hạn, hạn mức tháng và các đơn gần đây (backend/routes/billing.js) */
const PlanPanel = ({ account }) => {
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    axios.get('/billing').then(({ data }) => alive && setBill(data)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);
  if (failed) return <p className="text-sm text-ink-mid">Chưa tải được thông tin gói. Thử mở lại trang sau ít phút.</p>;
  if (!bill) return <p className="text-sm text-ink-lo">Đang tải thông tin gói</p>;
  return (
    <>
      <PanelHeader
        title={`Gói ${bill.planName}`}
        subtitle={account?.isDemo ? 'Tài khoản mẫu dùng chung đã mở mọi tính năng.' : bill.planUntil ? `Dùng tới ${day(bill.planUntil)}, hết hạn thì tự về gói Dùng thử, dữ liệu vẫn giữ.` : 'Miễn phí, không hết hạn.'}
      />
      {bill.room && bill.room.limit != null && (
        <p className="mb-4 text-sm text-ink-mid">
          Tháng này đã nạp <span className="font-semibold tabular-nums text-ink-hi">{bill.room.used.toLocaleString('vi-VN')}</span> trên {bill.room.limit.toLocaleString('vi-VN')} phản hồi.
        </p>
      )}
      <ul className="mb-6 flex flex-col gap-2 text-sm">
        {Object.entries(bill.features || {}).map(([k, on]) => (
          <li key={k} className={`flex items-center gap-2 ${on ? 'text-ink-hi' : 'text-ink-lo'}`}>
            {on ? <Check size={16} className="text-ok" aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
            {FEATURE_WORDS[k] || k}<span className="sr-only">{on ? ', đã mở' : ', chưa mở'}</span>
          </li>
        ))}
      </ul>
      {!account?.isDemo && <Button onClick={() => navigate('/bang-gia#chon-goi')}>{bill.plan === 'try' ? 'Nâng cấp gói' : 'Gia hạn hoặc đổi gói'}</Button>}
      {bill.orders?.length > 0 && (
        <div className="mt-8 border-t border-line-soft pt-6">
          <PanelHeader title="Đơn gần đây" />
          <ul className="flex flex-col gap-2 text-sm">
            {bill.orders.map((o) => (
              <li key={o.code} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-ink-hi">{o.planName}, {o.months} tháng <span className="font-code text-ink-mid">{o.code}</span></span>
                <span className="tabular-nums text-ink-mid">{o.amount.toLocaleString('vi-VN')} đ, {ORDER_STATUS[o.status] || o.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { glass, setGlass } = useGlass();
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState(load);
  const [toastMsg, setToastMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Tài khoản đang đăng nhập: tên và cửa hàng lưu ở máy chủ, email là tên đăng nhập (không đổi ở đây)
  const account = currentAccount();
  const [acct, setAcct] = useState(() => ({ name: account?.name || '', shop: account?.shop || '' }));

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? '' : cur)), 2400);
  };

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    setSaveError('');
    if (account && !account.isDemo) {
      setSaving(true);
      try {
        await updateAccount({ name: acct.name, shop: acct.shop });
      } catch (e) {
        setSaveError(authError(e).message);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...form }));
    // Thanh bên đọc tên từ đây và từ tài khoản: báo cho nó cập nhật ngay
    window.dispatchEvent(new Event('cr-settings'));
    showToast('Đã lưu cài đặt');
  };

  return (
    <PageEnter className="cx">
      <PageHeader
        title="Cài đặt"
        actions={tab === 'general' && <Button icon={Save} onClick={save} loading={saving}>Lưu thay đổi</Button>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 scroll-hint-x overflow-x-auto lg:sticky lg:top-[var(--topbar-h,5rem)] lg:flex-col" aria-label="Mục cài đặt">
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
                {account ? (
                  <>
                    <TextField
                      label="Họ và tên"
                      value={account.isDemo ? account.name : acct.name}
                      onChange={(e) => setAcct((a) => ({ ...a, name: e.target.value }))}
                      disabled={account.isDemo}
                      maxLength={80}
                      hint={account.isDemo ? 'Tài khoản mẫu dùng chung nên không đổi được. Tạo tài khoản riêng để đặt tên.' : undefined}
                      error={saveError || undefined}
                    />
                    <TextField label="Email đăng nhập" type="email" icon={Mail} value={account.email} disabled hint="Email dùng để đăng nhập, chưa đổi được ở đây" />
                    <TextField
                      label="Tên cửa hàng"
                      icon={Store}
                      value={account.isDemo ? account.shop : acct.shop}
                      onChange={(e) => setAcct((a) => ({ ...a, shop: e.target.value }))}
                      disabled={account.isDemo}
                      maxLength={120}
                    />
                  </>
                ) : (
                  <>
                    <TextField label="Họ và tên" value={form.name} onChange={set('name')} />
                    <TextField label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} />
                  </>
                )}
                <Select
                  label="Múi giờ"
                  value={form.timezone}
                  onChange={set('timezone')}
                  options={[{ value: 'Asia/Ho_Chi_Minh', label: '(GMT+07:00) Giờ Việt Nam' }, { value: 'UTC', label: 'UTC' }]}
                />
              </div>

              <div className="mt-8 border-t border-line-soft pt-6">
                <PanelHeader
                  title="Đổi mật khẩu"
                  subtitle="Sau khi đổi, các phiên ở thiết bị khác sẽ tự đăng xuất."
                />
                {!account || account.isDemo ? (
                  <p className="text-sm text-ink-mid">
                    Tài khoản mẫu dùng chung nên không đổi mật khẩu được. Tạo tài khoản riêng để đặt mật khẩu.
                  </p>
                ) : (
                  <div className="max-w-md">
                    <PasswordChangeForm onSuccess={() => showToast('Đã đổi mật khẩu')} />
                  </div>
                )}
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
              <PanelHeader title="Hiệu ứng kính" subtitle="Tắt để nhẹ hơn cho máy yếu." className="mt-8" />
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

          {tab === 'plan' && <PlanPanel account={account} />}

          {tab === 'data' && (
            <>
              <PanelHeader title="Quyền riêng tư" />
              <ul className="mb-8 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-ink-mid">
                {PRIVACY.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <p className="-mt-5 mb-8 text-sm text-ink-mid">
                Đầy đủ ở <a href="/dieu-khoan" target="_blank" rel="noopener" className="rounded-ctrl text-accent-hi underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Điều khoản sử dụng</a> và{' '}
                <a href="/chinh-sach-du-lieu" target="_blank" rel="noopener" className="rounded-ctrl text-accent-hi underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Chính sách dữ liệu</a>.
              </p>
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

        </GlassPanel>
      </div>

      <Toast show={Boolean(toastMsg)}>{toastMsg}</Toast>
    </PageEnter>
  );
};

export default Settings;
