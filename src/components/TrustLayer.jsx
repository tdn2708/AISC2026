import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Copy, Zap, UserX, Star, Receipt, HelpCircle, CheckCircle2, XCircle, Ban, Layers, ChevronDown, ShieldCheck, ShieldOff
} from 'lucide-react';
import { PageHeader, GlassPanel, PanelHeader, Stepper, Switch, Badge, ProgressBar, EmptyState, Button, SectionLabel } from './ui';
import { fmtInt, fmtDateTime } from '../lib/format';

/**
 * TẦNG KIỂM SOÁT TIN CẬY DỮ LIỆU
 * ------------------------------------------------------------------
 * Toàn bộ hoạt động của Trust Layer hiển thị công khai dưới dạng một
 * phễu, vì Sức khỏe Dữ liệu trả lời câu hỏi mà mọi người dùng doanh
 * nghiệp đều có khi nhìn một dashboard: "tôi có nên tin những con số này?"
 */

const SIGNAL_ICONS = {
  'Trùng lặp gần về nội dung': Copy,
  'Đột biến thời gian': Zap,
  'Bất thường hành vi tài khoản': UserX,
  'Bất nhất điểm sao và nội dung': Star,
  'Bất nhất với dữ liệu giao dịch': Receipt
};

const Signal = ({ s, tone = 'high' }) => {
  const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
  return (
    <span title={s.detail || ''}>
      <Badge tone={tone} icon={Icon}>{s.signal}{s.value != null ? ` · ${s.value}` : ''}</Badge>
    </span>
  );
};

/** Vòng sức khỏe dữ liệu — vòng sage mảnh, số đơn cách ở giữa */
const HealthDial = ({ score = 0 }) => {
  const R = 58;
  const C = 2 * Math.PI * R;
  const tone = score >= 75 ? 'var(--sev-ok)' : score >= 50 ? 'var(--sev-high)' : 'var(--sev-crit)';
  const label = score >= 75 ? 'Đáng tin cậy' : score >= 50 ? 'Cần chú ý' : 'Rủi ro cao';
  return (
    <div className="relative size-[150px] shrink-0">
      <svg viewBox="0 0 150 150" className="size-full -rotate-90">
        <circle cx="75" cy="75" r={R} fill="none" stroke="var(--raised)" strokeWidth="10" />
        <circle
          cx="75" cy="75" r={R} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="font-mono text-4xl leading-none font-semibold text-ink-hi">{score}</span>
        <span className="mt-1 text-[0.68rem] text-ink-lo">/ 100</span>
        <span className="mt-1.5 text-xs font-medium" style={{ color: tone }}>{label}</span>
      </div>
    </div>
  );
};

