import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../Logo';
import { useReducedMotion } from '../motion';

/**
 * KHỐI MỰC BA LỚP CHO TRANG ĐĂNG NHẬP QUẢN TRỊ (mục 5.3.1)
 * ------------------------------------------------------------------
 * Ba lớp position: absolute chồng lên nhau trên nền mực của Customer Radar:
 *   1. Lớp sau:   lưới kẻ ngang 28px (admin-ink-grid dùng --sheet-rule), dịch tối đa 4px
 *   2. Lớp giữa:  hai góc khung ngắm A2 lớn cách khối chữ 24px, dịch tối đa 8px
 *   3. Lớp trước: tiêu đề và câu mô tả (chữ thật, đứng yên)
 *
 * Chỉ dịch theo chuột trên thiết bị có con trỏ mịn và không bật giảm chuyển động.
 * Rời chuột thì về 0 trong 240ms. Điện thoại thu còn dải cao 160px ở trên.
 */

const LERP = 0.12;
const BACK_MAX = 4;
const MID_MAX = 8;

const BigCorner = ({ which }) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute block ${which === 'a' ? '-top-6 -right-6' : '-bottom-6 -left-6'}`}
    style={{ color: 'var(--accent-on-strip)' }}
  >
    <svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="miter">
      <path d={which === 'a' ? 'M4 2.5H25.5V24' : 'M2.5 4V25.5H24'} />
    </svg>
  </span>
);

const TitleCopy = ({ hidden = false }) => {
  const Heading = hidden ? 'p' : 'h2';
  return (
    <div className={`w-full max-w-[29rem] ${hidden ? 'invisible select-none' : ''}`} aria-hidden={hidden || undefined}>
      <Heading className="text-heading font-semibold tracking-[-0.02em] text-balance lg:text-cover">
        Bàn điều khiển máy chủ
      </Heading>
      <p className="mt-2 text-sm leading-relaxed text-on-strip-mid lg:mt-4 lg:text-base">
        Chỉ dành cho quản trị viên. Mọi thao tác đều được ghi lại.
      </p>
    </div>
  );
};

const AdminInk = () => {
  const reduced = useReducedMotion();
  const rootRef = useRef(null);
  const backRef = useRef(null);
  const midRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const back = backRef.current;
    const mid = midRef.current;
    if (!root || !back || !mid) return undefined;

    const resetImmediate = () => {
      back.style.transition = '';
      mid.style.transition = '';
      back.style.transform = 'translate3d(0, 0, 0)';
      mid.style.transform = 'translate3d(0, 0, 0)';
    };

    if (reduced) {
      resetImmediate();
      return undefined;
    }

    let fine = false;
    try {
      fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
      fine = false;
    }
    if (!fine) {
      resetImmediate();
      return undefined;
    }

    let raf = 0;
    let active = false;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const tick = () => {
      raf = 0;
      cx += (tx - cx) * LERP;
      cy += (ty - cy) * LERP;
      back.style.transform = `translate3d(${(cx * BACK_MAX).toFixed(2)}px, ${(cy * BACK_MAX).toFixed(2)}px, 0)`;
      mid.style.transform = `translate3d(${(cx * MID_MAX).toFixed(2)}px, ${(cy * MID_MAX).toFixed(2)}px, 0)`;
      if (active || Math.abs(tx - cx) > 0.004 || Math.abs(ty - cy) > 0.004) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    const onMove = (e) => {
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (!active) {
        active = true;
        back.style.transition = '';
        mid.style.transition = '';
      }
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      tx = Math.max(-1, Math.min(1, nx));
      ty = Math.max(-1, Math.min(1, ny));
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const onLeave = () => {
      active = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      tx = 0;
      ty = 0;
      cx = 0;
      cy = 0;
      const ret = 'transform 240ms var(--ease-out)';
      back.style.transition = ret;
      mid.style.transition = ret;
      back.style.transform = 'translate3d(0, 0, 0)';
      mid.style.transform = 'translate3d(0, 0, 0)';
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced]);

  return (
    <section
      ref={rootRef}
      aria-label="Bàn điều khiển máy chủ"
      className="relative h-[160px] overflow-hidden bg-strip text-on-strip lg:h-auto lg:min-h-dvh"
    >
      {/* Lớp 1 (sau): lưới kẻ ngang 28px */}
      <div
        ref={backRef}
        aria-hidden="true"
        className="admin-ink-grid pointer-events-none absolute -inset-3 will-change-transform"
      />

      {/* Lớp 2 (giữa): hai góc khung ngắm A2 ôm khối chữ tiêu đề, cách mép chữ 24px */}
      <div
        ref={midRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 lg:px-14 will-change-transform"
      >
        <div className="relative w-full max-w-[29rem]">
          <BigCorner which="a" />
          <BigCorner which="b" />
          <TitleCopy hidden />
        </div>
      </div>

      {/* Lớp 3 (trước): logo, tiêu đề, câu dưới và bản quyền (chữ thật, đứng yên) */}
      <div className="absolute inset-0 flex items-center justify-center px-8 lg:px-14">
        <div
          className="hidden lg:block lg:absolute lg:top-12 lg:left-12"
          style={{ '--text-hi': 'var(--on-strip)', '--accent': 'var(--accent-on-strip)' }}
        >
          <Link to="/" aria-label="Customer Radar, về trang giới thiệu" className="inline-block rounded-ctrl">
            <Logo size="md" showTagline={false} />
          </Link>
        </div>

        <TitleCopy />

        <p className="hidden text-xs text-on-strip-lo lg:block lg:absolute lg:bottom-12 lg:left-12">
          © 2026 Customer Radar, đội LDS, Trường Đại học Công nghệ Thông tin
        </p>
      </div>
    </section>
  );
};

export default AdminInk;
