import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Check, X, SkipForward } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, ProgressBar, EmptyState, Chip, Select, Toast } from '../ui';
import { fmtInt, fmtDate, fmtPct, SENTIMENT_MAP, LABELLER_LABEL } from '../../lib/format';

/**
 * KIỂM TRA NGẪU NHIÊN DO NGƯỜI LÀM
 * ------------------------------------------------------------------
 * Trả lời câu "chỉ số tin cậy cũng do AI tính, chứng thực bằng gì?": người
 * đọc phản hồi lấy NGẪU NHIÊN ĐỀU từ kho và chấm AI đúng hay sai. Tỉ lệ
 * đúng kèm khoảng tin cậy 95% (Wilson) là bằng chứng do người tạo ra, đại
 * diện cho cả kho chứ không chỉ cho những câu dễ.
 */

const SENTS = ['Positive', 'Neutral', 'Negative'];

const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('crSettings') || '{}').name || 'Admin User';
  } catch {
    return 'Admin User';
  }
};

const Result = ({ label, r }) => (
  <div className="rounded-lg border border-line-soft p-4">
    <p className="text-sm text-ink-mid">{label}</p>
    {r?.n ? (
      <>
        <p className="mt-1.5 font-mono text-[1.9rem] leading-none font-semibold text-ink-hi">{fmtPct(r.p, 0)}</p>
        <p className="mt-1.5 text-xs text-ink-lo">
          Khoảng tin cậy 95%: <span className="font-mono text-ink-mid">{fmtPct(r.low, 0)} – {fmtPct(r.high, 0)}</span>
        </p>
      </>
    ) : (
      <p className="mt-1.5 text-sm text-ink-lo">Chưa có kết quả</p>
    )}
  </div>
);

const YesNo = ({ value, onChange, label }) => (
  <div role="group" aria-label={label} className="flex gap-2">
    <Chip active={value === true} onClick={() => onChange(true)} icon={Check}>Đúng</Chip>
    <Chip active={value === false} onClick={() => onChange(false)} icon={X}>Sai</Chip>
  </div>
);

