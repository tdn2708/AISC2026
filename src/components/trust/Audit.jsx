import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Check, X, SkipForward } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, EmptyState, Chip, Select, Toast, Segmented, Skeleton } from '../ui';
import { fmtInt, fmtDate, SENTIMENT_MAP, LABELLER_LABEL } from '../../lib/format';
import { reportRefreshing } from '../../lib/dataVersion';
import { currentUser } from '../../hooks/useDecisions';

/**
 * DUYỆT NHÃN DO NGƯỜI LÀM — hai hàng đợi
 * ------------------------------------------------------------------
 *   Cần duyệt      hai mô hình bất đồng và số sao không phân xử được.
 *   Nghi mỉa mai   câu luật/mô hình nghi là mỉa mai.
 * Nhãn người GHI ĐÈ nhãn máy trong mọi chỉ số ngay sau khi lưu.
 */

const SENTS = ['Positive', 'Neutral', 'Negative'];
const MODES = [
  { value: 'review', label: 'Cần duyệt' },
  { value: 'sarcasm', label: 'Nghi mỉa mai' }
];

const YesNo = ({ value, onChange, label, yes = 'Đúng', no = 'Sai' }) => (
  <div role="group" aria-label={label} className="flex gap-2">
    <Chip active={value === true} onClick={() => onChange(true)} icon={Check}>{yes}</Chip>
    <Chip active={value === false} onClick={() => onChange(false)} icon={X}>{no}</Chip>
  </div>
);

const sentLabel = (s) => (SENTIMENT_MAP[s] || SENTIMENT_MAP.Neutral).label;

/** Vì sao câu này vào hàng chờ: tín hiệu luật + phiếu của từng mô hình */
const MachineVotes = ({ item, categories }) => {
  const catLabel = (k) => (k === 'Other' || !k ? 'không nêu vấn đề' : categories.find((c) => c.key === k)?.label || k);
  const v = item.labelVotes;
  if (!item.sarcasm?.suspected && !v) return null;
  return (
    <div className="mt-4 rounded-ctrl bg-raised px-4 py-3 text-xs leading-relaxed text-ink-mid">
      {item.sarcasm?.signals?.length > 0 && <p><b className="text-ink-hi">Vì sao bị đánh dấu:</b> {item.sarcasm.signals.join('; ')}.</p>}
      {v && (
        <ul className="mt-1.5 flex list-none flex-col gap-0.5">
          {v.primary && <li>Mô hình chính ({LABELLER_LABEL[v.primary.by] || v.primary.by}): {sentLabel(v.primary.sentiment)}, {catLabel(v.primary.category)}</li>}
          {v.judge && <li>Mô hình thứ hai ({v.judge.by}): {v.judge.sarcastic ? 'mỉa mai' : 'không mỉa mai'}, {sentLabel(v.judge.sentiment)}, {catLabel(v.judge.category)}</li>}
          {!v.judge && <li>Mô hình thứ hai: chưa có ý kiến (lỗi hoặc hết lượt gọi)</li>}
          {v.rating && <li>Số sao: nghiêng về {sentLabel(v.rating).toLowerCase()}</li>}
        </ul>
      )}
      {item.sarcasm?.reason && <p className="mt-1.5">Lý do mô hình thứ hai: “{item.sarcasm.reason}”</p>}
    </div>
  );
};

const EMPTY = { sent: null, cat: null, sarcasm: null, correctSentiment: null, correctCategory: '', correctCause: '' };

