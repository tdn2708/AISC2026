import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useDataVersion } from '../lib/dataVersion';
import FilterBar from './FilterBar';
import FeedbackTable from './FeedbackTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { readStorage, writeStorage } from '../lib/storage';
import SummaryHeader from './dashboard/SummaryHeader';
import StoreHealth from './dashboard/StoreHealth';
import TodayInbox, { buildTodo } from './dashboard/TodayInbox';
import SentimentTrendChart from './dashboard/SentimentTrendChart';
import SentimentShare from './dashboard/SentimentShare';
import RisingIssues from './dashboard/RisingIssues';
import LiveDigest from './dashboard/LiveDigest';
import { Button } from './ui';
import { useReducedMotion, MOTION } from './motion';

/**
 * TỔNG QUAN — việc cần làm trước, số liệu sau
 * ------------------------------------------------------------------
 *   [ Câu tóm tắt: hôm nay có mấy việc, việc nào gấp nhất            ]
 *   [ Bộ lọc                                                         ]
 *   [ Việc hôm nay: cảnh báo, livestream, đơn hàng, duyệt, dữ liệu   ]
 *   [ Cửa hàng đang thế nào: khiếu nại | không hài lòng | độ tin     ]
 *   [ Diễn biến cảm xúc                    8 ][ Phân bổ cảm xúc    4 ]
 *   [ Vấn đề đang tăng nhanh               6 ][ Livestream         6 ]
 *   [ Phản hồi gần đây                                               ]
 * Trên điện thoại, mọi khối xếp một cột theo đúng thứ tự trên: việc cần
 * làm luôn đứng trước số liệu mô tả.
 */

