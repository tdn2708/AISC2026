import React, { useState, useEffect } from 'react';
import { Brain, AlertTriangle, HelpCircle, Sparkles, Database, Lightbulb, Route } from 'lucide-react';
import axios from 'axios';
import FilterBar from './FilterBar';

/**
 * PHÂN TÍCH CHIẾN LƯỢC — bố cục
 * ------------------------------------------------------------------
 *   [ Nhãn AI · tiêu đề · chip bộ lọc                            12 ]
 *   [ Bộ lọc dạng pill, không khung bao                          12 ]
 *   [ Tóm tắt điều hành + timeline hành động  8 ][ Ma trận rủi ro 4 ]
 *   [                                          ][ Chú thích       4 ]
 *
 * Không còn nút "Chạy lại dự báo": khi chưa có bản cache, trang tự sinh
 * báo cáo một lần cho bộ lọc hiện tại.
 */

// Card kính: tách lớp bằng ánh sáng (viền mảnh trong suốt + vệt sáng mép
// trên) thay cho viền xám đặc.
const GlassCard = ({ className = '', children, ...rest }) => (
  <section className={`glass relative overflow-hidden rounded-2xl ${className}`} {...rest}>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"
    />
    {children}
  </section>
);

// Làm nổi số liệu và các cụm từ mang tín hiệu rủi ro trong đoạn văn do mô
// hình sinh, để mắt quét được ý chính mà không phải đọc từng chữ.
const RISK_TERMS = ['tiêu cực', 'rủi ro', 'khiếu nại', 'nghiêm trọng', 'khẩn cấp', 'suy giảm', 'ưu tiên'];
const TOKEN_RE = new RegExp(`(\\d+(?:[.,]\\d+)?\\s?%|\\d+(?:[.,]\\d+)*|${RISK_TERMS.join('|')})`, 'giu');

const highlight = (text) =>
  text.split(TOKEN_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (/\d/.test(part)) {
      return <span key={i} className="data-num font-medium text-accent-hi">{part}</span>;
    }
    return <span key={i} className="font-medium text-high">{part}</span>;
  });

// Mức rủi ro là nhãn định tính do mô hình trả về, không phải xác suất đo
// được. Độ dài thanh chỉ để so sánh bằng mắt, nên KHÔNG in kèm con số %.
const riskLevel = (probability = '') => {
  const p = probability.toLowerCase();
  if (p.includes('cao')) {
    return {
      width: 90,
      bar: 'from-crit to-high',
      chip: 'bg-crit/10 text-crit ring-crit/30',
      glow: 'shadow-[0_0_14px_-2px_color-mix(in_oklab,var(--sev-crit)_70%,transparent)]',
    };
  }
  if (p.includes('thấp')) {
    return {
      width: 25,
      bar: 'from-med/80 to-med',
      chip: 'bg-med/10 text-med ring-med/30',
      glow: 'shadow-[0_0_10px_-3px_color-mix(in_oklab,var(--sev-med)_60%,transparent)]',
    };
  }
  return {
    width: 58,
    bar: 'from-high to-med',
    chip: 'bg-high/10 text-high ring-high/30',
    glow: 'shadow-[0_0_12px_-3px_color-mix(in_oklab,var(--sev-high)_65%,transparent)]',
  };
};

const riskHorizon = (timeFilter) =>
  timeFilter === 'Today' ? '7 ngày'
    : timeFilter === 'This Week' ? '4 tuần'
    : timeFilter === 'This Month' ? '1 quý'
    : '30 ngày';

