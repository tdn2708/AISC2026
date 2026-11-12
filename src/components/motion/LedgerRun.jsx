import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, TriangleAlert } from 'lucide-react';
import { fmtInt } from '../../lib/format';
import { normalizeLedger, buildLedgerRun, ledgerStateAt, rollerPositions, digitCount } from '../../lib/ledgerRun';
import { useReducedMotion } from './useReducedMotion';
import { useInView } from './useInView';
import { BarGrow } from './BarGrow';
import { Skeleton } from '../ui/Skeleton';
import { MOTION } from './tokens';

/**
 * PHÉP TRỪ CHẠY (chữ ký của Customer Radar, F2-04)
 * ------------------------------------------------------------------
 * Sổ đối chiếu dựng thành chuyển động: số thu thập hiện trước, từng dòng
 * rác, nghi ảo, chờ duyệt, quá cũ lần lượt hiện vào, số còn lại đếm lùi như
 * công tơ và dừng ĐÚNG ở số được tính (countedForMetrics), rồi "chốt".
 *
 * Cùng ngôn ngữ với sổ tĩnh (sổ đối chiếu ở Tổng quan, nay cũng là LedgerRun): tờ
 * sổ, kẻ dòng, gạch đôi trên dòng tổng, chữ số đều cột, số kiểu Việt.
 *
 * Hai chế độ:
 * - mode="auto": chạy một lần trong --motion-story khi tờ sổ vào khung nhìn.
 * - mode="scroll": trang ngoài truyền progress 0..1 (thanh cuộn), sổ đứng
 *   đúng trạng thái của tiến độ đó; tới 1 thì chốt.
 * Giảm chuyển động hoặc play={false}: bảng tĩnh đủ số ngay, không chạy.
 *
 * Kỹ thuật: mỗi khung hình chỉ đổi opacity và transform (dòng hiện vào, dải
 * chữ số trượt dọc), không đổi chữ, nên trình duyệt không phải dàn trang lại.
 * Trạng thái mặc định khi render là bảng đã chạy xong; JS chỉ đưa về đầu
 * trước khung hình đầu tiên nếu sắp chạy.
 *
 * Trình đọc màn hình chỉ đọc số cuối (dải chữ số aria-hidden, kèm chữ ẩn).
 */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const Row = React.forwardRef(({ label, value, sign }, ref) => (
  <div ref={ref} className="grid grid-cols-[minmax(0,1fr)_1rem_auto] items-baseline gap-x-2 border-b border-(--sheet-rule) py-2">
    <dt className="min-w-0 text-ink-mid">{label}</dt>
    <dd className="text-right font-mono text-ink-lo" aria-hidden={!sign}>{sign || ''}</dd>
    <dd className="text-right font-mono tabular-nums text-ink-hi">{fmtInt(value)}</dd>
  </div>
));
Row.displayName = 'LedgerRunRow';

/** Cấu trúc cột của bộ đếm: mỗi chữ số một cột, dấu chấm nghìn giữa các nhóm ba */
const rollerLayout = (slots) => {
  const out = [];
  for (let i = 0; i < slots; i += 1) {
    const place = slots - 1 - i;
    out.push({ kind: 'digit', slot: i });
    if (place > 0 && place % 3 === 0) out.push({ kind: 'sep', after: i });
  }
  return out;
};

const stripTransform = (pos) => `translateY(${(-pos * 100) / DIGITS.length}%)`;

