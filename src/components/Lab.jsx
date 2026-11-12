import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import PipelineDemo from './lab/PipelineDemo';
import BatchDemo from './lab/BatchDemo';
import VersusDemo from './lab/VersusDemo';
import { preloadBrowserModel } from '../lib/analyze';
import { PageHeader, GlassPanel, PanelHeader, Tabs, Badge, EmptyState, Skeleton } from './ui';

/**
 * PHÒNG THÍ NGHIỆM
 * ------------------------------------------------------------------
 * Bốn tab, mỗi tab trả lời một câu hỏi của người xem:
 *   Đối đầu                    "khác gì công cụ đang có?"
 *   Trình diễn xử lý ngôn ngữ  "có thật sự xử lý được tiếng Việt không?" (tám bước, dữ liệu thật)
 *   Xử lý hàng loạt            "chạy cả lô nhanh cỡ nào?"
 *   Kết quả thực nghiệm        "chính xác bao nhiêu?" (đo trên tập kiểm tra giữ riêng)
 */

const TABS = [
  { value: 'versus', label: 'Đối đầu' },
  { value: 'live', label: 'Thử một câu' },
  { value: 'batch', label: 'Hàng loạt' },
  { value: 'eval', label: 'Kết quả' }
];

const f4 = (v) => (v == null ? 'Chưa có' : v.toFixed(4).replace('.', ','));

// ==================================================================
// KẾT QUẢ THỰC NGHIỆM
// ==================================================================

