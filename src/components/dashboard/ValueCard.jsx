import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { fmtInt, fmtDec } from '../../lib/format';

/**
 * CUSTOMER RADAR GIÚP SHOP ĐƯỢC BAO NHIÊU (30 ngày, GET /api/value)
 * Ba cột: doanh thu đang có rủi ro, khiếu nại tránh được đã đo, livestream.
 * Cách tính nằm trong phần gập "Cách tính", không viết thành chữ nhỏ.
 */
const money = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return `${fmtDec(n / 1e9, 1)} tỉ đ`;
  if (n >= 1e6) return `${fmtDec(n / 1e6, 1)} triệu đ`;
  return `${fmtInt(Math.round(n / 1000))} nghìn đ`;
};

const Col = ({ label, value, sub, tone }) => (
  <div className="min-w-0 border-t border-line-soft pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5 first:border-0 first:pl-0 first:pt-0">
    <p className="text-sm text-ink-mid">{label}</p>
    <p className={`mt-1 tabular-nums text-metric leading-none font-semibold ${tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : 'text-ink-hi'}`}>{value}</p>
    {sub && <p className="mt-1.5 text-sm text-ink-mid">{sub}</p>}
  </div>
);

const ValueCard = () => {
  const [v, setV] = useState(null);
  useEffect(() => {
    let alive = true;
    axios.get('/value').then((r) => alive && setV(r.data)).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!v) return null;
  const { atRisk, saved, live } = v;
  if (!atRisk.amount && !saved.measured && !saved.pending && !live.sessions) return null;

  return (
    <section aria-labelledby="value-title" className="glass-strong mb-8 rounded-surf p-5 sm:p-6">
      <h2 id="value-title" className="text-heading font-semibold text-ink-hi">Customer Radar giúp shop trong {v.windowDays} ngày</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Col
          label="Doanh thu đang có rủi ro"
          value={atRisk.amount ? money(atRisk.amount) : '—'}
          tone={atRisk.amount ? 'crit' : undefined}
          sub={atRisk.alerts ? `${fmtInt(atRisk.alerts)} cảnh báo chưa xử lý${atRisk.lowerBound ? ', con số cận dưới' : ''}` : 'Không có cảnh báo nào đang chờ'}
        />
        <Col
          label="Khiếu nại tránh được"
          value={saved.measured ? fmtInt(saved.complaintsAvoided) : '—'}
          tone={saved.complaintsAvoided ? 'ok' : undefined}
          sub={saved.measured
            ? `${saved.amount ? `khoảng ${money(saved.amount)}, ` : ''}${fmtInt(saved.improved)}/${fmtInt(saved.measured)} kế hoạch làm giảm khiếu nại`
            : saved.pending ? `${fmtInt(saved.pending)} kế hoạch đang chờ đủ ngày đo` : 'Chưa có kế hoạch nào được chấp nhận'}
        />
        <Col
          label="Livestream"
          value={live.sessions ? money(live.revenue) : '—'}
          sub={live.sessions
            ? `${fmtInt(live.sessions)} phiên${live.lostFlagged ? `, báo kịp ${money(live.lostFlagged)} lỡ vì hết hàng` : ''}${live.actionsDone ? `, ${fmtInt(live.actionsDone)} việc gấp đã làm` : ''}`
            : 'Chưa có phiên live nào'}
        />
      </div>
      <details className="group mt-4 border-t border-line-soft">
        <summary className="cursor-pointer list-none rounded-ctrl pt-3 text-sm font-medium text-ink-mid hover:text-ink-hi">Cách tính</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-mid">
          <li>Doanh thu rủi ro: tổng giá trị đơn đứng sau các cảnh báo chưa xử lý; phần không có mã đơn được ngoại suy từ phần có.</li>
          <li>Khiếu nại tránh được: với kế hoạch đã chấp nhận và đủ ngày đo, lấy tỉ lệ khiếu nại trước trừ sau, nhân số phản hồi sau. Quy ra tiền bằng giá trị đơn trung bình{saved.avgOrderValue ? ` (${money(saved.avgOrderValue)})` : ''}. Cảnh báo gắn một sản phẩm thì chỉ tính phần giảm vượt nhịp chung của các sản phẩm khác cùng kỳ{saved.controlled ? ` (${fmtInt(saved.controlled)}/${fmtInt(saved.measured)} kế hoạch có đối chứng)` : ''}.</li>
          <li>Livestream: doanh thu ước tính từ lượt chốt trên bình luận; doanh thu lỡ là lượt chốt đến sau khi biến thể đã hết, đã được báo trong phiên.</li>
        </ul>
      </details>
    </section>
  );
};

export default ValueCard;