const TrustLayerPage = () => {
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
      setError('Không tải được dữ liệu Trust Layer. Kiểm tra máy chủ đã chạy chưa.');
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

  const header = (
    <PageHeader
      section="Phân tích"
      title="Tin cậy"
      accent="dữ liệu"
      subtitle="Mỗi phản hồi được gán một trọng số tin cậy trước khi chạm tới bất kỳ chỉ số nào — đánh giá ảo, quảng cáo và cụm đánh giá có tổ chức bị loại hoặc giảm trọng số."
    />
  );

  if (error) return <div className="cx">{header}<GlassPanel><EmptyState variant="error" title="Không tải được" description={error} action={<Button onClick={load}>Thử lại</Button>} /></GlassPanel></div>;
  if (loading && !health) {
    return (
      <div className="cx">
        {header}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-[260px] animate-pulse rounded-[20px] bg-surface/50 lg:col-span-2" />
          <div className="h-[260px] animate-pulse rounded-[20px] bg-surface/50" />
        </div>
      </div>
    );
  }

  const shown = trustOn ? impact?.withTrustLayer : impact?.withoutTrustLayer;
  const comps = health.components || {};

  return (
    <div className="cx">
      {header}

      <SectionLabel>Phễu dữ liệu</SectionLabel>
      <div className="mb-8 grid items-stretch gap-6 lg:grid-cols-3">
        <GlassPanel tone="strong" className="flex flex-col p-6 lg:col-span-2">
          <PanelHeader title="Đường đi của dữ liệu" subtitle="Từ lúc thu thập tới lúc được đưa vào phân tích" />
          <Stepper
            className="mb-6"
            steps={[
              { label: 'Phản hồi thô', value: fmtInt(health.rawCollected), tone: 'neutral', sub: 'thu thập từ mọi kênh' },
              { label: 'Loại vì rác / quảng cáo', value: `−${fmtInt(health.spamRemoved.count)}`, tone: 'high', sub: `${health.spamRemoved.pct}%` },
              { label: 'Nghi không xác thực', value: `−${fmtInt(health.inauthenticFlagged.count)}`, tone: 'crit', sub: `${health.inauthenticFlagged.pct}% · ${health.inauthenticFlagged.duplicateClusters} cụm` },
              { label: 'Chờ kiểm duyệt', value: fmtInt(health.pendingReview.count), tone: 'med', sub: `${health.pendingReview.pct}% · vùng xám` },
              { label: 'Hợp lệ để phân tích', value: fmtInt(health.validForAnalysis), tone: 'ok', marker: '✓', sub: `trọng số hiệu dụng ${health.effectiveWeight}` }
            ]}
          />
          <div className="mt-auto flex flex-wrap gap-x-6 gap-y-2 border-t border-line-soft pt-4 text-xs text-ink-lo">
            <span>Độ phủ kênh <b className="font-mono font-semibold text-ink-hi">{health.channelCoverage.covered}/{health.channelCoverage.expected}</b></span>
            <span>Đối soát giao dịch <b className="font-mono font-semibold text-ink-hi">{health.reconciliationRate}%</b></span>
            <span>Độ trễ thu thập <b className="font-mono font-semibold text-ink-hi">{health.ingestionLagMinutes != null ? `${fmtInt(health.ingestionLagMinutes)} phút` : 'chưa rõ'}</b></span>
            <span>Từ điển chuẩn hoá <b className="font-mono font-semibold text-ink-hi">{fmtInt(health.dictionarySize)} mục</b></span>
          </div>
        </GlassPanel>

        <GlassPanel tone="strong" className="flex flex-col items-center p-6 text-center">
          <PanelHeader title="Sức khoẻ dữ liệu" subtitle="Tôi có nên tin những con số này không?" className="w-full text-left" />
          <HealthDial score={health.dataHealthScore} />
          <div className="mt-5 flex w-full flex-col gap-3 text-left">
            <ProgressBar label="Vượt qua Trust Layer" value={(comps.passRate ?? 0) / 100} showValue />
            <ProgressBar label="Độ phủ kênh" value={(comps.channelCoverage ?? 0) / 100} showValue />
            <ProgressBar label="Độ tươi dữ liệu" value={(comps.freshness ?? 0) / 100} showValue />
            <ProgressBar label="Đối soát giao dịch" value={(comps.reconciliation ?? 0) / 100} showValue />
          </div>
        </GlassPanel>
      </div>

      {impact && (
        <>
          <SectionLabel>Nếu tắt Trust Layer thì sao?</SectionLabel>
          <GlassPanel tone="strong" glow={!trustOn ? 'crit' : null} className="mb-8 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-sm leading-relaxed text-ink-mid">
                Cùng một tập dữ liệu, tính lại như một hệ thống <b className="text-ink-hi">không có</b> tầng kiểm soát tin cậy — mỗi phản hồi đều được đếm đủ một điểm.
              </p>
              <label className="flex items-center gap-3 rounded-full bg-surface/70 py-1.5 pr-1.5 pl-4">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${trustOn ? 'text-ok' : 'text-crit'}`}>
                  {trustOn ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                  Trust Layer {trustOn ? 'đang bật' : 'đã tắt'}
                </span>
                <Switch checked={trustOn} onChange={setTrustOn} label="Bật hoặc tắt Trust Layer" />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Cảnh báo sinh ra', value: shown?.alertCount ?? 0 },
                { label: 'Tỉ lệ khiếu nại (WCR)', value: trustOn ? impact.wcrWithTrustLayer : impact.wcrWithoutTrustLayer },
                { label: 'Phản hồi bị loại', value: trustOn ? fmtInt(impact.excludedFeedbacks) : '0' },
                { label: 'Cảnh báo ma được chặn', value: impact.phantomAlerts, keep: true }
              ].map((m) => (
                <div key={m.label} className={`rounded-2xl p-4 transition-colors ${!trustOn && !m.keep ? 'bg-crit/10' : 'bg-surface/60'}`}>
                  <p className="eyebrow">{m.label}</p>
                  <p className={`mt-1.5 font-mono text-2xl font-semibold ${!trustOn && !m.keep ? 'text-crit' : 'text-ink-hi'}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {impact.phantomAlerts > 0 && (
              <p className="mt-4 text-sm leading-relaxed text-ink-mid">
                Không có tầng này, hệ thống sẽ báo cho doanh nghiệp{' '}
                <b className="text-crit">{impact.phantomAlerts} vấn đề không có thật</b>
                {impact.phantomExamples?.length > 0 && <> — ví dụ: {impact.phantomExamples.map((p) => `${p.category}${p.cause ? ' → ' + p.cause : ''}`).join('; ')}</>}.
              </p>
            )}
          </GlassPanel>
        </>
      )}

      <div className="mb-8 grid items-start gap-6 xl:grid-cols-2">
        <section>
          <SectionLabel>Phân hạng nguồn gốc</SectionLabel>
          <GlassPanel tone="strong" className="overflow-hidden">
            <p className="border-b border-line-soft px-5 py-3.5 text-xs leading-relaxed text-ink-lo">
              Hạng P5 dùng để quan sát xu hướng nhưng không đủ điều kiện kích hoạt cảnh báo mức Cao / Nghiêm trọng.
            </p>
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
                      <span className="block text-[0.7rem] text-ink-lo">{t.reconciliation}</span>
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-raised 2xl:block"><span className="block h-full rounded-full bg-accent" style={{ width: `${t.weight * 100}%` }} /></span>
                        <span className="font-mono">{t.weight.toFixed(2)}</span>
                      </span>
                    </td>
                    <td className="pr-5 text-right font-mono">{fmtInt(t.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        </section>

        <section>
          <SectionLabel>Cụm trùng lặp nghi vấn</SectionLabel>
          <GlassPanel tone="strong" className="p-5">
            <PanelHeader title="Đánh giá dồn cục" subtitle="Nội dung gần như giống nhau, đăng trong thời gian ngắn — dấu vết của đánh giá được đặt hàng" right={<Layers size={16} className="text-ink-lo" />} />
            {clusters.length === 0 ? (
              <EmptyState compact variant="calm" title="Không phát hiện cụm nào" description="Dữ liệu hiện tại không có cụm trùng lặp gần đạt ngưỡng." />
            ) : (
              <ul className="flex list-none flex-col gap-2">
                {clusters.map((c) => {
                  const isOpen = openCluster === c.clusterId;
                  return (
                    <li key={c.clusterId} className="overflow-hidden rounded-2xl bg-surface/60">
                      <button
                        type="button"
                        onClick={() => setOpenCluster(isOpen ? null : c.clusterId)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-raised"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crit/12 font-mono text-sm font-semibold text-crit">{c.size}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink-hi">{c.size} đánh giá giống nhau · trong {c.spanMinutes} phút</span>
                          <span className="block truncate text-xs text-ink-lo">{c.productName} — “{c.sampleText}”</span>
                        </span>
                        <Badge tone="crit" mono>{(c.avgSimilarity * 100).toFixed(0)}%</Badge>
                        <ChevronDown size={16} className={`shrink-0 text-ink-lo transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <ul className="flex list-none flex-col gap-2 px-4 pb-4 animate-fade-up">
                          {c.members.map((m) => (
                            <li key={m._id} className="rounded-xl bg-surface/80 p-3 text-sm">
                              <div className="mb-1 flex flex-wrap justify-between gap-2">
                                <b className="font-medium text-ink-hi">{m.author}</b>
                                <span className="font-mono text-[0.68rem] text-ink-lo">{fmtDateTime(m.timestamp)} · {m.trust?.tier}</span>
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
        </section>
      </div>

      <SectionLabel right={queue.length > 0 && <Badge tone="med" mono>{queue.length} chờ</Badge>}>Hàng đợi kiểm duyệt</SectionLabel>
      <GlassPanel tone="strong" className="p-5">
        <PanelHeader
          title="Học chủ động"
          subtitle={`Xếp theo độ bất định của mô hình, không theo thời gian — mỗi nhãn của bạn mang lại nhiều thông tin huấn luyện nhất có thể.${health.humanLabelCount > 0 ? ` Đã có ${fmtInt(health.humanLabelCount)} nhãn do người kiểm duyệt xác nhận.` : ''}`}
        />
        {labelError && <p className="mb-3 rounded-xl bg-crit/10 px-3 py-2 text-sm text-crit">{labelError}</p>}
        {queue.length === 0 ? (
          <EmptyState compact variant="calm" title="Hàng đợi trống" description="Không còn phản hồi nào nằm trong vùng xám cần kiểm duyệt." />
        ) : (
          <ul className="grid list-none gap-3 lg:grid-cols-2">
            {queue.map((q) => (
              <li key={q._id} className="flex flex-col rounded-2xl bg-surface/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-hi">{q.author} <span className="font-normal text-ink-lo">· {q.source}</span></span>
                  <span className="font-mono text-[0.68rem] text-ink-lo">A={q.authenticityScore} · bất định {q.uncertainty}</span>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-mid">{q.originalText}</p>
                {q.triggeredSignals?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">{q.triggeredSignals.map((s, i) => <Signal key={i} s={s} />)}</div>
                )}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" icon={CheckCircle2} loading={labelling === q._id} onClick={() => submitLabel(q._id, 'valid')}>Hợp lệ</Button>
                  <Button size="sm" variant="danger" icon={XCircle} disabled={labelling === q._id} onClick={() => submitLabel(q._id, 'inauthentic')}>Không xác thực</Button>
                  <Button size="sm" variant="ghost" icon={Ban} disabled={labelling === q._id} onClick={() => submitLabel(q._id, 'spam')}>Rác</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
};

export default TrustLayerPage;
