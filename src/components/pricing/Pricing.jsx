import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock, LockOpen, ChevronDown } from 'lucide-react';
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
 * TRANG BẢNG GIÁ (/bang-gia), ngữ pháp "Bậc thang mở khóa"
 * ------------------------------------------------------------------
 * Brief, đường cảm xúc, bảng điểm: scrollcraft/builds/bang-gia/BRIEF.md.
 *   1. Hero      ba bậc giá nhô lên một lần khi mở trang (khoảnh khắc dàn dựng duy nhất)
 *   2. ĐỈNH      cảnh ghim "mở khóa theo thanh cuộn": cuộn qua từng bậc thì tính năng của bậc
 *                đó lật từ "Khóa" sang "Đã mở" và ảnh chụp app thật của nó quét vào khung
 *   3. So sánh   bảng đủ các dòng, hiện dần theo dòng khi tới
 *   4. Câu hỏi   ba câu, mở gập khi bấm
 *   5. Chốt      chọn gói, đứng yên. Đã đăng nhập: thấy gói đang dùng, giữ chỗ gói cao hơn
 * Giá dự kiến, chưa thu tiền (src/lib/plans.js); không có số liệu hay lời khen nào được bịa.
 */

const ACTION = 'Dùng thử miễn phí';

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

const Nav = ({ isAuthenticated }) => (
  <header className="pg-nav glass-chrome">
    <div className="pg-wrap pg-nav__inner">
      <Link to="/" className="pg-brand" aria-label="Customer Radar, về trang giới thiệu">
        <LogoMark size={26} />
        <span>Customer Radar</span>
      </Link>
      <nav aria-label="Bảng giá" className="pg-nav__links">
        <a className="pg-navlink" href="#mo-khoa">Mỗi gói mở gì</a>
        <a className="pg-navlink" href="#so-sanh">So sánh</a>
        <Button as={Link} to={isAuthenticated ? '/dashboard' : '/login'} size="sm" variant="secondary">
          {isAuthenticated ? 'Vào ứng dụng' : 'Đăng nhập'}
        </Button>
      </nav>
    </div>
  </header>
);

