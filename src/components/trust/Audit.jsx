import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Check, X, SkipForward, Download } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, EmptyState, Chip, Select, Toast, Segmented, Skeleton, Badge } from '../ui';
import { fmtInt, fmtDate, SENTIMENT_MAP, LABELLER_LABEL } from '../../lib/format';
import { reportRefreshing } from '../../lib/dataVersion';
import { currentUser } from '../../hooks/useDecisions';

/**
 * DUYỆT NHÃN DO NGƯỜI LÀM — ba hàng đợi
 * ------------------------------------------------------------------
 *   Cần duyệt          hai mô hình bất đồng và số sao không phân xử được.
 *   Nghi mỉa mai       câu luật/mô hình nghi là mỉa mai.
 *   Bộ chuẩn gia dụng  mẫu phân tầng để gán bộ gold L2 và L3 (gia_dung).
 * Nhãn người GHI ĐÈ nhãn máy trong mọi chỉ số ngay sau khi lưu.
 */

const SENTS = ['Positive', 'Neutral', 'Negative'];
const MODES = [
  { value: 'review', label: 'Cần duyệt' },
  { value: 'sarcasm', label: 'Nghi mỉa mai' },
  { value: 'gold', label: 'Bộ chuẩn gia dụng' }
];
const SPLIT_LABEL = {
  test: 'Tập kiểm tra',
  dev: 'Tập tinh chỉnh',
  train: 'Tập huấn luyện'
};

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

const EMPTY = {
  sent: null,
  cat: null,
  sarcasm: null,
  correctSentiment: null,
  correctCategory: '',
  correctCause: '',
  correctRootCauses: [],
  correctTiming: null,
  showAllRoots: false
};

