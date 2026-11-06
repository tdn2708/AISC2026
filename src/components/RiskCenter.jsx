import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Check, CircleSlash, Clock, FileSearch, RotateCcw, ShieldCheck, MessageSquareText, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { askAssistant } from '../lib/assistant';
import {
  PageHeader, GlassPanel, SeverityBadge, Button, ChipGroup, Drawer, EmptyState, Badge, SentimentFace, Toast, Tabs
} from './ui';
import { Evidence, ConfidenceMeter, DismissModal } from './alerts/AlertParts';
import { useDecisions } from '../hooks/useDecisions';
import { alertTitle, alertInWords, fmtInt, fmtPct, fmtDateTime, SEVERITY, SEVERITY_ORDER } from '../lib/format';

/**
 * CẢNH BÁO
 * ------------------------------------------------------------------
 * Tab "Cảnh báo": danh sách bên trái (quét nhanh, viết bằng lời thường),
 * chi tiết bên phải (quyết định). Quyết định ghi về máy chủ qua
 * /recommendations, đi vào vòng lặp học của bộ đề xuất.
 * Tab "Nhật ký quyết định": ai đã quyết gì, lúc nào, vì sao — thứ doanh
 * nghiệp cần để kiểm toán.
 */

const AlertRow = ({ alert, status, active, onClick }) => {
  const meta = SEVERITY[alert.severity] || SEVERITY.Low;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active || undefined}
        className={`relative w-full rounded-lg border p-4 pl-5 text-left transition-colors ${
          active ? 'border-accent bg-surface' : 'border-transparent hover:bg-raised'
        }`}
        style={{ '--sev': meta.color }}
      >
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-(--sev)" />
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-snug font-semibold text-ink-hi">{alertTitle(alert)}</p>
          <SeverityBadge level={alert.severity} />
        </div>
        {alert.productName && <p className="mt-0.5 truncate text-xs text-ink-lo">{alert.productName}</p>}
        <p className="mt-1.5 text-xs text-ink-mid">{alertInWords(alert)}</p>
        <p className="mt-1.5 text-xs text-ink-lo">
          {status === 'ACCEPTED' ? (
            <span className="inline-flex items-center gap-1 text-ok"><Check size={12} aria-hidden="true" /> Đã chấp nhận</span>
          ) : status === 'DISMISSED' ? (
            <span className="inline-flex items-center gap-1"><CircleSlash size={12} aria-hidden="true" /> Đã bỏ qua</span>
          ) : (
            alert.sla && <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" /> Xử lý trong {alert.sla}</span>
          )}
        </p>
      </button>
    </li>
  );
};

