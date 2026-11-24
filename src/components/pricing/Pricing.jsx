import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock, ChevronDown } from 'lucide-react';
import { LogoMark } from '../Logo';
import { Button } from '../ui';
import { useReducedMotion } from '../motion';
import { useTheme } from '../../hooks/useTheme';
import { PLANS, MATRIX, PRICE_NOTE } from '../../lib/plans';
import { currentAccount, updateAccount, authError } from '../../lib/auth';
// Engine scroll-craft chép nguyên văn (không sửa), nạp CSS dạng chuỗi như trang giới thiệu:
// CSS của engine có luật toàn cục nên chỉ gắn vào <head> khi trang này đang mở
import engineCss from '../../vendor/scrollcraft/scrollcraft.css?inline';
import '../../vendor/scrollcraft/scrollcraft.js';
import './pricing.css';

/**
 * TRANG BẢNG GIÁ (/bang-gia), ngữ pháp "Bậc thang mở khóa" (bản 2, 2026-11-24)
 * ------------------------------------------------------------------
 * Brief, đường cảm xúc, bảng điểm: scrollcraft/builds/bang-gia/BRIEF.md.
 *   1. Hero      ba lớp sâu: ảnh Tổng quan lùi phía sau, bậc thang giá ở giữa, khối số
 *                liệu live nổi phía trước; mỗi lớp trôi một nhịp khi cuộn, nghiêng nhẹ theo chuột
 *   2. ĐỈNH      cảnh ghim mở khóa: thanh cuộn chạy dọc ba nhóm tính năng, chạm tới đâu ổ khóa
 *                lật mở tới đó; bộ ba ảnh app thật xếp chồng, gói đang xem lên trước, gói đã qua
 *                rơi xuống. Tiến độ được làm mượt (lerp) và ghi thẳng vào biến CSS, không render lại
 *   3. So sánh   bảng đủ dòng, cột Shop có live nền mực, các dòng hiện nối nhau
 *   4. Câu hỏi   ba câu, mở gập khi bấm
 *   5. Chốt      ba thẻ chọn gói. Đã đăng nhập: thấy gói đang dùng, giữ chỗ gói cao hơn
 * Giá dự kiến, chưa thu tiền (src/lib/plans.js); không có số liệu hay lời khen nào được bịa.
 */

const ACTION = 'Dùng thử miễn phí';

/**
 * Ổ khóa vẽ tay một nét (cùng nét Lucide): thân và quai tách riêng, nên mở khóa là quai
 * nhấc lên và xoay quanh chân trái, không phải đổi sang một icon thứ hai đang ẩn sẵn.
 */
const LockGlyph = ({ size = 15 }) => (
  <svg className="pg-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path className="pg-glyph__shackle" d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

function useScrollCraft(rootRef, reduced) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const html = document.documentElement;
    const style = document.createElement('style');
    style.setAttribute('data-pricing', 'scrollcraft');
    style.textContent = engineCss;
    document.head.appendChild(style);
    html.classList.add('pg-on');
    let api = null;
    try {
      api = window.ScrollCraft?.mount(root) || null;
    } catch {
      api = null; // engine lỗi thì trang vẫn đọc được: CSS giữ mọi chữ hiện khi chưa có .sc-ready
    }
    return () => {
      api?.destroy?.();
      style.remove();
      html.classList.remove('pg-on');
    };
  }, [rootRef, reduced]);
}

/** Ảnh chụp app thật theo chế độ sáng, tối (ảnh nằm trong public/) */
const shotSrc = (shot, theme) => `${shot.base}-${theme === 'dark' ? 'dark' : 'light'}.webp`;

