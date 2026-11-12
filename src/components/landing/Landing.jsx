import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../Logo';
import { Button, EvidenceSwatch, EVIDENCE_KINDS } from '../ui';
import { LedgerRun, useReducedMotion } from '../motion';
import { useTheme } from '../../hooks/useTheme';
import { fmtInt } from '../../lib/format';
import { normalizeLedger } from '../../lib/ledgerRun';
import { useLandingHealth, verifiedCount, SNAPSHOT_DATE, SAMPLE_NOTE, LEDGER_SAMPLES, SCAN_SAMPLES, SCAN_LABELS } from './data';
// Engine scroll-craft chép nguyên văn (không sửa). CSS của engine có luật toàn cục
// (body, :focus-visible, img), nên KHÔNG import thường: nạp dạng chuỗi và chỉ gắn
// vào <head> trong lúc trang giới thiệu đang mở, rời trang là gỡ.
import engineCss from '../../vendor/scrollcraft/scrollcraft.css?inline';
import '../../vendor/scrollcraft/scrollcraft.js';
import './landing.css';

/**
 * TRANG GIỚI THIỆU CÔNG KHAI (`/`, F3-01 đến F3-07)
 * ------------------------------------------------------------------
 * Brief, ngữ pháp, đường cảm xúc, bảng điểm: scrollcraft/builds/gioi-thieu/BRIEF.md.
 * Bảy nhịp: Nhận ra mình, Cái giá (im lặng trước đỉnh), ĐỈNH phép trừ chạy theo
 * thanh cuộn (LedgerRun mode="scroll", số thật từ /trust/health), Bằng chứng,
 * Việc hôm nay (rãnh ngang), Người làm ra (ảnh nhóm), Chốt (đứng yên).
 *
 * Số liệu: data.js gọi /trust/health của kho mô phỏng MỘT lần; quá 4 giây hoặc
 * lỗi thì dùng ảnh chụp số ngày 12/11/2026 và ghi rõ ngày.
 *
 * ẢNH CHỤP APP BẢN MỚI (sau F4 đến F7, chụp 12/11/2026 20:53, giảm chuyển động bật):
 *   public/landing/tong-quan-{light,dark}.webp       Tổng quan nguyên màn (hero, lớp giữa)
 *   public/landing/bang-so-lieu-{light,dark}.webp    Bảng số liệu, bỏ thanh bên (hero lớp sau, rãnh)
 *   public/landing/so-doi-chieu-{light,dark}.webp    tờ sổ đối chiếu cắt ra, góc bo trong suốt (hero lớp trước)
 *   public/landing/viec-hom-nay-{light,dark}.webp    khối Việc hôm nay (rãnh)
 *   public/landing/livestream-{light,dark}.webp      báo cáo sau live của phiên mô phỏng (rãnh)
 *   public/landing/nhom.webp                         ảnh nhóm, cắt bớt tường trống (không chụp lại)
 * Chụp lại (backend local chỉ đọc ở :5000, Vite ở :5199, puppeteer-core ở `npm root -g`;
 * script chặn mọi request không phải GET):
 *   node <scratchpad>/cap_app.mjs  http://localhost:5199 cap/light light   (rồi dark)
 *   node <scratchpad>/cap_live.mjs http://localhost:5199 cap/light light "Báo cáo sau live"   (rồi dark)
 *   python <scratchpad>/make_webp.py cap .hallmark/team/nhom-customer-radar.png public/landing
 * (Ba script đó chép lại trong .hallmark/shots/F3/scripts/.) Ảnh 1440x900 ở tỉ lệ 1,5,
 * localStorage workspace=demo, cr-theme=light|dark, isAuthenticated=true. Đổi kích thước
 * ảnh thì sửa width/height ở SHOTS bên dưới. Ảnh chụp có số của ngày chụp: chụp lại
 * thì sửa luôn SNAPSHOT và SNAPSHOT_DATE trong data.js cho cùng ngày.
 */

