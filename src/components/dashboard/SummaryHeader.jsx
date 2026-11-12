import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Check, TriangleAlert } from 'lucide-react';
import { Button } from '../ui';
import { fmtDate, fmtDateTime, fmtInt } from '../../lib/format';

/**
 * CÂU TRẢ LỜI ĐỨNG TRƯỚC, CUỐN SỔ ĐỐI CHIẾU ĐỨNG NGAY CẠNH
 * ------------------------------------------------------------------
 * Đầu trang, trên nền giấy. Bên trái: một câu nói hôm nay có mấy việc và
 * việc nào gấp nhất. Bên phải: phép tính từ số phản hồi thu thập được tới số
 * được đưa vào chỉ số — bao nhiêu bị loại vì rác, vì nghi ảo, còn lại bao
 * nhiêu, trong đó bao nhiêu có chứng từ. Đây là thứ các công cụ khác không
 * cho người dùng thấy: con số nào cũng truy được về nguồn.
 *
 * Sổ đọc từ /trust/health (cả kho, không theo bộ lọc) để phép cộng trừ khớp
 * từng đơn vị; phần "có chứng từ" chỉ hiện khi không lọc, vì nó đến từ /stats.
 */

const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const LedgerRow = ({ label, value, sign }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_1rem_auto] items-baseline gap-x-2 border-b border-(--sheet-rule) py-2">
    <dt className="min-w-0 text-ink-mid">{label}</dt>
    <dd className="text-right tabular-nums text-ink-lo" aria-hidden={!sign}>{sign || ''}</dd>
    <dd className="text-right tabular-nums  text-ink-hi">{fmtInt(value)}</dd>
  </div>
);

/**
 * Sổ đối chiếu: thu thập, trừ phần bị loại, ra số được tính; trong đó bao
 * nhiêu có chứng từ. Dòng cuối tự cộng trừ lại các dòng phía trên: khớp thì
 * đóng dấu, lệch thì nói lệch bao nhiêu. Không có chỗ nào để con số "đẹp" hơn.
 */