const Detail = ({ alert, rec, status, saving, onAccept, onDismiss, onEvidence }) => {
  const steps = rec?.steps || alert.recommendation?.steps || [];
  const confidence = rec?.confidence ?? alert.recommendation?.confidence;
  const evidence = rec?.evidence || {};
  const facts = [
    ['Khách bị ảnh hưởng', evidence.affectedCustomers != null ? fmtInt(evidence.affectedCustomers) : '—'],
    [
      'Phản hồi làm bằng chứng',
      <>
        {fmtInt(evidence.evidenceCount ?? alert.evidenceCount)}
        {alert.excludedByTrust > 0 && <span className="font-normal text-ink-lo">, đã loại {fmtInt(alert.excludedByTrust)} không đáng tin</span>}
      </>
    ],
    ['Bộ phận phụ trách', alert.owner || '—'],
    ['Doanh thu chịu rủi ro', rec?.dataProfile?.slots?.revenue || 'Chưa đối soát được']
  ];

  return (
    <GlassPanel tone="strong" className="p-6" key={alert.id}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge level={alert.severity} />
        {alert.typeVi && <Badge tone="neutral">{alert.typeVi}</Badge>}
        {alert.sla && <Badge tone="neutral" icon={Clock}>Xử lý trong {alert.sla}</Badge>}
      </div>
      <h2 className="mt-3 text-xl leading-snug font-semibold text-ink-hi">{alertTitle(alert)}</h2>
      {alert.productName && <p className="mt-1 text-sm text-ink-mid">{alert.productName}</p>}

      {alert.summary && <p className="mt-4 text-sm leading-relaxed text-ink-hi">{alert.summary}</p>}

      <dl className="mt-5 grid gap-x-6 gap-y-3 border-y border-line-soft py-4 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-ink-lo">{k}</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink-hi">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-hi">Kế hoạch đề xuất</h3>
        {steps.length === 0 ? (
          <p className="text-sm text-ink-lo">Chưa có hành động nào khớp với dữ liệu của cảnh báo này.</p>
        ) : (
          <ol className="flex list-none flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.actionId || i} className="flex gap-3 rounded-lg border border-line-soft p-3.5">
                <span className={`grid size-6 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ${i === 0 ? 'bg-accent text-on-accent' : 'bg-raised text-ink-mid'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-ink-hi">{s.text}</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-lo">
                    {s.kindLabel && <span>{s.kindLabel}</span>}
                    <span>Khoảng {s.effortDays} ngày công</span>
                    {s.reversible === false && <span className="text-high">Không đảo ngược được</span>}
                    {s.requiresApproval && s.approvalRole && <span>Cần {s.approvalRole} duyệt</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <ConfidenceMeter value={confidence} className="mt-4" />
      </div>

      <details className="group mt-5 rounded-lg border border-line-soft">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-ink-mid hover:text-ink-hi">
          Số liệu kiểm định
        </summary>
        <div className="border-t border-line-soft px-4 py-3">
          <Evidence alert={alert} />
        </div>
      </details>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-5">
        {status === 'ACCEPTED' ? (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-ok"><Check size={16} /> Đã chấp nhận. Hệ thống đo lại hiệu quả sau 7 ngày.</p>
        ) : status === 'DISMISSED' ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink-mid">
            <CircleSlash size={16} /> Đã bỏ qua{rec?.dismissReason ? `: ${rec.dismissReason}` : ''}
          </p>
        ) : (
          steps.length > 0 && (
            <>
              <Button icon={Check} onClick={onAccept} loading={saving}>Chấp nhận kế hoạch</Button>
              <Button variant="ghost" onClick={onDismiss} disabled={saving}>Bỏ qua</Button>
            </>
          )
        )}
        <Button
          variant="ghost"
          icon={MessageSquareText}
          className="sm:ml-auto"
          onClick={() => askAssistant(`Vì sao ${alertTitle(alert)}${alert.productName ? ` ở ${alert.productName}` : ''} lại bị cảnh báo?`)}
        >
          Hỏi trợ lý
        </Button>
        <Button variant="secondary" icon={FileSearch} onClick={onEvidence}>Xem phản hồi gốc</Button>
      </div>

      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-lo">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Hệ thống chỉ đề xuất. Việc tốn chi phí hoặc chạm tới khách hàng luôn cần người có thẩm quyền duyệt.
      </p>
    </GlassPanel>
  );
};

const SourceDrawer = ({ alert, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!alert) return;
    setData(null);
    setError(null);
    axios
      .get(`/alerts/${encodeURIComponent(alert.id)}/evidence`)
      .then((r) => setData(r.data))
      .catch(() => setError('Không tải được phản hồi gốc của cảnh báo này.'));
  }, [alert]);

  return (
    <Drawer open={Boolean(alert)} onClose={onClose} title="Phản hồi gốc" subtitle={alert ? alertTitle(alert) : undefined}>
      {error ? (
        <EmptyState variant="error" compact title="Không tải được" description={error} />
      ) : !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-raised" />)}
        </div>
      ) : data.evidence?.length === 0 ? (
        <EmptyState compact title="Không có phản hồi đính kèm" description="Cảnh báo tăng chậm được phát hiện trên chuỗi thời gian, không gắn với từng phản hồi riêng." />
      ) : (
        <>
          {data.excludedByTrust > 0 && (
            <p className="mb-4 rounded-lg bg-accent-dim px-3 py-2 text-xs text-accent-hi">
              Đã loại {fmtInt(data.excludedByTrust)} phản hồi không đáng tin khỏi bằng chứng của cảnh báo này.
            </p>
          )}
          <ul className="flex list-none flex-col gap-3">
            {data.evidence.map((f) => (
              <li key={f._id} className="rounded-lg border border-line-soft p-4">
                <div className="flex items-center gap-2.5">
                  <SentimentFace sentiment={f.sentiment} size={26} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-hi">{f.author || 'Ẩn danh'}</p>
                  <p className="shrink-0 text-xs text-ink-lo">{f.source}, hạng {f.trust?.tier}</p>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-hi">{f.originalText}</p>
                <p className="mt-2 font-mono text-xs text-ink-lo">{fmtDateTime(f.timestamp)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
};

/** Tỉ lệ dưới 1% giữ hai chữ số, để 0,04% không thành 0,0% */
const pctSmart = (v) => fmtPct(v, v != null && v > 0 && v < 0.01 ? 2 : 1);

/**
 * Hiệu quả sau khi chấp nhận: tỉ lệ khiếu nại đúng phạm vi cảnh báo, 7 ngày
 * trước so với 7 ngày sau. Ghi rõ là so sánh trước/sau, chưa loại trừ yếu tố khác.
 */
const Effect = ({ e }) => {
  if (!e) return <span className="text-ink-lo">—</span>;
  if (e.status === 'pending') {
    return <span className="text-ink-lo">Còn {e.daysLeft} ngày nữa mới đủ 7 ngày để đo</span>;
  }
  if (e.change == null) return <span className="text-ink-lo">Chưa đủ phản hồi để so</span>;
  const better = e.change < -0.0005;
  const worse = e.change > 0.0005;
  const Icon = better ? ArrowDownRight : worse ? ArrowUpRight : Minus;
  return (
    <span className="inline-flex flex-col">
      <span className={`inline-flex items-center gap-1 font-semibold ${better ? 'text-ok' : worse ? 'text-crit' : 'text-ink-mid'}`}>
        <Icon size={14} aria-hidden="true" />
        {pctSmart(e.before.rate)} → {pctSmart(e.after.rate)}
      </span>
      <span className="text-xs text-ink-lo">
        {better ? 'Giảm' : worse ? 'Tăng' : 'Gần như không đổi'}, trên {fmtInt(e.before.n)} và {fmtInt(e.after.n)} phản hồi
      </span>
    </span>
  );
};

/** Nhật ký quyết định: mới nhất trước */
const DecisionLog = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get('/decisions')
      .then((r) => setRows(r.data?.decisions || []))
      .catch(() => setError('Không tải được nhật ký quyết định.'));
  }, []);

  if (error) return <GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel>;
  if (!rows) return <div className="h-64 animate-pulse rounded-xl bg-raised" />;
  if (!rows.length) {
    return (
      <GlassPanel>
        <EmptyState title="Chưa có quyết định nào" description="Khi ai đó chấp nhận hoặc bỏ qua một đề xuất, quyết định sẽ được ghi lại ở đây cùng người quyết và lý do." />
      </GlassPanel>
    );
  }

  return (
    <GlassPanel tone="strong" className="overflow-hidden">
      <p className="border-b border-line-soft px-5 py-3 text-xs leading-relaxed text-ink-lo">
        Hiệu quả là tỉ lệ khiếu nại đúng vấn đề đó trong 7 ngày trước và 7 ngày sau khi chấp nhận. Đây là so sánh trước và sau,
        chưa loại trừ các yếu tố khác như mùa vụ hay khuyến mãi.
      </p>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Vấn đề</th>
              <th>Quyết định</th>
              <th>Người quyết</th>
              <th>Lý do bỏ qua</th>
              <th>Hiệu quả sau 7 ngày</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.alertId}-${d.at}`}>
                <td className="font-mono whitespace-nowrap text-ink-mid">{fmtDateTime(d.at)}</td>
                <td>
                  <p className="font-medium">{d.title || 'Cảnh báo không còn trong dữ liệu hiện tại'}</p>
                  {d.productName && <p className="text-xs text-ink-lo">{d.productName}</p>}
                </td>
                <td>
                  {d.decision === 'ACCEPTED' ? (
                    <Badge tone="ok" icon={Check}>Chấp nhận</Badge>
                  ) : (
                    <Badge icon={CircleSlash}>Bỏ qua</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap">{d.by}</td>
                <td className="text-ink-mid">{d.decision === 'DISMISSED' ? d.reason || '—' : '—'}</td>
                <td><Effect e={d.effect} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
};

const RiskCenter = () => {
  const [params, setParams] = useSearchParams();
  const [alerts, setAlerts] = useState([]);
  const [recs, setRecs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [severity, setSeverity] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [dismissing, setDismissing] = useState(null);
  const [evidenceFor, setEvidenceFor] = useState(null);
  const [toast, setToast] = useState(null);
  const tab = params.get('tab') === 'log' ? 'log' : 'alerts';
  // Cảnh báo vừa quyết định trong phiên này vẫn ở lại danh sách "Đang chờ"
  // để người dùng thấy kết quả, thay vì biến mất ngay dưới tay họ
  const [recent, setRecent] = useState(() => new Set());
  const { states, setStates, accept, dismiss } = useDecisions();

  const decide = async (alert, kind, reason) => {
    const target = { ...alert, recommendation: recs[alert.id] || alert.recommendation };
    const ok = kind === 'ACCEPTED' ? await accept(target) : await dismiss(target, reason);
    if (ok) {
      setRecent((s) => new Set(s).add(alert.id));
      setToast(kind === 'ACCEPTED' ? 'Đã chấp nhận kế hoạch' : 'Đã bỏ qua và ghi lại lý do');
      setTimeout(() => setToast(null), 2600);
    }
    return ok;
  };

  const load = () => {
    setLoading(true);
    Promise.all([axios.get('/alerts'), axios.get('/recommendations')])
      .then(([a, r]) => {
        setAlerts(a.data?.alerts || []);
        const byAlert = Object.fromEntries((r.data?.recommendations || []).map((x) => [x.alertId, x]));
        setRecs(byAlert);
        // Trạng thái quyết định lấy từ máy chủ, không từ trình duyệt
        setStates(Object.fromEntries(Object.values(byAlert).filter((x) => x.status !== 'PROPOSED').map((x) => [x.alertId, x.status])));
        setError(null);
      })
      .catch(() => setError('Không tải được danh sách cảnh báo. Kiểm tra máy chủ đã chạy chưa.'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const statusOf = (a) => (states[a.id] === 'ACCEPTED' || states[a.id] === 'DISMISSED' ? states[a.id] : null);

  const sorted = useMemo(
    () =>
      [...alerts].sort(
        (a, b) => (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0) || (b.severityScore ?? 0) - (a.severityScore ?? 0)
      ),
    [alerts]
  );

  const visible = sorted.filter((a) => {
    const st = statusOf(a);
    const okStatus = statusFilter === 'all' || (statusFilter === 'open' ? !st || recent.has(a.id) : Boolean(st));
    return okStatus && (severity === 'all' || a.severity === severity);
  });

  const selectedId = params.get('alert');

  // Mở từ thông báo tới một cảnh báo đang bị bộ lọc che đi → nới bộ lọc ra,
  // thay vì lặng lẽ hiển thị một cảnh báo khác
  useEffect(() => {
    if (!selectedId || visible.some((a) => a.id === selectedId)) return;
    if (sorted.some((a) => a.id === selectedId)) {
      setStatusFilter('all');
      setSeverity('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, sorted]);
  const selected = visible.find((a) => a.id === selectedId) || visible[0] || null;
  const detailRef = useRef(null);
  const select = (id) => {
    setParams(id ? { alert: id } : {}, { replace: true });
    // Màn hẹp: chi tiết nằm DƯỚI danh sách, chạm một cảnh báo mà không cuộn
    // tới thì người dùng không thấy gì thay đổi
    if (id && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const open = sorted.filter((a) => !statusOf(a));
  const statusOptions = [
    { value: 'open', label: 'Đang chờ', count: open.length },
    { value: 'decided', label: 'Đã quyết định', count: sorted.length - open.length },
    { value: 'all', label: 'Tất cả', count: sorted.length }
  ];
  const sevOptions = [
    { value: 'all', label: 'Mọi mức' },
    ...SEVERITY_ORDER.map((k) => ({ value: k, label: SEVERITY[k].label, count: sorted.filter((a) => a.severity === k).length })).filter((o) => o.count > 0)
  ];

  return (
    <div className="cx">
      <PageHeader
        title="Cảnh báo"
        subtitle="Những biến động đủ lớn để chắc chắn không phải ngẫu nhiên, kèm kế hoạch chờ bạn quyết định."
        actions={tab === 'alerts' && <Button variant="secondary" icon={RotateCcw} onClick={load} loading={loading}>Làm mới</Button>}
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => setParams(v === 'log' ? { tab: 'log' } : {}, { replace: true })}
        tabs={[
          { value: 'alerts', label: 'Danh sách' },
          { value: 'log', label: 'Nhật ký quyết định' }
        ]}
      />

      {tab === 'log' ? (
        <DecisionLog />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <ChipGroup label="Lọc theo trạng thái" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
            {sevOptions.length > 2 && <ChipGroup label="Lọc theo mức độ" options={sevOptions} value={severity} onChange={setSeverity} />}
          </div>

          {error ? (
            <GlassPanel><EmptyState variant="error" title="Không tải được cảnh báo" description={error} action={<Button onClick={load}>Thử lại</Button>} /></GlassPanel>
          ) : loading && alerts.length === 0 ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-raised" />)}</div>
              <div className="h-[520px] animate-pulse rounded-xl bg-raised" />
            </div>
          ) : visible.length === 0 ? (
            <GlassPanel>
              <EmptyState
                variant="calm"
                title={statusFilter === 'open' ? 'Không còn cảnh báo nào chờ quyết định' : 'Không có cảnh báo khớp bộ lọc'}
                description="Chưa có biến động nào vừa đủ lớn về số liệu vừa đáng kể về kinh doanh trong phạm vi này."
              />
            </GlassPanel>
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* Cuộn riêng chỉ trên màn rộng; trên điện thoại cuộn lồng trong trang cuộn rất khó dùng */}
              <ul className="flex list-none flex-col gap-1 rounded-[10px] border border-line bg-surface p-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto" aria-label="Danh sách cảnh báo">
                {visible.map((a) => (
                  <AlertRow key={a.id} alert={a} status={statusOf(a)} active={selected?.id === a.id} onClick={() => select(a.id)} />
                ))}
              </ul>

              {selected && (
                <div ref={detailRef} className="scroll-mt-20 lg:sticky lg:top-20">
                  <Detail
                    alert={selected}
                    rec={recs[selected.id]}
                    status={statusOf(selected)}
                    saving={states[selected.id] === 'saving'}
                    onAccept={() => decide(selected, 'ACCEPTED')}
                    onDismiss={() => setDismissing(selected)}
                    onEvidence={() => setEvidenceFor(selected)}
                  />
                  {states[selected.id] === 'error' && <p className="mt-2 text-sm text-crit">Không lưu được quyết định. Thử lại.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <DismissModal
        alert={dismissing}
        open={Boolean(dismissing)}
        onClose={() => setDismissing(null)}
        onConfirm={(reason) => decide(dismissing, 'DISMISSED', reason)}
      />
      <SourceDrawer alert={evidenceFor} onClose={() => setEvidenceFor(null)} />
      <Toast show={Boolean(toast)}>{toast}</Toast>
    </div>
  );
};

export default RiskCenter;
