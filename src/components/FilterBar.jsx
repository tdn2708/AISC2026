import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { CalendarRange, ChevronDown, Download, Package, Radio, Search, X } from 'lucide-react';
import { Chip, Button, Popover, MenuItem, SELECTED, fieldClass } from './ui';
import { foldVi } from '../lib/format';

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

// Đúng các kênh có trong dữ liệu (bản cũ có "Website" — không bản ghi nào mang
// nguồn này — và thiếu Lazada, Tổng đài, Tiki)
const SOURCES = [
  { value: 'All', label: 'Mọi nguồn' },
  { value: 'Shopee', label: 'Shopee' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Lazada', label: 'Lazada' },
  { value: 'Tiki', label: 'Tiki' },
  { value: 'CSKH', label: 'Tổng đài CSKH' },
  // Khiếu nại đưa từ trang Livestream vào (TikTok Live giữ nguồn TikTok)
  { value: 'Livestream', label: 'Livestream' },
  { value: 'YouTube', label: 'YouTube Live' }
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
    <Popover ref={ref} className={`absolute top-[calc(100%+8px)] ${align === 'right' ? 'right-0' : 'left-0'}`} style={{ width }}>
      {children}
    </Popover>
  );
};

const Option = ({ active, onClick, children }) => (
  <MenuItem active={active} onClick={onClick} aria-pressed={active}>{children}</MenuItem>
);

const Trigger = ({ icon: Icon, active, children, onClick, open }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={open}
    className={`inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-ctrl border px-3 text-xs font-medium transition-[background-color,border-color,color] duration-micro ease-out ${
      active ? SELECTED : 'border-line bg-surface text-ink-mid hover:border-ink-lo hover:text-ink-hi'
    }`}
  >
    <Icon size={14} className="shrink-0" aria-hidden="true" />
    <span className="truncate">{children}</span>
    <ChevronDown size={14} className={`shrink-0 transition-transform duration-short ease-out ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
  </button>
);

const FilterBar = ({ timeFilter, setTimeFilter, sourceFilter, setSourceFilter, productFilter, setProductFilter, hideExportButton = false }) => {
  const barRef = useRef(null);
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

  // Báo chiều cao thanh lọc cho vùng cuộn (--filter-h): scroll-padding-top của .main-content cộng số này,
  // để cuộn tới anchor (#today...) không nằm dưới thanh trên và thanh lọc dính. Rời trang thì về 0.
  useEffect(() => {
    const bar = barRef.current;
    const scroller = bar?.closest('.main-content');
    if (!bar || !scroller) return undefined;
    const sync = () => scroller.style.setProperty('--filter-h', `${bar.offsetHeight + 8}px`);
    sync();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      scroller.style.setProperty('--filter-h', '0px');
    };
  }, []);

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
    return `${new Date(s).toLocaleDateString('vi-VN')} đến ${new Date(e).toLocaleDateString('vi-VN')}`;
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
  // Không phân biệt dấu: gõ "ao thun" vẫn ra "Áo thun cotton"
  const productNeedle = foldVi(productQuery.trim());
  const filteredProducts = productOptions.filter((p) => foldVi(p).includes(productNeedle));

  return (
    <div ref={barRef} className="cx glass-chrome filterbar md:sticky md:top-[calc(var(--topbar-h,5rem)+0.5rem)] z-[110] mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-surf px-4 py-3">
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
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={`mt-1 px-2.5 ${fieldClass({ size: 'sm' })}`} />
              </label>
              <label className="text-xs text-ink-mid">
                Đến ngày
                <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} className={`mt-1 px-2.5 ${fieldClass({ size: 'sm' })}`} />
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
                  className={`pr-3 pl-8 ${fieldClass({ size: 'sm' })}`}
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
            className="inline-flex h-8 items-center gap-1 rounded-ctrl px-2.5 text-xs text-ink-mid transition-colors hover:bg-crit/10 hover:text-crit"
          >
            <X size={13} aria-hidden="true" />
            Xoá {activeCount} bộ lọc
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
