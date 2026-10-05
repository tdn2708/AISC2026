import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Check, CircleSlash, Clock, FileSearch, Lightbulb, ShieldCheck, Siren, UserRound, Users, Wallet, RotateCcw
} from 'lucide-react';
import {
  PageHeader, GlassPanel, SeverityBadge, Button, ChipGroup, Drawer, EmptyState, Badge, SentimentFace, Stat, Toast
} from './ui';
import { Evidence, ConfidenceMeter, DismissModal } from './alerts/AlertParts';
import { useDecisions } from '../hooks/useDecisions';
import { alertTitle, fmtInt, fmtDateTime, SEVERITY, SEVERITY_ORDER } from '../lib/format';

/**
 * CẢNH BÁO & HÀNH ĐỘNG
 * ------------------------------------------------------------------
 * Bản cũ ghi "đã xử lý" vào localStorage của trình duyệt: người khác mở
 * máy khác thì không thấy, và hệ thống không bao giờ biết quyết định đó.
 * Bản này đọc và ghi quyết định thật qua /recommendations — chấp nhận
 * hay bỏ qua đều về máy chủ, đi vào vòng lặp học của bộ đề xuất.
 *
 * Bố cục: danh sách bên trái (quét nhanh), chi tiết bên phải (quyết định).
 */

const STATUS_FILTERS = [
  { value: 'open', label: 'Đang chờ' },
  { value: 'ACCEPTED', label: 'Đã chấp nhận' },
  { value: 'DISMISSED', label: 'Đã bỏ qua' },
  { value: 'all', label: 'Tất cả' }
];

const AlertRow = ({ alert, status, active, onClick }) => {
  const meta = SEVERITY[alert.severity] || SEVERITY.Low;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active || undefined}
        className={`relative w-full rounded-lg border p-4 pl-5 text-left transition-[background-color,border-color,box-shadow] ${
          active ? 'border-accent/40 bg-surface shadow-[0_0_0_3px_var(--accent-dim)]' : 'border-transparent bg-surface/45 hover:bg-surface/80'
        }`}
        style={{ '--sev': meta.color }}
      >
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-(--sev)" />
        <div className="flex items-center justify-between gap-2">
          <SeverityBadge level={alert.severity} />
          {status === 'ACCEPTED' ? (
            <Badge tone="ok" icon={Check}>Đã chấp nhận</Badge>
          ) : status === 'DISMISSED' ? (
            <Badge icon={CircleSlash}>Đã bỏ qua</Badge>
          ) : (
            alert.sla && <span className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-ink-lo"><Clock size={11} />{alert.sla}</span>
          )}
        </div>
        <p className="mt-2 text-sm leading-snug font-semibold text-ink-hi">{alertTitle(alert)}</p>
        {alert.productName && <p className="mt-0.5 truncate text-xs text-ink-lo">{alert.productName}</p>}
        <Evidence alert={alert} className="mt-2" />
      </button>
    </li>
  );
};

const Fact = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-3 rounded-lg bg-surface/55 p-3">
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-dim text-accent">
      <Icon size={15} aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <p className="text-[0.7rem] text-ink-lo">{label}</p>
      <p className="text-sm font-medium text-ink-hi">{children}</p>
    </div>
  </div>
);