/** HERO: ba bậc giá, bậc sau cao hơn bậc trước; bấm một bậc là cuộn tới chỗ nó mở khóa */
const Hero = ({ cta, onJump }) => (
  <section className="pg-hero" aria-labelledby="pg-h1">
    <div className="pg-wrap pg-hero__grid">
      <div className="pg-hero__copy">
        <h1 id="pg-h1" className="pg-h1">Mở khóa theo nhịp shop lớn lên.</h1>
        <p className="pg-hero__lede">Bắt đầu miễn phí, thêm Quản gia Zalo và livestream khi cần.</p>
        <div className="pg-actions">
          <Button as={Link} to={cta.to} size="lg">{cta.label}</Button>
          <a className="pg-textlink" href="#mo-khoa">Xem mỗi gói mở gì</a>
        </div>
      </div>
      <ul className="pg-stairs" aria-label="Ba gói, từ thấp tới cao">
        {PLANS.map((p, i) => (
          <li key={p.id} className={`pg-step pg-step--${i + 1}`} style={{ '--i': i }}>
            <button type="button" onClick={() => onJump(i)} aria-label={`${p.name}, ${p.price}${p.unit}. Xem gói này mở gì`}>
              <span className="pg-step__name">{p.name}</span>
              <span className="pg-step__price">{p.priceShort}<span className="pg-step__unit">{p.priceShort === '0' ? ' đ' : ' đ mỗi tháng'}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
    <p className="pg-wrap pg-note">{PRICE_NOTE}</p>
  </section>
);

/**
 * ĐỈNH: cảnh ghim mở khóa theo thanh cuộn. Tiến độ đọc từ vị trí của chính cảnh ghim
 * (như PeakLedger ở trang giới thiệu); chia ba đoạn bằng nhau cho ba bậc.
 */
function useActProgress(actRef, enabled) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = actRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = Math.max(1, r.height - window.innerHeight);
      const v = Math.min(1, Math.max(0, -r.top / travel));
      setT((old) => (Math.abs(old - v) > 0.002 ? v : old));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [actRef, enabled]);
  return t;
}

const tierOf = (t) => (t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2);

const Unlock = ({ actRef, reduced, theme }) => {
  const t = useActProgress(actRef, !reduced);
  usePreloadShots(theme);
  const tier = reduced ? 2 : tierOf(t);

  if (reduced) {
    // Giảm chuyển động: ba bậc xếp dọc, mở sẵn cả ba
    return (
      <section id="mo-khoa" ref={actRef} className="pg-unlock is-static" aria-labelledby="pg-unlock-h">
        <div className="pg-wrap">
          <h2 id="pg-unlock-h" className="pg-h2">Mỗi bậc mở thêm một việc.</h2>
          {PLANS.map((p, i) => (
            <div key={p.id} className="pg-static-tier">
              <TierText plan={p} index={i} open />
              <ShotFrame plan={p} theme={theme} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="mo-khoa" ref={actRef} className="pg-unlock" data-sc-act="pin" data-sc-span="3.6" aria-labelledby="pg-unlock-h">
      <div data-sc-stage="" className="pg-unlock__stage" style={{ '--pg-t': t }}>
        <div className="pg-wrap pg-unlock__grid">
          <div className="pg-unlock__side">
            <h2 id="pg-unlock-h" className="pg-h2">Mỗi bậc mở thêm một việc.</h2>
            <ol className="pg-rail" aria-label="Các bậc">
              {PLANS.map((p, i) => (
                <li key={p.id} className={`pg-rail__stop ${i <= tier ? 'is-on' : ''} ${i === tier ? 'is-here' : ''}`}>
                  <button type="button" onClick={() => jumpToTier(actRef.current, i)} aria-current={i === tier ? 'step' : undefined}>
                    <span className="pg-rail__name">{p.name}</span>
                    <span className="pg-rail__price">{p.price}{p.unit}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="pg-unlock__list" aria-live="polite">
              <TierText key={tier} plan={PLANS[tier]} index={tier} open />
            </div>
          </div>
          {/* Chỉ dựng ảnh của bậc đang đứng; đổi bậc thì ảnh mới quét vào (không ảnh nào bị ẩn sẵn chờ script) */}
          <div className="pg-unlock__shots">
            <ShotFrame key={tier} plan={PLANS[tier]} theme={theme} />
          </div>
        </div>
      </div>
    </section>
  );
};

/** Cuộn tới giữa đoạn của một bậc trong cảnh ghim */
function jumpToTier(act, i) {
  if (!act) return;
  const top = act.getBoundingClientRect().top + window.scrollY;
  const travel = Math.max(1, act.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + travel * ((i + 0.5) / 3), behavior: 'smooth' });
}

const TierText = ({ plan, index, open }) => (
  <div className="pg-tier">
    <p className="pg-tier__lead">{index === 0 ? `${plan.name} mở` : `${plan.name} mở thêm`}</p>
    <ul className="pg-tier__list">
      {plan.unlocks.map((u, k) => (
        <li key={u} className="pg-tier__item" style={{ '--k': k }}>
          <span className="pg-lock" aria-hidden="true">
            <Lock size={16} className="pg-lock__shut" />
            <LockOpen size={16} className="pg-lock__open" />
          </span>
          <span>{u}</span>
          <span className="sr-only">{open ? ', đã mở' : ', đang khóa'}</span>
        </li>
      ))}
    </ul>
  </div>
);

const ShotFrame = ({ plan, theme }) => (
  <figure className="pg-shot">
    <img src={shotSrc(plan.shot, theme)} width={plan.shot.w} height={plan.shot.h} alt={plan.shot.alt} decoding="async" />
  </figure>
);

/** Tải sẵn ảnh của cả ba bậc để lúc đổi bậc ảnh quét vào ngay, không chờ mạng */
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
              {PLANS.map((p) => <th key={p.id} scope="col">{p.name}</th>)}
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
const Choose = ({ account, cta }) => {
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
    if (!account) return <Button as={Link} to={cta.to} variant={variantFor(p)} block>{p.id === 'try' ? ACTION : 'Đăng ký'}</Button>;
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
    <section className="pg-choose" aria-labelledby="pg-choose-h">
      <div className="pg-wrap">
        <h2 id="pg-choose-h" className="pg-h2">Chọn gói cho shop.</h2>
        <p className="pg-choose__note">Giá dự kiến, chưa thu tiền.</p>
        {account?.isDemo && <p className="pg-choose__note">Tài khoản mẫu dùng chung đã mở mọi tính năng trên kho Mô phỏng.</p>}
        <ul className="pg-cards">
          {PLANS.map((p) => (
            <li key={p.id} className={`pg-card ${p.id === 'live' ? 'pg-card--ink' : ''}`}>
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

  const cta = isAuthenticated ? { to: '/dashboard', label: 'Vào ứng dụng' } : { to: '/signup', label: ACTION };
  const onJump = (i) => {
    const act = actRef.current;
    if (!act) return;
    if (reduced) act.scrollIntoView({ block: 'start' });
    else jumpToTier(act, i);
  };

  return (
    <div ref={rootRef} className="pg">
      <a className="pg-skip" href="#pg-main">Bỏ qua tới nội dung</a>
      <Nav isAuthenticated={isAuthenticated} />
      <main id="pg-main">
        <Hero cta={cta} onJump={onJump} />
        <Unlock actRef={actRef} reduced={reduced} theme={theme} />
        <Compare />
        <Questions />
        <Choose account={account} cta={cta} />
      </main>
    </div>
  );
};

export default Pricing;