const Audit = () => {
  const [summary, setSummary] = useState(null);
  const [queue, setQueue] = useState([]);
  const [categories, setCategories] = useState([]);
  const [remaining, setRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [ans, setAns] = useState({ sent: null, cat: null, correctSentiment: null, correctCategory: '' });

  const loadSample = useCallback(async () => {
    const { data } = await axios.get('/audit/sample?n=10');
    setQueue(data.items || []);
    setRemaining(data.remaining);
    setCategories(data.categories || []);
  }, []);

  useEffect(() => {
    Promise.all([axios.get('/audit/summary'), loadSample()])
      .then(([s]) => {
        setSummary(s.data);
        setError(null);
      })
      .catch(() => setError('Không tải được dữ liệu kiểm tra. Kiểm tra máy chủ đã chạy chưa.'))
      .finally(() => setLoading(false));
  }, [loadSample]);

  const item = queue[0];
  const reset = () => setAns({ sent: null, cat: null, correctSentiment: null, correctCategory: '' });
  const next = async () => {
    reset();
    if (queue.length > 1) setQueue((q) => q.slice(1));
    else await loadSample();
  };

  const ready =
    ans.sent !== null && ans.cat !== null &&
    (ans.sent || ans.correctSentiment) &&
    (ans.cat || ans.correctCategory);

  const save = async () => {
    if (!ready || !item) return;
    setSaving(true);
    try {
      const { data } = await axios.post('/audit/label', {
        feedbackId: item._id,
        sentimentCorrect: ans.sent,
        categoryCorrect: ans.cat,
        correctSentiment: ans.sent ? undefined : ans.correctSentiment,
        correctCategory: ans.cat ? undefined : ans.correctCategory,
        by: currentUser()
      });
      setSummary(data.summary);
      setToast(true);
      setTimeout(() => setToast(false), 1500);
      await next();
    } catch (e) {
      setError(e.response?.data?.error || 'Không lưu được kết quả. Thử lại.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-[420px] animate-pulse rounded-xl bg-raised" />;
  if (error && !summary) return <GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel>;

  const aiCat = item ? (item.category && item.category !== 'Other' ? item.categoryLabel : 'Không nêu vấn đề') : '';

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <GlassPanel tone="strong" className="p-6">
        <PanelHeader title="Kết quả kiểm tra" subtitle="Người đọc phản hồi lấy ngẫu nhiên và chấm AI đúng hay sai." />
        <ProgressBar
          value={summary ? summary.n / summary.target : 0}
          label={`Đã kiểm tra ${fmtInt(summary?.n)} trên mục tiêu ${fmtInt(summary?.target)} phản hồi`}
          showValue
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Result label="AI xếp đúng nhóm vấn đề" r={summary?.category} />
          <Result label="AI đoán đúng cảm xúc" r={summary?.sentiment} />
        </div>
        {summary?.n > 0 && summary.n < 30 && (
          <p className="mt-3 text-xs leading-relaxed text-high">Mới {summary.n} phản hồi nên khoảng tin cậy còn rộng. Từ khoảng 100 phản hồi trở lên con số mới đủ chắc để trình bày.</p>
        )}
        {summary?.topConfusions?.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-semibold text-ink-hi">AI hay nhầm ở đâu</p>
            <ul className="mt-2 flex list-none flex-col gap-1.5 text-sm text-ink-mid">
              {summary.topConfusions.map((c) => (
                <li key={`${c.from}-${c.to}`} className="flex justify-between gap-3">
                  <span>AI xếp “{c.from}”, người sửa thành “{c.to}”</span>
                  <span className="font-mono text-ink-hi">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-5 border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-lo">
          {summary?.method} {summary?.reviewers ? `${summary.reviewers} người đã tham gia kiểm tra.` : ''}
        </p>
      </GlassPanel>

      <GlassPanel tone="strong" className="p-6">
        {!item ? (
          <EmptyState title="Đã kiểm tra hết" description="Không còn phản hồi nào chưa được kiểm tra trong kho này." />
        ) : (
          <>
            <PanelHeader
              title="Phản hồi này AI xếp có đúng không?"
              subtitle={remaining != null ? `Lấy ngẫu nhiên từ ${fmtInt(remaining)} phản hồi chưa kiểm tra` : undefined}
            />
            <blockquote className="rounded-lg border border-line-soft p-4 text-[0.95rem] leading-relaxed text-ink-hi">
              {item.originalText}
              <span className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-lo">
                {item.rating != null && <span className="font-mono">{item.rating}★</span>}
                <span>{item.source}</span>
                <span className="font-mono">{fmtDate(item.timestamp)}</span>
                {item.productName && <span className="truncate">{item.productName}</span>}
              </span>
            </blockquote>

            <div className="mt-5 flex flex-col gap-5">
              <div>
                <p className="text-sm text-ink-mid">
                  AI đoán cảm xúc: <b className="text-ink-hi">{(SENTIMENT_MAP[item.sentiment] || SENTIMENT_MAP.Neutral).label}</b>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <YesNo label="Cảm xúc đúng hay sai" value={ans.sent} onChange={(v) => setAns((a) => ({ ...a, sent: v }))} />
                  {ans.sent === false && (
                    <div role="group" aria-label="Cảm xúc đúng" className="flex flex-wrap gap-2">
                      {SENTS.filter((s) => s !== item.sentiment).map((s) => (
                        <Chip key={s} active={ans.correctSentiment === s} onClick={() => setAns((a) => ({ ...a, correctSentiment: s }))}>
                          {SENTIMENT_MAP[s].label}
                        </Chip>
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
                    <Select
                      label="Nhóm đúng"
                      value={ans.correctCategory}
                      onChange={(e) => setAns((a) => ({ ...a, correctCategory: e.target.value }))}
                      options={[{ value: '', label: 'Chọn nhóm đúng' }, ...categories.filter((c) => c.key !== (item.category || 'Other')).map((c) => ({ value: c.key, label: c.label }))]}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-5">
              <Button icon={Check} onClick={save} loading={saving} disabled={!ready}>Lưu và sang phản hồi tiếp</Button>
              <Button variant="ghost" icon={SkipForward} onClick={next} disabled={saving}>Bỏ qua</Button>
              <span className="ml-auto text-xs text-ink-lo">AI gán: {LABELLER_LABEL[item.labelledBy] || item.labelledBy}</span>
            </div>
            {error && <p className="mt-2 text-sm text-crit">{error}</p>}
          </>
        )}
      </GlassPanel>
      <Toast show={toast}>Đã lưu kết quả kiểm tra</Toast>
    </div>
  );
};

export default Audit;
