import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../Logo';
import { EvidenceSwatch } from '../ui';
import { LedgerRun, useReducedMotion, MOTION, EASE } from '../motion';
import LedgerSkeleton from '../dashboard/LedgerSkeleton';

/**
 * KHUNG CHUNG CỦA BA TRANG TÀI KHOẢN: /auth (chọn), /login, /signup
 * ------------------------------------------------------------------
 * Trái: khối mực đứng yên ở cả ba trang (sổ đối chiếu thật của kho đang chọn,
 * như trang đăng nhập cũ). Phải: một "ô" đổi nội dung theo đường dẫn.
 *
 * Chữ ký của luồng này là KHUNG NGẮM: hai góc lấy đúng nét của logo A2 (góc
 * trên phải, góc dưới trái), bám vào thứ người dùng đang chọn. Ở trang chọn,
 * khung ôm lựa chọn đang rê hoặc đang focus; bấm vào thì khung bay sang ô
 * nhập đầu tiên của trang mới; trong biểu mẫu, khung theo ô đang focus.
 * Hai góc chỉ dịch chuyển (transform), không co giãn.
 *
 * Chuyển trang: View Transitions API. Ô cũ mờ và lùi 20px, ô mới hiện và tiến
 * 24px theo hướng đi (tới là sang trái, lui là sang phải); hai góc là hai lớp
 * riêng nên trình duyệt cho chúng bay từ chỗ cũ sang chỗ mới. Trình duyệt
 * không có API, hoặc bấm nút Back: ô mới hiện bằng Web Animations, góc trượt
 * bằng transition. Giảm chuyển động: đổi ngay, không hiệu ứng.
 * Lần mở đầu tiên dùng PageEnter (M1) như mọi trang khác.
 */

const ORDER = { '/auth': 0, '/login': 1, '/signup': 2 };
const PAD = 8; // khung đứng cách mép thứ được ngắm
const SIZE = 14; // cạnh mỗi góc

/**
 * Hộp của `el` so với `stage` theo bố cục, bỏ qua mọi transform đang chạy.
 * Cộng offsetLeft/Top theo chuỗi offsetParent tới stage (stage là position: relative).
 * Chuỗi không về tới stage (hiếm) thì dùng hình đang hiện.
 */
const layoutBox = (el, stage) => {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== stage) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  if (n === stage) return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
};

const supportsVT = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

const AuthCtx = createContext(null);
export const useAuthFlow = () => useContext(AuthCtx);

const PROOF = [
  { kind: 'verified', text: 'Có chứng từ: khớp đơn hàng hoặc sàn xác nhận đã mua' },
  { kind: 'human', text: 'Người kiểm duyệt đã đọc lại' },
  { kind: 'inferred', text: 'AI đoán, chưa có chứng từ' }
];

/** Một góc khung ngắm, cùng nét với logo (đầu tròn, góc vuông) */
const Corner = React.forwardRef(({ which }, ref) => (
  <span ref={ref} className={`auth-corner auth-corner-${which}`} aria-hidden="true">
    <svg viewBox="0 0 14 14" width={SIZE} height={SIZE} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="miter">
      <path d={which === 'a' ? 'M2 1.5H12.5V12' : 'M1.5 2V12.5H12'} />
    </svg>
  </span>
));
Corner.displayName = 'Corner';

