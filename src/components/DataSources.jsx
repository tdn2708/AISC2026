import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Link2, RefreshCw, Store, ShoppingBag, Music2, Globe, Plus, Trash2, Boxes, Activity, Clock, CircleCheck, CircleX, CircleDashed, Unplug, History, Info, FileUp } from 'lucide-react';
import ImportCsv from './data/ImportCsv';
import { PageHeader, GlassPanel, PanelHeader, Tabs, Button, IconButton, TextField, Select, Modal, Badge, EmptyState } from './ui';
import { fmtInt } from '../lib/format';
import { readStorage, writeStorage } from '../lib/storage';
import { reportRefreshing } from '../lib/dataVersion';
import AutoCollect from './datasources/AutoCollect';
import { MOTION, EASE, useReducedMotion, PageEnter } from './motion';

/**
 * NGUỒN DỮ LIỆU
 * ------------------------------------------------------------------
 * Mô hình dữ liệu chính là first-party: doanh nghiệp kết nối gian hàng
 * của CHÍNH HỌ, nhờ đó có mã đơn hàng để tính tỉ lệ khiếu nại thật.
 * Đồng bộ theo liên kết chỉ dành cho đối sánh nhanh từng sản phẩm.
 */

const PLATFORM = {
  Shopee: { icon: ShoppingBag, tile: 'bg-high/12 text-high', label: 'Shopee' },
  TikTok: { icon: Music2, tile: 'bg-blush/45 text-ink-hi', label: 'TikTok Shop' },
  Tiki: { icon: ShoppingBag, tile: 'bg-sky/45 text-ink-hi', label: 'Tiki' },
  Web: { icon: Globe, tile: 'bg-sky/45 text-ink-hi', label: 'Website' }
};

const isLink = (v) => /^https?:\/\//i.test(String(v || '').trim());

/** Đường dẫn tới kho phản hồi, lọc đúng nguồn + sản phẩm vừa thu thập, mọi thời gian */
const feedbackLink = (source, productName) => {
  const q = new URLSearchParams({ time: 'All', include: 'all' });
  if (source) q.set('source', source);
  if (productName) q.set('product', productName);
  return `/feedbacks?${q.toString()}`;
};

const loadLocal = (key, fallback) => {
  try {
    const parsed = JSON.parse(readStorage(key) || 'null');
    if (!Array.isArray(parsed)) return fallback;
    // Lượt đồng bộ đang chạy dở khi đóng tab sẽ kẹt "Đang đồng bộ" mãi mãi
    return parsed.map((r) => (r && r.status === 'Syncing...' ? { ...r, status: 'Failed', error: 'Lần thu thập bị ngắt giữa chừng' } : r));
  } catch {
    return fallback;
  }
};


const STATUS = {
  Success: { tone: 'ok', icon: CircleCheck, label: 'Thành công' },
  Failed: { tone: 'crit', icon: CircleX, label: 'Thất bại' },
  Empty: { tone: 'med', icon: CircleDashed, label: 'Không có dữ liệu' },
  'Syncing...': { tone: 'accent', icon: RefreshCw, label: 'Đang thu thập' }
};

const LABELLER = { visobert: 'ViSoBERT', llm: 'mô hình ngôn ngữ lớn', rules: 'lớp luật từ khóa' };
const SENT_TONE = { Negative: 'crit', Positive: 'ok', Neutral: 'neutral' };
const SENT_LABEL = { Negative: 'Tiêu cực', Positive: 'Tích cực', Neutral: 'Trung tính' };