const Detail = ({ alert, rec, status, saving, onAccept, onDismiss, onEvidence }) => {
  const steps = rec?.steps || alert.recommendation?.steps || [];
  const confidence = rec?.confidence ?? alert.recommendation?.confidence;
  const evidence = rec?.evidence || {};
  return (
    <GlassPanel tone="strong" glow={alert.severity === 'Critical' && !status ? 'crit' : null} className="p-6 animate-fade-up" key={alert.id}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge level={alert.severity} />
        <Badge tone="neutral">{alert.typeVi || 'Cảnh báo'}</Badge>
        {alert.sla && <Badge tone="neutral" icon={Clock}>Xử lý trong {alert.sla}</Badge>}
      </div>
      <h2 className="mt-3 text-xl leading-snug font-semibold text-ink-hi">{alertTitle(alert)}</h2>
      {alert.productName && <p className="mt-1 text-sm text-ink-mid">{alert.productName}</p>}

      {alert.summary && (
        <div className="mt-4 rounded-lg bg-surface/55 p-4">
          <p className="eyebrow mb-1.5">Diễn giải</p>
          <p className="text-sm leading-relaxed text-ink-hi">{alert.summary}</p>
          <Evidence alert={alert} className="mt-3" />
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Fact icon={Users} label="Khách bị ảnh hưởng">
          {evidence.affectedCustomers != null ? fmtInt(evidence.affectedCustomers) : '—'}
        </Fact>
        <Fact icon={FileSearch} label="Phản hồi làm bằng chứng">
          {fmtInt(evidence.evidenceCount ?? alert.evidenceCount)}
          {alert.excludedByTrust > 0 && <span className="font-normal text-ink-lo"> · đã loại {fmtInt(alert.excludedByTrust)}</span>}
        </Fact>
        <Fact icon={UserRound} label="Bộ phận phụ trách">{alert.owner || '—'}</Fact>
        <Fact icon={Wallet} label="Doanh thu chịu rủi ro">
          {rec?.dataProfile?.slots?.revenue || 'Chưa đối soát được'}
        </Fact>
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-3 flex items-center gap-1.5"><Lightbulb size={12} /> Kế hoạch hành động đề xuất</p>
        {steps.length === 0 ? (
          <p className="text-sm text-ink-lo">Chưa có hành động nào phù hợp với hồ sơ dữ liệu của cảnh báo này.</p>
        ) : (
          <ol className="flex list-none flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.actionId || i} className={`flex gap-3 rounded-lg p-3.5 ${i === 0 ? 'bg-accent-dim' : 'bg-surface/50'}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ${i === 0 ? 'bg-accent text-on-accent' : 'bg-raised text-ink-mid'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-ink-hi">{s.text}</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-ink-mid">
                    {s.kindLabel && <span>{s.kindLabel}</span>}
                    <span>~{s.effortDays} ngày công</span>
                    {s.reversible === false && <span className="text-high">Không đảo ngược được</span>}
                    {s.requiresApproval && s.approvalRole && <span>Duyệt: {s.approvalRole}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <ConfidenceMeter value={confidence} className="mt-4" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-5">
        {status === 'ACCEPTED' ? (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-ok"><Check size={16} /> Đã chấp nhận — hệ thống sẽ đo lại hiệu quả sau 7 ngày</p>
        ) : status === 'DISMISSED' ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink-mid">
            <CircleSlash size={16} /> Đã bỏ qua{rec?.dismissReason ? ` — ${rec.dismissReason}` : ''}
          </p>
        ) : (
          steps.length > 0 && (
            <>
              <Button icon={Check} onClick={onAccept} loading={saving}>Chấp nhận kế hoạch</Button>
              <Button variant="ghost" onClick={onDismiss} disabled={saving}>Bỏ qua…</Button>
            </>
          )
        )}
        <Button variant="secondary" icon={FileSearch} onClick={onEvidence} className="sm:ml-auto">Xem phản hồi gốc</Button>
      </div>

      <p className="mt-4 flex gap-2 text-[0.72rem] leading-relaxed text-ink-lo">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Hệ thống không tự thực thi hành động phát sinh chi phí hoặc chạm tới khách hàng. Quyết định thuộc về người có thẩm quyền.
      </p>
    </GlassPanel>
  );
};

const EvidenceDrawer = ({ alert, onClose }) => {
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
    <Drawer
      open={Boolean(alert)}
      onClose={onClose}
      title="Phản hồi gốc"
      subtitle={alert ? alertTitle(alert) : undefined}
    >
      {error ? (
        <EmptyState variant="error" compact title="Không tải được" description={error} />
      ) : !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-raised" />)}
        </div>
      ) : data.evidence?.length === 0 ? (
        <EmptyState compact title="Không có phản hồi đính kèm" description="Cảnh báo dạng suy giảm kéo dài được phát hiện trên chuỗi thời gian, không gắn với từng phản hồi." />
      ) : (
        <>
          {data.excludedByTrust > 0 && (
            <p className="mb-4 rounded-lg bg-accent-dim px-3 py-2 text-xs text-accent-hi">
              Đã loại {fmtInt(data.excludedByTrust)} phản hồi không đạt ngưỡng tin cậy khỏi bằng chứng của cảnh báo này.
            </p>
          )}
          <ul className="flex list-none flex-col gap-3">
            {data.evidence.map((f) => (
              <li key={f._id} className="rounded-lg bg-surface/60 p-4">
                <div className="flex items-center gap-2.5">
                  <SentimentFace sentiment={f.sentiment} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-hi">{f.author || 'Ẩn danh'}</p>
                    <p className="font-mono text-[0.68rem] text-ink-lo">{fmtDateTime(f.timestamp)} · {f.source} · {f.trust?.tier}</p>
                  </div>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-hi">{f.originalText}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
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
    const okStatus = statusFilter === 'all' || (statusFilter === 'open' ? !st || recent.has(a.id) : st === statusFilter);
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
  const select = (id) => setParams(id ? { alert: id } : {}, { replace: true });

  const open = sorted.filter((a) => !statusOf(a));
  const sevOptions = [
    { value: 'all', label: 'Mọi mức', count: open.length },
    ...SEVERITY_ORDER.map((k) => ({ value: k, label: SEVERITY[k].label, count: open.filter((a) => a.severity === k).length })).filter((o) => o.count > 0)
  ];

  return (
    <div className="cx">
      <PageHeader
        section="Giám sát"
        title="Cảnh báo"
        accent="& hành động"
        subtitle="Chỉ gồm biến động đã qua kiểm định thống kê và hiệu chỉnh đa kiểm định. Mỗi cảnh báo đi kèm một kế hoạch đề xuất chờ quyết định."
        actions={<Button variant="secondary" icon={RotateCcw} onClick={load} loading={loading}>Làm mới</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Chỉ tô màu khi con số khác 0 — một số 0 màu đỏ đọc ra là báo động giả */}
        {[
          ['Đang chờ quyết định', open.length, null],
          ['Nghiêm trọng', open.filter((a) => a.severity === 'Critical').length, 'crit'],
          ['Mức cao', open.filter((a) => a.severity === 'High').length, 'high'],
          ['Đã quyết định', sorted.length - open.length, 'ok']
        ].map(([label, n, tone]) => (
          <Stat key={label} label={label} value={fmtInt(n)} tone={n > 0 ? tone : null} />
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ChipGroup label="Lọc theo trạng thái" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <ChipGroup label="Lọc theo mức độ" options={sevOptions} value={severity} onChange={setSeverity} />
      </div>

      {error ? (
        <GlassPanel><EmptyState variant="error" title="Không tải được cảnh báo" description={error} action={<Button onClick={load}>Thử lại</Button>} /></GlassPanel>
      ) : loading && alerts.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-surface/50" />)}</div>
          <div className="h-[520px] animate-pulse rounded-xl bg-surface/50" />
        </div>
      ) : visible.length === 0 ? (
        <GlassPanel>
          <EmptyState
            variant="calm"
            title={statusFilter === 'open' ? 'Không còn cảnh báo nào chờ quyết định' : 'Không có cảnh báo khớp bộ lọc'}
            description="Không có biến động nào đạt đồng thời ý nghĩa thống kê và ý nghĩa nghiệp vụ trong phạm vi này."
          />
        </GlassPanel>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <GlassPanel className="p-2.5">
            <p className="eyebrow px-2.5 pt-2 pb-2.5">
              <Siren size={11} className="mr-1.5 inline" />
              <span className="font-mono">{visible.length}</span> cảnh báo · xếp theo mức độ
            </p>
            <ul className="flex max-h-[calc(100vh-18rem)] list-none flex-col gap-2 overflow-y-auto">
              {visible.map((a) => (
                <AlertRow key={a.id} alert={a} status={statusOf(a)} active={selected?.id === a.id} onClick={() => select(a.id)} />
              ))}
            </ul>
          </GlassPanel>

          {selected && (
            <div className="lg:sticky lg:top-20">
              <Detail
                alert={selected}
                rec={recs[selected.id]}
                status={statusOf(selected)}
                saving={states[selected.id] === 'saving'}
                onAccept={() => decide(selected, 'ACCEPTED')}
                onDismiss={() => setDismissing(selected)}
                onEvidence={() => setEvidenceFor(selected)}
              />
              {states[selected.id] === 'error' && <p className="mt-2 text-sm text-crit">Không lưu được quyết định — thử lại sau.</p>}
            </div>
          )}
        </div>
      )}

      <DismissModal
        alert={dismissing}
        open={Boolean(dismissing)}
        onClose={() => setDismissing(null)}
        onConfirm={(reason) => decide(dismissing, 'DISMISSED', reason)}
      />
      <EvidenceDrawer alert={evidenceFor} onClose={() => setEvidenceFor(null)} />
      <Toast show={Boolean(toast)}>{toast}</Toast>
    </div>
  );
};

export default RiskCenter;