const SHOTS = {
  overview: { base: 'tong-quan', w: 1600, h: 1000 },
  insights: { base: 'bang-so-lieu', w: 1400, h: 979 },
  sheet: { base: 'so-doi-chieu', w: 600, h: 669 },
  today: { base: 'viec-hom-nay', w: 1400, h: 654 },
  live: { base: 'livestream', w: 1400, h: 979 }
};
const shot = (key, theme) => `/landing/${SHOTS[key].base}-${theme === 'dark' ? 'dark' : 'light'}.webp`;

const TEAM_ALT =
  'Nhóm Customer Radar. Hàng trên, từ trái sang: Nguyễn Thành Dũng, Phạm Văn Minh Phúc. ' +
  'Hàng dưới, từ trái sang: Nguyễn Ngọc Thanh Thảo, Nguyễn Triệu Vy, Lê Thị Thanh Thảo.';

const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const pctVi = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')}%`;

/** Gắn engine khi trang mở, gỡ sạch khi rời trang (destroy + bỏ CSS + bỏ lớp trên <html>). */
function useScrollCraft(rootRef, reduced) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const html = document.documentElement;
    const style = document.createElement('style');
    style.setAttribute('data-landing', 'scrollcraft');
    style.textContent = engineCss;
    document.head.appendChild(style);
    html.classList.add('lp-on');
    let api = null;
    try {
      api = window.ScrollCraft?.mount(root) || null;
    } catch {
      // Engine lỗi thì trang vẫn đọc được: CSS giữ mọi chữ hiện khi <html> chưa có .sc-ready
      api = null;
    }
    return () => {
      api?.destroy?.();
      style.remove();
      html.classList.remove('lp-on');
    };
    // Đổi chế độ giảm chuyển động thì cảnh ghim thành cảnh thường: gắn lại engine
  }, [rootRef, reduced]);
}

/**
 * ĐỈNH: tờ sổ trừ theo vị trí cuộn của chính cảnh ghim.
 * Tiến độ thô = đoạn đã cuộn trong cảnh / quãng ghim. Khi cảnh còn đang trượt
 * lên (chưa ghim) sổ đã hiện dòng thu thập (t = 0,1), để khung không trống.
 */
function PeakLedger({ actRef, health, reduced }) {
  const [t, setT] = useState(0.1);
  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = actRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = Math.max(1, r.height - window.innerHeight);
      const raw = clamp01(-r.top / travel);
      const next = 0.1 + 0.9 * clamp01((raw - 0.05) / 0.8);
      setT(Math.round(next * 1000) / 1000);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [actRef, reduced]);

  return (
    <div className="lp-peak__sheet" data-sc-verify-state={reduced ? 'tĩnh' : t.toFixed(3)}>
      {/* Sổ là SỐ LIỆU: giấy đặc, không kính. data-theme="light" làm riêng tờ giấy sáng khi trang đang tối */}
      <div className="lp-paper" data-theme="light">
        <LedgerRun
          ledger={health}
          mode="scroll"
          progress={reduced ? 1 : t}
          showLink={false}
          title="Sổ đối chiếu"
          bare
          rowNotes={ROW_NOTES}
          numberClass="lp-bignum"
          settleDot
        />
        <p className="lp-paper__cap">{SAMPLE_NOTE}: mỗi khoản bị trừ kèm một bình luận thật.</p>
      </div>
    </div>
  );
}

/** Bình luận mẫu bị gạch ngang dưới từng dòng trừ (chép tĩnh từ kho Mô phỏng, data.js) */
const sampleMeta = (x) => `${x.source}${x.rating ? `, ${x.rating} sao` : ''}, ${x.date}`;
const ROW_NOTES = Object.fromEntries(
  Object.entries(LEDGER_SAMPLES).map(([key, x]) => [
    key,
    <p key={key} className="lp-ex">
      <s>{x.text}</s>
      <span className="lp-ex__meta">{sampleMeta(x)}</span>
    </p>
  ])
);

