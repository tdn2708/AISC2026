import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Link2, RefreshCw, Store, ShoppingBag, Music2, Globe, Plus, Trash2, Boxes, Activity, Clock, CircleCheck, CircleX, CircleDashed, Unplug, History
} from 'lucide-react';
import { PageHeader, GlassPanel, PanelHeader, Tabs, Button, TextField, Select, Switch, Modal, Badge, EmptyState, Stat } from './ui';
import { fmtInt } from '../lib/format';

/**
 * NGUỒN DỮ LIỆU
 * ------------------------------------------------------------------
 * Mô hình dữ liệu chính là first-party: doanh nghiệp kết nối gian hàng
 * của CHÍNH HỌ, nhờ đó có mã đơn hàng để tính tỉ lệ khiếu nại thật.
 * Đồng bộ theo liên kết chỉ dành cho đối sánh nhanh từng sản phẩm.
 */

const PLATFORM = {
  Shopee: { icon: ShoppingBag, tile: 'bg-[#F6D9C9] text-[#9A4316]', label: 'Shopee' },
  TikTok: { icon: Music2, tile: 'bg-blush/55 text-[#8E2F45]', label: 'TikTok Shop' },
  Web: { icon: Globe, tile: 'bg-sky/55 text-[#2F5E92]', label: 'Website' }
};

const loadLocal = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const DEMO_SHOPS = [
  // Gian hàng mẫu để minh hoạ giao diện — productsCount để null vì không có
  // nguồn số nào đứng sau, số sản phẩm thật lấy từ API
  { id: 'shp1', name: 'Gian hàng mẫu Shopee', platform: 'Shopee', shopId: 'SHP-982341', productsCount: null, autoSync: true, status: 'Active', isDemo: true },
  { id: 'tik1', name: 'Gian hàng mẫu TikTok Shop', platform: 'TikTok', shopId: 'TIK-44122', productsCount: null, autoSync: false, status: 'Active', isDemo: true }
];

const STATUS = {
  Success: { tone: 'ok', icon: CircleCheck, label: 'Thành công' },
  Failed: { tone: 'crit', icon: CircleX, label: 'Thất bại' },
  Empty: { tone: 'med', icon: CircleDashed, label: 'Không có dữ liệu' },
  'Syncing...': { tone: 'accent', icon: RefreshCw, label: 'Đang đồng bộ' }
};

