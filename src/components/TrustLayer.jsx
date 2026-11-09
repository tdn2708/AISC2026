import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Copy, Zap, UserX, Star, Receipt, HelpCircle, CheckCircle2, XCircle, Ban, ChevronDown, ShieldCheck, ShieldOff
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, GlassPanel, PanelHeader, Stepper, Switch, Badge, ProgressBar, EmptyState, Button, Tabs } from './ui';
import Audit from './trust/Audit';
import { fmtInt, fmtDateTime } from '../lib/format';

/**
 * TIN CẬY DỮ LIỆU
 * ------------------------------------------------------------------
 * Toàn bộ hoạt động của Trust Layer hiển thị công khai: phễu dữ liệu, điểm
 * sức khỏe, so sánh có / không có Trust Layer, các nguồn được tin đến đâu,
 * cụm đánh giá giống nhau, và hàng đợi để người kiểm duyệt đọc lại.
 */

const SIGNAL_ICONS = {
  'Trùng lặp gần về nội dung': Copy,
  'Đột biến thời gian': Zap,
  'Bất thường hành vi tài khoản': UserX,
  'Bất nhất điểm sao và nội dung': Star,
  'Bất nhất với dữ liệu giao dịch': Receipt
};

const pct1 = (v) => `${String(v).replace('.', ',')}%`;

const Signal = ({ s, tone = 'high' }) => {
  const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
  return (
    <span title={s.detail || ''}>
      <Badge tone={tone} icon={Icon}>{s.signal}</Badge>
    </span>
  );
};

/** Vòng sức khỏe dữ liệu */
const HealthDial = ({ score = 0 }) => {
  const R = 58;
  const C = 2 * Math.PI * R;
  const tone = score >= 75 ? 'var(--sev-ok)' : score >= 50 ? 'var(--sev-high)' : 'var(--sev-crit)';
  const label = score >= 75 ? 'Đáng tin cậy' : score >= 50 ? 'Cần chú ý' : 'Rủi ro cao';
  return (
    <div className="relative size-[150px] shrink-0">
      <svg viewBox="0 0 150 150" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--raised)" strokeWidth="10" />
        <circle
          cx="75" cy="75" r={R} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="font-mono text-4xl leading-none font-semibold text-ink-hi">{score}</span>
        <span className="mt-1 text-xs text-ink-lo">trên 100</span>
        <span className="mt-1.5 text-xs font-medium" style={{ color: tone }}>{label}</span>
      </div>
    </div>
  );
};