const Nav = ({ isAuthenticated, onUnlock }) => (
  <header className="pg-nav glass-chrome">
    <div className="pg-wrap pg-nav__inner">
      <Link to="/" className="pg-brand" aria-label="Customer Radar, về trang giới thiệu">
        <LogoMark size={26} />
        <span>Customer Radar</span>
      </Link>
      <nav aria-label="Bảng giá" className="pg-nav__links">
        <a className="pg-navlink" href="#mo-khoa" onClick={onUnlock}>Mỗi gói mở gì</a>
        <a className="pg-navlink" href="#so-sanh">So sánh</a>
        <Button as={Link} to={isAuthenticated ? '/dashboard' : '/login'} size="sm" variant="secondary">
          {isAuthenticated ? 'Vào ứng dụng' : 'Đăng nhập'}
        </Button>
      </nav>
    </div>
  </header>
);

/**
 * HERO: ba lớp sâu. Lớp sau (ảnh Tổng quan) trôi chậm hơn trang, lớp trước (khối số liệu
 * live) trôi nhanh hơn; cả cụm nghiêng tối đa 2,5 độ theo chuột (engine, chỉ chuột thật).
 * Bấm một bậc là cuộn tới đúng chỗ bậc đó mở khóa.
 */
const Hero = ({ cta, onJump, onUnlock, theme }) => {
  const live = PLANS[2];
  return (
    <section className="pg-hero" data-sc-act="flow" aria-labelledby="pg-h1">
      <div className="pg-wrap pg-hero__grid">
        <div className="pg-hero__copy">
          <h1 id="pg-h1" className="pg-h1">Mở khóa theo nhịp shop lớn lên.</h1>
          <p className="pg-hero__lede">Bắt đầu miễn phí, thêm Quản gia Zalo và livestream khi cần.</p>
          <div className="pg-actions">
            {cta.href
              ? <Button as="a" href={cta.href} size="lg">{cta.label}</Button>
              : <Button as={Link} to={cta.to} size="lg">{cta.label}</Button>}
            <a className="pg-textlink" href="#mo-khoa" onClick={onUnlock}>Xem mỗi gói mở gì</a>
          </div>
        </div>

        <div className="pg-depth" data-sc-tilt="2.5">
          <div className="pg-depth__back" data-sc-parallax="0.9" aria-hidden="true">
            <img src={shotSrc(PLANS[0].shot, theme)} width={PLANS[0].shot.w} height={PLANS[0].shot.h} alt="" decoding="async" />
          </div>
          <ul className="pg-stairs" aria-label="Ba gói, từ thấp tới cao">
            {PLANS.map((p, i) => (
              <li key={p.id} className={`pg-step pg-step--${i + 1}`} style={{ '--i': i }}>
                <button type="button" onClick={() => onJump(i)} aria-label={`${p.name}, ${p.price}${p.unit}. Xem gói này mở gì`}>
                  <span className="pg-step__top">
                    <span className="pg-step__name">{p.name}</span>
                    <span className={`pg-step__lock ${i === 0 ? 'is-open' : ''}`} aria-hidden="true"><LockGlyph /></span>
                  </span>
                  <span className="pg-step__price">{p.price}</span>
                  <span className="pg-step__unit">{i === 0 ? 'miễn phí' : 'mỗi tháng'}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="pg-depth__front" data-sc-parallax="-1.3">
            <figure className="pg-chip glass-float">
              <img src={shotSrc(live.pulse, theme)} width={live.pulse.w} height={live.pulse.h} decoding="async"
                alt="Gói Shop có live: người xem, bình luận và lượt chốt theo từng phút của một phiên live" />
            </figure>
          </div>
        </div>
      </div>
      <p className="pg-wrap pg-note">{PRICE_NOTE}</p>
    </section>
  );
};

/*
 * ĐỈNH: cảnh ghim mở khóa.
 * u = tiến độ x 3 (0..3), mỗi gói một phần ba. s = vị trí "gói đang xem" (0..2), đứng yên
 * ở giữa mỗi phần ba và chỉ chuyển ở quanh ranh giới (u = 1 và u = 2), nên mỗi gói có chỗ
 * dừng để đọc. Tính năng thứ k của gói g mở ở ngưỡng riêng (FEAT_AT).
 */
const SHIFT = 0.18;
const shiftOf = (u) => smooth((u - (1 - SHIFT)) / (2 * SHIFT)) + smooth((u - (2 - SHIFT)) / (2 * SHIFT));
const FEAT_AT = (g, k) => (g === 0 ? 0.1 + k * 0.1 : g - 0.12 + k * 0.1);

/** Đọc vị trí cảnh ghim, làm mượt bằng lerp, ghi thẳng vào biến CSS (không setState mỗi khung) */
function useUnlockMotion(actRef, stageRef, liveRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const act = actRef.current;
    const stage = stageRef.current;
    if (!act || !stage) return undefined;
    const cards = [...stage.querySelectorAll('.pg-deck__card')];
    const groups = [...stage.querySelectorAll('.pg-grp')];
    const feats = [...stage.querySelectorAll('.pg-feat')].map((el) => ({ el, at: FEAT_AT(+el.dataset.g, +el.dataset.k), open: null }));
    let cur = null;
    let raf = 0;
    let here = -1;

    const target = () => {
      const r = act.getBoundingClientRect();
      return clamp01(-r.top / Math.max(1, r.height - window.innerHeight));
    };
    const apply = (p) => {
      const u = p * 3;
      const s = shiftOf(u);
      stage.style.setProperty('--pg-p', p.toFixed(4));
      cards.forEach((c, i) => {
        const o = i - s;
        c.style.setProperty('--o', o.toFixed(4));
        // Ảnh đã qua (o < 0) luôn chìm dưới ảnh đang lên, nên chỉ thấy nó trượt xuống phía sau, không đè chữ
        c.style.zIndex = String(o >= 0 ? 10 - Math.round(o * 3) : 4 - Math.round(-o * 3));
      });
      groups.forEach((g, i) => {
        g.style.setProperty('--fill', clamp01(u - i).toFixed(4));
        g.style.setProperty('--on', clamp01(1 - Math.abs(i - s) * 1.4).toFixed(4));
      });
      feats.forEach((f) => {
        const open = u >= f.at;
        if (open !== f.open) { f.open = open; f.el.classList.toggle('is-open', open); }
      });
      const h = Math.round(s);
      if (h !== here) {
        here = h;
        groups.forEach((g, i) => g.classList.toggle('is-here', i === h));
        if (liveRef.current) liveRef.current.textContent = `Đang xem gói ${PLANS[h].name}`;
      }
    };
    // Làm mượt theo thời gian thật (hằng số 120 ms), không theo số khung: màn 60 Hz, 120 Hz hay
    // tab bị trình duyệt hạ nhịp đều tới đích cùng lúc
    let last = 0;
    const frame = (now = performance.now()) => {
      raf = 0;
      const t = target();
      const dt = last ? Math.min(250, now - last) : 16;
      last = now;
      if (cur === null) cur = t;
      cur += (t - cur) * (1 - Math.exp(-dt / 120));
      if (Math.abs(t - cur) < 0.0004) cur = t;
      apply(cur);
      if (cur !== t) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    frame();
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      cancelAnimationFrame(raf);
    };
  }, [actRef, stageRef, liveRef, enabled]);
}

/** Cuộn tới giữa phần của một gói trong cảnh ghim (s đứng yên đúng gói đó) */
function jumpToTier(act, i) {
  if (!act) return;
  const top = act.getBoundingClientRect().top + window.scrollY;
  const travel = Math.max(1, act.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + travel * ((i + 0.5) / 3), behavior: 'smooth' });
}