const Audit = () => {
  const [mode, setMode] = useState('review');
  const [queue, setQueue] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rootCatalog, setRootCatalog] = useState([]);
  const [timingCatalog, setTimingCatalog] = useState([]);
  const [remaining, setRemaining] = useState(null);
  const [queues, setQueues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(false);
  const [ans, setAns] = useState(EMPTY);

  const loadSample = useCallback(async (m) => {
    const { data } = await axios.get(`/audit/sample?n=10&mode=${m}`);
    setQueue(data.items || []);
    setRemaining(data.remaining);
    setQueues(data.queues || {});
    setCategories(data.categories || []);
    setRootCatalog(data.rootCauses || []);
    setTimingCatalog(data.timings || []);
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
  useEffect(() => {
    if (!item) return;
    setAns({
      ...EMPTY,
      correctRootCauses: Array.isArray(item.rootCauses) ? item.rootCauses : [],
      correctTiming: item.failureTiming || null
    });
  }, [item]);

  const next = async () => {
    setAns(EMPTY);
    if (queue.length > 1) setQueue((q) => q.slice(1));
    else await loadSample(mode);
  };

  const effectiveCat = ans.cat === false
    ? ans.correctCategory
    : ans.cat === true
      ? (item?.category || 'Other')
      : (item?.category || 'Other');

  const chosenCatObj = categories.find((c) => c.key === effectiveCat);
  const effectiveCause = ans.correctCause || (ans.cat !== false ? (item?.subCategory || '') : '');

  const matchingRoots = effectiveCause
    ? rootCatalog.filter((r) => r.parentCause === effectiveCause)
    : effectiveCat && effectiveCat !== 'Other'
      ? rootCatalog.filter((r) => r.parentCategory === effectiveCat)
      : [];
  const visibleRoots = ans.showAllRoots ? rootCatalog : (matchingRoots.length > 0 ? matchingRoots : []);

  const toggleRoot = (rootObj) => {
    setAns((prev) => {
      const exists = prev.correctRootCauses.includes(rootObj.key);
      const nextRoots = exists
        ? prev.correctRootCauses.filter((k) => k !== rootObj.key)
        : [...prev.correctRootCauses, rootObj.key];
      // Nếu L2 đang trống và chọn L3 cùng nhóm L1 thì tự điền L2 cha
      const autoCause = !exists && !prev.correctCause && (!item?.subCategory || prev.cat === false) && rootObj.parentCategory === effectiveCat
        ? rootObj.parentCause
        : prev.correctCause;
      return { ...prev, correctRootCauses: nextRoots, correctCause: autoCause };
    });
  };

  const ready =
    ans.sent !== null && ans.cat !== null && ans.sarcasm !== null &&
    (ans.sent || ans.correctSentiment) &&
    (ans.cat || ans.correctCategory);

  const save = async () => {
    if (!ready || !item) return;
    setSaving(true);
    try {
      const isNonComplaint = effectiveCat === 'Other';
      await axios.post('/audit/label', {
        feedbackId: item._id,
        sentimentCorrect: ans.sent,
        categoryCorrect: ans.cat,
        correctSentiment: ans.sent ? undefined : ans.correctSentiment,
        correctCategory: ans.cat ? undefined : ans.correctCategory,
        correctCause: ans.correctCause || undefined,
        correctRootCauses: isNonComplaint ? [] : ans.correctRootCauses,
        correctTiming: isNonComplaint || ans.correctRootCauses.length === 0 ? null : (ans.correctTiming || 'UNKNOWN'),
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

  const exportGold = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/audit/gold-export?format=jsonl', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gold_gia_dung.jsonl';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.response?.data?.error || 'Không xuất được tệp bộ chuẩn.');
    } finally {
      setExporting(false);
    }
  };

  const aiCat = item ? (item.category && item.category !== 'Other' ? item.categoryLabel : 'Không nêu vấn đề') : '';
  const modeOptions = MODES.map((m) => ({ ...m, label: `${m.label} (${fmtInt(queues[m.value] ?? 0)})` }));

  return (
    <div className="max-w-3xl">
      <GlassPanel tone="strong" className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Hàng đợi" options={modeOptions} value={mode} onChange={setMode} />
          {mode === 'gold' && (
            <Button variant="secondary" size="sm" icon={Download} onClick={exportGold} loading={exporting}>
              Xuất bộ chuẩn
            </Button>
          )}
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
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-lo">
                {item.rating != null && <span className="tabular-nums">{item.rating} sao</span>}
                <span>{item.source}</span>
                <span className="tabular-nums">{fmtDate(item.timestamp)}</span>
                {item.productName && <span className="truncate">{item.productName}</span>}
                {item.productType && <Badge tone="neutral">{item.productType}</Badge>}
                {mode === 'gold' && item.goldSplit && (
                  <Badge tone={item.goldSplit === 'test' ? 'accent' : 'neutral'}>
                    {SPLIT_LABEL[item.goldSplit] || item.goldSplit}
                  </Badge>
                )}
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
                  <YesNo
                    label="Nhóm vấn đề đúng hay sai"
                    value={ans.cat}
                    onChange={(v) => setAns((a) => ({
                      ...a,
                      cat: v,
                      correctCategory: v ? '' : a.correctCategory,
                      correctCause: '',
                      correctRootCauses: v && (item.category || 'Other') === 'Other' ? [] : a.correctRootCauses
                    }))}
                  />
                  {ans.cat === false && (
                    <Select
                      label="Nhóm đúng"
                      value={ans.correctCategory}
                      onChange={(e) => setAns((a) => ({
                        ...a,
                        correctCategory: e.target.value,
                        correctCause: '',
                        correctRootCauses: e.target.value === 'Other' ? [] : a.correctRootCauses
                      }))}
                      options={[
                        { value: '', label: 'Chọn nhóm đúng' },
                        ...categories.filter((c) => c.key !== (item.category || 'Other')).map((c) => ({ value: c.key, label: c.label }))
                      ]}
                    />
                  )}
                  {effectiveCat && effectiveCat !== 'Other' && chosenCatObj?.causes?.length > 0 && (ans.cat === false || ans.cat === true) && (
                    <Select
                      label="Nguyên nhân cấp 2"
                      value={ans.correctCause || (ans.cat === true ? (item.subCategory || '') : '')}
                      onChange={(e) => setAns((a) => ({ ...a, correctCause: e.target.value }))}
                      options={[
                        { value: '', label: 'Chưa rõ' },
                        ...chosenCatObj.causes.map((c) => ({ value: c.key, label: c.label }))
                      ]}
                    />
                  )}
                </div>
              </div>

              {effectiveCat && effectiveCat !== 'Other' && rootCatalog.length > 0 && (
                <div className="border-t border-line-soft pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-mid">
                      <b className="text-ink-hi">Nguyên nhân gốc rễ cấp 3</b> (chọn nhiều nếu có, để trống nếu không thuộc nhóm lỗi gia dụng)
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAns((a) => ({ ...a, showAllRoots: !a.showAllRoots }))}
                    >
                      {ans.showAllRoots ? 'Chỉ hiện theo nguyên nhân cấp 2' : `Hiện đủ ${fmtInt(rootCatalog.length)} lỗi gia dụng`}
                    </Button>
                  </div>
                  {visibleRoots.length > 0 ? (
                    <div role="group" aria-label="Nguyên nhân gốc rễ cấp 3" className="mt-2.5 flex flex-wrap gap-2">
                      {visibleRoots.map((r) => {
                        const active = ans.correctRootCauses.includes(r.key);
                        return (
                          <Chip
                            key={r.key}
                            active={active}
                            icon={active ? Check : undefined}
                            onClick={() => toggleRoot(r)}
                            title={r.notThis ? `${r.description} Không phải: ${r.notThis}` : r.description}
                          >
                            {r.label}
                          </Chip>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-lo">
                      Nguyên nhân cấp 2 này không có nhóm cấp 3 riêng. Để trống là hợp lệ, hoặc bấm Hiện đủ {fmtInt(rootCatalog.length)} lỗi gia dụng nếu câu nêu lỗi khác.
                    </p>
                  )}
                  {ans.correctRootCauses.length > 0 && (
                    <p className="mt-2 text-xs text-ink-mid">
                      Đã chọn {fmtInt(ans.correctRootCauses.length)} lỗi: {ans.correctRootCauses.map((k) => rootCatalog.find((r) => r.key === k)?.label || k).join(', ')}
                    </p>
                  )}
                  {ans.correctRootCauses.length > 0 && timingCatalog.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-ink-mid">
                        <b className="text-ink-hi">Khách phát hiện lỗi lúc nào</b> (câu không nói thì chọn Không rõ)
                      </p>
                      <div role="group" aria-label="Lúc phát hiện lỗi" className="mt-2.5 flex flex-wrap gap-2">
                        {timingCatalog.map((t) => {
                          const active = (ans.correctTiming || 'UNKNOWN') === t.key;
                          return (
                            <Chip
                              key={t.key}
                              active={active}
                              icon={active ? Check : undefined}
                              onClick={() => setAns((a) => ({ ...a, correctTiming: t.key }))}
                              title={t.description}
                            >
                              {t.label}
                            </Chip>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
