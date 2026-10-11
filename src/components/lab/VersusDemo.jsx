import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Swords, Play, Loader2, Check, X, MessageSquareText, Building2, ShieldCheck, Lock, Layers, Target, Info, Sparkles
} from 'lucide-react';
import { GlassPanel, PanelHeader, Badge, SentimentFace, Chip } from '../ui';
import { SENTIMENT_MAP } from '../../lib/format';

/**
 * ĐỐI ĐẦU — cùng một câu phản hồi, hai cách đọc.
 * ------------------------------------------------------------------
 * Bên trái là cách các nền tảng CRM / helpdesk phổ biến đang làm: một nhãn
 * cảm xúc cho cả câu. Đó KHÔNG phải một đối thủ dựng ra cho dễ thắng — đây là
 * đúng hàm B2 trong khung thực nghiệm (backend/evaluation/baselines.js), đã
 * được đo trên tập kiểm tra cùng với mô hình của đề tài.
 *
 * Các câu thử thách dưới đây là câu MỚI viết cho màn trình diễn: không trùng
 * câu nào trong tập kiểm tra hay mẫu huấn luyện (độ trùng từ < 0.4). Người xem
 * có thể gõ câu bất kỳ — kết quả là thật, kể cả khi mô hình sai.
 */

const CHALLENGES = [
  { id: 'multi', label: 'Hai vấn đề trong một câu', text: 'Áo đẹp nhưng giao trễ cả tuần, nhắn shop hỏi thì không ai trả lời' },
  { id: 'implicit', label: 'Chê mà không dùng từ xấu', text: 'Hẹn thứ hai giao, nay đã thứ bảy tuần sau, con mình hết háo hức rồi' },
  { id: 'negation', label: 'Khen nhưng có chữ "móp"', text: 'Đóng gói kỹ lắm, không móp méo gì hết, giao cũng nhanh' },
  { id: 'teencode', label: 'Teencode', text: 'sp xài dc 2 bữa là hư r, ib shop k thấy rep, chán thiệt sự' },
  { id: 'telex', label: 'Gõ Telex bị lỗi', text: 'giao chaamjmmmm quá trời, đợi cả tuần luôn' },
  { id: 'payment', label: 'Lỗi thanh toán', text: 'Bấm thanh toán ví điện tử cứ báo lỗi mà tiền vẫn bị trừ' },
  { id: 'ad', label: 'Quảng cáo trá hình', text: 'Bên mình chuyên sỉ giá gốc, inbox zalo 0909123456 nhận mã giảm 50%' },
  { id: 'praise', label: 'Khen shipper', text: 'Cô giao hàng dễ thương ghê, gọi báo trước và chờ mình xuống' }
];

const sentimentLabel = (s) => SENTIMENT_MAP[s]?.label || 'Trung tính';

/** Một hàng năng lực: hai cột ✓/✗ và lời giải thích cho bên làm được */
const CapabilityRow = ({ icon: Icon, label, generic, ours, detail }) => (
  <li className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 border-b border-line-soft py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem]">
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-[0.84rem] font-medium text-ink-hi">
        <Icon size={15} className="shrink-0 text-ink-lo" aria-hidden="true" />
        {label}
      </p>
      {detail && <p className="mt-0.5 pl-[23px] text-[0.74rem] leading-snug text-ink-lo">{detail}</p>}
    </div>
    <Mark ok={generic} />
    <Mark ok={ours} />
  </li>
);

const Mark = ({ ok }) => (
  <span className={`grid size-7 place-items-center justify-self-center rounded-full ${ok ? 'bg-ok/14 text-ok' : 'bg-crit/10 text-crit'}`}>
    {ok ? <Check size={15} aria-label="Có" /> : <X size={15} aria-label="Không" />}
  </span>
);

