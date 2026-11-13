import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Copy, Check, Download, Save } from 'lucide-react';
import { PageHeader, GlassPanel, EmptyState, Button, Badge, Stat, Skeleton, Toast, ChartTooltip, Checkbox, TextField, fieldClass } from './ui';
import ReplyDraft from './feedback/ReplyDraft';
import { fmtInt, fmtPct, fmtDate, spanWords } from '../lib/format';
import { AXIS_TICK } from '../lib/tokens';
import { PageEnter } from './motion';

/**
 * HỒ SƠ XỬ LÝ MỘT ĐIỂM ĐAU (/cases?key=...) và danh sách hồ sơ (/cases)
 * ------------------------------------------------------------------
 * Bốn bước, dựng từ dữ liệu (backend services/case_file.js):
 *   1 Khoanh vùng  2 Ai làm  3 Đồ làm sẵn  4 Theo dõi.
 * Bước nào thiếu dữ liệu thì nói thẳng thiếu gì. Hệ thống không gửi gì cho
 * khách hay đối tác: người dùng đọc, sửa, tự gửi.
 */

const fmtMoney = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')} đ`;
const KIND_TONE = { INVESTIGATE: 'neutral', INTERNAL_FIX: 'neutral', CONTACT_PARTNER: 'accent', CUSTOMER_CONTACT: 'med', FINANCIAL: 'high' };

const Step = ({ n, title, subtitle, children }) => (
  <GlassPanel as="section" tone="strong" className="reveal p-5 sm:p-6" aria-labelledby={`step-${n}`}>
    <header className="mb-4 flex items-baseline gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-ctrl bg-accent-dim tabular-nums text-sm font-semibold text-accent-hi">{n}</span>
      <div className="min-w-0">
        <h2 id={`step-${n}`} className="text-heading font-semibold text-ink-hi">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-mid">{subtitle}</p>}
      </div>
    </header>
    {children}
  </GlassPanel>
);

const Missing = ({ items }) => (items?.length ? (
  <ul className="mt-3 flex list-none flex-col gap-1 text-xs leading-relaxed text-ink-lo">
    {items.map((m) => <li key={m}>Thiếu dữ liệu: {m}</li>)}
  </ul>
) : null);

const CopyButton = ({ text, label = 'Sao chép' }) => {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={done ? Check : Copy}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* trình duyệt chặn: người dùng tự chọn chữ */ }
      }}
    >
      {done ? 'Đã chép' : label}
    </Button>
  );
};

