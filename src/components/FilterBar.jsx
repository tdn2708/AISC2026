import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { CalendarRange, ChevronDown, Download, Package, Radio, Search, X, Check } from 'lucide-react';
import { Chip, Button } from './ui';

/**
 * BỘ LỌC CHUNG — một hàng, đặt trên mọi thứ nó áp dụng.
 * Giữ nguyên giá trị gửi lên máy chủ ('Today', 'This Week',
 * 'Custom:yyyy-mm-dd:yyyy-mm-dd'…) — chỉ đổi cách trình bày.
 */

const TIME_PRESETS = [
  { value: 'All', label: 'Toàn bộ' },
  { value: 'Today', label: 'Hôm nay' },
  { value: 'This Week', label: '7 ngày' },
  { value: 'This Month', label: '30 ngày' }
];

const SOURCES = [
  { value: 'All', label: 'Mọi nguồn' },
  { value: 'Shopee', label: 'Shopee' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Web', label: 'Website' }
];

/** Menu thả xuống kính — đóng khi bấm ra ngoài hoặc Esc */
const Dropdown = ({ open, onClose, children, width = 240, align = 'left' }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.parentElement.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`glass-strong absolute top-[calc(100%+8px)] z-[150] rounded-2xl p-1.5 animate-pop-in ${align === 'right' ? 'right-0' : 'left-0'}`}
      style={{ width }}
    >
      {children}
    </div>
  );
};