const Audit = () => {
  const [mode, setMode] = useState('review');
  const [queue, setQueue] = useState([]);
  const [categories, setCategories] = useState([]);
  const [remaining, setRemaining] = useState(null);
  const [queues, setQueues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [ans, setAns] = useState(EMPTY);

  const loadSample = useCallback(async (m) => {
    const { data } = await axios.get(`/audit/sample?n=10&mode=${m}`);
    setQueue(data.items || []);
    setRemaining(data.remaining);
    setQueues(data.queues || {});
    setCategories(data.categories || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setAns(EMPTY);
    loadSample(mode)
      .then(() => setError(null))
      .catch(() => setError('Không tải được dữ liệu kiểm tra. Tải lại trang, hoặc kiểm tra mạng.'))
      .finally(() => setLoading(false));
  }, [mode, loadSample]);

  const item = queue[0];
  const next = async () => {
    setAns(EMPTY);
    if (queue.length > 1) setQueue((q) => q.slice(1));
    else await loadSample(mode);
  };

  const chosenCat = categories.find((c) => c.key === ans.correctCategory);
  const ready =
    ans.sent !== null && ans.cat !== null && ans.sarcasm !== null &&
    (ans.sent || ans.correctSentiment) &&
    (ans.cat || ans.correctCategory);

  const save = async () => {
    if (!ready || !item) return;
    setSaving(true);
    try {
      await axios.post('/audit/label', {
        feedbackId: item._id,
        sentimentCorrect: ans.sent,
        categoryCorrect: ans.cat,
        correctSentiment: ans.sent ? undefined : ans.correctSentiment,
        correctCategory: ans.cat ? undefined : ans.correctCategory,
        correctCause: ans.cat ? undefined : ans.correctCause || undefined,
        sarcasm: ans.sarcasm,
        sampleMode: mode,
        by: currentUser()
      });
      reportRefreshing(true);
      setToast(true);
      setTimeout(() => setToast(false), 1500);
      await next();
    } catch (e) {
      setError(e.response?.data?.error || 'Không lưu được kết quả. Thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const aiCat = item ? (item.category && item.category !== 'Other' ? item.categoryLabel : 'Không nêu vấn đề') : '';
  const modeOptions = MODES.map((m) => ({ ...m, label: `${m.label} (${fmtInt(queues[m.value] ?? 0)})` }));

  return (
    <div className="max-w-3xl">
      <GlassPanel tone="strong" className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Hàng đợi" options={modeOptions} value={mode} onChange={setMode} />
        </div>

        {loading ? (
          <Skeleton as="div" className="h-[360px] rounded-ctrl bg-raised" />
        ) : error && !item ? (
          <EmptyState variant="error" title="Không tải được" description={error} />
        ) : !item ? (
          <EmptyState title="Hàng đợi này đã trống" description="Không còn câu nào chờ duyệt ở hàng này." />
        ) : (
          <>
            <PanelHeader
              title="Phản hồi này AI xếp có đúng không?"
              subtitle={remaining != null ? `Còn ${fmtInt(remaining)} phản hồi trong hàng này` : undefined}
            />
            <blockquote className="rounded-ctrl border border-line-soft p-4 text-base leading-relaxed text-ink-hi">
              {item.originalText}
              <span className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-lo">
                {item.rating != null && <span className="tabular-nums">{item.rating}★</span>}
                <span>{item.source}</span>
                <span className="tabular-nums">{fmtDate(item.timestamp)}</span>
                {item.productName && <span className="truncate">{item.productName}</span>}
              </span>
            </blockquote>
            <MachineVotes item={item} categories={categories} />

            <div className="mt-5 flex flex-col gap-5">
              <div>
                <p className="text-sm text-ink-mid">Câu này có <b className="text-ink-hi">mỉa mai</b> không (khen ngoài miệng nhưng thật ra chê)?</p>
                <div className="mt-2">
                  <YesNo label="Có mỉa mai không" yes="Có" no="Không" value={ans.sarcasm} onChange={(v) => setAns((a) => ({ ...a, sarcasm: v }))} />
                </div>
              </div>

              <div>
                <p className="text-sm text-ink-mid">AI đoán cảm xúc: <b className="text-ink-hi">{sentLabel(item.sentiment)}</b></p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <YesNo label="Cảm xúc đúng hay sai" value={ans.sent} onChange={(v) => setAns((a) => ({ ...a, sent: v }))} />
                  {ans.sent === false && (
                    <div role="group" aria-label="Cảm xúc đúng" className="flex flex-wrap gap-2">
                      {SENTS.filter((s) => s !== item.sentiment).map((s) => (
                        <Chip key={s} active={ans.correctSentiment === s} onClick={() => setAns((a) => ({ ...a, correctSentiment: s }))}>{sentLabel(s)}</Chip>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm text-ink-mid">
                  AI xếp nhóm: <b className="text-ink-hi">{aiCat}</b>
                  {item.causeLabel && item.category !== 'Other' && <span className="text-ink-lo"> ({item.causeLabel})</span>}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <YesNo label="Nhóm vấn đề đúng hay sai" value={ans.cat} onChange={(v) => setAns((a) => ({ ...a, cat: v }))} />
                  {ans.cat === false && (
                    <>
                      <Select
                        label="Nhóm đúng"
                        value={ans.correctCategory}
                        onChange={(e) => setAns((a) => ({ ...a, correctCategory: e.target.value, correctCause: '' }))}
                        options={[{ value: '', label: 'Chọn nhóm đúng' }, ...categories.filter((c) => c.key !== (item.category || 'Other')).map((c) => ({ value: c.key, label: c.label }))]}
                      />
                      {chosenCat?.causes?.length > 0 && (
                        <Select
                          label="Nguyên nhân (nếu rõ)"
                          value={ans.correctCause}
                          onChange={(e) => setAns((a) => ({ ...a, correctCause: e.target.value }))}
                          options={[{ value: '', label: 'Không rõ' }, ...chosenCat.causes.map((c) => ({ value: c.key, label: c.label }))]}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-5">
              <Button icon={Check} onClick={save} loading={saving} disabled={!ready}>Lưu và sang phản hồi tiếp</Button>
              <Button variant="ghost" icon={SkipForward} onClick={next} disabled={saving}>Bỏ qua</Button>
            </div>
            {error && <p className="mt-2 text-sm text-crit">{error}</p>}
          </>
        )}
      </GlassPanel>
      <Toast show={toast}>Đã lưu, nhãn của bạn đã thay nhãn máy</Toast>
    </div>
  );
};

export default Audit;