const Feature = ({ text, g, k, open }) => (
  <li className={`pg-feat ${open ? 'is-open' : ''}`} data-g={g} data-k={k}>
    <span className="pg-lock" aria-hidden="true"><LockGlyph /></span>
    <span className="pg-feat__text">{text}</span>
  </li>
);

const TierGroups = ({ onJump, allOpen }) => (
  <ol className="pg-tiers" aria-label="Các gói, từ thấp tới cao">
    {PLANS.map((p, g) => (
      <li key={p.id} className={`pg-grp ${g === 0 || allOpen ? 'is-here' : ''}`} style={{ '--fill': allOpen ? 1 : 0, '--on': g === 0 || allOpen ? 1 : 0 }}>
        <button type="button" className="pg-grp__head" onClick={() => onJump(g)}>
          <span className="pg-grp__name">{p.name}</span>
          <span className="pg-grp__price">{p.price}{p.unit}</span>
        </button>
        <ul className="pg-feats" aria-label={g === 0 ? `${p.name} mở` : `${p.name} mở thêm`}>
          {p.unlocks.map((u, k) => <Feature key={u} text={u} g={g} k={k} open={allOpen} />)}
        </ul>
      </li>
    ))}
  </ol>
);

const Unlock = ({ actRef, reduced, theme }) => {
  const stageRef = useRef(null);
  const liveRef = useRef(null);
  useUnlockMotion(actRef, stageRef, liveRef, !reduced);
  usePreloadShots(theme);

  if (reduced) {
    // Giảm chuyển động: mọi tính năng mở sẵn, ba ảnh xếp cạnh nhau, không ghim
    return (
      <section id="mo-khoa" ref={actRef} className="pg-unlock is-static" aria-labelledby="pg-unlock-h">
        <div className="pg-wrap">
          <div className="pg-unlock__grid">
            <div className="pg-unlock__side">
              <h2 id="pg-unlock-h" className="pg-h2">Mỗi bậc mở thêm một việc.</h2>
              <TierGroups onJump={() => {}} allOpen />
            </div>
            <div className="pg-gallery">
              {PLANS.map((p) => (
                <figure key={p.id} className="pg-gallery__item">
                  <img src={shotSrc(p.shot, theme)} width={p.shot.w} height={p.shot.h} alt={p.shot.alt} decoding="async" />
                  <figcaption>{p.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="mo-khoa" ref={actRef} className="pg-unlock" data-sc-act="pin" data-sc-span="3.4" aria-labelledby="pg-unlock-h">
      <div data-sc-stage="" ref={stageRef} className="pg-unlock__stage">
        <div className="pg-wrap pg-unlock__grid">
          <div className="pg-unlock__side">
            <h2 id="pg-unlock-h" className="pg-h2">Mỗi bậc mở thêm một việc.</h2>
            <TierGroups onJump={(g) => jumpToTier(actRef.current, g)} />
            <p ref={liveRef} className="sr-only" aria-live="polite" />
          </div>
          {/* Bộ ba ảnh app thật xếp chồng: luôn dựng đủ ba ảnh (không ảnh nào chờ script mới hiện),
              vị trí từng ảnh đọc từ --o = thứ tự ảnh trừ gói đang xem */}
          <div className="pg-deck">
            {PLANS.map((p, i) => (
              <figure key={p.id} className="pg-deck__card" style={{ '--o': i, zIndex: 10 - i * 3 }}>
                <img src={shotSrc(p.shot, theme)} width={p.shot.w} height={p.shot.h} alt={p.shot.alt} decoding="async" />
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/** Tải sẵn ảnh của cả ba bậc để lúc đổi bậc ảnh có ngay, không chờ mạng */
function usePreloadShots(theme) {
  useEffect(() => {
    PLANS.forEach((p) => { const im = new Image(); im.decoding = 'async'; im.src = shotSrc(p.shot, theme); });
  }, [theme]);
}

const Mark = ({ v }) => {
  if (v === true) return <><Check size={18} className="pg-yes" aria-hidden="true" /><span className="sr-only">Có</span></>;
  if (v === false) return <><Lock size={15} className="pg-no" aria-hidden="true" /><span className="sr-only">Không có</span></>;
  return <span className="pg-cellword">{v}</span>;
};

const Compare = () => (
  <section id="so-sanh" className="pg-compare" aria-labelledby="pg-compare-h">
    <div className="pg-wrap">
      <h2 id="pg-compare-h" className="pg-h2">So sánh từng dòng.</h2>
      <div className="pg-table-wrap">
        <table className="pg-table">
          <colgroup><col className="pg-col-name" /><col /><col /><col /></colgroup>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Tính năng</span></th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col">
                  <span className="pg-th__name">{p.name}</span>
                  <span className="pg-th__price">{p.price.replace(' ', '\u00a0')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-sc-stagger="45">
            {MATRIX.map(([label, ...cells]) => (
              <tr key={label} data-sc-in="">
                <th scope="row">{label}</th>
                {cells.map((v, i) => <td key={PLANS[i].id}><Mark v={v} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
);

const FAQ = [
  ['Giá này đã thu tiền chưa?', 'Chưa. Đây là giá dự kiến cho giai đoạn thử nghiệm với shop thật, chưa có khách nào trả tiền.'],
  ['Gói Dùng thử giới hạn gì?', 'Gói Dùng thử miễn phí, giới hạn ở 500 phản hồi mỗi tháng. Quản gia Zalo và livestream thuộc các gói cao hơn.'],
  ['Giữ chỗ gói là gì?', 'Khi đã đăng nhập, bấm Giữ chỗ để lưu gói bạn chọn. Nhóm liên hệ qua email bạn đăng ký khi mở thanh toán.']
];

const Questions = () => (
  <section className="pg-faq" aria-labelledby="pg-faq-h">
    <div className="pg-wrap pg-faq__grid">
      <h2 id="pg-faq-h" className="pg-h2">Trước khi nâng cấp.</h2>
      <div className="pg-faq__list">
        {FAQ.map(([q, a]) => (
          <details key={q} className="pg-q">
            <summary>
              <span>{q}</span>
              <ChevronDown size={18} className="pg-q__chev" aria-hidden="true" />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

/** CHỐT: chọn gói. Đã đăng nhập thì thấy gói đang dùng và giữ chỗ gói cao hơn */
const Choose = ({ account }) => {
  const [wanted, setWanted] = useState(account?.planWanted || null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setWanted(account?.planWanted || null); }, [account?.planWanted]);

  const hold = useCallback(async (id) => {
    setBusy(id || 'none');
    setMsg('');
    try {
      const u = await updateAccount({ planWanted: id });
      setWanted(u?.planWanted || null);
      setMsg(id ? `Đã giữ chỗ gói ${PLANS.find((p) => p.id === id)?.name}. Nhóm sẽ liên hệ qua email ${u?.email || 'bạn đăng ký'} khi mở thanh toán.` : 'Đã bỏ giữ chỗ.');
    } catch (e) {
      setMsg(authError(e).message);
    } finally {
      setBusy(null);
    }
  }, []);

  // Thẻ nền mực (Shop có live) luôn dùng nút chính: nút phụ là chữ sáng trên nền sáng, không đọc được
  const variantFor = (p) => (p.id === 'live' ? 'primary' : 'secondary');
  const action = (p) => {
    // Chưa đăng nhập: thẻ Dùng thử mời dùng thử, hai gói trả phí chỉ "Đăng ký" (đăng ký xong mới giữ chỗ được)
    if (!account) return <Button as={Link} to="/signup" variant={variantFor(p)} block>{p.id === 'try' ? ACTION : 'Đăng ký'}</Button>;
    if (account.isDemo) return <Button as={Link} to="/dashboard" variant={variantFor(p)} block>Vào ứng dụng</Button>;
    if (p.id === 'try') return <p className="pg-card__state">{wanted ? 'Đang dùng, chờ lên gói đã giữ chỗ' : 'Gói đang dùng'}</p>;
    if (wanted === p.id) {
      return (
        <div className="pg-card__held">
          <p className="pg-card__state">Đã giữ chỗ</p>
          <button type="button" className="pg-unhold" disabled={busy === 'none'} onClick={() => hold(null)}>{busy === 'none' ? 'Đang bỏ giữ chỗ' : 'Bỏ giữ chỗ'}</button>
        </div>
      );
    }
    return <Button variant={variantFor(p)} block loading={busy === p.id} onClick={() => hold(p.id)}>Giữ chỗ gói này</Button>;
  };

  return (
    <section id="chon-goi" className="pg-choose" aria-labelledby="pg-choose-h">
      <div className="pg-wrap">
        <h2 id="pg-choose-h" className="pg-h2">Chọn gói cho shop.</h2>
        <p className="pg-choose__note">Giá dự kiến, chưa thu tiền.</p>
        {account?.isDemo && <p className="pg-choose__note">Tài khoản mẫu dùng chung đã mở mọi tính năng trên kho Mô phỏng.</p>}
        <ul className="pg-cards" data-sc-stagger="90">
          {PLANS.map((p) => (
            <li key={p.id} data-sc-in="" className={`pg-card ${p.id === 'live' ? 'pg-card--ink' : ''}`}>
              <h3 className="pg-card__name">{p.name}</h3>
              <p className="pg-card__price">{p.price}<span>{p.unit}</span></p>
              <ul className="pg-card__list">
                {p.brief.map((it) => <li key={it}><Check size={16} aria-hidden="true" />{it}</li>)}
              </ul>
              <div className="pg-card__action">{action(p)}</div>
            </li>
          ))}
        </ul>
        <p role="status" className="pg-choose__msg">{msg}</p>
        <p className="pg-foot">© 2026 Customer Radar</p>
      </div>
    </section>
  );
};

const Pricing = ({ isAuthenticated }) => {
  const rootRef = useRef(null);
  const actRef = useRef(null);
  const reduced = useReducedMotion();
  const { theme } = useTheme();
  const [account, setAccount] = useState(() => (isAuthenticated ? currentAccount() : null));
  useScrollCraft(rootRef, reduced);

  useEffect(() => {
    const sync = () => setAccount(isAuthenticated ? currentAccount() : null);
    sync();
    window.addEventListener('cr-auth', sync);
    return () => window.removeEventListener('cr-auth', sync);
  }, [isAuthenticated]);
  useEffect(() => { document.title = 'Bảng giá | Customer Radar'; }, []);

  // Đã đăng nhập: nút chính của hero đưa xuống chỗ chọn và giữ chỗ gói
  const cta = isAuthenticated ? { href: '#chon-goi', label: 'Chọn gói' } : { to: '/signup', label: ACTION };
  const onJump = (i) => {
    const act = actRef.current;
    if (!act) return;
    if (reduced) act.scrollIntoView({ block: 'start' });
    else jumpToTier(act, i);
  };
  // Neo "Mỗi gói mở gì": dừng ở giữa phần của gói đầu (ổ khóa đã mở), không ở mép cảnh ghim
  const onUnlock = (e) => {
    e.preventDefault();
    onJump(0);
  };

  return (
    <div ref={rootRef} className="pg">
      <a className="pg-skip" href="#pg-main">Bỏ qua tới nội dung</a>
      <div className="pg-atmos" aria-hidden="true"><i /><i /><i /></div>
      <Nav isAuthenticated={isAuthenticated} onUnlock={onUnlock} />
      <main id="pg-main">
        <Hero cta={cta} onJump={onJump} onUnlock={onUnlock} theme={theme} />
        <Unlock actRef={actRef} reduced={reduced} theme={theme} />
        <Compare />
        <Questions />
        <Choose account={account} />
      </main>
    </div>
  );
};

export default Pricing;