export const LedgerRun = ({
  ledger,
  evidence,
  mode = 'auto',
  progress = 0,
  duration = MOTION.story,
  title = 'Số liệu này đứng trên gì',
  showLink = true,
  bare = false,
  play = true,
  onDone,
  className = ''
}) => {
  // Tính theo giá trị chứ không theo đối tượng: tải lại dữ liệu cùng số thì sổ không chạy lại
  const sig = JSON.stringify(normalizeLedger(ledger));
  const run = useMemo(() => buildLedgerRun(JSON.parse(sig)), [sig]);
  // play=false: hiện ngay số cuối như giảm chuyển động (trang chỉ cần bảng tĩnh)
  const reducedPref = useReducedMotion();
  const reduced = reducedPref || !play;
  const rootRef = useRef(null);
  const rowRefs = useRef({});
  const stripRefs = useRef([]);
  const slotRefs = useRef([]);
  const sepRefs = useRef([]);
  const numberRef = useRef(null);
  const checkRef = useRef(null);
  const playedRef = useRef(false);
  const settledRef = useRef(true);
  const [settled, setSettled] = useState(true);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const slots = run ? digitCount(Math.max(run.raw, run.counted)) : 1;
  const layout = useMemo(() => rollerLayout(slots), [slots]);
  const finalRoll = run ? rollerPositions(run.counted, slots) : null;

  /** Đặt cả tờ sổ về trạng thái của tiến độ p. Chỉ ghi style, không render React. */
  const apply = useCallback(
    (p, whole = false) => {
      if (!run) return;
      const st = ledgerStateAt(run, p);
      for (const [key, r] of Object.entries(st.reveal)) {
        const el = rowRefs.current[key];
        if (!el) continue;
        el.style.opacity = r >= 1 ? '' : String(r);
        el.style.transform = r >= 1 ? '' : `translateY(${((1 - r) * 6).toFixed(2)}px)`;
      }
      // whole: số nguyên (chế độ cuộn có thể dừng ở bất kỳ đâu, không để chữ số lưng chừng)
      const { positions, visible } = rollerPositions(whole ? st.shown : st.remaining, slots);
      positions.forEach((pos, i) => {
        const strip = stripRefs.current[i];
        if (strip) strip.style.transform = stripTransform(pos);
        const slot = slotRefs.current[i];
        if (slot) slot.style.opacity = visible[i] ? '' : '0';
      });
      layout.forEach((item, j) => {
        if (item.kind !== 'sep') return;
        const sep = sepRefs.current[j];
        if (sep) sep.style.opacity = visible[item.after] ? '' : '0';
      });
      if (checkRef.current) checkRef.current.style.opacity = st.settle >= 1 ? '' : String(st.settle);
      if (st.done !== settledRef.current) {
        settledRef.current = st.done;
        setSettled(st.done);
      }
    },
    [run, slots, layout]
  );

  const live = mode === 'auto' ? !reduced : mode === 'scroll' && !reduced;
  const inView = useInView(rootRef, { threshold: 0.35, enabled: mode === 'auto' && !reduced && Boolean(run) });

  // Trước khung hình đầu: chế độ cuộn đứng đúng tiến độ; tự chạy thì đưa sổ về
  // đầu nếu sắp chạy, không thì đứng ở cuối (đã chạy, giảm chuyển động)
  useLayoutEffect(() => {
    if (!run) return;
    if (mode === 'scroll') apply(reduced ? 1 : progress, true);
    else apply(!reduced && !playedRef.current ? 0 : 1);
  }, [run, mode, reduced, progress, apply]);

  // Chế độ tự chạy: một lần khi vào khung nhìn
  useEffect(() => {
    if (mode !== 'auto' || reduced || !inView || !run || playedRef.current) return undefined;
    const strips = stripRefs.current.filter(Boolean);
    strips.forEach((s) => { s.style.willChange = 'transform'; });
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      apply(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        playedRef.current = true;
        strips.forEach((s) => { s.style.willChange = ''; });
        onDoneRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      strips.forEach((s) => { s.style.willChange = ''; });
    };
  }, [mode, reduced, inView, run, duration, apply]);

  if (!run) {
    return <Skeleton as="div" className={`h-64 rounded-lg border border-line bg-(--sheet) ${className}`} />;
  }

  const subs = run.steps.slice(1, -1);
  const pct = evidence?.total ? Math.round(((evidence.verified + evidence.human) / evidence.total) * 100) : null;

  return (
    <figure
      ref={rootRef}
      data-ledger-run={mode}
      data-state={settled ? 'done' : 'run'}
      data-live={live ? '1' : '0'}
      className={bare ? className : `rounded-lg border border-line bg-(--sheet) px-5 pt-4 pb-5 ${className}`}
    >
      {(title || showLink) && (
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-ink-hi">{title}</span>
        {showLink && (
          <Link to="/trust" className="-my-1.5 inline-flex min-h-8 shrink-0 items-center rounded-ctrl text-sm font-medium text-accent-hi underline-offset-4 hover:underline focus-visible:underline">
            Xem phễu
          </Link>
        )}
      </figcaption>
      )}
      <dl className={`text-sm ${title || showLink ? 'mt-2' : ''}`}>
        <Row ref={(el) => { rowRefs.current.raw = el; }} label={run.steps[0].label} value={run.raw} />
        {subs.map((s) => (
          <Row key={s.key} ref={(el) => { rowRefs.current[s.key] = el; }} label={s.label} value={s.value} sign={s.sign} />
        ))}
        {/* Gạch đôi trên dòng tổng, như sổ kế toán */}
        <div
          ref={(el) => { rowRefs.current.counted = el; }}
          className="mt-px grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 border-0 border-t-[3px] border-double border-ink-lo pt-2.5"
        >
          <dt className="font-semibold text-ink-hi">{run.steps.at(-1).label}</dt>
          <dd className="text-right font-mono text-metric font-semibold tabular-nums text-ink-hi">
            <span
              ref={numberRef}
              className={`ledger-roll ${settled && live ? 'motion-settle' : ''}`}
              style={{ transformOrigin: 'right center' }}
              aria-hidden="true"
            >
              {layout.map((item, j) =>
                item.kind === 'sep' ? (
                  <span key={`s${j}`} ref={(el) => { sepRefs.current[j] = el; }} style={{ opacity: finalRoll.visible[item.after] ? undefined : 0 }}>.</span>
                ) : (
                  <span key={`d${item.slot}`} ref={(el) => { slotRefs.current[item.slot] = el; }} className="ledger-roll-slot" style={{ opacity: finalRoll.visible[item.slot] ? undefined : 0 }}>
                    <span className="invisible">0</span>
                    <span ref={(el) => { stripRefs.current[item.slot] = el; }} className="ledger-roll-strip" style={{ transform: stripTransform(finalRoll.positions[item.slot]) }}>
                      {DIGITS.map((d, k) => <span key={k}>{d}</span>)}
                    </span>
                  </span>
                )
              )}
            </span>
            <span className="sr-only">{fmtInt(run.counted)}</span>
          </dd>
        </div>
      </dl>
      <div ref={checkRef}>
        <p className={`mt-3 flex items-start gap-2 text-sm leading-snug ${run.matches ? 'text-ink-mid' : 'text-crit'}`}>
          {run.matches ? (
            <>
              <Check size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                Phép trừ khớp: {fmtInt(run.raw)} trừ {fmtInt(run.removed)} đúng bằng {fmtInt(run.counted)}
                {run.pendingCounted > 0 && `. ${fmtInt(run.pendingCounted)} phản hồi chờ duyệt vẫn được tính tạm theo trọng số`}
              </span>
            </>
          ) : (
            <>
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Phép trừ lệch {fmtInt(Math.abs(run.diff))} phản hồi so với số được tính</span>
            </>
          )}
        </p>
        {pct != null && (
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-xs bg-raised">
              <BarGrow value={pct / 100} start={settled} className="bg-accent" />
            </div>
            <p className="mt-2 text-sm leading-snug text-ink-mid">
              <span className="font-semibold text-ink-hi">{pct}%</span> có chứng từ hoặc người đã duyệt, {100 - pct}% do AI đoán
            </p>
          </div>
        )}
      </div>
    </figure>
  );
};

export default LedgerRun;