const InkBlock = () => {
  // Sổ đối chiếu thật: người mở link thấy sản phẩm làm gì trước khi có tài khoản
  const [ledger, setLedger] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    axios.get('/trust/health').then((r) => alive && setLedger(r.data)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  return (
    // overflow-clip: dải chữ số cuộn của sổ (ledger-roll-strip) nằm ngoài khung nhìn, không cắt thì trang có thanh cuộn thừa
    <section className="hidden overflow-clip flex-col justify-between bg-strip p-12 text-on-strip lg:flex">
      {/* Đổi token chữ cục bộ để logo và chữ đọc được trên nền mực */}
      <div style={{ '--text-hi': 'var(--on-strip)', '--accent': 'var(--accent-on-strip)' }}>
        <Link to="/" aria-label="Customer Radar, về trang giới thiệu" className="inline-block rounded-ctrl">
          <Logo size="md" showTagline={false} />
        </Link>
      </div>
      <div className="max-w-[34rem]">
        <h2 className="text-cover font-semibold tracking-[-0.02em] text-balance">
          Phản hồi khách hàng, kèm bằng chứng cho từng con số.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-on-strip-mid">
          Đánh giá ảo, quảng cáo và chiến dịch có tổ chức bị lọc trước khi được tính. Phần còn lại cho bạn biết
          con số nào dựa trên chứng từ, con số nào do AI đoán.
        </p>
        {!failed ? (
          <div className="mt-8 max-w-[400px]">
            {ledger ? <LedgerRun ledger={ledger} mode="auto" play={false} showLink={false} /> : <LedgerSkeleton />}
          </div>
        ) : (
          <ul className="mt-8 flex list-none flex-col gap-3 text-sm text-on-strip-mid">
            {PROOF.map((p) => (
              <li key={p.kind} className="flex items-center gap-3">
                <span style={{ '--accent': 'var(--accent-on-strip)' }}><EvidenceSwatch kind={p.kind} size={14} /></span>
                {p.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-on-strip-lo">© 2026 Customer Radar, đội LDS, Trường Đại học Công nghệ Thông tin</p>
    </section>
  );
};

const AuthShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const stageRef = useRef(null);
  const paneRef = useRef(null);
  const aRef = useRef(null);
  const bRef = useRef(null);
  const targetRef = useRef(null); // thứ đang được ngắm (rê, focus)
  const homeRef = useRef(null); // chỗ khung về khi không ngắm gì (do từng trang đặt)
  const pendingRef = useRef(null);
  const navigatedRef = useRef(false);
  const dirRef = useRef(1);
  const viaVTRef = useRef(false);
  const pathRef = useRef(location.pathname);
  const searchRef = useRef(location.search);
  const lastKeyRef = useRef(location.key);

  /** Đặt hai góc quanh thứ đang ngắm; không có gì để ngắm thì ẩn */
  const place = useCallback(() => {
    const stage = stageRef.current;
    const a = aRef.current;
    const b = bRef.current;
    if (!stage || !a || !b) return;
    const t = targetRef.current?.isConnected ? targetRef.current : homeRef.current?.isConnected ? homeRef.current : null;
    if (!t) {
      a.removeAttribute('data-on');
      b.removeAttribute('data-on');
      return;
    }
    // Đo theo bố cục (offset*), KHÔNG theo getBoundingClientRect: lúc trang vừa mở nội dung còn
    // đang trượt (PageEnter dịch 12px, nút Back dịch 24px), đo theo hình đang chạy thì khung chốt lệch
    const r = layoutBox(t, stage);
    const left = r.left - PAD;
    const top = r.top - PAD;
    const right = r.left + r.width + PAD - SIZE;
    const bottom = r.top + r.height + PAD - SIZE;
    a.style.transform = `translate(${Math.round(right)}px, ${Math.round(top)}px)`;
    b.style.transform = `translate(${Math.round(left)}px, ${Math.round(bottom)}px)`;
    a.setAttribute('data-on', '');
    b.setAttribute('data-on', '');
    // Lần đặt đầu: hiện tại chỗ, không bay từ góc trên trái vào
    if (!stage.hasAttribute('data-ready')) requestAnimationFrame(() => stage.setAttribute('data-ready', ''));
  }, []);

  const frame = useCallback((el) => {
    targetRef.current = el || null;
    place();
  }, [place]);

  const setHome = useCallback((el) => {
    homeRef.current = el || null;
    place();
  }, [place]);

  const settle = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    p.resolve();
  }, []);

  /** Điều hướng giữa ba trang có hiệu ứng; giữ ?next= khi đi giữa chúng */
  const go = useCallback((to, { state, replace = false } = {}) => {
    const dest = to.includes('?') ? to : `${to}${searchRef.current}`;
    const destPath = dest.split('?')[0];
    if (destPath === pathRef.current) return;
    dirRef.current = (ORDER[destPath] ?? 1) >= (ORDER[pathRef.current] ?? 0) ? 1 : -1;
    navigatedRef.current = true;
    if (reduced || !supportsVT()) {
      viaVTRef.current = false;
      navigate(dest, { state, replace });
      return;
    }
    const root = document.documentElement;
    root.classList.add('vt-auth');
    root.style.setProperty('--auth-dir', String(dirRef.current));
    viaVTRef.current = true;
    const vt = document.startViewTransition(
      () =>
        new Promise((resolve) => {
          pendingRef.current = { resolve, timer: setTimeout(settle, 600) };
          navigate(dest, { state, replace });
        })
    );
    vt.finished.finally(() => {
      root.classList.remove('vt-auth');
      root.style.removeProperty('--auth-dir');
      viaVTRef.current = false;
    });
  }, [navigate, reduced, settle]);

  // Trang mới đã gắn: trang con đã đặt "home" trong layout effect của nó (chạy trước
  // effect này), nên khung đã ở chỗ mới khi View Transition chụp trạng thái mới.
  useLayoutEffect(() => {
    pathRef.current = location.pathname;
    searchRef.current = location.search;
    // Lần gắn đầu (và lần chạy lại của StrictMode) không có gì để chuyển: PageEnter lo màn vào.
    // So theo key chứ không theo cờ "đã gắn": Back về trang đầu mang key khác key đang hiện.
    if (location.key === lastKeyRef.current) return;
    lastKeyRef.current = location.key;
    // Không xóa targetRef: trang mới có thể vừa focus ô đầu (khung phải ở đó);
    // nếu targetRef còn là phần tử của trang cũ thì nó đã rời DOM và place() bỏ qua
    place();
    if (pendingRef.current) {
      settle();
      return;
    }
    // Không qua View Transition (trình duyệt cũ, nút Back): ô mới hiện bằng Web Animations
    navigatedRef.current = true;
    const pane = paneRef.current;
    if (!reduced && pane?.animate) {
      const dir = location.state?.dir ?? dirRef.current;
      pane.animate(
        [{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }],
        { duration: MOTION.medium, easing: EASE.out, fill: 'backwards' }
      );
    }
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bố cục đổi (cửa sổ co giãn, dòng lỗi xuất hiện, font về muộn): đặt lại khung
  useEffect(() => {
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    let ro;
    if (typeof ResizeObserver === 'function' && paneRef.current) {
      ro = new ResizeObserver(onResize);
      ro.observe(paneRef.current);
    }
    document.fonts?.ready?.then(onResize).catch(() => {});
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [place]);

  useEffect(() => {
    const t = { '/auth': 'Vào Customer Radar', '/login': 'Đăng nhập', '/signup': 'Tạo tài khoản' }[location.pathname];
    document.title = t ? `${t} | Customer Radar` : 'Customer Radar';
  }, [location.pathname]);

  // Rời khung (đăng nhập xong) giữa lúc chuyển: đừng để View Transition treo
  useEffect(() => () => settle(), [settle]);

  const ctx = useMemo(() => ({ go, frame, setHome, isFirstView: () => !navigatedRef.current }), [go, frame, setHome]);

  return (
    <AuthCtx.Provider value={ctx}>
      <div className="cx grid min-h-screen min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(440px,1fr)]">
        <InkBlock />
        <section ref={stageRef} className="auth-stage relative flex min-w-0 flex-col px-6 py-8 sm:px-10">
          <div className="mb-10 lg:hidden">
            <Link to="/" aria-label="Customer Radar, về trang giới thiệu" className="inline-block rounded-ctrl">
              <Logo size="md" showTagline={false} />
            </Link>
          </div>
          <main id="noi-dung" ref={paneRef} className="auth-pane mx-auto w-full max-w-[400px] lg:pt-[10vh]">
            <Outlet />
          </main>
          <Corner which="a" ref={aRef} />
          <Corner which="b" ref={bRef} />
        </section>
      </div>
    </AuthCtx.Provider>
  );
};

export default AuthShell;