const Experiments = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/evaluation');
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.hint || 'Chưa có kết quả đánh giá. Chạy npm run eval trong thư mục backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex flex-col gap-4" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton as="div" key={i} className="h-40 rounded-surf bg-raised" />)}</div>;
  }
  if (error) {
    return <EmptyState variant="error" title="Chưa có kết quả thực nghiệm" description={error} />;
  }

  const b1 = data.models.find((m) => m.id === 'B1');
  const mRow = data.models.find((m) => m.id === 'M' && m.available);
  const h2h = data.headToHead?.available ? data.headToHead : null;
  const gap = b1 && b1.devCategoryMacroF1 != null ? b1.devCategoryMacroF1 - b1.categoryMacroF1 : null;
  const unavailable = data.models.filter((m) => !m.available);

  return (
    <div className="flex flex-col gap-5">
      {/* Giới hạn của tập dữ liệu — đặt TRƯỚC mọi con số */}
      <section className="rounded-ctrl bg-high/10 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-high">
          <AlertTriangle size={16} aria-hidden="true" /> Giới hạn của các con số dưới đây
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-mid">
          <li>Tập do nhóm tự soạn và tự gán nhãn ({data.dataset.aspectSamples} câu), <strong className="text-ink-hi">chưa phải UIT-ViSFD</strong>.</li>
          <li>Mới có {data.dataset.annotators} người gán nhãn, nên <strong className="text-ink-hi">chưa tính được Cohen&apos;s kappa</strong>.</li>
          <li>Cỡ mẫu nhỏ nên khoảng tin cậy rộng. Con số là tín hiệu về hướng đi, chưa phải kết quả công bố được.</li>
          {mRow && (
            <li>
              Dòng M train trên nhãn cảm xúc do người gán của UIT-ViSFD cộng tập chuyên ngành <strong className="text-ink-hi">sinh từ khung câu</strong> (nhãn
              theo cấu trúc sinh, không phải người gán trên phản hồi thật), đã lọc trùng mặt chữ với tập kiểm tra. F1 phát triển của M không độc lập vì
              tập này dùng để chọn epoch.
            </li>
          )}
        </ul>
      </section>

      {data.leakageAudit && (
        <p className={`flex items-start gap-2.5 rounded-ctrl px-5 py-3.5 text-sm leading-relaxed text-ink-mid ${data.leakageAudit.clean ? 'bg-ok/10' : 'bg-crit/10'}`}>
          {data.leakageAudit.clean
            ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
            : <XCircle size={17} className="mt-0.5 shrink-0 text-crit" aria-hidden="true" />}
          <span>{data.leakageAudit.verdict}</span>
        </p>
      )}

      {/* Bảng mô hình */}
      <GlassPanel tone="strong" className="overflow-hidden">
        <PanelHeader className="mb-0 border-b border-line-soft px-5 pt-5 pb-4" title="Phân loại danh mục (Level 1)" subtitle="Macro-F1 trên tập kiểm tra giữ riêng, so với tập phát triển" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-xs text-ink-mid">
                <th scope="col" className="px-5 py-2.5 font-semibold">Mã</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Mô hình</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Vai trò</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">F1 kiểm tra</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">F1 phát triển</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.id} className={`border-b border-line-soft last:border-0 ${m.id === 'M' ? 'bg-accent-dim/40' : ''}`}>
                  <td className="px-5 py-3 tabular-nums font-semibold text-ink-hi">{m.id}</td>
                  <td className="px-3 py-3 text-ink-hi">{m.name}</td>
                  <td className="px-3 py-3 text-ink-mid">{m.role || '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink-hi">
                    {!m.available ? <span className="font-sans font-normal text-ink-lo">chưa có số</span>
                      : m.canDetectAspect ? f4(m.categoryMacroF1)
                        : <span className="font-sans font-normal text-ink-lo">không bóc tách được</span>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-mid">{f4(m.devCategoryMacroF1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unavailable.length > 0 && (
          <div className="border-t border-line-soft px-5 py-3.5">
            {unavailable.map((m) => (
              <p key={m.id} className="text-xs leading-relaxed text-ink-mid"><strong className="text-ink-hi">{m.id}:</strong> {m.reason}</p>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Đối đầu từng câu: luật và ViSoBERT, liệt kê đủ cả hai chiều */}
      {h2h && (
        <GlassPanel tone="strong" className="overflow-hidden">
          <PanelHeader
            className="mb-0 border-b border-line-soft px-5 pt-5 pb-4"
            title="Luật từ khóa và ViSoBERT trên từng câu"
            subtitle={`${h2h.total} câu kiểm tra giữ riêng: cả hai đúng ${h2h.bothCorrect}, chỉ ViSoBERT đúng ${h2h.onlyModelCorrect.length}, chỉ luật đúng ${h2h.onlyRulesCorrect.length}, cả hai sai ${h2h.bothWrong}`}
          />
          {[['Chỉ ViSoBERT đúng', h2h.onlyModelCorrect], ['Chỉ luật từ khóa đúng', h2h.onlyRulesCorrect]].map(([title, rows]) => (
            <div key={title} className="border-b border-line-soft px-5 py-4 last:border-0">
              <h4 className="text-sm font-semibold text-ink-hi">{title} <span className="tabular-nums font-normal text-ink-mid">({rows.length})</span></h4>
              {rows.length === 0 ? (
                <p className="mt-1 text-sm text-ink-lo">Không có câu nào.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line-soft text-xs text-ink-mid">
                        <th scope="col" className="py-2 pr-3 font-semibold">Câu</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Đáp án</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Luật từ khóa</th>
                        <th scope="col" className="py-2 font-semibold">ViSoBERT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b border-line-soft last:border-0 align-top">
                          <td className="min-w-[220px] py-2.5 pr-3 text-ink-hi">{r.text}</td>
                          <td className="py-2.5 pr-3 text-ink-mid">{r.gold}</td>
                          <td className={`py-2.5 pr-3 ${r.rulesCorrect ? 'text-ok' : 'text-crit'}`}>{r.rules}</td>
                          <td className={`py-2.5 ${r.modelCorrect ? 'text-ok' : 'text-crit'}`}>{r.model}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {mRow?.checkpoint && (
            <p className="border-t border-line-soft px-5 py-3 text-xs leading-relaxed text-ink-mid">
              Checkpoint train lúc {new Date(mRow.checkpoint.trainedAt).toLocaleString('vi-VN')}, epoch tốt nhất {mRow.checkpoint.bestEpoch}, số nhãn:
              cảm xúc {mRow.checkpoint.trainCounts?.sentiment}, danh mục {mRow.checkpoint.trainCounts?.category}, rác {mRow.checkpoint.trainCounts?.spam},
              loại {mRow.checkpoint.testOverlapRemoved} câu trùng tập kiểm tra.
            </p>
          )}
        </GlassPanel>
      )}

      {/* Phát hiện quan trọng nhất: khoảng cách dev/test */}
      {gap != null && (
        <GlassPanel tone="strong" className="p-5">
          <h3 className="flex items-start gap-2 text-heading font-semibold text-ink-hi">
            <Lightbulb size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            Phát hiện chính: bộ phân loại luật không khái quát hóa được
          </h3>
          <p className="mt-2 max-w-[78ch] text-sm leading-relaxed text-ink-mid">
            Cùng một bộ phân loại luật đạt Macro-F1 <strong className="tabular-nums text-ok">{b1.devCategoryMacroF1.toFixed(2).replace('.', ',')}</strong> trên tập đã dùng
            để tinh chỉnh từ khóa, nhưng chỉ còn <strong className="tabular-nums text-crit">{b1.categoryMacroF1.toFixed(2).replace('.', ',')}</strong> trên tập kiểm tra giữ
            riêng, chênh {gap.toFixed(2).replace('.', ',')}. Thêm từ khóa chỉ giúp khớp đúng những câu đã thấy, không giúp hiểu câu mới. Đây là lập luận định lượng cho
            việc dùng một mô hình ngôn ngữ được tinh chỉnh, thay vì tiếp tục mở rộng danh sách từ khóa.
          </p>
        </GlassPanel>
      )}

      {/* Trust Layer */}
      {data.trustLayer && (
        <GlassPanel tone="strong" className="p-5">
          <PanelHeader title="Tầng kiểm soát tin cậy dữ liệu" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Precision bộ lọc rác', data.trustLayer.report.perClass.spam.precision, data.targets.spamPrecision],
              ['Precision phát hiện không xác thực', data.trustLayer.report.perClass.inauthentic.precision, data.targets.inauthenticPrecision],
              ['Tỉ lệ loại nhầm phản hồi thật', data.trustLayer.falseRejectRate, data.targets.falseRejectRate, true]
            ].map(([label, value, target, lowerIsBetter]) => {
              const pass = lowerIsBetter ? value <= target : value >= target;
              return (
                <div key={label} className="rounded-ctrl bg-raised px-4 py-3.5">
                  <p className="text-xs leading-snug text-ink-mid">{label}</p>
                  <p className={`mt-1.5 tabular-nums text-display font-semibold ${pass ? 'text-ok' : 'text-crit'}`}>
                    {lowerIsBetter ? `${(value * 100).toFixed(1).replace('.', ',')}%` : value.toFixed(3).replace('.', ',')}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-mid">
                    Mục tiêu {lowerIsBetter ? `≤ ${(target * 100).toFixed(0)}%` : `≥ ${String(target).replace('.', ',')}`}
                    <Badge tone={pass ? 'ok' : 'crit'}>{pass ? 'Đạt' : 'Chưa đạt'}</Badge>
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-mid">{data.trustLayer.methodNote}</p>
        </GlassPanel>
      )}

      {/* Ablation */}
      {data.ablations?.trustLayer && (
        <GlassPanel tone="strong" className="p-5">
          <PanelHeader title="Thí nghiệm loại bỏ thành phần" subtitle="Tắt từng thành phần để đo đúng phần nó đóng góp" />
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-ctrl bg-raised px-4 py-3.5">
              <dt className="text-sm font-semibold text-ink-hi">Chuẩn hóa teencode</dt>
              <dd className="mt-1 text-sm text-ink-mid">
                Macro-F1 <span className="tabular-nums">{f4(data.ablations.slangNormalization.categoryMacroF1_off)}</span> khi tắt,{' '}
                <span className="tabular-nums font-semibold text-ink-hi">{f4(data.ablations.slangNormalization.categoryMacroF1_on)}</span> khi bật
              </dd>
            </div>
            <div className="rounded-ctrl bg-raised px-4 py-3.5">
              <dt className="text-sm font-semibold text-ink-hi">Trust Layer</dt>
              <dd className="mt-1 text-sm text-ink-mid">
                Tỉ lệ khiếu nại có trọng số <span className="tabular-nums">{data.ablations.trustLayer.wcrWithoutTrustLayer}</span> khi tắt,{' '}
                <span className="tabular-nums font-semibold text-ink-hi">{data.ablations.trustLayer.wcrWithTrustLayer}</span> khi bật; loại{' '}
                {data.ablations.trustLayer.excludedFeedbacks} trên {data.ablations.trustLayer.datasetSize} phản hồi
              </dd>
            </div>
          </dl>
        </GlassPanel>
      )}

      <p className="text-xs text-ink-mid">
        Sinh lúc {new Date(data.generatedAt).toLocaleString('vi-VN')} bằng lệnh <code className="font-code">npm run eval</code>
      </p>
    </div>
  );
};

// ==================================================================

const Lab = () => {
  // Mở vào tab Đối đầu: câu hỏi đầu tiên của người xem là "khác gì công cụ đang có"
  const [tab, setTab] = useState('versus');

  // Máy chủ không có dịch vụ mô hình (bản web miễn phí): bắt đầu tải ViSoBERT
  // về trình duyệt ngay khi mở Lab, để lúc người xem bấm thì mô hình đã sẵn
  useEffect(() => {
    axios.get('/nlp/status')
      .then((r) => { if (!r.data?.canLabel) preloadBrowserModel(); })
      .catch(() => preloadBrowserModel());
  }, []);

  return (
    <div className="cx pb-12">
      <PageHeader
        title="Phòng thí nghiệm mô hình"
        subtitle="Thử bộ phân loại tiếng Việt với câu của bạn, và xem kết quả đo trên tập kiểm tra."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-6" />
      {tab === 'versus' ? <VersusDemo /> : tab === 'live' ? <PipelineDemo /> : tab === 'batch' ? <BatchDemo /> : <Experiments />}
    </div>
  );
};

export default Lab;