export const Ledger = ({ ledger, evidence, showLink = true }) => {
  if (!ledger) {
    return <div className="h-64 animate-pulse rounded-ctrl border border-line bg-(--sheet)" aria-hidden="true" />;
  }
  const { rawCollected, spamRemoved, inauthenticFlagged, pendingReview, validForAnalysis, countedForMetrics } = ledger;
  // Con số cuối là số phản hồi góp vào chỉ số, khớp với mọi trang khác. Phần
  // chênh với số qua bộ lọc là phản hồi quá cũ, trọng số đã giảm về 0.
  const counted = countedForMetrics ?? validForAnalysis;
  // ledger (máy chủ mới): phản hồi chờ duyệt còn trọng số được tính tạm, không trừ
  const split = ledger.ledger;
  const aged = split ? split.aged : Math.max(0, validForAnalysis - counted);
  const pendingOut = split ? split.pendingNotCounted : (pendingReview?.count ?? 0);
  const verifiedShare = evidence?.total ? (evidence.verified + evidence.human) / evidence.total : null;
  const pct = verifiedShare == null ? null : Math.round(verifiedShare * 100);
  const removed = (spamRemoved?.count ?? 0) + (inauthenticFlagged?.count ?? 0) + pendingOut + aged;
  const diff = rawCollected - removed - counted;
  return (
    <figure className="rounded-ctrl border border-line bg-(--sheet) px-5 pt-4 pb-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-ink-hi">Số liệu này đứng trên gì</span>
        {showLink && <Link to="/trust" className="shrink-0 text-sm font-medium text-accent-hi underline-offset-4 hover:underline">Xem phễu</Link>}
      </figcaption>
      <dl className="mt-2 text-sm">
        <LedgerRow label="Phản hồi thu thập được" value={rawCollected} />
        <LedgerRow label="Rác, quảng cáo" value={spamRemoved?.count ?? 0} sign="−" />
        <LedgerRow label="Nghi đánh giá ảo" value={inauthenticFlagged?.count ?? 0} sign="−" />
        {pendingOut > 0 && <LedgerRow label={split?.pendingCounted ? 'Chờ duyệt, chưa tính' : 'Chờ người duyệt'} value={pendingOut} sign="−" />}
        {aged > 0 && <LedgerRow label="Quá cũ, không còn trọng số" value={aged} sign="−" />}
        {/* Gạch đôi trên dòng tổng, như sổ kế toán */}
        <div className="mt-px grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 border-0 border-t-[3px] border-double border-ink-lo pt-2.5">
          <dt className="font-semibold text-ink-hi">Được tính vào chỉ số</dt>
          <dd className="text-right tabular-nums text-metric font-semibold tracking-[-0.02em]  text-ink-hi">{fmtInt(counted)}</dd>
        </div>
      </dl>
      <p role="status" className={`mt-3 flex items-start gap-2 text-sm leading-snug ${diff === 0 ? 'text-ink-mid' : 'text-crit'}`}>
        {diff === 0 ? (
          <>
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-accent text-accent-hi" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
            <span>
              Phép trừ khớp: {fmtInt(rawCollected)} trừ {fmtInt(removed)} đúng bằng {fmtInt(counted)}
              {split?.pendingCounted > 0 && `. ${fmtInt(split.pendingCounted)} phản hồi chờ duyệt vẫn được tính tạm theo trọng số`}
            </span>
          </>
        ) : (
          <>
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Phép trừ lệch {fmtInt(Math.abs(diff))} phản hồi so với số được tính</span>
          </>
        )}
      </p>
      {pct != null && (
        <div className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-ctrl bg-raised" aria-hidden="true">
            <span className="h-full bg-accent" style={{ flexBasis: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm leading-snug text-ink-mid">
            <span className="font-semibold text-ink-hi">{pct}%</span> có chứng từ hoặc người đã duyệt, {100 - pct}% do AI đoán
          </p>
        </div>
      )}
    </figure>
  );
};

const todayLabel = () => {
  const s = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** todo: danh sách việc đã gộp và xếp (TodayInbox.buildTodo) */
const SummaryHeader = ({ stats, todo = [], loading, error, lastUpdated, ledger, evidence }) => {
  const navigate = useNavigate();
  const top = todo[0];
  const urgent = todo.filter((t) => t.severity === 'critical').length;
  const real = stats?.workspace === 'real';

  let sentence;
  if (error) {
    sentence = 'Không kết nối được máy chủ phân tích. Số liệu bên dưới có thể đã cũ.';
  } else if (loading && !stats) {
    sentence = 'Đang tải dữ liệu…';
  } else if (top) {
    sentence = (
      <>
        Hôm nay có {todo.length} việc cần làm{urgent ? `, ${urgent} việc khẩn` : ''}. Gấp nhất: {lower1(top.title)}.
      </>
    );
  } else {
    sentence = 'Hôm nay không có việc nào cần làm. Mọi chỉ số đang trong ngưỡng bình thường.';
  }

  const asOfLine = real
    ? `Dữ liệu thật thu thập từ sàn, tên người mua đã che. Tính đến đánh giá mới nhất ngày ${fmtDate(stats.asOf)}${stats.ingestedAt ? `, thu thập lần gần nhất ${fmtDateTime(stats.ingestedAt)}` : ''}.`
    : loading ? 'Dữ liệu mô phỏng, đang tải.' : `Dữ liệu mô phỏng, cập nhật lúc ${lastUpdated}.`;

  return (
    <section aria-labelledby="summary-title" className="mb-8 border-b border-line pt-4 pb-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p className="text-sm text-ink-mid"><time>{todayLabel()}</time></p>
          <h1 id="summary-title" className="mt-3 max-w-[30ch] text-display font-semibold tracking-[-0.02em] text-ink-hi" aria-live="polite">
            {sentence}
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            {top && (
              <Button onClick={() => document.getElementById('today')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                Xem việc hôm nay
              </Button>
            )}
            <Button variant="secondary" icon={RefreshCw} onClick={() => navigate('/data')}>
              Thu thập dữ liệu mới
            </Button>
          </div>
          <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-ink-lo">{asOfLine}</p>
        </div>
        <Ledger ledger={ledger} evidence={evidence} />
      </div>
    </section>
  );
};

export default SummaryHeader;