/** Thanh so sánh một chỉ số đo được trên tập kiểm tra */
const MetricBar = ({ label, generic, ours, note }) => (
  <div>
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <p className="text-[0.82rem] font-medium text-ink-hi">{label}</p>
      {note && <p className="text-right text-[0.7rem] text-ink-lo">{note}</p>}
    </div>
    {[['Công cụ thông thường', generic, 'bg-neu'], ['Customer Radar', ours, 'bg-accent']].map(([name, v, cls]) => (
      <div key={name} className="mb-1 grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-[0.74rem] sm:grid-cols-[10rem_minmax(0,1fr)_3rem]">
        <span className="truncate text-ink-mid">{name}</span>
        <span className="h-2 overflow-hidden rounded-full bg-raised">
          <span className={`block h-full rounded-full ${cls} animate-grow-x origin-left`} style={{ width: `${Math.max(1, (v ?? 0) * 100)}%` }} />
        </span>
        <span className="data-num text-right font-semibold text-ink-hi">{v == null ? '—' : v.toFixed(2)}</span>
      </div>
    ))}
  </div>
);

const VersusDemo = () => {
  const [text, setText] = useState(CHALLENGES[0].text);
  const [activeId, setActiveId] = useState(CHALLENGES[0].id);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [evalData, setEvalData] = useState(null);

  useEffect(() => {
    axios.get('/evaluation').then((r) => setEvalData(r.data)).catch(() => setEvalData(null));
  }, []);

  const run = async (value = text) => {
    const v = value.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    try {
      const r = await axios.post('/analyze', { text: v });
      setResult(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Không gọi được máy chủ phân tích.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Chạy ngay câu đầu tiên để người xem thấy kết quả mà không phải bấm gì
  useEffect(() => {
    run(CHALLENGES[0].text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (c) => {
    setActiveId(c.id);
    setText(c.text);
    run(c.text);
  };

  const final = result?.trace?.final;
  const aspects = final?.aspects || [];
  const generic = result?.genericBaseline;
  const piiTypes = result?.trace?.pii?.types || [];
  const spam = result?.trace?.spam;
  const replacements = result?.trace?.normalize?.replacements || [];
  const guard = result?.trace?.model?.guard;
  const usedModel = final?.source === 'visobert';

  const models = evalData?.models || [];
  const mB2 = models.find((m) => m.id === 'B2');
  const mM = models.find((m) => m.id === 'M' && m.available);
  const sample = mM?.categoryAccuracyCI?.total || mB2?.categoryAccuracyCI?.total || null;

  return (
    <div className="cx flex flex-col gap-5">
      <GlassPanel tone="strong" className="p-5 sm:p-6">
        <PanelHeader
          title={<span className="inline-flex items-center gap-2"><Swords size={18} className="text-accent" aria-hidden="true" />Cùng một câu, hai cách đọc</span>}
          subtitle="Bên trái là cách các nền tảng CRM phổ biến đang làm: gán một nhãn cảm xúc cho cả câu. Bên phải là Customer Radar. Chọn một thử thách hoặc gõ câu của bạn."
        />

        <div className="mb-4 flex flex-wrap gap-2">
          {CHALLENGES.map((c) => (
            <Chip key={c.id} active={activeId === c.id} onClick={() => pick(c)}>{c.label}</Chip>
          ))}
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => { e.preventDefault(); setActiveId(null); run(); }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                setActiveId(null);
                run();
              }
            }}
            maxLength={2000}
            rows={2}
            aria-label="Câu phản hồi cần phân tích"
            placeholder="Gõ một phản hồi bất kỳ, kể cả teencode…"
            className="min-h-[3.25rem] w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink-hi outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Phân tích
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-crit">{error}</p>}
      </GlassPanel>

      {result && (
        <div className={`grid gap-5 md:grid-cols-2 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {/* ---------- Công cụ thông thường ---------- */}
          <GlassPanel className="flex flex-col p-5 sm:p-6">
            <p className="eyebrow mb-1">Công cụ thông thường</p>
            <p className="mb-5 text-[0.78rem] leading-relaxed text-ink-lo">
              Một nhãn cảm xúc cho cả câu (baseline B2 trong thực nghiệm)
            </p>
            <div className="flex items-center gap-3">
              <SentimentFace sentiment={generic?.sentiment} size={44} />
              <div>
                <p className="text-xl font-semibold text-ink-hi">{sentimentLabel(generic?.sentiment)}</p>
                <p className="text-[0.8rem] text-ink-lo">cho cả câu</p>
              </div>
            </div>
            <div className="mt-5 flex flex-1 flex-col justify-end gap-2 text-[0.82rem] text-ink-mid">
              <p className="flex items-start gap-2"><X size={15} className="mt-0.5 shrink-0 text-crit" />Không biết khách phàn nàn về vấn đề gì</p>
              <p className="flex items-start gap-2"><X size={15} className="mt-0.5 shrink-0 text-crit" />Không biết chuyển cho bộ phận nào xử lý</p>
              {piiTypes.length > 0 && <p className="flex items-start gap-2"><X size={15} className="mt-0.5 shrink-0 text-crit" />Lưu nguyên số điện thoại, email của khách</p>}
              {spam?.isSpam && <p className="flex items-start gap-2"><X size={15} className="mt-0.5 shrink-0 text-crit" />Đếm quảng cáo như một phản hồi thật</p>}
            </div>
          </GlassPanel>

          {/* ---------- Customer Radar ---------- */}
          <GlassPanel tone="strong" className="p-5 ring-1 ring-accent/35 sm:p-6">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="eyebrow">Customer Radar</p>
              <Badge tone={usedModel ? 'accent' : 'neutral'} icon={Sparkles}>
                {usedModel ? 'ViSoBERT tinh chỉnh' : 'Lớp luật dự phòng'}
              </Badge>
            </div>
            <p className="mb-5 text-[0.78rem] leading-relaxed text-ink-lo">
              {usedModel ? 'Mô hình hiểu tiếng Việt mạng xã hội, bóc tách từng vấn đề' : 'Dịch vụ mô hình chưa sẵn sàng — đang dùng luật từ khóa'}
            </p>

            {spam?.isSpam ? (
              <div className="rounded-lg border border-crit/30 bg-crit/8 p-4">
                <p className="flex items-center gap-2 font-semibold text-crit"><ShieldCheck size={17} />Chặn: không phải phản hồi thật</p>
                <p className="mt-1 text-[0.8rem] text-ink-mid">{spam.reasons?.[0]}. Không được đếm vào bất kỳ chỉ số nào.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <SentimentFace sentiment={final?.sentiment} size={44} />
                  <div>
                    <p className="text-xl font-semibold text-ink-hi">{sentimentLabel(final?.sentiment)}</p>
                    <p className="text-[0.8rem] text-ink-lo">
                      {aspects.length ? `${aspects.length} vấn đề được bóc tách` : 'Không có vấn đề cần xử lý'}
                    </p>
                  </div>
                </div>

                {aspects.length > 0 && (
                  <ul className="mt-4 flex list-none flex-col gap-2">
                    {aspects.map((a, i) => (
                      <li key={`${a.category}-${a.cause}-${i}`} className="rounded-lg bg-raised px-3.5 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[0.88rem] font-semibold text-ink-hi">
                            {a.categoryLabel}{a.causeLabel ? <span className="font-normal text-ink-mid"> → {a.causeLabel}</span> : null}
                          </p>
                          {a.confidence != null && <span className="data-num shrink-0 text-[0.74rem] text-ink-lo">{Math.round(a.confidence * 100)}%</span>}
                        </div>
                        {a.owner && (
                          <p className="mt-1 flex items-center gap-1.5 text-[0.76rem] text-ink-mid">
                            <Building2 size={13} aria-hidden="true" />Chuyển cho: <b className="font-semibold text-ink-hi">{a.owner}</b>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {(replacements.length > 0 || piiTypes.length > 0 || guard) && (
              <div className="mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3 text-[0.78rem] text-ink-mid">
                {replacements.length > 0 && (
                  <p>
                    <span className="text-ink-lo">Đã hiểu: </span>
                    {replacements.slice(0, 5).map((r, i) => (
                      <span key={i} className="mr-1.5 inline-block font-mono text-[0.74rem]">
                        {r.from}<span className="text-ink-lo"> → </span><span className="text-accent-hi">{r.to}</span>{i < Math.min(replacements.length, 5) - 1 ? ',' : ''}
                      </span>
                    ))}
                  </p>
                )}
                {piiTypes.length > 0 && (
                  <p className="flex items-center gap-1.5"><Lock size={13} className="text-ok" />Đã che {piiTypes.length} loại thông tin cá nhân trước khi lưu và phân tích</p>
                )}
                {guard && (
                  <p className="flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0 text-ink-lo" />Lớp kiểm soát đã gỡ một khía cạnh mô hình gán nhầm: {guard.reason}</p>
                )}
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {result && (
        <GlassPanel className="p-5 sm:p-6">
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem]">
            <p className="eyebrow">Với câu này, ai làm được gì</p>
            <p className="text-center text-[0.68rem] leading-tight text-ink-lo">Thông thường</p>
            <p className="text-center text-[0.68rem] leading-tight font-semibold text-accent-hi">Customer Radar</p>
          </div>
          {/* Mỗi hàng tính từ KẾT QUẢ THẬT của câu đang xem: chỉ hiện hàng liên
              quan, và đánh ✗ cho Customer Radar khi nó bỏ sót — không tô hồng */}
          <ul className="list-none">
            <CapabilityRow icon={MessageSquareText} label="Gán một nhãn cảm xúc" generic ours detail="Việc mọi công cụ đều làm được" />
            {spam?.isSpam ? (
              <CapabilityRow icon={ShieldCheck} label="Nhận ra đây là quảng cáo, không đếm vào chỉ số" generic={false} ours detail={spam.reasons?.[0]} />
            ) : (
              <CapabilityRow
                icon={Target}
                label="Biết khách phàn nàn về vấn đề gì"
                generic={false}
                ours={aspects.length > 0 || final?.sentiment !== 'Negative'}
                detail={
                  aspects.length
                    ? aspects.map((a) => a.causeLabel || a.categoryLabel).join(' · ')
                    : final?.sentiment === 'Negative'
                      ? 'Câu chê này chưa được gắn vào nhóm vấn đề nào'
                      : 'Biết đây không phải lời phàn nàn — không tạo việc thừa'
                }
              />
            )}
            {aspects.length > 1 && (
              <CapabilityRow icon={Layers} label="Tách nhiều vấn đề trong cùng một câu" generic={false} ours detail={`${aspects.length} vấn đề, mỗi vấn đề chuyển đúng một bộ phận`} />
            )}
            {aspects.length > 0 && (
              <CapabilityRow
                icon={Building2}
                label="Chỉ ra bộ phận chịu trách nhiệm xử lý"
                generic={false}
                ours={aspects.some((a) => a.owner)}
                detail={[...new Set(aspects.map((a) => a.owner).filter(Boolean))].join(' · ')}
              />
            )}
            {piiTypes.length > 0 && (
              <CapabilityRow icon={Lock} label="Che thông tin cá nhân (Nghị định 13/2023)" generic={false} ours detail="Số điện thoại, email, mã đơn được che trước khi lưu" />
            )}
          </ul>
        </GlassPanel>
      )}

      {mB2 && mM && (
        <GlassPanel className="p-5 sm:p-6">
          <PanelHeader
            title="Không phải chọn ví dụ đẹp: đo trên tập kiểm tra độc lập"
            subtitle={`${sample ? `${sample} phản hồi` : 'Tập kiểm tra'} do nhóm gán nhãn, không dùng để huấn luyện. Macro-F1, càng gần 1 càng tốt.`}
          />
          <div className="flex flex-col gap-4">
            <MetricBar label="Nhận ra đúng nhóm vấn đề" generic={mB2.categoryMacroF1} ours={mM.categoryMacroF1} note="khoảng trống lớn nhất" />
            <MetricBar label="Chỉ ra đúng nguyên nhân gốc" generic={mB2.causeMacroF1} ours={mM.causeMacroF1} />
            <MetricBar label="Đoán đúng cảm xúc" generic={mB2.sentimentMacroF1} ours={mM.sentimentMacroF1} note="hai bên gần nhau" />
          </div>
          <p className="mt-4 text-[0.76rem] leading-relaxed text-ink-lo">
            Về cảm xúc, hai cách gần ngang nhau — và đó chính là điểm đáng nói: biết khách "không vui" thì công cụ nào cũng làm được.
            Thứ doanh nghiệp cần là biết khách không vui <b className="text-ink-mid">vì cái gì</b> và <b className="text-ink-mid">ai phải xử lý</b>.
            Số liệu đầy đủ, kể cả các chỉ số chưa đạt mục tiêu, ở tab Kết quả thực nghiệm.
          </p>
        </GlassPanel>
      )}
    </div>
  );
};

export default VersusDemo;