const Option = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
      active ? 'bg-accent-dim font-medium text-accent-hi' : 'text-ink-hi hover:bg-raised'
    }`}
  >
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {active && <Check size={14} aria-hidden="true" />}
  </button>
);

const Trigger = ({ icon: Icon, active, children, onClick, open }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={open}
    className={`inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
      active ? 'border-accent/40 bg-accent-dim text-accent-hi' : 'border-line bg-surface/55 text-ink-mid hover:border-ink-lo hover:text-ink-hi'
    }`}
  >
    <Icon size={13} className="shrink-0" aria-hidden="true" />
    <span className="truncate">{children}</span>
    <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
  </button>
);

const FilterBar = ({ timeFilter, setTimeFilter, sourceFilter, setSourceFilter, productFilter, setProductFilter, hideExportButton = false }) => {
  const [open, setOpen] = useState(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [productOptions, setProductOptions] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const navigate = useNavigate();

  // Tải danh sách sản phẩm MỘT lần — bản trước gọi lại API mỗi lần đổi sản phẩm
  const [productsLoaded, setProductsLoaded] = useState(false);
  useEffect(() => {
    if (!setProductFilter) return;
    axios
      .get('/products')
      .then((res) => setProductOptions(Array.isArray(res.data) ? res.data : []))
      .catch((e) => console.error('Không tải được danh sách sản phẩm:', e))
      .finally(() => setProductsLoaded(true));
  }, [setProductFilter]);

  // Sản phẩm lưu từ phiên trước không còn trong dữ liệu → gỡ khỏi bộ lọc
  useEffect(() => {
    if (productsLoaded && productOptions.length && productFilter && productFilter !== 'All' && !productOptions.includes(productFilter)) {
      setProductFilter?.('All');
    }
  }, [productsLoaded, productOptions, productFilter, setProductFilter]);

  const isCustom = timeFilter?.startsWith('Custom:');
  const customLabel = (() => {
    if (!isCustom) return 'Tuỳ chọn';
    const [, s, e] = timeFilter.split(':');
    return `${new Date(s).toLocaleDateString('vi-VN')} – ${new Date(e).toLocaleDateString('vi-VN')}`;
  })();

  const activeCount =
    (timeFilter && timeFilter !== 'All' ? 1 : 0) +
    (sourceFilter && sourceFilter !== 'All' ? 1 : 0) +
    (productFilter && productFilter !== 'All' ? 1 : 0);

  const clearAll = () => {
    setTimeFilter('All');
    setSourceFilter('All');
    setProductFilter?.('All');
    setOpen(null);
  };

  const applyCustom = () => {
    if (customStart && customEnd) {
      setTimeFilter(`Custom:${customStart}:${customEnd}`);
      setOpen(null);
    }
  };

  const close = () => setOpen(null);
  const filteredProducts = productOptions.filter((p) => p.toLowerCase().includes(productQuery.toLowerCase()));

  return (
    <div className="cx glass relative z-[100] mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Khoảng thời gian">
        <span className="eyebrow mr-1 hidden lg:inline">Thời gian</span>
        {TIME_PRESETS.map((t) => (
          <Chip key={t.value} active={timeFilter === t.value} onClick={() => setTimeFilter(t.value)}>
            {t.label}
          </Chip>
        ))}
        <div className="relative">
          <Chip active={isCustom} icon={CalendarRange} onClick={() => setOpen(open === 'time' ? null : 'time')} aria-expanded={open === 'time'}>
            {customLabel}
          </Chip>
          <Dropdown open={open === 'time'} onClose={close} width={260}>
            <div className="flex flex-col gap-2 p-2">
              <p className="eyebrow">Khoảng tuỳ chọn</p>
              <label className="text-xs text-ink-mid">
                Từ ngày
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink-hi outline-none focus:border-accent" />
              </label>
              <label className="text-xs text-ink-mid">
                Đến ngày
                <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink-hi outline-none focus:border-accent" />
              </label>
              <Button size="sm" onClick={applyCustom} disabled={!customStart || !customEnd} className="mt-1">
                Áp dụng
              </Button>
            </div>
          </Dropdown>
        </div>
      </div>

      <span className="hidden h-6 w-px bg-line-soft md:block" aria-hidden="true" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Trigger icon={Radio} active={sourceFilter !== 'All'} open={open === 'source'} onClick={() => setOpen(open === 'source' ? null : 'source')}>
            {SOURCES.find((s) => s.value === sourceFilter)?.label || sourceFilter}
          </Trigger>
          <Dropdown open={open === 'source'} onClose={close} width={200}>
            {SOURCES.map((s) => (
              <Option key={s.value} active={sourceFilter === s.value} onClick={() => { setSourceFilter(s.value); close(); }}>
                {s.label}
              </Option>
            ))}
          </Dropdown>
        </div>

        {setProductFilter && (
          <div className="relative">
            <Trigger icon={Package} active={productFilter && productFilter !== 'All'} open={open === 'product'} onClick={() => setOpen(open === 'product' ? null : 'product')}>
              {/* Mọi chỗ cắt chữ đều kèm title để xem được giá trị đầy đủ */}
              <span title={productFilter !== 'All' ? productFilter : undefined}>
                {!productFilter || productFilter === 'All' ? 'Mọi sản phẩm' : productFilter}
              </span>
            </Trigger>
            <Dropdown open={open === 'product'} onClose={close} width={300}>
              <div className="relative mb-1.5">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Tìm sản phẩm…"
                  aria-label="Tìm sản phẩm"
                  className="h-9 w-full rounded-xl border border-line bg-surface pr-3 pl-8 text-sm text-ink-hi outline-none focus:border-accent"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Option active={productFilter === 'All'} onClick={() => { setProductFilter('All'); close(); }}>Mọi sản phẩm</Option>
                {filteredProducts.map((p) => (
                  <Option key={p} active={productFilter === p} onClick={() => { setProductFilter(p); close(); }}>
                    <span title={p}>{p}</span>
                  </Option>
                ))}
                {filteredProducts.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-lo">Không có sản phẩm khớp</p>}
              </div>
            </Dropdown>
          </div>
        )}

        {/* Bộ lọc được lưu qua các lần tải trang, nên phải luôn thấy được
            đang lọc mấy điều kiện và gỡ được trong một cú bấm */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-ink-lo transition-colors hover:bg-crit/10 hover:text-crit"
          >
            <X size={13} aria-hidden="true" />
            <span className="font-mono">{activeCount}</span> điều kiện · xoá
          </button>
        )}
      </div>

      {!hideExportButton && (
        <Button variant="ghost" size="sm" icon={Download} onClick={() => navigate('/reports')} className="ml-auto">
          Xuất báo cáo
        </Button>
      )}
    </div>
  );
};

export default FilterBar;
