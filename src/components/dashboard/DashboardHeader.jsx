import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, RefreshCw } from 'lucide-react';

const loadReadIds = () => {
  try {
    const saved = localStorage.getItem('readNotifs');
    const parsed = saved && saved !== 'undefined' ? JSON.parse(saved) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const DashboardHeader = ({ risks = [], loading, error, lastUpdated }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState(loadReadIds);
  const menuRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('readNotifs', JSON.stringify([...readIds]));
  }, [readIds]);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng — bản cũ chỉ đóng khi bấm lại chuông
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => menuRef.current && !menuRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = risks.filter((r) => !readIds.has(r.id)).length;

  const openRisk = (id) => {
    setReadIds((prev) => new Set([...prev, id]));
    setOpen(false);
    navigate('/risk');
  };

  return (
    <header className="cx relative z-[110] mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-ink-hi">Tổng quan</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem] text-ink-mid">
          <span>Mọi con số được tính trên phản hồi đã qua tầng kiểm soát tin cậy dữ liệu</span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-lo">
            <span className={`size-1.5 rounded-full ${loading ? 'bg-high' : 'bg-ok'}`} aria-hidden="true" />
            <span className="tabular-nums">{loading ? 'đang cập nhật…' : `cập nhật lúc ${lastUpdated}`}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {error && <span className="text-sm text-crit">Lỗi kết nối API</span>}

        <button
          type="button"
          onClick={() => navigate('/data')}
          className="glass inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[0.82rem] font-semibold text-ink-mid transition-colors hover:text-ink-hi"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Đồng bộ dữ liệu
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`glass relative grid size-10 place-items-center rounded-full transition-colors ${open ? 'text-ink-hi' : 'text-ink-mid hover:text-ink-hi'}`}
          >
            <Bell size={18} aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute right-0 top-0 size-2.5 rounded-full bg-crit shadow-[0_0_10px_var(--sev-crit)] ring-2 ring-canvas" />
            )}
          </button>

          {open && (
            <div className="glass absolute right-0 top-[calc(100%+0.5rem)] w-80 overflow-hidden rounded-xl shadow-2xl">
              <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-hi">Thông báo</h3>
                {unread > 0 && (
                  <span className="rounded-full bg-crit/15 px-2 py-0.5 text-[0.68rem] font-semibold text-crit">{unread} mới</span>
                )}
              </div>
              <ul className="max-h-[300px] list-none overflow-y-auto">
                {risks.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-ink-lo">Không có thông báo mới</li>
                ) : (
                  risks.map((risk) => {
                    const isRead = readIds.has(risk.id);
                    return (
                      <li key={risk.id}>
                        <button
                          type="button"
                          onClick={() => openRisk(risk.id)}
                          className={`flex w-full gap-3 border-b border-line/30 px-4 py-3 text-left transition-colors ${
                            isRead ? 'opacity-60 hover:bg-raised/40' : 'bg-crit/[0.06] hover:bg-crit/[0.12]'
                          }`}
                        >
                          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead ? 'bg-transparent' : 'bg-crit'}`} />
                          <span className="min-w-0">
                            <span className="block text-[0.82rem] font-semibold text-ink-hi">Cảnh báo: {risk.issue}</span>
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-mid">{risk.insight}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <button
                type="button"
                onClick={() => setReadIds(new Set([...readIds, ...risks.map((r) => r.id)]))}
                className="w-full py-2.5 text-center text-xs font-medium text-accent-hi transition-colors hover:bg-raised/40"
              >
                Đánh dấu tất cả đã đọc
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