// Khung ngắm quét từ p = SCAN_FROM tới SCAN_TO của nhịp "Cái giá" (--sc-p do engine đặt)
const SCAN_FROM = 0.3;
const SCAN_TO = 0.72;

/** Hai góc chữ L của logo A2 (đường nét gốc trong Logo.jsx), cắt từng góc, nét giữ 3 px khi phóng to */
const Corner = ({ at }) => (
  <svg
    className={`lp-scan__corner lp-scan__corner--${at}`}
    viewBox={at === 'bl' ? '1 5 7 10' : '8 1 7 10'}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d={at === 'bl' ? 'M2.5 6.5V13.5H6.5' : 'M13.5 9.5V2.5H9.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="miter"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

/**
 * KHUNG NGẮM (K5-05): hai góc chữ L của logo trôi xuống danh sách bình luận mẫu theo --sc-p.
 * Bình luận lọt trong khung được gắn nhãn đúng theo Trust Layer, rác và ảo mờ đi;
 * ngoài khung để nguyên. Chỉ transform (khung) và opacity (hàng, nhãn). Không JS hoặc giảm
 * chuyển động: không có khung, mọi hàng hiện nhãn đủ (bảng tĩnh có nhãn).
 */
function ScanList({ actRef, reduced }) {
  const listRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    const frame = frameRef.current;
    const act = actRef.current;
    if (reduced || !list || !frame || !act) return undefined;
    list.classList.add('is-scan');
    const rows = Array.from(list.querySelectorAll('[data-scan-row]'));
    const geo = { listH: 0, frameH: 0, mids: [] };
    const measure = () => {
      geo.listH = list.offsetHeight;
      geo.frameH = frame.offsetHeight;
      geo.mids = rows.map((r) => r.offsetTop + r.offsetHeight / 2);
    };
    let raf = 0;
    const paint = () => {
      raf = 0;
      const p = parseFloat(act.style.getPropertyValue('--sc-p')) || 0;
      const t = clamp01((p - SCAN_FROM) / (SCAN_TO - SCAN_FROM));
      const y = t * Math.max(0, geo.listH - geo.frameH);
      frame.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      rows.forEach((r, i) => {
        const v = geo.mids[i] >= y && geo.mids[i] <= y + geo.frameH ? '1' : '0';
        if (r.dataset.in !== v) r.dataset.in = v;
      });
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const remeasure = () => {
      measure();
      queue();
    };
    remeasure();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', remeasure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', remeasure);
      list.classList.remove('is-scan');
      frame.style.transform = '';
    };
  }, [actRef, reduced]);

  return (
    <div className="lp-scan" ref={listRef}>
      <ul className="lp-scan__list">
        {SCAN_SAMPLES.map((x) => (
          <li key={x.id} className={`lp-scan__row lp-scan__row--${x.kind}`} data-scan-row="" data-in="0">
            <p className="lp-scan__text">{x.text}</p>
            <p className="lp-scan__meta">
              <span>{sampleMeta(x)}</span>
              <span className={`lp-scan__tag lp-scan__tag--${x.kind}`}>{SCAN_LABELS[x.kind]}</span>
            </p>
          </li>
        ))}
      </ul>
      <div className="lp-scan__frame" ref={frameRef} aria-hidden="true">
        <Corner at="tr" />
        <Corner at="bl" />
      </div>
      <p className="lp-scan__note">{SAMPLE_NOTE}. Nhãn là kết luận của Trust Layer.</p>
    </div>
  );
}

const cue = (on, value) => (on ? { 'data-sc-cue': value } : {});