const DataSources = () => {
  const [tab, setTab] = useState('shops');
  const [url, setUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [history, setHistory] = useState(() => loadLocal('syncHistory', []));
  const [shops, setShops] = useState(() => loadLocal('connectedShops', DEMO_SHOPS));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ platform: 'Shopee', name: '', shopId: '' });
  const [confirm, setConfirm] = useState(null); // { type: 'shop' | 'history', id? }
  const [trackedProducts, setTrackedProducts] = useState(null);

  useEffect(() => localStorage.setItem('syncHistory', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('connectedShops', JSON.stringify(shops)), [shops]);

  // Số sản phẩm THẬT, đếm từ dữ liệu đã thu thập
  useEffect(() => {
    axios.get('/products').then((r) => setTrackedProducts(Array.isArray(r.data) ? r.data.length : 0)).catch(() => setTrackedProducts(null));
  }, []);

  const addShop = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.shopId.trim()) return;
    setShops((prev) => [
      { id: Date.now().toString(), name: form.name.trim(), platform: form.platform, shopId: form.shopId.trim(), productsCount: 0, autoSync: true, status: 'Active' },
      ...prev
    ]);
    setShowAdd(false);
    setForm({ platform: 'Shopee', name: '', shopId: '' });
  };

  const runConfirm = () => {
    if (confirm?.type === 'shop') setShops((prev) => prev.filter((s) => s.id !== confirm.id));
    if (confirm?.type === 'history') setHistory([]);
    setConfirm(null);
  };

  const sync = async (e) => {
    e.preventDefault();
    if (!url) return;
    setIsSyncing(true);
    const id = Date.now();
    setHistory((prev) => [
      { id, source: url.includes('shopee') ? 'Shopee' : url.includes('facebook') ? 'Facebook' : url.includes('tiktok') ? 'TikTok' : 'Website', url, status: 'Syncing...', items: 0, time: new Date().toISOString() },
      ...prev
    ]);
    try {
      const res = await axios.post('/scrape', { url });
      // Dùng đúng số bản ghi máy chủ báo về — không bao giờ bịa con số
      setHistory((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'Success', items: res.data.count ?? 0 } : r)));
      setUrl('');
    } catch (err) {
      // 422 = trang chặn truy cập hoặc không có bình luận: kết quả hợp lệ, không phải lỗi hệ thống
      const status = err.response?.status;
      const reason = status === 422 ? err.response?.data?.hint || 'Trang không có bình luận công khai nào' : 'Không kết nối được máy chủ hoặc quá thời gian chờ';
      setHistory((prev) => prev.map((r) => (r.id === id ? { ...r, status: status === 422 ? 'Empty' : 'Failed', items: 0, error: reason } : r)));
    } finally {
      setIsSyncing(false);
    }
  };

  const fmtTime = (t) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? t : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="cx">
      <PageHeader
        section="Hệ thống"
        title="Nguồn"
        accent="dữ liệu"
        subtitle="Kết nối gian hàng của chính doanh nghiệp để có mã đơn hàng — đó là mẫu số của tỉ lệ khiếu nại thật."
        actions={<Button icon={Plus} onClick={() => setShowAdd(true)}>Kết nối gian hàng</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Gian hàng đã kết nối" value={fmtInt(shops.length)} sub="tối đa 10 trong gói hiện tại" />
        <Stat label="Sản phẩm đang theo dõi" value={trackedProducts == null ? '—' : fmtInt(trackedProducts)} sub="đếm từ phản hồi đã thu thập" />
        <Stat label="Luồng tự đồng bộ" value={fmtInt(shops.filter((s) => s.autoSync).length)} sub="chạy hằng đêm" tone={shops.some((s) => s.autoSync) ? 'ok' : null} />
      </div>

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'shops', label: 'Gian hàng', icon: Store, count: shops.length },
          { value: 'url', label: 'Đồng bộ theo liên kết', icon: Link2 },
          { value: 'history', label: 'Lịch sử đồng bộ', icon: History, count: history.length }
        ]}
      />

      {tab === 'shops' && (
        shops.length === 0 ? (
          <GlassPanel><EmptyState title="Chưa kết nối gian hàng nào" description="Kết nối gian hàng Shopee, TikTok Shop hoặc website của bạn để bắt đầu thu thập phản hồi." action={<Button icon={Plus} onClick={() => setShowAdd(true)}>Kết nối gian hàng</Button>} /></GlassPanel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {shops.map((s) => {
              const p = PLATFORM[s.platform] || PLATFORM.Web;
              return (
                <GlassPanel key={s.id} tone="strong" className="flex flex-col p-5 animate-fade-up">
                  <div className="flex items-start gap-3.5">
                    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${p.tile}`}>
                      <p.icon size={22} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-hi">{s.name}</p>
                      <p className="font-mono text-xs text-ink-lo">{s.shopId}</p>
                    </div>
                    {s.isDemo ? <Badge tone="sky">Mẫu</Badge> : <Badge tone="ok">Hoạt động</Badge>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-surface/60 px-3 py-2"><p className="text-ink-lo">Nền tảng</p><p className="font-medium text-ink-hi">{p.label}</p></div>
                    <div className="rounded-xl bg-surface/60 px-3 py-2"><p className="text-ink-lo">Sản phẩm</p><p className="font-mono font-medium text-ink-hi">{s.isDemo ? 'chưa kết nối thật' : fmtInt(s.productsCount ?? 0)}</p></div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-4">
                    <label className="flex items-center gap-2.5 text-sm text-ink-mid">
                      <Switch size="sm" checked={s.autoSync} onChange={(v) => setShops((prev) => prev.map((x) => (x.id === s.id ? { ...x, autoSync: v } : x)))} label={`Tự đồng bộ ${s.name}`} />
                      {s.autoSync ? 'Tự đồng bộ hằng đêm' : 'Đã tạm dừng'}
                    </label>
                    <Button size="sm" variant="ghost" icon={Unplug} onClick={() => setConfirm({ type: 'shop', id: s.id, name: s.name })}>Ngắt</Button>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        )
      )}

      {tab === 'url' && (
        <GlassPanel tone="strong" className="max-w-3xl p-6">
          <PanelHeader title="Đồng bộ một sản phẩm" subtitle="Dán liên kết sản phẩm (kể cả của đối thủ) để thu thập bình luận công khai, chuẩn hoá tiếng Việt, che thông tin cá nhân và phân loại ngay." />
          <form onSubmit={sync} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              className="flex-1"
              label="Liên kết sản phẩm"
              icon={Link2}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://shopee.vn/…"
              required
              disabled={isSyncing}
            />
            <Button type="submit" size="lg" icon={RefreshCw} loading={isSyncing} disabled={!url}>
              {isSyncing ? 'Đang đồng bộ…' : 'Đồng bộ & phân loại'}
            </Button>
          </form>
          <div className="mt-5 flex gap-3 rounded-2xl bg-accent-dim p-4 text-sm text-ink-mid">
            <Clock size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <p>Mỗi lần đồng bộ mất khoảng 15 giây và có giới hạn tần suất. Để theo dõi ổn định, hãy kết nối cả gian hàng ở tab <b className="text-ink-hi">Gian hàng</b> — hệ thống tự đồng bộ hằng đêm và tuân thủ robots.txt.</p>
          </div>
        </GlassPanel>
      )}

      {tab === 'history' && (
        <GlassPanel tone="strong" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div>
              <h3 className="text-[0.98rem] font-semibold text-ink-hi">Lịch sử đồng bộ</h3>
              <p className="text-xs text-ink-lo">Xoá nhật ký không xoá dữ liệu đã thu thập trong cơ sở dữ liệu</p>
            </div>
            {history.length > 0 && <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm({ type: 'history' })}>Xoá nhật ký</Button>}
          </div>
          {history.length === 0 ? (
            <EmptyState compact title="Chưa có lần đồng bộ nào" description="Các lần đồng bộ theo liên kết sẽ xuất hiện ở đây." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[680px]">
                <thead><tr><th className="pl-5">Nguồn</th><th>Trạng thái</th><th className="text-right">Bản ghi</th><th>Thời điểm</th><th className="pr-5" /></tr></thead>
                <tbody>
                  {history.map((r) => {
                    const st = STATUS[r.status] || STATUS.Empty;
                    return (
                      <tr key={r.id}>
                        <td className="pl-5">
                          <p className="font-medium text-ink-hi">{r.source}</p>
                          <p className="max-w-[360px] truncate font-mono text-[0.7rem] text-ink-lo" title={r.url}>{r.url}</p>
                        </td>
                        <td>
                          <Badge tone={st.tone} icon={st.icon}>{st.label}</Badge>
                          {r.error && <p className="mt-1 text-[0.7rem] text-crit">{r.error}</p>}
                        </td>
                        <td className="text-right font-mono">{fmtInt(r.items || 0)}</td>
                        <td className="font-mono text-xs text-ink-mid">{fmtTime(r.time)}</td>
                        <td className="pr-5 text-right">
                          <button type="button" onClick={() => setHistory((prev) => prev.filter((x) => x.id !== r.id))} aria-label="Xoá khỏi nhật ký" className="grid size-8 place-items-center rounded-full text-ink-lo hover:bg-crit/10 hover:text-crit">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>
      )}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        icon={Boxes}
        title="Kết nối gian hàng"
        description="Doanh nghiệp cấp quyền truy cập gian hàng của chính mình qua API chính thức."
      >
        <form id="add-shop" onSubmit={addShop} className="flex flex-col gap-4">
          <Select
            label="Nền tảng"
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
            options={[{ value: 'Shopee', label: 'Shopee' }, { value: 'TikTok', label: 'TikTok Shop' }, { value: 'Web', label: 'Website tự quản' }]}
          />
          <TextField label="Tên gian hàng" icon={Store} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Cửa hàng chính hãng" required />
          <TextField label="Mã gian hàng hoặc URL" icon={Activity} value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} placeholder="SHP-12345 hoặc https://…" required />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Huỷ</Button>
            <Button type="submit" icon={Plus}>Kết nối</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        icon={confirm?.type === 'shop' ? Unplug : Trash2}
        tone="crit"
        size="sm"
        title={confirm?.type === 'shop' ? 'Ngắt kết nối gian hàng?' : 'Xoá toàn bộ nhật ký?'}
        description={
          confirm?.type === 'shop'
            ? `“${confirm?.name}” sẽ ngừng tự đồng bộ. Phản hồi đã thu thập vẫn được giữ lại.`
            : 'Chỉ xoá nhật ký trên máy này — dữ liệu đã đồng bộ trong cơ sở dữ liệu không bị ảnh hưởng.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Huỷ</Button>
            <Button variant="danger" onClick={runConfirm}>{confirm?.type === 'shop' ? 'Ngắt kết nối' : 'Xoá nhật ký'}</Button>
          </>
        }
      />
    </div>
  );
};

export default DataSources;