const Analytics = () => {
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const [prediction, setPrediction] = useState(null);
  // So phan hoi hop le ma du bao dua tren. Day la con so THAT do API
  // tra ve, dung de thay cho "92% diem tin cay" von duoc viet cung.
  const [basedOn, setBasedOn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Chỉ còn đường tự sinh khi chưa có cache — nút chạy tay đã bỏ.
  const generatePrediction = async () => {
    try {
      const res = await axios.post('/predict/refresh', {
        time: timeFilter,
        source: sourceFilter,
        product: productFilter
      });
      setPrediction(res.data.data);
      setBasedOn(res.data.basedOnValidFeedbacks ?? null);
    } catch (err) {
      console.error(err);
      setError("Không thể tự động tạo báo cáo AI: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrediction = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (timeFilter !== 'All') params.append('time', timeFilter);
      if (sourceFilter !== 'All') params.append('source', sourceFilter);
      if (productFilter !== 'All') params.append('product', productFilter);
      const q = params.toString() ? `?${params.toString()}` : '';

      const res = await axios.get(`/predict${q}`);
      if (res.data.data) {
        setPrediction(res.data.data);
        setBasedOn(res.data.basedOnValidFeedbacks ?? null);
        setLoading(false);
      } else {
        await generatePrediction();
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrediction();
  }, [timeFilter, sourceFilter, productFilter]);

  const basedOnLabel = basedOn != null ? basedOn.toLocaleString('vi-VN') : '—';
  const activeChips = [sourceFilter, timeFilter].filter((f) => f !== 'All');

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <GlassCard className="flex flex-col gap-6 p-6 lg:col-span-8">
        <div className="flex items-center gap-3">
          <div className="skeleton size-10 rounded-xl" />
          <div className="skeleton h-7 w-52 rounded-md" />
        </div>
        <div className="skeleton h-32 w-full rounded-xl" />
        <div className="skeleton h-5 w-44 rounded-md" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="skeleton size-8 shrink-0 rounded-full" />
            <div className="skeleton h-16 w-full rounded-xl" />
          </div>
        ))}
      </GlassCard>
      <GlassCard className="flex flex-col gap-5 p-6 lg:col-span-4">
        <div className="skeleton h-6 w-40 rounded-md" />
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 w-full rounded-lg" />)}
      </GlassCard>
    </div>
  );

  return (
    <div className="cx relative isolate">
      {/* Ánh sáng môi trường cho lớp kính có thứ để làm mờ.
          KHÔNG đặt overflow-hidden ở đây: nó cắt vệt sáng đúng theo mép vùng
          nội dung và để lộ một khung chữ nhật cạnh cứng ở góc trang.
          .main-content đã có overflow-x: hidden nên không sinh thanh cuộn ngang. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-accent/15 blur-[120px]" />
        <div className="absolute -right-40 top-24 h-[26rem] w-[26rem] rounded-full bg-pos/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[22rem] w-[22rem] rounded-full bg-crit/[0.07] blur-[130px]" />
      </div>

      {/* ---------- Header ---------- */}
      <header className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 ring-1 ring-accent/25">
          <Sparkles size={13} className="text-accent-hi" aria-hidden="true" />
          <span className="data-num text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-accent-hi">
            AI Forecast Engine
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-[1.75rem] font-bold tracking-tight text-ink-hi">Phân tích chiến lược</h2>
          {activeChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-raised/60 px-3 py-0.5 text-[0.72rem] font-medium text-ink-mid ring-1 ring-line/50"
            >
              {chip}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[0.9rem] text-ink-lo">
          Dự báo và khuyến nghị do mô hình sinh
          {activeChips.length > 0 || productFilter !== 'All' ? ', theo đúng bộ lọc đang áp dụng' : ''}
        </p>
      </header>

      <FilterBar
        variant="pill"
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
      />

      {error ? (
        <GlassCard className="flex items-center gap-3 p-5 text-crit">
          <AlertTriangle size={18} aria-hidden="true" />
          <span className="text-[0.9rem]">Lỗi: {error}</span>
        </GlassCard>
      ) : loading ? (
        renderSkeleton()
      ) : !prediction ? (
        <GlassCard className="px-6 py-16 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-raised/60 ring-1 ring-line/40">
            <HelpCircle size={26} className="text-ink-lo" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-[1.2rem] font-semibold text-ink-hi">Chưa có báo cáo AI</h3>
          <p className="mx-auto max-w-md text-[0.9rem] text-ink-lo">
            Chưa đủ dữ liệu để sinh dự báo cho bộ lọc này. Thử nới rộng khoảng thời gian hoặc nguồn dữ liệu.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">

          {/* ---------- Cột chính ---------- */}
          <GlassCard className="flex flex-col gap-7 p-5 sm:p-7 lg:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-accent/30 to-accent/5 ring-1 ring-accent/30">
                  <Brain size={19} className="text-accent-hi" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="m-0 text-[1.2rem] font-semibold text-ink-hi">Tóm tắt điều hành</h3>
                  <p className="text-[0.75rem] text-ink-lo">Tổng hợp tình hình và rủi ro nổi bật</p>
                </div>
              </div>

              {/* Số phản hồi THẬT mà dự báo dựa trên — thay cho điểm tin cậy
                  viết cứng ở bản cũ. */}
              <div className="flex items-center gap-3 rounded-full bg-accent/10 py-1.5 pl-1.5 pr-4 ring-1 ring-accent/30 shadow-[0_0_28px_-8px_color-mix(in_oklab,var(--accent)_70%,transparent)]">
                <span className="relative grid size-8 place-items-center rounded-full bg-accent/15">
                  <Database size={15} className="text-accent-hi" aria-hidden="true" />
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-ok shadow-[0_0_8px_var(--sev-ok)]" />
                </span>
                <div className="leading-tight">
                  <div className="data-num text-[1.05rem] font-semibold text-ink-hi">{basedOnLabel}</div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-lo">
                    Phản hồi hợp lệ
                  </div>
                </div>
              </div>
            </div>

            <div className="relative rounded-xl bg-canvas/40 px-5 py-5 shadow-[inset_0_2px_14px_rgb(0_0_0/0.28),inset_0_0_0_1px_var(--glass-line)] sm:px-6">
              <span aria-hidden="true" className="absolute inset-y-5 left-0 w-[2px] rounded-full bg-linear-to-b from-accent via-accent/40 to-transparent" />
              <div className="flex flex-col gap-3 text-[0.95rem] leading-[1.85] text-ink-mid">
                {prediction.aiReport.split('\n').filter((line) => line.trim()).map((line, i) => (
                  <p key={i}>{highlight(line)}</p>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-5 flex items-center gap-2.5">
                <Route size={16} className="text-accent-hi" aria-hidden="true" />
                <h4 className="m-0 text-[0.98rem] font-semibold text-ink-hi">Kế hoạch hành động đề xuất</h4>
                <span className="h-px flex-1 bg-linear-to-r from-line/60 to-transparent" />
              </div>

              <ol className="relative">
                {prediction.actionableSteps.map((step, idx) => {
                  const isLast = idx === prediction.actionableSteps.length - 1;
                  return (
                    <li key={idx} className="group relative grid grid-cols-[2rem_1fr] gap-4 pb-5 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 left-4 top-9 w-px -translate-x-1/2 bg-linear-to-b from-accent/60 via-accent/25 to-accent/5"
                        />
                      )}

                      <div className="relative flex justify-center pt-1">
                        <span
                          aria-hidden="true"
                          className={`absolute top-1 size-8 rounded-full bg-accent/30 blur-md ${idx === 0 ? 'animate-pulse' : 'opacity-60'}`}
                        />
                        <span className="relative grid size-8 place-items-center rounded-full bg-canvas ring-1 ring-accent/60 shadow-[0_0_16px_-2px_color-mix(in_oklab,var(--accent)_65%,transparent)]">
                          <span className="size-2 rounded-full bg-accent-hi shadow-[0_0_8px_var(--accent-hi)]" />
                        </span>
                      </div>

                      <div className="rounded-xl bg-raised/25 px-4 py-3 ring-1 ring-line/30 transition duration-200 group-hover:bg-accent/[0.06] group-hover:ring-accent/30">
                        <div className="data-num mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-accent-hi/90">
                          Bước {String(idx + 1).padStart(2, '0')}
                        </div>
                        <p className="text-[0.92rem] leading-relaxed text-ink-hi">{step}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </GlassCard>

          {/* ---------- Sidebar ---------- */}
          <aside className="flex flex-col gap-6 lg:col-span-4">
            <GlassCard className="p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-crit/25 to-high/5 ring-1 ring-crit/25">
                  <AlertTriangle size={16} className="text-high" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="m-0 text-[1.05rem] font-semibold text-ink-hi">Ma trận rủi ro</h3>
                  <p className="data-num text-[0.7rem] uppercase tracking-[0.12em] text-ink-lo">
                    Tầm nhìn · {riskHorizon(timeFilter)}
                  </p>
                </div>
              </div>

              <ul className="flex flex-col gap-5">
                {prediction.topRisks.map((risk, idx) => {
                  const lvl = riskLevel(risk.probability);
                  return (
                    <li key={idx}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[0.88rem] text-ink-hi" title={risk.name}>
                          {risk.name}
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.66rem] font-semibold uppercase tracking-wider ring-1 ${lvl.chip}`}>
                          {risk.probability}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-raised/70 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]">
                        <div
                          className={`h-full rounded-full bg-linear-to-r transition-[width] duration-500 ${lvl.bar} ${lvl.glow}`}
                          style={{ width: `${lvl.width}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </GlassCard>

            {/* Ranh giới giữa "số đo" và "dự báo" phải nói thành lời, nhưng
                đây là chú thích nên hạ tông để không tranh sự chú ý. */}
            <div role="note" className="rounded-2xl bg-raised/20 px-4 py-4 ring-1 ring-line/25">
              <div className="mb-2 flex items-center gap-2">
                <Lightbulb size={14} className="text-med" aria-hidden="true" />
                <h3 className="m-0 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-lo">
                  Đọc trang này thế nào
                </h3>
              </div>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[0.76rem] leading-relaxed text-ink-lo marker:text-line">
                <li>
                  Toàn bộ nội dung là <span className="text-ink-mid">dự báo do mô hình sinh</span>, không phải số đo.
                  Số đo nằm ở Tổng quan và Trung tâm cảnh báo.
                </li>
                <li>
                  Dựa trên <span className="data-num text-ink-mid">{basedOnLabel}</span> phản hồi đã qua tầng kiểm
                  soát tin cậy, theo bộ lọc đang áp dụng.
                </li>
                <li>Hệ thống không tự thực thi bước nào. Mọi hành động cần người có thẩm quyền phê duyệt.</li>
              </ul>
            </div>
          </aside>

        </div>
      )}
    </div>
  );
};

export default Analytics;