const nowLabel = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const Dashboard = () => {
  const [timeFilter, setTimeFilter] = useState(readStorage('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(readStorage('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(readStorage('productFilter') || 'All');

  useEffect(() => {
    writeStorage('timeFilter', timeFilter);
    writeStorage('sourceFilter', sourceFilter);
    writeStorage('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const { stats, sentiments, alerts, trend, loading, error, reload } = useDashboardData(timeFilter, sourceFilter, productFilter);
  // Lỗi chỉ tính khi chưa có số nào để hiện; có số cũ thì giữ số cũ (câu tóm tắt đã báo mất kết nối)
  const failed = Boolean(error) && !stats;

  // Việc ngoài cảnh báo (livestream, đơn hàng, duyệt, dữ liệu); làm mới mỗi phút
  const [inbox, setInbox] = useState([]);
  const [inboxFailed, setInboxFailed] = useState(false);
  // Câu tóm tắt đếm việc từ cả cảnh báo lẫn inbox: chưa có inbox thì chưa nói số (tránh chớp "1 việc" rồi "4 việc")
  const [inboxReady, setInboxReady] = useState(false);
  const [inboxAttempt, setInboxAttempt] = useState(0);
  const dataVersion = useDataVersion();
  useEffect(() => {
    let alive = true;
    const load = () => axios.get('/inbox')
      .then((r) => { if (alive) { setInbox(r.data.items || []); setInboxFailed(false); setInboxReady(true); } })
      .catch(() => { if (alive) { setInboxFailed(true); setInboxReady(true); } });
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [dataVersion, inboxAttempt]);
  const retryAll = () => {
    reload();
    setInboxAttempt((n) => n + 1);
  };
  const todo = buildTodo(alerts, inbox);

  // Sổ đối chiếu ở đầu trang: phễu của cả kho (thu thập, loại, được tính)
  const [ledger, setLedger] = useState(null);
  const [ledgerFailed, setLedgerFailed] = useState(false);
  const [ledgerAttempt, setLedgerAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    axios.get('/trust/health')
      .then((r) => { if (alive) { setLedger(r.data); setLedgerFailed(false); } })
      .catch(() => alive && setLedgerFailed(true));
    return () => { alive = false; };
  }, [dataVersion, ledgerAttempt]);
  const retryLedger = () => {
    setLedgerFailed(false);
    setLedgerAttempt((n) => n + 1);
  };

  // Nhịp mở đầu (F5-02): phép trừ chạy xong thì ba số của "Cửa hàng đang thế
  // nào" mới đếm. Không đợi mãi: sổ lỗi, hoặc chưa xong sau một lúc (sổ nằm
  // ngoài khung nhìn), thì vẫn cho đếm. Giảm chuyển động: không có nhịp nào.
  const reduced = useReducedMotion();
  const [ledgerDone, setLedgerDone] = useState(false);
  const onLedgerDone = useCallback(() => setLedgerDone(true), []);
  const hasStats = Boolean(stats);
  useEffect(() => {
    if (ledgerDone || !hasStats) return undefined;
    if (ledgerFailed) {
      setLedgerDone(true);
      return undefined;
    }
    const t = setTimeout(() => setLedgerDone(true), MOTION.story + 2500);
    return () => clearTimeout(t);
  }, [ledgerDone, hasStats, ledgerFailed]);

  const hasFilter = timeFilter !== 'All' || sourceFilter !== 'All' || productFilter !== 'All';
  const clearFilters = () => {
    setTimeFilter('All');
    setSourceFilter('All');
    setProductFilter('All');
  };

  // Mốc cập nhật đổi khi dữ liệu về xong, không phải mỗi lần render
  const [lastUpdated, setLastUpdated] = useState(nowLabel);
  useEffect(() => {
    if (!loading) setLastUpdated(nowLabel());
  }, [loading]);

  return (
    <div className="cx pt-2">
      <SummaryHeader
        stats={stats} todo={todo} todoReady={inboxReady} loading={loading} error={error} lastUpdated={lastUpdated}
        ledger={ledger} ledgerFailed={ledgerFailed} onRetryLedger={retryLedger} onLedgerDone={onLedgerDone}
        evidence={hasFilter ? null : stats?.evidence?.all}
      />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
      />

      {/* Bộ lọc được lưu qua các lần mở trang: lọc trúng một nhóm không có phản hồi
          nào được tính (vd. một sản phẩm vừa cào, toàn đánh giá cũ) thì mọi thẻ về
          0 — phải nói rõ là do bộ lọc */}
      {!loading && hasFilter && stats?.totalFeedbacks?.valid === 0 && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-ctrl bg-high/10 px-4 py-3 text-sm text-ink-hi">
          <span>
            Bộ lọc đang chọn không có phản hồi nào được tính vào chỉ số
            {stats.totalFeedbacks.value > 0 && ` (${stats.totalFeedbacks.value} phản hồi thô đều quá cũ hoặc bị Trust Layer loại)`}
            , nên các con số bên dưới đều trống.
          </span>
          <Button variant="link" size="sm" onClick={clearFilters}>
            Xoá bộ lọc, xem toàn bộ
          </Button>
        </div>
      )}

      {/* Tải lại thì giữ khung cũ ở độ mờ thấp: không nháy, không nhảy bố cục */}
      <div className={`transition-opacity duration-short ease-out ${loading && stats ? 'opacity-60' : ''}`} aria-busy={loading}>
        <TodayInbox alerts={alerts} items={inbox} loading={loading} failed={failed || inboxFailed} onRetry={retryAll} />

        <StoreHealth stats={stats} trend={trend} loading={loading} failed={failed} onRetry={reload} countStart={reduced || ledgerDone} />

        <div className="mb-8 grid grid-cols-12 items-start gap-6">
          <section aria-label="Diễn biến cảm xúc" className="col-span-12 xl:col-span-8">
            <SentimentTrendChart data={trend} loading={loading && !stats} failed={failed} onRetry={reload} />
          </section>
          <section aria-label="Phân bổ cảm xúc" className="col-span-12 md:col-span-6 xl:col-span-4">
            <SentimentShare data={sentiments} loading={loading && !stats} failed={failed} onRetry={reload} />
          </section>
          <section aria-label="Vấn đề đang tăng nhanh" className="col-span-12 md:col-span-6 xl:col-span-6 xl:[&:has(+section:empty)]:col-span-12">
            <RisingIssues alerts={alerts} loading={loading && !stats} failed={failed} onRetry={reload} />
          </section>
          <section aria-label="Livestream" className="col-span-12 xl:col-span-6 [&>div]:mt-0">
            <LiveDigest />
          </section>
        </div>

        <section aria-label="Phản hồi gần đây">
          <FeedbackTable timeFilter={timeFilter} sourceFilter={sourceFilter} productFilter={productFilter} />
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
