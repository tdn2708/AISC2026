import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown, TriangleAlert, CalendarCheck2 } from 'lucide-react';
import { GlassPanel, PanelHeader, Stat, Badge, Button, ChartTooltip, EmptyState } from '../ui';
import { fmtInt, fmtRate, fmtDec, fmtDate } from '../../lib/format';
import { AXIS_TICK } from '../../lib/tokens';
import { BarGrow, ChartReveal, STAGGER_STEP, useReducedMotion } from '../motion';

const fmtVnd = (n) => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${fmtDec(n / 1e9, 2)} tỉ đ`;
  if (n >= 1e6) return `${fmtDec(n / 1e6, 1)} triệu đ`;
  return `${fmtInt(Math.round(n))} đ`;
};

const fmtCi = (w) => {
  if (!w || w.rate == null || w.n <= 0) return '—';
  return `${fmtRate(w.low)} đến ${fmtRate(w.high)} (n=${fmtInt(w.n)})`;
};

const HourTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <ChartTooltip title={`Khung ${label} giờ`}>
      <p><span className="font-semibold text-ink-hi">{fmtInt(row.orders)}</span> đơn đặt ({String(row.sharePct ?? 0).replace('.', ',')}%)</p>
      <p>Đơn hủy: <span className="font-semibold text-neg">{fmtInt(row.cancelled)}</span></p>
      {row.unpaidCancelled > 0 && (
        <p>Chưa thanh toán: <span className="font-semibold text-high">{fmtInt(row.unpaidCancelled)}</span></p>
      )}
    </ChartTooltip>
  );
};

function buildHeadline(summary, cancelGroups) {
  if (!summary) return '';
  const period = summary.dateRange?.fromDay && summary.dateRange?.toDay
    ? `Từ ${summary.dateRange.fromDay.slice(8, 10)}/${summary.dateRange.fromDay.slice(5, 7)} đến ${summary.dateRange.toDay.slice(8, 10)}/${summary.dateRange.toDay.slice(5, 7)}`
    : 'Kỳ hiện tại';
  const topGrp = (cancelGroups || [])[0];
  let tail = '';
  if (topGrp && topGrp.lines > 0) {
    if (topGrp.key === 'edit' && topGrp.share >= 0.4) {
      tail = '; gần một nửa số hủy là khách sửa đơn';
    } else {
      tail = `; nhóm hủy nhiều nhất là ${topGrp.label.toLowerCase()} (${fmtRate(topGrp.share, 0)})`;
    }
  }
  return `${period}: ${fmtInt(summary.totalOrders)} đơn hàng, ${fmtRate(summary.cancelRate, 1)} bị hủy${tail}.`;
}

const OrdersTab = ({ data }) => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [showStats, setShowStats] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);

  if (!data?.hasOrders || !data.summary) {
    return (
      <GlassPanel>
        <EmptyState
          title="Chưa có dữ liệu đơn hàng"
          description="Nạp file đơn hàng xuất từ trang người bán để xem phân tích hủy đơn, hoàn trả và kế hoạch ngày sale."
          action={<Button onClick={() => navigate('/data?tab=file')}>Nạp file đơn hàng</Button>}
        />
      </GlassPanel>
    );
  }

  const { summary, cancelGroups = [], repurchase, byModel = [], byTag = [], saleDays = [], handover, nextSalePlan, cancelModel, limitations = [] } = data;
  const biggestSale = saleDays[0] || null;
  const maxGroupLines = cancelGroups.reduce((m, g) => Math.max(m, g.lines), 0);
  const visibleModels = showAllModels ? byModel : byModel.slice(0, 15);
  const showCancelModel = Boolean(
    cancelModel &&
    cancelModel.passedThreshold === true &&
    cancelModel.auc >= 0.65 &&
    cancelModel.testCount >= 300 &&
    Array.isArray(cancelModel.topFactors) &&
    cancelModel.topFactors.length > 0
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Khối 1: Câu tóm tắt và chỉ số chính */}
      <GlassPanel tone="strong" className="p-6">
        <p className="text-display font-semibold text-ink-hi">{buildHeadline(summary, cancelGroups)}</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Đơn hoàn tất"
            value={fmtInt(summary.completedOrders)}
            sub={`trên ${fmtInt(summary.totalOrders)} đơn${summary.shippingOrders ? `, ${fmtInt(summary.shippingOrders)} đang giao` : ''}`}
          />
          <Stat
            label="Đơn bị hủy"
            value={fmtRate(summary.cancelRate, 1)}
            sub={`${fmtInt(summary.cancelledOrders)} đơn, giá trị ${fmtVnd(summary.cancelledValue)}`}
          />
          <Stat
            label="Doanh thu đơn xong"
            value={fmtVnd(summary.completedRevenue)}
            sub={summary.avgOrderValue ? `trung bình ${fmtInt(summary.avgOrderValue)} đ, trung vị ${fmtInt(summary.medianOrderValue)} đ` : '—'}
          />
          <Stat
            label="Trả hàng hoặc hoàn tiền"
            value={fmtInt(summary.returnOrders)}
            sub={`trên ${fmtInt(summary.completedOrders + summary.shippingOrders)} đơn không hủy (${fmtRate(summary.returnWilson?.rate, 1)})`}
          />
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-xs text-ink-mid">
          {repurchase?.totalCancelledLines > 0 && (
            <div className="flex gap-1.5">
              <dt className="text-ink-lo">Mua lại đúng mã sau hủy</dt>
              <dd className="tabular-nums font-semibold text-ink-hi">
                {fmtInt(repurchase.repurchasedLines)}/{fmtInt(repurchase.totalCancelledLines)} dòng ({fmtRate(repurchase.wilson?.rate, 0)})
              </dd>
            </div>
          )}
          {summary.preOrders?.total > 0 && (
            <div className="flex gap-1.5">
              <dt className="text-ink-lo">Hàng đặt trước</dt>
              <dd className="tabular-nums font-semibold text-ink-hi">
                {fmtInt(summary.preOrders.total)} đơn, hủy {fmtRate(summary.preOrders.cancelWilson?.rate, 0)} (đơn thường {fmtRate(summary.preOrders.normalCancelWilson?.rate, 0)})
              </dd>
            </div>
          )}
          {handover?.overall?.count > 0 && (
            <div className="flex gap-1.5">
              <dt className="text-ink-lo">Thời gian bàn giao vận chuyển</dt>
              <dd className="tabular-nums font-semibold text-ink-hi">
                trung vị {fmtDec(handover.overall.medianHours, 1)} giờ, 90% dưới {fmtDec(handover.overall.p90Hours, 1)} giờ (n={fmtInt(handover.overall.count)})
              </dd>
            </div>
          )}
          {summary.buyers?.unique > 0 && (
            <div className="flex gap-1.5">
              <dt className="text-ink-lo">Người mua (ẩn danh)</dt>
              <dd className="tabular-nums font-semibold text-ink-hi">
                {fmtInt(summary.buyers.unique)} người, {fmtInt(summary.buyers.repeat)} người đặt từ 2 đơn
              </dd>
            </div>
          )}
        </dl>
      </GlassPanel>

      {/* Khối 2: 5 nhóm lý do hủy & biểu đồ đơn theo giờ ngày sale lớn nhất */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <GlassPanel tone="strong" className="p-6">
          <PanelHeader
            title="Nhóm lý do hủy đơn"
            subtitle={`Tính trên ${fmtInt(repurchase?.totalCancelledLines ?? 0)} dòng sản phẩm bị hủy và tỉ lệ khách đặt lại đúng mã hàng sau đó`}
          />
          <div className="flex flex-col gap-3">
            {cancelGroups.map((g, idx) => (
              <div key={g.key} className="border-b border-line-soft pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink-hi">{g.label}</span>
                  <span className="tabular-nums text-xs text-ink-mid">
                    <b className="font-semibold text-ink-hi">{fmtInt(g.lines)}</b> dòng ({fmtRate(g.share, 1)})
                    {g.repurchaseRate != null ? `, mua lại ${fmtRate(g.repurchaseRate, 0)}` : ''}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                  <BarGrow
                    value={maxGroupLines ? Math.max(0.02, g.lines / maxGroupLines) : 0}
                    className={`rounded-full ${g.key === 'edit' ? 'bg-accent' : 'bg-neg'}`}
                    style={reduced ? undefined : { transitionDelay: `${Math.min(idx, 6) * STAGGER_STEP}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {byTag.some((t) => t.key !== 'regular' && t.totalLines > 0) && (
            <div className="mt-5 border-t border-line-soft pt-4">
              <p className="mb-2 text-xs font-semibold text-ink-mid">Tỉ lệ hủy theo nhãn đăng bán</p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {byTag.filter((t) => t.totalLines > 0).map((t) => (
                  <div key={t.key} className="rounded-ctrl bg-raised px-3 py-2">
                    <dt className="text-xs text-ink-lo">{t.label}</dt>
                    <dd className="mt-0.5 tabular-nums text-sm font-semibold text-ink-hi">
                      {fmtRate(t.cancelRate, 0)} <span className="text-xs font-normal text-ink-mid">({fmtInt(t.cancelledLines)}/{fmtInt(t.totalLines)})</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </GlassPanel>

        <GlassPanel tone="strong" className="p-6">
          <PanelHeader
            title={biggestSale ? `Đơn theo giờ ngày sale ${biggestSale.label}` : 'Phân bố đơn theo ngày sale'}
            subtitle={biggestSale
              ? `${fmtInt(biggestSale.orders)} đơn trong ngày ${biggestSale.label} (gấp từ 3 lần mức trung vị ${fmtInt(biggestSale.medianDailyOrders)} đơn/ngày), hủy ${fmtRate(biggestSale.cancelWilson?.rate, 0)}`
              : 'Chưa có ngày nào vượt ngưỡng gấp 3 lần trung vị đơn ngày thường'}
          />
          {biggestSale ? (
            <ChartReveal className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={biggestSale.byHour} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                  <XAxis dataKey="hour" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(h) => `${h}h`} minTickGap={12} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={56} tickFormatter={(v) => fmtInt(v)} />
                  <Tooltip content={<HourTooltip />} cursor={{ fill: 'var(--raised)' }} />
                  <Bar dataKey="orders" name="Tổng đơn" fill="var(--viz-1)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="cancelled" name="Đơn hủy" fill="var(--viz-neg)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartReveal>
          ) : (
            <p className="py-10 text-sm text-ink-lo">Cần ít nhất một ngày sale đột biến để vẽ biểu đồ theo khung giờ.</p>
          )}
        </GlassPanel>
      </div>

      {/* Khối 3: Bảng theo mã máy */}
      <GlassPanel tone="strong" className="reveal overflow-hidden p-6">
        <PanelHeader
          title="Đơn hàng, hủy, hoàn trả và lời chê theo mã máy"
          subtitle="Ước lượng lời chê trên 1.000 sản phẩm bán ra nối chéo kênh bằng mã máy, chỉ tính khi có từ 50 dòng đơn và 20 đánh giá"
        />
        <div className="paper">
          <div className="scroll-hint-x overflow-x-auto">
            <table className="data-table min-w-[780px]">
              <thead>
                <tr>
                  <th className="pl-4">Mã máy / Sản phẩm</th>
                  <th className="text-right">Dòng đơn</th>
                  <th className="text-right">Tỉ lệ hủy</th>
                  <th>Lý do hủy chính</th>
                  <th className="text-right">Hoàn trả</th>
                  <th className="pr-4 text-right">Lời chê cùng mã</th>
                </tr>
              </thead>
              <tbody>
                {visibleModels.map((m) => (
                  <tr key={m.key}>
                    <td className="pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {m.modelCode && <span className="font-mono text-xs font-semibold text-accent-hi">{m.modelCode}</span>}
                        {m.cancelFlag && <Badge tone="crit" icon={TriangleAlert}>Hủy cao</Badge>}
                        {m.returnFlag && <Badge tone="high" icon={TriangleAlert}>Trả cao</Badge>}
                      </div>
                      <p className="max-w-[300px] truncate text-sm text-ink-hi" title={m.name}>{m.name}</p>
                    </td>
                    <td className="text-right tabular-nums text-sm text-ink-hi">{fmtInt(m.totalLines)}</td>
                    <td className="text-right tabular-nums text-sm">
                      <span className={m.cancelFlag ? 'font-semibold text-crit' : 'text-ink-hi'}>
                        {fmtRate(m.cancelRate, 0)}
                      </span>
                      <span className="ml-1 text-xs text-ink-lo">({fmtInt(m.cancelledLines)}/{fmtInt(m.totalLines)})</span>
                    </td>
                    <td className="max-w-[220px] truncate text-xs text-ink-mid" title={m.topCancelGroupLabel || ''}>
                      {m.topCancelGroupLabel || '—'}
                    </td>
                    <td className="text-right tabular-nums text-sm">
                      {m.activeLines > 0 ? (
                        <>
                          <span className={m.returnFlag ? 'font-semibold text-high' : 'text-ink-hi'}>
                            {fmtInt(m.returnLines)}/{fmtInt(m.activeLines)}
                          </span>
                          {m.returnLines > 0 && <span className="ml-1 text-xs text-ink-lo">({fmtRate(m.returnRate, 1)})</span>}
                        </>
                      ) : '—'}
                    </td>
                    <td className="pr-4 text-right tabular-nums text-sm text-ink-hi">
                      {m.complaintCount > 0 ? (
                        <>
                          <span>{fmtInt(m.complaintCount)} câu</span>
                          {m.crossChannelPer1000 != null && (
                            <span className="block text-xs text-ink-lo" title="Ước lượng chéo kênh trên 1.000 sản phẩm bán ra">
                              ước lượng {fmtDec(m.crossChannelPer1000, 1)}/1.000 bán
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {byModel.length > 15 && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowAllModels((v) => !v)}>
              {showAllModels ? 'Thu gọn danh sách' : `Xem đủ ${fmtInt(byModel.length)} mã máy`}
            </Button>
          </div>
        )}
      </GlassPanel>

      {/* Khối 4 (B6): Kế hoạch chuẩn bị ngày sale kế tiếp */}
      {nextSalePlan && (
        <GlassPanel tone="strong" className="reveal p-6">
          <PanelHeader
            title="Kế hoạch chuẩn bị ngày sale kế tiếp (12/12)"
            subtitle={`${nextSalePlan.basisNote}. Chỉ nêu tỉ trọng phần trăm theo giờ và việc chuẩn bị, không dự báo số đơn cụ thể.`}
            right={<Badge tone="accent" icon={CalendarCheck2}>{nextSalePlan.basisNote}</Badge>}
          />
          <ol className="flex list-none flex-col divide-y divide-line-soft">
            {nextSalePlan.prepTasks.map((task, idx) => (
              <li key={task.id} className="flex items-start gap-3.5 py-3.5 first:pt-0">
                <span className="grid size-7 shrink-0 place-items-center rounded-ctrl bg-raised tabular-nums text-sm font-semibold text-ink-hi">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink-hi">{task.title}</p>
                  <p className="mt-0.5 text-sm text-ink-mid">{task.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid gap-6 border-t border-line-soft pt-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-hi">10 mã máy chiếm tỉ trọng cao nhất ngày sale</h3>
              <div className="paper p-3">
                <ul className="flex list-none flex-col divide-y divide-line-soft text-xs">
                  {nextSalePlan.top10Models.map((m) => (
                    <li key={m.key} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                      <span className="min-w-0 truncate text-ink-hi" title={m.name}>
                        {m.modelCode ? <b className="font-semibold">{m.modelCode}</b> : m.name}
                        {m.modelCode ? ` (${m.name})` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-mid">
                        {fmtDec(m.sharePct, 1)}% lượng đặt, hủy {fmtRate(m.cancelRate, 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-hi">Tỉ trọng lượng đặt theo khung giờ (%)</h3>
              <div className="paper p-3">
                <ul className="grid list-none grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                  {nextSalePlan.hourlyShare.filter((h) => h.pct >= 2).map((h) => (
                    <li key={h.hour} className="flex items-baseline justify-between gap-2 border-b border-line-soft pb-1">
                      <span className="tabular-nums text-ink-mid">Khung {h.hour} giờ</span>
                      <span className="tabular-nums font-semibold text-ink-hi">{fmtDec(h.pct, 1)}%</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-lo">
                  Khung hủy chưa thanh toán cao nhất: {nextSalePlan.peakUnpaidWindow.label} ({fmtDec(nextSalePlan.peakUnpaidWindow.sharePct, 1)}% tổng đơn hủy chưa thanh toán ngày sale).
                </p>
              </div>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Khối 5 (B7 tùy chọn): Chỉ hiện khi mô hình logistic đạt AUC >= 0,65 và đơn kiểm >= 300 */}
      {showCancelModel && (
        <GlassPanel tone="strong" className="reveal p-6">
          <PanelHeader
            title="Yếu tố làm tăng nguy cơ hủy đơn"
            subtitle={`Rút từ hồi quy logistic trên đặc trưng lúc đặt đơn (kiểm trên ${fmtInt(cancelModel.testCount)} đơn từ ${fmtDate(cancelModel.splitAt)}). Không chấm điểm từng khách.`}
          />
          <ul className="flex list-none flex-col divide-y divide-line-soft">
            {cancelModel.topFactors.map((f) => (
              <li key={f.key} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                <span className="font-medium text-ink-hi">{f.label}</span>
                <span className="tabular-nums text-xs text-ink-mid">{f.effectWords}</span>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}

      {/* Giới hạn dữ liệu (công khai trung thực) & Số liệu kiểm định */}
      <GlassPanel tone="strong" className="reveal p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink-hi">Giới hạn dữ liệu và số liệu kiểm định</h3>
            <p className="text-xs text-ink-lo">Khoảng tin cậy Wilson 95% và cỡ mẫu từng chỉ số</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconRight={ChevronDown}
            onClick={() => setShowStats((v) => !v)}
            aria-expanded={showStats}
          >
            {showStats ? 'Ẩn số liệu kiểm định' : 'Số liệu kiểm định'}
          </Button>
        </div>

        {limitations.length > 0 && (
          <ul className="mt-4 flex list-none flex-col gap-1.5 text-xs leading-relaxed text-ink-mid">
            {limitations.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}

        {showStats && (
          <div className="paper mt-4 p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-[1fr_auto]">
              <dt className="text-ink-mid">Tỉ lệ hủy toàn bộ đơn (Wilson 95%)</dt>
              <dd className="font-code text-ink-hi">{fmtRate(summary.cancelWilson?.rate, 2)}: {fmtCi(summary.cancelWilson)}</dd>
              <dt className="text-ink-mid">Tỉ lệ hoàn trả trên đơn không hủy (Wilson 95%)</dt>
              <dd className="font-code text-ink-hi">{fmtRate(summary.returnWilson?.rate, 2)}: {fmtCi(summary.returnWilson)}</dd>
              {repurchase?.wilson?.n > 0 && (
                <>
                  <dt className="text-ink-mid">Tỉ lệ mua lại đúng mã hàng sau hủy (Wilson 95%)</dt>
                  <dd className="font-code text-ink-hi">{fmtRate(repurchase.wilson.rate, 2)}: {fmtCi(repurchase.wilson)}</dd>
                </>
              )}
              {byModel.filter((m) => m.flag).map((m) => (
                <React.Fragment key={`stat-${m.key}`}>
                  <dt className="text-ink-mid">Kiểm định mã {m.modelCode || m.name}</dt>
                  <dd className="font-code text-ink-hi">
                    {m.cancelFlag && m.cancelTest
                      ? `hủy ${fmtCi(m.cancelWilson)}, z=${fmtDec(m.cancelTest.z, 2)}, q=${fmtDec(m.cancelTest.qValue, 4)}`
                      : ''}
                    {m.cancelFlag && m.returnFlag ? '; ' : ''}
                    {m.returnFlag && m.returnTest
                      ? `trả ${fmtCi(m.returnWilson)}, z=${fmtDec(m.returnTest.z, 2)}, q=${fmtDec(m.returnTest.qValue, 4)}`
                      : ''}
                  </dd>
                </React.Fragment>
              ))}
              {showCancelModel && (
                <>
                  <dt className="text-ink-mid">Mô hình nguy cơ hủy (kiểm định theo thời gian)</dt>
                  <dd className="font-code text-ink-hi">
                    AUC={fmtDec(cancelModel.auc, 3)}, Brier={fmtDec(cancelModel.brier, 4)} (nền {fmtDec(cancelModel.baselineBrier, 4)}), n_train={fmtInt(cancelModel.trainCount)}, n_test={fmtInt(cancelModel.testCount)}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
      </GlassPanel>
    </div>
  );
};

export default OrdersTab;