/** Danh sách đánh giá vừa thu thập kèm nhãn hệ thống gán (lời chê lên trước) */
const ScrapeResult = ({ result }) => {
  const navigate = useNavigate();
  const rows = result.data || [];
  const complaints = rows.filter((r) => r.categoryLabel).length;
  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink-hi">
            {result.count > 0
              ? <>Đã thu thập {fmtInt(result.count)} đánh giá mới{result.duplicatesSkipped ? <span className="font-normal text-ink-lo">, bỏ qua {fmtInt(result.duplicatesSkipped)} đánh giá đã có</span> : null}</>
              : <>Không có đánh giá mới <span className="font-normal text-ink-lo">({fmtInt(result.duplicatesSkipped || 0)} đánh giá của sản phẩm này đã có sẵn)</span></>}
          </p>
          {result.productName && <p className="truncate text-xs text-ink-lo">{result.productName}</p>}
        </div>
        <Badge tone="accent">Phân loại bằng {LABELLER[result.labelledBy] || 'hệ thống'}</Badge>
      </div>
      {rows.length > 0 && (
        <div className="paper"><ul className="flex max-h-[28rem] list-none flex-col divide-y divide-line-soft overflow-y-auto pr-1">
          {rows.map((r, i) => (
            <li key={i} className="py-3">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-lo">
                {r.rating != null && <span className="tabular-nums text-high">{'★'.repeat(r.rating)}<span className="text-ink-lo/50">{'★'.repeat(5 - r.rating)}</span></span>}
                <span>{r.author}</span>
                <Badge tone={SENT_TONE[r.sentiment] || 'neutral'}>{SENT_LABEL[r.sentiment] || r.sentiment}</Badge>
              </div>
              <p className="fb-clamp text-sm text-ink-hi">{r.originalText}</p>
              {r.categoryLabel && (
                <p className="mt-1.5 text-xs text-ink-mid">
                  <b className="font-semibold text-ink-hi">{r.categoryLabel}</b>{r.causeLabel ? ` (${r.causeLabel})` : ''}
                  {r.owner ? <span className="text-ink-lo">, chuyển cho {r.owner}</span> : null}
                </p>
              )}
            </li>
          ))}
        </ul></div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-lo">
          Lời chê lên trước. {complaints} trên {rows.length} đánh giá nêu vấn đề cụ thể.
        </p>
        <Button size="sm" onClick={() => navigate(feedbackLink(result.source, result.productName))}>
          Xem trong trang Phản hồi
        </Button>
      </div>
    </div>
  );
};

/**
 * Tiến độ thu thập. Máy chủ trả kết quả một lần khi xong, không báo phần trăm,
 * nên không vẽ phần trăm giả: một vệt chạy (transform) cho biết đang làm việc
 * và số giây đã trôi qua.
 */
const SyncProgress = () => {
  const reduced = useReducedMotion();
  const barRef = useRef(null);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = barRef.current;
    if (reduced || !el || typeof el.animate !== 'function') return undefined;
    const a = el.animate(
      [{ transform: 'translateX(-100%)' }, { transform: 'translateX(250%)' }],
      { duration: MOTION.story, iterations: Infinity, easing: EASE.inOut }
    );
    return () => a.cancel();
  }, [reduced]);

  return (
    <div className="mt-4" role="status">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
        {!reduced && <div ref={barRef} className="h-full w-2/5 rounded-full bg-accent" />}
      </div>
      <p className="mt-2 text-xs text-ink-lo">
        Đang lấy đánh giá và phân loại, đã chạy <span className="tabular-nums">{secs}</span> giây. Thường mất 20 đến 30 giây.
      </p>
    </div>
  );
};

