import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Drawer, Button, EvidenceBar, EvidenceLegend } from '../ui';
import { fmtInt, fmtPct, fmtDate, LABELLER_LABEL } from '../../lib/format';

/**
 * NGĂN KÉO "VÌ SAO TIN ĐƯỢC?"
 * ------------------------------------------------------------------
 * Mở từ bất kỳ thẻ chỉ số nào. Đọc theo thứ tự một người hoài nghi sẽ hỏi:
 *   1. Con số này tính thế nào     — công thức bằng lời, với số thật
 *   2. Nó đứng trên những gì        — thành phần bằng chứng
 *   3. Ai quyết định nội dung       — nguồn gán nhãn (AI nào, hay người)
 *   4. Cho tôi đọc thử              — vài phản hồi gốc
 *   5. Số liệu cho người phân tích  — tử số, mẫu số, cỡ mẫu
 */

const nf2fmt = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf2 = (v) => (v == null || !Number.isFinite(v) ? '—' : nf2fmt.format(v));

const METRICS = {
  wcr: {
    title: 'Tỉ lệ khiếu nại',
    mixKey: 'reconcilableComplaints',
    scope: 'khiếu nại trên kênh có đơn hàng để đối chiếu',
    formula: (s) => {
      const w = s?.weightedComplaintRate;
      if (!w?.available) return w?.reason || 'Chưa có dữ liệu giao dịch làm mẫu số, nên chỉ số này không được tính.';
      return `Cộng trọng số tin cậy của các khiếu nại trên kênh gắn được đơn hàng (được ${nf2(w.numerator)}), rồi chia cho ${fmtInt(w.denominator)} giao dịch. Khiếu nại của người mua đã xác nhận có trọng số 1; bình luận ẩn danh chỉ 0,15; trọng số giảm một nửa sau mỗi ${s?.halfLifeDays ?? 30} ngày.`;
    },
    stats: (s) => {
      const w = s?.weightedComplaintRate;
      return [
        ['Tử số (tổng trọng số khiếu nại)', nf2(w?.numerator)],
        ['Mẫu số (giao dịch)', fmtInt(w?.denominator)],
        ['Cỡ mẫu (phản hồi có chứng từ)', fmtInt(w?.sampleSize)],
        ['Độ phủ đối soát', fmtPct(w?.coverage, 0)]
      ];
    }
  },
  negative: {
    title: 'Khách không hài lòng',
    mixKey: 'complaints',
    scope: 'phản hồi tiêu cực',
    formula: (s) => {
      const n = s?.shareOfNegative;
      return `Tổng trọng số phản hồi tiêu cực (${nf2(n?.numerator)}) chia cho tổng trọng số mọi phản hồi hợp lệ (${nf2(n?.denominator)}), kể cả lời khen ngắn kiểu “hàng tốt”. Trọng số giảm một nửa sau mỗi ${s?.halfLifeDays ?? 30} ngày. Dùng được cho cả kênh không gắn đơn hàng như Facebook hay TikTok.`;
    },
    stats: (s) => {
      const n = s?.shareOfNegative;
      return [
        ['Tử số', nf2(n?.numerator)],
        ['Mẫu số', nf2(n?.denominator)],
        ['Cỡ mẫu', fmtInt(n?.sampleSize)]
      ];
    }
  },
  velocity: {
    title: 'Tốc độ tăng phản hồi tiêu cực',
    mixKey: 'recentComplaints',
    scope: 'phản hồi tiêu cực trong 7 ngày gần nhất',
    formula: (s) => {
      const v = s?.negativeVelocity;
      return `Số phản hồi tiêu cực mỗi ngày trong 7 ngày gần nhất (${nf2(v?.ratePerDayCurrent)}/ngày) so với 21 ngày trước đó (${nf2(v?.ratePerDayBaseline)}/ngày).`;
    },
    stats: (s) => {
      const v = s?.negativeVelocity;
      return [
        ['Tiêu cực mỗi ngày, 7 ngày qua', nf2(v?.ratePerDayCurrent)],
        ['Tiêu cực mỗi ngày, nền', nf2(v?.ratePerDayBaseline)],
        ['Cỡ mẫu 7 ngày / nền', `${fmtInt(v?.windowSample)} / ${fmtInt(v?.baselineSample)}`]
      ];
    }
  },
  health: {
    title: 'Độ tin số liệu',
    mixKey: 'all',
    scope: 'phản hồi hợp lệ',
    formula: () =>
      'Điểm gồm bốn phần: tỉ lệ phản hồi vượt qua Trust Layer (40%), số kênh đang có dữ liệu (20%), độ mới của lần thu thập gần nhất (20%) và tỉ lệ đối soát được với giao dịch (20%).',
    stats: (s) => {
      const c = s?.healthComponents || {};
      return [
        ['Vượt qua Trust Layer', c.passRate != null ? `${c.passRate}%` : '—'],
        ['Độ phủ kênh', c.channelCoverage != null ? `${c.channelCoverage}%` : '—'],
        ['Độ mới', c.freshness != null ? `${c.freshness}%` : '—'],
        ['Đối soát giao dịch', c.reconciliation != null ? `${c.reconciliation}%` : '—']
      ];
    }
  }
};

const Section = ({ title, children }) => (
  <section className="border-b border-line-soft py-5 first:pt-0 last:border-b-0">
    <h3 className="mb-3 text-sm font-semibold text-ink-hi">{title}</h3>
    {children}
  </section>
);