/** Tải danh sách phản hồi của điểm đau thành CSV (mở được bằng Excel) */
const downloadCsv = (rows, name) => {
  const head = ['Ngày', 'Sản phẩm', 'Nguồn', 'Số sao', 'Có chứng từ', 'Mã đơn', 'Khu vực', 'Nội dung'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head, ...rows.map((r) => [fmtDate(r.timestamp), r.productName, r.source, r.rating, r.verified ? 'có' : 'không', r.orderId, r.region, r.text])]
    .map((r) => r.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const WeekTip = ({ active, payload }) => (active && payload?.length ? (
  <ChartTooltip title={`${payload[0].payload.days > 7 ? 'Kỳ' : 'Tuần'} từ ${fmtDate(payload[0].payload.start)}`}>
    <p><span className="font-semibold text-ink-hi">{fmtInt(payload[0].value)}</span> phản hồi</p>
  </ChartTooltip>
) : null);

/** Kỳ của biểu đồ hồ sơ: kho dày theo tuần, kho thưa theo kỳ dài hơn (backend case_file weekStep) */
const periodTitle = (step = 7) => (step <= 7 ? 'Theo tuần, 12 tuần gần nhất' : `Mỗi kỳ ${step} ngày, ${spanWords(step * 12)} gần nhất`);
const periodSpan = (step = 7) => (step <= 7 ? '12 tuần' : spanWords(step * 12));

const effectWords = (e) => {
  if (!e) return null;
  if (e.status === 'pending') return `Còn ${fmtInt(e.daysLeft)} ngày nữa mới đo lại được.`;
  if (!e.enough) return `Chưa đủ phản hồi để so (${spanWords(e.beforeDays || 7)} trước ${fmtInt(e.before.n)}, từ lúc mở tới nay ${fmtInt(e.after.n)}; cần ít nhất 30 mỗi bên). Kho ít phản hồi mới thì phải chờ lâu hơn.`;
  const dir = e.change < 0 ? 'giảm' : e.change > 0 ? 'tăng' : 'không đổi';
  return `Tỉ lệ câu nhắc chuyện này ${dir}: ${fmtPct(e.before.rate, 1)} trước, ${fmtPct(e.after.rate, 1)} sau. Đây là so trước và sau, chưa chứng minh nhờ việc đã làm.`;
};

// ------------------------------------------------------------------
// Danh sách hồ sơ
// ------------------------------------------------------------------
const CaseList = () => {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    axios.get('/cases').then((r) => setList(r.data.cases)).catch(() => setError('Không tải được danh sách hồ sơ.'));
  }, []);
  return (
    <PageEnter className="cx">
      <PageHeader title="Hồ sơ xử lý" subtitle="Những điểm đau shop đã nhận xử lý, việc còn lại và kết quả đo sau 7 ngày." />
      {error ? <GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel>
        : !list ? <Skeleton as="div" className="h-[320px] rounded-surf bg-surface/50" />
          : list.length === 0 ? (
            <GlassPanel>
              <EmptyState
                title="Chưa có hồ sơ nào"
                description="Mở trang Phân tích nguyên nhân, tab Điểm đau cụ thể, chọn một điểm đau rồi bấm Xử lý."
                action={<Button as={Link} to="/analytics?tab=pain">Xem điểm đau</Button>}
              />
            </GlassPanel>
          ) : (
            <GlassPanel tone="strong" className="p-5">
              <ul className="flex list-none flex-col divide-y divide-line-soft">
                {list.map((c) => {
                  const done = c.tasks.filter((t) => t.done).length;
                  return (
                    <li key={c._id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4">
                      <div className="min-w-0 flex-[1_1_18rem]">
                        <p className="text-base font-semibold text-ink-hi">"{c.phrase}"</p>
                        <p className="mt-0.5 text-sm text-ink-mid">{c.groupLabel}, {fmtInt(c.snapshot.customers)} khách lúc mở, mở ngày {fmtDate(c.openedAt)}</p>
                        <p className="mt-1 text-xs text-ink-lo">{effectWords(c.effect)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={c.status === 'closed' ? 'ok' : 'accent'}>{c.status === 'closed' ? 'Đã đóng' : `Xong ${fmtInt(done)}/${fmtInt(c.tasks.length)} việc`}</Badge>
                        <Button size="sm" variant="secondary" as={Link} to={`/cases?key=${encodeURIComponent(c.key)}`}>Mở</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </GlassPanel>
          )}
    </PageEnter>
  );
};

// ------------------------------------------------------------------
// Một hồ sơ
// ------------------------------------------------------------------
const CaseFile = ({ caseKey, filterQuery }) => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [letter, setLetter] = useState('');
  const [voucher, setVoucher] = useState(10);
  const [replyFor, setReplyFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg, tone = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        axios.get(`/cases/preview?key=${encodeURIComponent(caseKey)}${filterQuery}`),
        axios.get('/cases')
      ]);
      setFile(p.data);
      setLetter(p.data.steps.ready.letter.text);
      const open = c.data.cases.find((x) => x.key === caseKey && x.status === 'open') || null;
      setSaved(open);
      setTasks(open ? open.tasks : p.data.steps.follow.tasks.map((t) => ({ ...t, due: null, done: false })));
      setError(null);
    } catch (e) {
      setError(e?.response?.status === 404 ? 'Điểm đau này không còn trong dữ liệu với bộ lọc hiện tại.' : 'Không tải được hồ sơ. Tải lại trang, hoặc kiểm tra mạng.');
    }
  }, [caseKey, filterQuery]);
  useEffect(() => { load(); }, [load]);

  const s = file?.steps;
  const comp = s?.ready.compensation;
  const voucherCost = comp?.available ? (comp.orderValue * voucher) / 100 : 0;
  const weeks = useMemo(() => (s ? s.scope.weeks.map((w) => ({ ...w, name: w.days >= 31 ? fmtDate(w.start).slice(3) : fmtDate(w.start).slice(0, 5) })) : []), [s]);
  const anyWeek = weeks.some((w) => w.count > 0);

  const setTask = (i, patch) => setTasks((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const save = async () => {
    setBusy(true);
    try {
      if (saved) {
        const { data } = await axios.patch(`/cases/${saved._id}`, { tasks });
        setSaved(data);
        setTasks(data.tasks);
        flash('Đã lưu tiến độ');
      } else {
        await axios.post('/cases', { key: caseKey, tasks, filters: Object.fromEntries(new URLSearchParams(filterQuery.slice(1))) });
        await load();
        flash('Đã mở hồ sơ. 7 ngày sau hệ thống đo lại.');
      }
    } catch {
      flash('Chưa lưu được. Thử lại sau ít phút.', 'crit');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      const { data } = await axios.patch(`/cases/${saved._id}`, { tasks, status: 'closed' });
      setSaved(null);
      flash('Đã đóng hồ sơ');
      setTasks(data.tasks);
      navigate('/cases');
    } catch {
      flash('Chưa đóng được. Thử lại sau ít phút.', 'crit');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <PageEnter className="cx">
        <PageHeader title="Hồ sơ xử lý" />
        <GlassPanel><EmptyState variant="error" title="Không mở được hồ sơ" description={error} action={<Button as={Link} to="/analytics?tab=pain">Về danh sách điểm đau</Button>} /></GlassPanel>
      </PageEnter>
    );
  }
  if (!file) {
    return (
      <div className="cx flex flex-col gap-6">
        <Skeleton as="div" className="h-24 rounded-surf bg-surface/50" />
        <Skeleton as="div" className="h-[420px] rounded-surf bg-surface/50" />
      </div>
    );
  }

  return (
    <PageEnter className="cx">
      <Link to="/analytics?tab=pain" className="mb-3 inline-flex min-h-8 items-center gap-1 text-sm text-ink-mid hover:text-accent-hi">
        <ArrowLeft size={14} aria-hidden="true" /> Điểm đau cụ thể
      </Link>
      <PageHeader
        title={`"${file.phrase}"`}
        subtitle={`${file.group.label}. Mảng hàng lấy từ ${file.group.sourceLabel}.${file.variants.length ? ` Khách cũng viết: ${file.variants.slice(0, 3).map((v) => `"${v}"`).join(', ')}.` : ''}`}
        actions={saved ? <Badge tone="accent">Đang xử lý từ {fmtDate(saved.openedAt)}</Badge> : null}
      />

      <div className="flex flex-col gap-6">
        <GlassPanel className="p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Khách nhắc" value={fmtInt(s.scope.customers)} />
            <Stat label="Phản hồi" value={fmtInt(s.scope.count)} sub={`${fmtPct(file.shareOfNegatives, 0)} câu chê của mảng`} />
            <Stat label="Có chứng từ mua" value={fmtInt(s.scope.verified)} />
            <Stat label="Lần gần nhất" value={fmtDate(s.scope.lastSeen)} sub={`Lần đầu ${fmtDate(s.scope.firstSeen)}`} />
          </div>
        </GlassPanel>

        <Step n={1} title="Khoanh vùng" subtitle="Chuyện này dồn vào đâu, từ khi nào.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-hi">Sản phẩm</h3>
              <ol className="paper flex list-none flex-col gap-1 p-2">
                {s.scope.products.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 px-1 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-hi" title={p.name}>{p.name}</span>
                    <span className="tabular-nums text-xs text-ink-mid">{fmtInt(p.count)} ({fmtPct(p.share, 0)})</span>
                  </li>
                ))}
                {s.scope.products.length === 0 && <li className="px-1 py-1.5 text-sm text-ink-lo">—</li>}
              </ol>
              <p className="mt-3 text-sm text-ink-mid">
                Nguồn: {s.scope.sources.map((x) => `${x.name} ${fmtInt(x.count)}`).join(', ') || '—'}
                {s.scope.regions.length > 0 && <><br />Khu vực: {s.scope.regions.map((x) => `${x.name} ${fmtInt(x.count)}`).join(', ')}</>}
                {s.scope.orders.withOrder > 0 && <><br />{fmtInt(s.scope.orders.withOrder)} phản hồi có mã đơn{s.scope.orders.value ? `, tổng giá trị đơn ${fmtMoney(s.scope.orders.value)}` : ''}</>}
              </p>
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-hi">{periodTitle(s.scope.weekStep)}</h3>
              {anyWeek ? (
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeks} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} dy={6} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                      <Tooltip content={<WeekTip />} cursor={{ fill: 'var(--viz-grid)' }} />
                      <Bar dataKey="count" fill="var(--viz-neg)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="paper px-3 py-3 text-sm leading-relaxed text-ink-mid">
                  {periodSpan(s.scope.weekStep)} gần nhất không có phản hồi nào nhắc chuyện này. Lần gần nhất: {fmtDate(s.scope.lastSeen)}.
                </p>
              )}
            </div>
          </div>
          <Missing items={s.scope.missing} />
          <Button className="mt-4" size="sm" variant="secondary" icon={Download} onClick={() => downloadCsv(s.scope.feedbacks, `diem-dau-${file.phrase}`)}>
            Tải {fmtInt(s.scope.feedbacks.length)} phản hồi (CSV)
          </Button>
        </Step>

        <Step n={2} title="Ai làm, làm gì" subtitle={s.who.owner ? `Bộ phận phụ trách: ${s.who.owner}${s.who.causeLabel ? `. Nguyên nhân chiếm đa số: ${s.who.causeLabel} (${fmtPct(s.who.causeShare, 0)} số câu)` : ''}.` : 'Chưa xác định được nhóm vấn đề chiếm đa số.'}>
          <ol className="paper flex list-none flex-col divide-y divide-line-soft px-3 py-1">
            {s.who.actions.map((a) => (
              <li key={a.id} className="py-3">
                <p className="text-sm leading-relaxed text-ink-hi">{a.text}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone={KIND_TONE[a.kind] || 'neutral'}>{a.kindLabel}</Badge>
                  {a.requiresApproval && <Badge tone="high">Cần người có thẩm quyền duyệt</Badge>}
                  {a.effortDays != null && <Badge>Khoảng {fmtInt(a.effortDays)} ngày</Badge>}
                </div>
              </li>
            ))}
            {s.who.dataGap && (
              <li className="py-3">
                <p className="text-sm leading-relaxed text-ink-hi">{s.who.dataGap.text}</p>
                <div className="mt-1.5"><Badge>Bổ sung dữ liệu: {s.who.dataGap.gap}</Badge></div>
              </li>
            )}
          </ol>
          {s.who.note && <p className="mt-3 text-xs text-ink-lo">{s.who.note}</p>}
          {s.who.dropped.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-lo">
              {fmtInt(s.who.dropped.length)} việc mẫu khác chưa đề xuất vì dữ liệu chưa có: {[...new Set(s.who.dropped.flatMap((d) => d.need))].join(', ')}.
            </p>
          )}
        </Step>

        <Step n={3} title="Đồ làm sẵn" subtitle="Soạn sẵn từ số liệu thật. Bạn đọc, sửa rồi tự gửi; hệ thống không gửi gì.">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-hi">Thư gửi {s.ready.letter.recipient}</h3>
                <CopyButton text={letter} />
              </div>
              <textarea
                aria-label="Nội dung thư"
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                rows={14}
                className={`${fieldClass({ multiline: true })} resize-y px-3 py-2 leading-relaxed`}
              />
              <Missing items={s.ready.letter.missing} />
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-hi">Tin nhắn bù cho khách</h3>
              {comp.available ? (
                <>
                  <p className="text-sm leading-relaxed text-ink-mid">
                    {fmtInt(comp.customers)} khách có mã đơn ({fmtInt(comp.orders)} đơn, tổng {fmtMoney(comp.orderValue)}).
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <TextField label="Mã giảm (% giá trị đơn)" type="number" min={0} max={100} value={voucher} onChange={(e) => setVoucher(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="w-44" />
                    <p className="pb-2 text-sm text-ink-mid">Chi phí nếu mọi khách dùng mã: <span className="tabular-nums font-semibold text-ink-hi">{fmtMoney(voucherCost)}</span></p>
                  </div>
                  <p className="paper mt-3 px-3 py-3 text-sm leading-relaxed text-ink-hi">{comp.template}</p>
                  <div className="mt-2"><CopyButton text={comp.template} label="Sao chép tin nhắn" /></div>
                </>
              ) : (
                <p className="paper px-3 py-3 text-sm leading-relaxed text-ink-mid">{comp.missing[0]}</p>
              )}
              <Missing items={comp.available ? comp.missing : []} />
            </div>
          </div>

          <div className="mt-6 border-t border-line-soft pt-5">
            <h3 className="text-sm font-semibold text-ink-hi">Trả lời công khai {fmtInt(s.scope.feedbacks.length)} phản hồi</h3>
            <p className="mt-1 text-xs text-ink-lo">{s.ready.replies.note}</p>
            <ul className="paper mt-3 flex max-h-[520px] list-none flex-col divide-y divide-line-soft overflow-y-auto px-3 py-1">
              {s.scope.feedbacks.slice(0, 40).map((f) => (
                <li key={f.id} className="py-3">
                  <p className="text-sm leading-relaxed text-ink-hi">{f.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-lo">
                    {f.author && <span>{f.author}</span>}
                    <span className="tabular-nums">{fmtDate(f.timestamp)}</span>
                    {f.source && <span>{f.source}</span>}
                    {f.verified && <span>Có chứng từ</span>}
                    <Button size="sm" variant="link" onClick={() => setReplyFor(replyFor === f.id ? null : f.id)} aria-expanded={replyFor === f.id}>
                      {replyFor === f.id ? 'Đóng' : 'Soạn trả lời'}
                    </Button>
                  </div>
                  {replyFor === f.id && <div className="mt-3"><ReplyDraft feedbackId={f.id} /></div>}
                </li>
              ))}
            </ul>
            {s.scope.feedbacks.length > 40 && <p className="mt-2 text-xs text-ink-lo">Hiện 40 phản hồi mới nhất; tải CSV ở bước 1 để có đủ {fmtInt(s.scope.feedbacks.length)}.</p>}
          </div>
        </Step>

        <Step n={4} title="Theo dõi" subtitle={saved ? 'Đánh dấu việc đã xong, đổi người làm và hạn chót, rồi lưu.' : 'Chọn người làm, hạn chót cho từng việc rồi mở hồ sơ. 7 ngày sau hệ thống tự đo lại.'}>
          <ul className="paper flex list-none flex-col divide-y divide-line-soft px-3 py-1">
            {tasks.map((t, i) => (
              <li key={t.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_11rem_10rem] md:items-start">
                <Checkbox
                  checked={!!t.done}
                  onChange={(v) => setTask(i, { done: v })}
                  label={<span className={`text-sm leading-relaxed ${t.done ? 'text-ink-lo line-through' : 'text-ink-hi'}`}>{t.text}</span>}
                />
                <TextField label="Người làm" value={t.owner || ''} onChange={(e) => setTask(i, { owner: e.target.value })} />
                <TextField label="Hạn chót" type="date" value={t.due ? String(t.due).slice(0, 10) : ''} onChange={(e) => setTask(i, { due: e.target.value || null })} />
              </li>
            ))}
          </ul>
          {saved && <p className="mt-3 text-sm text-ink-mid">{effectWords(saved.effect)}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button icon={Save} loading={busy} onClick={save}>{saved ? 'Lưu tiến độ' : 'Mở hồ sơ xử lý'}</Button>
            {saved && <Button variant="secondary" disabled={busy} onClick={close}>Đóng hồ sơ</Button>}
            <Button variant="ghost" as={Link} to="/cases">Mọi hồ sơ</Button>
          </div>
        </Step>
      </div>
      <Toast show={!!toast} tone={toast?.tone}>{toast?.msg}</Toast>
    </PageEnter>
  );
};

const Cases = () => {
  const [params] = useSearchParams();
  const key = params.get('key');
  const rest = new URLSearchParams(params);
  rest.delete('key');
  const filterQuery = rest.toString() ? `&${rest.toString()}` : '';
  return key ? <CaseFile key={key} caseKey={key} filterQuery={filterQuery} /> : <CaseList />;
};

export default Cases;