const DataSources = () => {
  // Thu thập theo liên kết là đường duy nhất đang chạy thật, nên mở trước
  const [tab, setTab] = useState('url');
  const [url, setUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [history, setHistory] = useState(() => loadLocal('syncHistory', []));
  // Bản cũ cài sẵn hai "gian hàng mẫu" không có dữ liệu thật đứng sau: bỏ
  // khỏi danh sách đã lưu, chỉ giữ gian hàng người dùng tự thêm
  const [shops, setShops] = useState(() => loadLocal('connectedShops', []).filter((s) => s && !s.isDemo));
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ platform: 'Tiki', name: '', shopId: '' });
  const [confirm, setConfirm] = useState(null); // { type: 'shop' | 'history', id? }
  const [trackedProducts, setTrackedProducts] = useState(null);
  // Kết quả lần đồng bộ gần nhất: cho người xem thấy NGAY dữ liệu thật vừa về
  // và hệ thống đã phân loại ra sao, thay vì chỉ một con số trong lịch sử
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => writeStorage('syncHistory', JSON.stringify(history)), [history]);
  useEffect(() => writeStorage('connectedShops', JSON.stringify(shops)), [shops]);

  // Số sản phẩm THẬT, đếm từ dữ liệu đã thu thập
  useEffect(() => {
    axios.get('/products').then((r) => setTrackedProducts(Array.isArray(r.data) ? r.data.length : 0)).catch(() => setTrackedProducts(null));
  }, []);

  const addShop = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.shopId.trim()) return;
    const shopId = form.shopId.trim();
    setShops((prev) => [
      { id: Date.now().toString(), name: form.name.trim(), platform: form.platform, shopId },
      ...prev
    ]);
    setShowAdd(false);
    setForm({ platform: 'Tiki', name: '', shopId: '' });
    // Nhập vào là đường dẫn sản phẩm: thu thập ngay và cho xem kết quả, thay vì
    // chỉ lưu một thẻ gian hàng không có dữ liệu
    if (isLink(shopId)) {
      setTab('url');
      runSync(shopId);
    }
  };

  const runConfirm = () => {
    if (confirm?.type === 'shop') setShops((prev) => prev.filter((s) => s.id !== confirm.id));
    if (confirm?.type === 'history') setHistory([]);
    setConfirm(null);
  };

  const sync = (e) => {
    e.preventDefault();
    runSync(url);
  };

  const runSync = async (raw) => {
    const link = String(raw || '').trim();
    if (!link || isSyncing) return;
    setUrl(link);
    setIsSyncing(true);
    setLastResult(null);
    const id = Date.now();
    setHistory((prev) => [
      { id, source: link.includes('tiki.vn') ? 'Tiki' : link.includes('shopee') ? 'Shopee' : link.includes('facebook') ? 'Facebook' : link.includes('tiktok') ? 'TikTok' : 'Website', url: link, status: 'Syncing...', items: 0, time: new Date().toISOString() },
      ...prev
    ]);
    try {
      const res = await axios.post('/scrape', { url: link });
      // Dùng đúng số bản ghi máy chủ báo về — không bao giờ bịa con số
      const dup = res.data.duplicatesSkipped || 0;
      setHistory((prev) => prev.map((r) => (r.id === id
        ? { ...r, status: 'Success', items: res.data.count ?? 0, note: dup ? `Bỏ qua ${dup} bình luận đã có trong kho` : undefined, dataSource: res.data.source, productName: res.data.productName }
        : r)));
      setLastResult(res.data);
      setUrl('');
      if (res.data.count) reportRefreshing(true);
    } catch (err) {
      // 422 = trang chặn truy cập hoặc không có bình luận: kết quả hợp lệ, không phải lỗi hệ thống
      const status = err.response?.status;
      const reason = status === 422
        ? err.response?.data?.hint || 'Trang không có bình luận công khai nào'
        // 400 = đường dẫn không hợp lệ: nêu đúng lý do máy chủ trả về
        : err.response?.data?.error || 'Không kết nối được máy chủ hoặc quá thời gian chờ. Kiểm tra mạng rồi thử lại.';
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
    <PageEnter className="cx">
      <PageHeader
        title="Nguồn dữ liệu"
        subtitle={`Thu thập phản hồi từ sàn.${trackedProducts ? ` Đang theo dõi ${fmtInt(trackedProducts)} sản phẩm.` : ''}`}
        actions={<Button variant="secondary" icon={Plus} onClick={() => setShowAdd(true)}>Thêm gian hàng</Button>}
      />

      <AutoCollect />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'url', label: 'Liên kết', icon: Link2 },
          { value: 'file', label: 'Nạp file', icon: FileUp },
          { value: 'shops', label: 'Gian hàng', icon: Store, count: shops.length || undefined },
          { value: 'history', label: 'Lịch sử', icon: History, count: history.length || undefined }
        ]}
      />

      {tab === 'shops' && (
        shops.length === 0 ? (
          <GlassPanel>
            <EmptyState
              title="Chưa có gian hàng nào"
              description="Kết nối trực tiếp với API của sàn (để lấy cả mã đơn hàng) đang được phát triển. Hiện tại, thêm đường dẫn sản phẩm Tiki để thu thập đánh giá."
              action={<Button icon={Plus} onClick={() => setShowAdd(true)}>Thêm gian hàng</Button>}
            />
          </GlassPanel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {shops.map((s) => {
              const p = PLATFORM[s.platform] || PLATFORM.Web;
              return (
                <GlassPanel key={s.id} tone="strong" className="flex flex-col p-5">
                  <div className="flex items-start gap-3.5">
                    <span className={`grid size-12 shrink-0 place-items-center rounded-ctrl ${p.tile}`}>
                      <p.icon size={22} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-hi">{s.name}</p>
                      <p className="tabular-nums text-xs text-ink-lo">{s.shopId}</p>
                    </div>
                    {isLink(s.shopId) ? <Badge tone="ok">Thu thập được</Badge> : <Badge>Chờ kết nối API</Badge>}
                  </div>
                  <p className="mt-3 text-xs text-ink-lo">{p.label}</p>
                  <div className="mt-4 flex items-center justify-end border-t border-line-soft pt-4">
                    <div className="flex items-center gap-1">
                      {isLink(s.shopId) && (
                        <Button size="sm" variant="secondary" icon={RefreshCw} loading={isSyncing} onClick={() => { setTab('url'); runSync(s.shopId); }}>
                          Thu thập ngay
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={Unplug} onClick={() => setConfirm({ type: 'shop', id: s.id, name: s.name })}>Gỡ</Button>
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        )
      )}

      {tab === 'url' && (
        <GlassPanel tone="strong" className="max-w-3xl p-6">
          <PanelHeader title="Thu thập đánh giá của một sản phẩm" subtitle="Dán liên kết sản phẩm, kể cả của đối thủ. Tên người mua được che trước khi lưu." />
          <form onSubmit={sync} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              className="flex-1"
              label="Liên kết sản phẩm"
              icon={Link2}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://tiki.vn/…"
              required
              disabled={isSyncing}
            />
            <Button type="submit" icon={RefreshCw} loading={isSyncing} disabled={!url}>
              {isSyncing ? 'Đang thu thập…' : 'Thu thập và phân loại'}
            </Button>
          </form>
          {isSyncing && <SyncProgress />}
          <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-lo">
            <Clock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Hỗ trợ Tiki: tối đa 100 đánh giá mới nhất mỗi lần, khoảng 20 đến 30 giây. Shopee và Lazada chặn truy cập tự động.
          </p>

          {lastResult && <ScrapeResult result={lastResult} />}
        </GlassPanel>
      )}

      {tab === 'file' && <ImportCsv />}

      {tab === 'history' && (
        <GlassPanel tone="strong" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-ink-hi">Lịch sử thu thập trên máy này</h3>
              <p className="text-xs text-ink-lo">Xoá lịch sử không xoá dữ liệu đã thu thập</p>
            </div>
            {history.length > 0 && <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm({ type: 'history' })}>Xoá lịch sử</Button>}
          </div>
          {history.length === 0 ? (
            <EmptyState compact title="Chưa thu thập lần nào" description="Mỗi lần thu thập theo liên kết sẽ được ghi lại ở đây." />
          ) : (
            <div className="paper"><div className="scroll-hint-x overflow-x-auto">
              <table className="data-table min-w-[680px]">
                <thead><tr><th className="pl-5">Nguồn</th><th>Trạng thái</th><th className="text-right">Bản ghi</th><th>Thời điểm</th><th className="pr-5" /></tr></thead>
                <tbody>
                  {history.map((r) => {
                    const st = STATUS[r.status] || STATUS.Empty;
                    return (
                      <tr key={r.id}>
                        <td className="pl-5">
                          <p className="font-medium text-ink-hi">{r.source}</p>
                          <p className="max-w-[360px] truncate tabular-nums text-xs text-ink-lo" title={r.url}>{r.url}</p>
                        </td>
                        <td>
                          <Badge tone={st.tone} icon={st.icon}>{st.label}</Badge>
                          {r.error && <p className="mt-1 text-xs text-crit">{r.error}</p>}
                          {r.note && <p className="mt-1 text-xs text-ink-lo">{r.note}</p>}
                          {r.status === 'Success' && r.dataSource && (
                            <Button variant="link" size="sm" onClick={() => navigate(feedbackLink(r.dataSource, r.productName))} className="mt-1">
                              Xem dữ liệu
                            </Button>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{fmtInt(r.items || 0)}</td>
                        <td className="tabular-nums text-xs text-ink-mid">{fmtTime(r.time)}</td>
                        <td className="pr-5 text-right">
                          <IconButton icon={Trash2} variant="danger" size="sm" label="Xoá khỏi nhật ký" onClick={() => setHistory((prev) => prev.filter((x) => x.id !== r.id))} className="ml-auto" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></div>
          )}
        </GlassPanel>
      )}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        icon={Boxes}
        title="Thêm gian hàng"
        description="Dán đường dẫn sản phẩm Tiki để thu thập ngay. Kết nối trực tiếp API của sàn (lấy cả mã đơn hàng) đang được phát triển."
      >
        <form id="add-shop" onSubmit={addShop} className="flex flex-col gap-4">
          <Select
            label="Nền tảng"
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
            options={[{ value: 'Tiki', label: 'Tiki' }, { value: 'Shopee', label: 'Shopee' }, { value: 'TikTok', label: 'TikTok Shop' }, { value: 'Web', label: 'Website tự quản' }]}
          />
          <TextField label="Tên gian hàng" icon={Store} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Cửa hàng chính hãng" required />
          <TextField label="Mã gian hàng hoặc URL" icon={Activity} value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} placeholder="SHP-12345 hoặc https://…" required />
          {isLink(form.shopId) ? (
            <p className="flex gap-2 rounded-ctrl bg-accent-dim p-3 text-xs text-ink-mid">
              <Info size={14} className="mt-0.5 shrink-0 text-accent" />
              Đây là đường dẫn: hệ thống sẽ thu thập đánh giá công khai của sản phẩm này ngay (hỗ trợ Tiki; Shopee và Lazada chặn truy cập tự động).
            </p>
          ) : (
            <p className="flex gap-2 rounded-ctrl bg-raised p-3 text-xs text-ink-mid">
              <Info size={14} className="mt-0.5 shrink-0 text-ink-lo" />
              Với mã gian hàng, hệ thống chỉ lưu lại; chưa thu thập được cho tới khi có kết nối API của sàn.
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Huỷ</Button>
            <Button type="submit" icon={isLink(form.shopId) ? RefreshCw : Plus}>{isLink(form.shopId) ? 'Thêm và thu thập ngay' : 'Lưu gian hàng'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        icon={confirm?.type === 'shop' ? Unplug : Trash2}
        tone="crit"
        size="sm"
        title={confirm?.type === 'shop' ? 'Gỡ gian hàng?' : 'Xoá toàn bộ lịch sử?'}
        description={
          confirm?.type === 'shop'
            ? `Gỡ “${confirm?.name}” khỏi danh sách. Phản hồi đã thu thập vẫn được giữ lại.`
            : 'Chỉ xoá lịch sử trên máy này. Dữ liệu đã thu thập không bị ảnh hưởng.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Huỷ</Button>
            <Button variant="danger" onClick={runConfirm}>{confirm?.type === 'shop' ? 'Gỡ gian hàng' : 'Xoá lịch sử'}</Button>
          </>
        }
      />
    </PageEnter>
  );
};

export default DataSources;