const TrustOverview = () => {
  const [health, setHealth] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [queue, setQueue] = useState([]);
  const [impact, setImpact] = useState(null);
  const [trustOn, setTrustOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCluster, setOpenCluster] = useState(null);
  const [labelling, setLabelling] = useState(null);
  const [labelError, setLabelError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [h, c, q, i] = await Promise.all([
        axios.get('/trust/health'),
        axios.get('/trust/clusters'),
        axios.get('/trust/queue?limit=20'),
        axios.get('/trust/impact')
      ]);
      setHealth(h.data);
      setClusters(c.data);
      setQueue(q.data);
      setImpact(i.data);
      setError(null);
    } catch (e) {
      console.error('Lỗi tải Trust Layer:', e);
      setError('Không tải được dữ liệu. Kiểm tra máy chủ đã chạy chưa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitLabel = async (feedbackId, label) => {
    try {
      setLabelling(feedbackId);
      setLabelError(null);
      await axios.post('/trust/label', { feedbackId, label });
      setQueue((prev) => prev.filter((q) => q._id !== feedbackId));
      load();
    } catch (e) {
      setLabelError(`Không lưu được nhãn: ${e.message}`);
    } finally {
      setLabelling(null);
    }
  };

  // Tiêu đề trang và thanh tab do TrustLayerPage dựng
  const header = null;

  if (error) return <div>{header}<GlassPanel><EmptyState variant="error" title="Không tải được" description={error} action={<Button onClick={load}>Thử lại</Button>} /></GlassPanel></div>;
  if (loading && !health) {
    return (
      <div>
        {header}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-[260px] animate-pulse rounded-xl bg-raised lg:col-span-2" />
          <div className="h-[260px] animate-pulse rounded-xl bg-raised" />
        </div>
      </div>
    );
  }

  const shown = trustOn ? impact?.withTrustLayer : impact?.withoutTrustLayer;
  const comps = health.components || {};

  return (
    <div>
      {header}

      <div className="mb-6 grid items-start gap-6 lg:grid-cols-3">
        <GlassPanel tone="strong" className="flex flex-col p-6 lg:col-span-2">
          <PanelHeader title="Phễu dữ liệu" subtitle="Từ lúc thu thập tới lúc được tính vào chỉ số" />
          <Stepper
            className="mb-6"
            steps={[
              { label: 'Thu thập được', value: fmtInt(health.rawCollected), tone: 'neutral' },
              { label: 'Loại vì rác, quảng cáo', value: `−${fmtInt(health.spamRemoved.count)}`, tone: 'high', sub: pct1(health.spamRemoved.pct) },
              {
                label: 'Loại vì nghi đánh giá ảo',
                value: `−${fmtInt(health.inauthenticFlagged.count)}`,
                tone: 'crit',
                sub: health.inauthenticFlagged.duplicateClusters ? `${pct1(health.inauthenticFlagged.pct)}, ${health.inauthenticFlagged.duplicateClusters} cụm` : pct1(health.inauthenticFlagged.pct)
              },
              { label: 'Chờ người duyệt', value: fmtInt(health.pendingReview.count), tone: 'med', sub: pct1(health.pendingReview.pct) },
              { label: 'Được tính vào chỉ số', value: fmtInt(health.validForAnalysis), tone: 'ok', marker: '✓' }
            ]}
          />
          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-xs">
            <div className="flex gap-1.5"><dt className="text-ink-lo">Số kênh có dữ liệu</dt><dd className="font-mono font-semibold text-ink-hi">{health.channelCoverage.covered}/{health.channelCoverage.expected}</dd></div>
            <div className="flex gap-1.5"><dt className="text-ink-lo">Khớp với đơn hàng</dt><dd className="font-mono font-semibold text-ink-hi">{pct1(health.reconciliationRate)}</dd></div>
            {health.lowInformation?.count > 0 && (
              <div className="flex gap-1.5" title="Đánh giá ngắn kiểu “ok”, “hàng tốt”: không phải rác, vẫn được tính vào chỉ số">
                <dt className="text-ink-lo">Đánh giá ngắn, vẫn được tính</dt>
                <dd className="font-mono font-semibold text-ink-hi">{fmtInt(health.lowInformation.count)}</dd>
              </div>
            )}
            {health.halfLifeDays && (
              <div className="flex gap-1.5"><dt className="text-ink-lo">Trọng số giảm một nửa sau</dt><dd className="font-mono font-semibold text-ink-hi">{health.halfLifeDays} ngày</dd></div>
            )}
            <div className="flex gap-1.5"><dt className="text-ink-lo">Độ trễ thu thập</dt><dd className="font-mono font-semibold text-ink-hi">{health.ingestionLagMinutes != null ? `${fmtInt(health.ingestionLagMinutes)} phút` : 'chưa rõ'}</dd></div>
          </dl>
        </GlassPanel>

        <GlassPanel tone="strong" className="flex flex-col items-center p-6 text-center">
          <PanelHeader title="Độ tin số liệu" className="w-full text-left" />
          <HealthDial score={health.dataHealthScore} />
          <div className="mt-5 flex w-full flex-col gap-3 text-left">
            <ProgressBar label="Vượt qua kiểm tra tin cậy" value={(comps.passRate ?? 0) / 100} showValue />
            <ProgressBar label="Số kênh có dữ liệu" value={(comps.channelCoverage ?? 0) / 100} showValue />
            <ProgressBar label="Độ mới của dữ liệu" value={(comps.freshness ?? 0) / 100} showValue />
            <ProgressBar label="Khớp với đơn hàng" value={(comps.reconciliation ?? 0) / 100} showValue />
          </div>
        </GlassPanel>
      </div>

      {impact && (
        <GlassPanel tone="strong" className={`mb-6 p-6 ${!trustOn ? 'border-crit/50' : ''}`}>
          <PanelHeader
            title="Nếu không có Trust Layer thì sao?"
            subtitle="Tính lại cùng dữ liệu như một hệ thống đếm mọi phản hồi bằng nhau."
            right={
              <label className="flex shrink-0 items-center gap-3 rounded-lg border border-line bg-surface py-1.5 pr-1.5 pl-3">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${trustOn ? 'text-ok' : 'text-crit'}`}>
                  {trustOn ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                  {trustOn ? 'Đang bật' : 'Đã tắt'}
                </span>
                <Switch checked={trustOn} onChange={setTrustOn} label="Bật hoặc tắt Trust Layer" />
              </label>
            }
          />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Cảnh báo sinh ra', value: shown?.alertCount ?? 0 },
              { label: 'Tỉ lệ khiếu nại', value: trustOn ? impact.wcrWithTrustLayer : impact.wcrWithoutTrustLayer },
              { label: 'Phản hồi bị loại', value: trustOn ? fmtInt(impact.excludedFeedbacks) : '0' },
              { label: 'Cảnh báo sai được chặn', value: impact.phantomAlerts, keep: true }
            ].map((m) => (
              <div key={m.label} className={`rounded-lg border p-4 transition-colors ${!trustOn && !m.keep ? 'border-crit/30 bg-crit/8' : 'border-line-soft'}`}>
                <p className="text-xs text-ink-mid">{m.label}</p>
                <p className={`mt-1.5 font-mono text-2xl font-semibold ${!trustOn && !m.keep ? 'text-crit' : 'text-ink-hi'}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {impact.phantomAlerts > 0 && (
            <p className="mt-4 text-sm leading-relaxed text-ink-mid">
              Không có tầng này, hệ thống sẽ báo{' '}
              <b className="text-crit">{impact.phantomAlerts} vấn đề không có thật</b>
              {impact.phantomExamples?.length > 0 && <>, ví dụ {impact.phantomExamples.map((p) => `${p.category}${p.cause ? ` (${p.cause})` : ''}`).join('; ')}</>}.
            </p>
          )}
        </GlassPanel>
      )}

      <div className="mb-6 grid items-start gap-6 xl:grid-cols-2">
        <GlassPanel tone="strong" className="overflow-hidden">
          <div className="px-5 pt-5">
            <PanelHeader
              title="Nguồn được tin đến đâu"
              subtitle="Mỗi nguồn có trọng số tối đa riêng. Nguồn hạng P5 chỉ để theo dõi xu hướng, không đủ để bật cảnh báo mức Cao trở lên."
            />
          </div>
          <table className="data-table">
            <thead>
              <tr><th className="pl-5">Hạng</th><th>Nguồn</th><th className="text-right">Trọng số</th><th className="pr-5 text-right">Phản hồi</th></tr>
            </thead>
            <tbody>
              {health.tierBreakdown.map((t) => (
                <tr key={t.tier}>
                  <td className="pl-5"><span className="font-mono font-semibold text-accent">{t.tier}</span></td>
                  <td>
                    <span className="block text-[0.82rem] text-ink-hi">{t.label}</span>
                    <span className="block text-xs text-ink-lo">Đối soát: {t.reconciliation.toLowerCase()}</span>
                  </td>
                  <td className="text-right font-mono">{t.weight.toFixed(2).replace('.', ',')}</td>
                  <td className="pr-5 text-right font-mono">{fmtInt(t.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>

        <GlassPanel tone="strong" className="p-5">
          <PanelHeader title="Cụm đánh giá giống nhau" subtitle="Nội dung gần như trùng nhau, đăng dồn trong thời gian ngắn: dấu vết của đánh giá được đặt hàng." />
          {clusters.length === 0 ? (
            <EmptyState compact variant="calm" title="Không có cụm nào" description="Chưa thấy nhóm đánh giá nào giống nhau bất thường." />
          ) : (
            <ul className="flex list-none flex-col gap-2">
              {clusters.map((c) => {
                const isOpen = openCluster === c.clusterId;
                return (
                  <li key={c.clusterId} className="overflow-hidden rounded-lg border border-line-soft">
                    <button
                      type="button"
                      onClick={() => setOpenCluster(isOpen ? null : c.clusterId)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink-hi">{c.size} đánh giá trong {c.spanMinutes} phút, giống nhau {(c.avgSimilarity * 100).toFixed(0)}%</span>
                        <span className="mt-0.5 block truncate text-xs text-ink-lo">{c.productName}: “{c.sampleText}”</span>
                      </span>
                      <ChevronDown size={16} className={`shrink-0 text-ink-lo transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <ul className="flex list-none flex-col gap-2 px-4 pb-4">
                        {c.members.map((m) => (
                          <li key={m._id} className="rounded-lg bg-raised p-3 text-sm">
                            <div className="mb-1 flex flex-wrap justify-between gap-2">
                              <b className="font-medium text-ink-hi">{m.author}</b>
                              <span className="font-mono text-xs text-ink-lo">{fmtDateTime(m.timestamp)}</span>
                            </div>
                            <p className="leading-relaxed text-ink-mid">{m.originalText}</p>
                            {m.trust?.triggeredSignals?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">{m.trust.triggeredSignals.map((s, i) => <Signal key={i} s={s} tone="crit" />)}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </GlassPanel>
      </div>

      <GlassPanel tone="strong" className="p-5">
        <PanelHeader
          title="Hàng đợi kiểm duyệt"
          subtitle={`Phản hồi hệ thống phân vân nhất được xếp lên đầu; mỗi nhãn của bạn giúp mô hình học đúng hơn.${health.humanLabelCount > 0 ? ` Đã duyệt ${fmtInt(health.humanLabelCount)} phản hồi.` : ''}`}
          right={queue.length > 0 && <Badge tone="med">{queue.length} đang chờ</Badge>}
        />
        {labelError && <p className="mb-3 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{labelError}</p>}
        {queue.length === 0 ? (
          <EmptyState compact variant="calm" title="Hàng đợi trống" description="Không còn phản hồi nào cần người đọc lại." />
        ) : (
          <ul className="grid list-none gap-3 lg:grid-cols-2">
            {queue.map((q) => (
              <li key={q._id} className="flex flex-col rounded-lg border border-line-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-hi">{q.author} <span className="font-normal text-ink-lo">trên {q.source}</span></span>
                  {q.uncertainty != null && <span className="text-xs text-ink-lo">Hệ thống phân vân {Math.round(q.uncertainty * 100)}%</span>}
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-mid">{q.originalText}</p>
                {q.triggeredSignals?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">{q.triggeredSignals.map((s, i) => <Signal key={i} s={s} />)}</div>
                )}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" icon={CheckCircle2} loading={labelling === q._id} onClick={() => submitLabel(q._id, 'valid')}>Thật</Button>
                  <Button size="sm" variant="danger" icon={XCircle} disabled={labelling === q._id} onClick={() => submitLabel(q._id, 'inauthentic')}>Đánh giá ảo</Button>
                  <Button size="sm" variant="ghost" icon={Ban} disabled={labelling === q._id} onClick={() => submitLabel(q._id, 'spam')}>Rác, quảng cáo</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
};

/** Trang Tin cậy dữ liệu: tab tổng quan và tab kiểm tra ngẫu nhiên do người làm */
const TrustLayerPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'audit' ? 'audit' : 'overview';
  return (
    <div className="cx">
      <PageHeader
        title="Tin cậy dữ liệu"
        subtitle={tab === 'audit'
          ? 'Người kiểm tra lại nhãn AI trên phản hồi lấy ngẫu nhiên, để biết AI đúng tới đâu.'
          : 'Phản hồi nào được tính vào chỉ số, phản hồi nào bị loại, và vì sao.'}
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(v) => setParams(v === 'audit' ? { tab: 'audit' } : {}, { replace: true })}
        tabs={[
          { value: 'overview', label: 'Tổng quan' },
          { value: 'audit', label: 'Kiểm tra ngẫu nhiên' }
        ]}
      />
      {tab === 'audit' ? <Audit /> : <TrustOverview />}
    </div>
  );
};

export default TrustLayerPage;