const sampleBadge = (s) => {
  if (s.humanLabel) return { text: 'Người đã duyệt', strong: true };
  if (s.verifiedPurchase) return { text: 'Sàn xác nhận đã mua', strong: true };
  if (s.hasOrder) return { text: 'Đã mua thật', strong: true };
  if (s.tier === 'P2') return { text: 'Tài khoản đã định danh', strong: true };
  return { text: `Chưa đối soát, hạng ${s.tier}`, strong: false };
};

const EvidenceDrawer = ({ metric, stats, onClose }) => {
  // Kết quả kiểm tra ngẫu nhiên do người làm: bằng chứng độc lập với AI
  const [audit, setAudit] = useState(null);
  useEffect(() => {
    if (!metric) return;
    axios.get('/audit/summary').then((r) => setAudit(r.data)).catch(() => setAudit(null));
  }, [metric]);
  const navigate = useNavigate();
  const m = METRICS[metric];
  const ev = stats?.evidence;
  const mix = m && ev ? ev[m.mixKey] : null;
  const labels = Object.entries(mix?.labels || {}).sort((a, b) => b[1] - a[1]);
  const go = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <Drawer
      open={Boolean(m)}
      onClose={onClose}
      title={m ? `Vì sao tin được: ${m.title.toLowerCase()}` : ''}
      subtitle={m ? `Dựa trên ${fmtInt(mix?.total)} ${m.scope}` : ''}
      width={560}
      footer={
        <>
          <Button variant="ghost" iconRight={ArrowUpRight} onClick={() => go('/feedbacks')}>Xem toàn bộ phản hồi</Button>
          <Button icon={ShieldCheck} onClick={() => go('/trust')}>Mở hàng chờ kiểm duyệt</Button>
        </>
      }
    >
      {m && (
        <>
          <Section title="Con số này tính thế nào">
            <p className="text-sm leading-relaxed text-ink-mid">{m.formula(stats)}</p>
          </Section>

          <Section title="Đứng trên những phản hồi nào">
            <EvidenceBar mix={mix} height={10} showCaption={false} className="mb-4" />
            <EvidenceLegend mix={mix} />
            <p className="mt-4 text-xs leading-relaxed text-ink-lo">
              {mix?.human
                ? `Người kiểm duyệt đã đọc lại ${fmtInt(mix.human)} phản hồi trong phạm vi này.`
                : 'Chưa có phản hồi nào trong phạm vi này được người kiểm duyệt đọc lại. Duyệt ở hàng chờ để phần gạch chéo nhỏ lại.'}
            </p>
          </Section>

          <Section title="Người kiểm tra lại AI">
            {audit?.n ? (
              <p className="text-sm leading-relaxed text-ink-mid">
                Người đã đọc <b className="text-ink-hi">{fmtInt(audit.n)}</b> phản hồi lấy ngẫu nhiên: AI xếp đúng nhóm vấn đề{' '}
                <b className="text-ink-hi">{fmtPct(audit.category.p, 0)}</b> (khoảng tin cậy 95%: {fmtPct(audit.category.low, 0)} – {fmtPct(audit.category.high, 0)}),
                đoán đúng cảm xúc <b className="text-ink-hi">{fmtPct(audit.sentiment.p, 0)}</b> ({fmtPct(audit.sentiment.low, 0)} – {fmtPct(audit.sentiment.high, 0)}).
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-mid">Chưa có đợt kiểm tra nào. Người kiểm tra phản hồi ngẫu nhiên ở trang Tin cậy dữ liệu, tab Kiểm tra ngẫu nhiên.</p>
            )}
            <button type="button" onClick={() => go('/trust?tab=audit')} className="mt-2 text-xs font-semibold text-accent hover:underline">
              Mở trang kiểm tra ngẫu nhiên
            </button>
          </Section>

          <Section title="Ai gán nhãn nội dung">
            <p className="mb-3 text-xs leading-relaxed text-ink-lo">
              Phần trên trả lời “phản hồi có thật không”. Phần này trả lời “phản hồi nói về vấn đề gì”: ai đã đọc và xếp nó vào khiếu nại, cảm xúc, nguyên nhân.
            </p>
            <ul className="flex list-none flex-col gap-1.5">
              {labels.map(([by, n]) => (
                <li key={by} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-mid">{LABELLER_LABEL[by] || by}</span>
                  <span className="font-mono text-ink-hi">
                    {fmtInt(n)} <span className="text-ink-lo">({mix.total ? Math.round((n / mix.total) * 100) : 0}%)</span>
                  </span>
                </li>
              ))}
              {!labels.length && <li className="text-sm text-ink-lo">Không có dữ liệu</li>}
            </ul>
          </Section>

          {ev?.samples?.length > 0 && (
            <Section title="Đọc thử phản hồi gốc">
              <p className="mb-3 text-xs text-ink-lo">Năm khiếu nại mới nhất trong phạm vi đang lọc, nguyên văn (tên người mua đã che).</p>
              <ul className="flex list-none flex-col gap-2.5">
                {ev.samples.map((s) => {
                  const b = sampleBadge(s);
                  return (
                    <li key={String(s._id)} className="rounded-lg border border-line-soft p-3">
                      <p className="text-sm leading-relaxed text-ink-hi">“{s.text}”</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-lo">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${b.strong ? 'bg-accent-dim text-accent-hi' : 'bg-raised text-ink-mid'}`}>{b.text}</span>
                        <span>{s.source}</span>
                        <span className="font-mono">{fmtDate(s.timestamp)}</span>
                        {s.rating != null && <span className="font-mono">{s.rating}★</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <Section title="Số liệu cho người phân tích">
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
              {m.stats(stats).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-ink-mid">{k}</dt>
                  <dd className="font-code text-right text-ink-hi">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
          </Section>
        </>
      )}
    </Drawer>
  );
};

export default EvidenceDrawer;