const Landing = ({ isAuthenticated = false }) => {
  const rootRef = useRef(null);
  const peakRef = useRef(null);
  const costRef = useRef(null);
  const reduced = useReducedMotion();
  const { theme } = useTheme();
  const { health, source } = useLandingHealth();

  useScrollCraft(rootRef, reduced);

  // Ảnh tải xong hoặc số về thì nhắc engine đo lại vị trí các cảnh
  const remeasure = () => window.dispatchEvent(new Event('resize'));
  useEffect(() => {
    if (health) remeasure();
  }, [health]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Customer Radar: chỉ tin con số có chứng từ';
    return () => {
      document.title = prev;
      // Rời trang ở giữa chừng: trang kế tiếp mở từ đầu
      window.scrollTo(0, 0);
    };
  }, []);

  const cta = isAuthenticated ? { to: '/dashboard', label: 'Vào ứng dụng' } : { to: '/login', label: 'Xem bản dùng thử' };
  const nav = isAuthenticated ? { to: '/dashboard', label: 'Vào ứng dụng' } : { to: '/login', label: 'Đăng nhập' };

  const l = normalizeLedger(health);
  const verified = verifiedCount(health);
  const rate = health?.reconciliationRate;
  const humanCount = health?.humanLabelCount || 0;
  const sourceLine =
    source === 'live'
      ? 'Số liệu lấy trực tiếp lúc bạn mở trang.'
      : source === 'snapshot'
        ? `Số liệu ngày ${SNAPSHOT_DATE}: máy chủ chưa trả lời kịp, trang dùng bản chụp.`
        : 'Đang lấy số liệu từ kho mô phỏng.';
  const num = (v) => (l ? fmtInt(v) : '—');

  return (
    <div ref={rootRef} className={`lp ${reduced ? 'is-reduced' : ''}`}>
      {/* 1. NHẬN RA MÌNH: ba lớp ảnh app thật trượt lệch nhịp */}
      <section className="lp-hero" data-sc-act="flow" aria-labelledby="lp-h1">
        <header className="lp-wrap lp-nav">
          <Link to="/" className="lp-brand" aria-label="Customer Radar, trang giới thiệu">
            <LogoMark size={26} />
            <span>Customer Radar</span>
          </Link>
          <Link to={nav.to} className="lp-navlink">
            {nav.label}
          </Link>
        </header>
        <div className="lp-wrap lp-hero__grid">
          <div className="lp-hero__copy">
            <h1 id="lp-h1" className="lp-h1">Sáng nào cũng lướt bình luận khách?</h1>
            <p className="lp-lede">Customer Radar lọc rác và đánh giá ảo trước khi đếm.</p>
            <div className="lp-actions">
              <Button as={Link} to={cta.to} size="lg">
                {cta.label}
              </Button>
            </div>
          </div>
          <figure className="lp-hero__art">
            {/* Màn chính đứng đầu theo thứ tự đọc; lớp sau, lớp trước xếp bằng z-index */}
            <img
              className="lp-plane lp-plane--main"
              src={shot('overview', theme)}
              width={SHOTS.overview.w}
              height={SHOTS.overview.h}
              alt="Trang Tổng quan của Customer Radar: câu tóm tắt việc cần làm hôm nay, bên phải là sổ đối chiếu từ phản hồi thu thập tới số được tính."
              data-sc-parallax="0.5"
              fetchPriority="high"
              onLoad={remeasure}
            />
            <img
              className="lp-plane lp-plane--back"
              src={shot('insights', theme)}
              width={SHOTS.insights.w}
              height={SHOTS.insights.h}
              alt=""
              data-sc-parallax="1.6"
              onLoad={remeasure}
            />
            {/* Tấm kính: ảnh Bảng số liệu lùi xa nằm SAU nên mờ qua kính; Tổng quan và tờ sổ nằm TRƯỚC */}
            <div className="lp-glass glass-float" aria-hidden="true" data-sc-parallax="0.8" />
            <div className="lp-tilt" data-sc-tilt="3">
              <img
                className="lp-plane lp-plane--front"
                src={shot('sheet', theme)}
                width={SHOTS.sheet.w}
                height={SHOTS.sheet.h}
                alt=""
                data-sc-parallax="-1.3"
                onLoad={remeasure}
              />
            </div>
            <figcaption className="lp-hero__cap">Ảnh chụp ứng dụng, kho mô phỏng, {SNAPSHOT_DATE}.</figcaption>
          </figure>
        </div>
      </section>

      {/* 2. CÁI GIÁ: khung ngắm quét danh sách bình luận thật, gọi tên rác, ảo, khách thật */}
      <section ref={costRef} className="lp-cost" data-sc-act="flow" aria-labelledby="lp-cost-h">
        <div className="lp-wrap lp-cost__inner">
          <div className="lp-cost__copy">
            <h2 id="lp-cost-h" className="lp-h2">Nhưng không phải bình luận nào cũng của khách thật.</h2>
            <p className="lp-cost__lede" data-sc-in="">
              Đây là tám bình luận nằm lẫn trong kho. Khung ngắm đi qua từng cái và gọi tên.
            </p>
            <p className="lp-cost__turn" data-sc-in="">
              Đếm hết thì con số sai. Bỏ bừa thì mất lời khách thật.
            </p>
          </div>
          <ScanList actRef={costRef} reduced={reduced} />
        </div>
      </section>

      {/* 3. ĐỈNH: phép trừ chạy theo thanh cuộn, khoảng cuộn dài nhất trang */}
      <section
        ref={peakRef}
        className="lp-peak"
        data-sc-act={reduced ? 'flow' : 'pin'}
        {...(reduced ? {} : { 'data-sc-span': '3.8' })}
        aria-labelledby="lp-peak-h"
      >
        <div data-sc-stage="" className="lp-peak__stage">
          <div className="lp-wrap lp-peak__grid">
            <div className="lp-peak__copy">
              <h2 id="lp-peak-h" className="lp-h2">Từ mọi phản hồi thu về đến con số được tính.</h2>
              <div className="lp-peak__lines">
                <p {...cue(!reduced, '0 0.3 0')}>
                  Kho mô phỏng thu về <b>{num(l?.raw)}</b> phản hồi, chưa bỏ gì.
                </p>
                <p {...cue(!reduced, '0.24 0.66')}>
                  Trừ rác, đánh giá nghi ảo, phần chờ duyệt và phần quá cũ.
                </p>
                <p {...cue(!reduced, '0.62 1 0.12 0.04')}>
                  Còn lại <b>{num(l?.counted)}</b>, đúng số mọi trang trong ứng dụng dùng.
                </p>
              </div>
              <p className="lp-source">{sourceLine}</p>
            </div>
            <PeakLedger actRef={peakRef} health={health} reduced={reduced} />
          </div>
        </div>
      </section>

      {/* 4. BẰNG CHỨNG: thanh "khớp với đơn hàng" mở bằng một nhát cắt */}
      <section className="lp-proof" data-sc-act="flow" aria-labelledby="lp-proof-h">
        <div className="lp-wrap lp-proof__grid">
          <div className="lp-proof__main">
            <h2 id="lp-proof-h" className="lp-h2">Mỗi con số nói rõ nó đứng trên gì.</h2>
            <figure className="lp-meter">
              <div className="lp-meter__wipe" data-sc-reveal="left" data-sc-reveal-at="0.25 0.55">
                <div className="lp-meter__track">
                  <div className="lp-meter__fill" style={{ width: l ? `${clamp01(verified / l.raw) * 100}%` : '0%' }} />
                </div>
              </div>
              <figcaption className="lp-meter__cap">
                {rate != null ? (
                  <>
                    <b>{pctVi(rate)}</b> phản hồi thu về khớp với đơn hàng: {num(verified)} trên {num(l?.raw)}.
                  </>
                ) : (
                  'Đang lấy số liệu.'
                )}
              </figcaption>
            </figure>
          </div>
          <dl className="lp-kinds">
            {EVIDENCE_KINDS.map((k) => (
              <div key={k.key} className="lp-kind">
                <dt>
                  <EvidenceSwatch kind={k.key} size={14} />
                  {k.label}
                </dt>
                <dd>
                  {k.hint}
                  {k.key === 'human' && humanCount > 0 ? `. Đã duyệt ${fmtInt(humanCount)} phản hồi.` : '.'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 5. VIỆC HÔM NAY: ba màn hình làm việc trượt ngang */}
      <section
        className={`lp-work ${reduced ? 'is-static' : ''}`}
        data-sc-act={reduced ? 'flow' : 'pan'}
        {...(reduced ? {} : { 'data-sc-span': '2.4' })}
        aria-labelledby="lp-work-h"
      >
        <div data-sc-stage="" className="lp-work__stage">
          <div className="lp-rail" {...(reduced ? {} : { 'data-sc-pan': '0.04' })}>
            <div className="lp-rail__head">
              <h2 id="lp-work-h" className="lp-h2">Mở ra là biết hôm nay làm gì.</h2>
              <p>Cảnh báo, đơn chốt từ livestream, phản hồi chờ duyệt gom vào một danh sách, việc gấp ở trên.</p>
            </div>
            <figure className="lp-shot">
              <img src={shot('today', theme)} width={SHOTS.today.w} height={SHOTS.today.h} loading="lazy" alt="Khối Việc hôm nay: năm việc xếp theo mức gấp, mỗi việc một nút xử lý." />
              <figcaption>Việc hôm nay</figcaption>
            </figure>
            <figure className="lp-shot">
              <img src={shot('live', theme)} width={SHOTS.live.w} height={SHOTS.live.h} loading="lazy" alt="Báo cáo sau livestream: doanh thu ước tính, doanh thu lỡ vì hết hàng, khiếu nại, việc cần làm cho phiên sau." />
              <figcaption>Báo cáo sau livestream</figcaption>
            </figure>
            <figure className="lp-shot">
              <img src={shot('insights', theme)} width={SHOTS.insights.w} height={SHOTS.insights.h} loading="lazy" alt="Bảng số liệu: phản hồi được tính, tỉ lệ tiêu cực, diễn biến theo tuần và theo kênh." />
              <figcaption>Bảng số liệu</figcaption>
            </figure>
            <p className="lp-rail__note">Ảnh chụp ứng dụng thật, kho mô phỏng, ngày {SNAPSHOT_DATE}.</p>
          </div>
        </div>
      </section>

      {/* 6. NGƯỜI LÀM RA */}
      <section className="lp-team" aria-labelledby="lp-team-h">
        <div className="lp-wrap lp-team__grid">
          <img className="lp-team__photo" src="/landing/nhom.webp" width={420} height={384} loading="lazy" alt={TEAM_ALT} />
          <div className="lp-team__text" data-sc-in="">
            <h2 id="lp-team-h" className="lp-h2">Năm người đứng sau những con số này.</h2>
            <p className="lp-team__school">Nhóm Customer Radar, Trường Đại học Công nghệ Thông tin (UIT).</p>
            <dl className="lp-team__rows">
              <div>
                <dt>Hàng trên, từ trái sang</dt>
                <dd>Nguyễn Thành Dũng, Phạm Văn Minh Phúc</dd>
              </div>
              <div>
                <dt>Hàng dưới, từ trái sang</dt>
                <dd>Nguyễn Ngọc Thanh Thảo, Nguyễn Triệu Vy, Lê Thị Thanh Thảo</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* 7. CHỐT: dòng tổng của sổ, đứng yên */}
      <section className="lp-close" aria-labelledby="lp-close-h">
        <div className="lp-wrap lp-close__inner">
          <div className="lp-close__total">
            <span>Được tính vào chỉ số</span>
            <span className="lp-close__num">{num(l?.counted)}</span>
          </div>
          <h2 id="lp-close-h" className="lp-h2">Phần còn lại sau phép trừ là phần bạn tin được.</h2>
          <div className="lp-actions">
            <Button as={Link} to={cta.to} size="lg">
              {cta.label}
            </Button>
          </div>
          <p className="lp-foot">
            © 2026 Customer Radar. Nhóm Customer Radar, Trường Đại học Công nghệ Thông tin. {sourceLine}
          </p>
        </div>
      </section>
    </div>
  );
};

export default Landing;
