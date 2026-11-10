import React from 'react';
import { Link } from 'react-router-dom';
import { Copy, Zap, UserX, Star, Receipt, HelpCircle } from 'lucide-react';
import ReplyDraft from './ReplyDraft';
import { Drawer, SentimentFace, Badge, ProgressBar, EvidenceSwatch } from '../ui';
import { fmtDateTime, initials, SENTIMENT_MAP, evidenceOf, exclusionLabel, LABELLER_LABEL } from '../../lib/format';

/**
 * CHI TIẾT MỘT PHẢN HỒI — ngăn kéo dùng chung cho trang Phản hồi và bảng
 * "Phản hồi gần đây" trên Tổng quan: nội dung gốc, nhãn và ai gán, vì sao
 * phản hồi được tính (hay không), và nháp trả lời cho phản hồi chê.
 */

const SIGNAL_ICONS = {
  'Trùng lặp gần về nội dung': Copy,
  'Đột biến thời gian': Zap,
  'Bất thường hành vi tài khoản': UserX,
  'Bất nhất điểm sao và nội dung': Star,
  'Bất nhất với dữ liệu giao dịch': Receipt
};

const nf2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FeedbackDetail = ({ item, onClose }) => {
  const t = item?.trust;
  const ev = item ? evidenceOf(item) : null;
  return (
    <Drawer open={Boolean(item)} onClose={onClose} title="Chi tiết phản hồi" subtitle={item ? `${item.source}, ${fmtDateTime(item.timestamp)}` : ''}>
      {item && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-accent-dim text-sm font-semibold text-accent-hi">
              {initials(item.author || 'Ẩn danh')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-hi">{item.author || 'Ẩn danh'}</p>
              <p className="truncate text-xs text-ink-lo">{item.productName || 'Không gắn sản phẩm'}{item.region ? `, ${item.region}` : ''}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-mid">
              <SentimentFace sentiment={item.sentiment} size={28} />
              {(SENTIMENT_MAP[item.sentiment] || SENTIMENT_MAP.Neutral).label}
            </span>
          </div>

          <blockquote className="rounded-lg border border-line-soft p-4 text-[0.95rem] leading-relaxed text-ink-hi">
            {item.originalText}
            {item.rating != null && (
              <span className="mt-2 flex items-center gap-1 text-xs text-ink-lo">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={12} className={i < item.rating ? 'fill-high text-high' : 'text-line'} aria-hidden="true" />
                ))}
                <span className="ml-1 font-mono">{item.rating}/5</span>
              </span>
            )}
          </blockquote>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {item.category && item.category !== 'Other' ? (
              <>
                <div>
                  <dt className="text-xs text-ink-lo">Nhóm vấn đề</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-hi">{item.categoryLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-lo">Nguyên nhân</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-hi">{item.causeLabel || 'Chưa xác định'}</dd>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <dt className="text-xs text-ink-lo">Nhóm vấn đề</dt>
                <dd className="mt-0.5 text-sm text-ink-mid">Không nêu vấn đề cụ thể</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-xs text-ink-lo">Ai gán nhãn</dt>
              <dd className="mt-0.5 text-sm text-ink-mid">
                {LABELLER_LABEL[item.labelledBy] || item.labelledBy}
                {item.machineLabel && (
                  <span className="block text-xs text-ink-lo">
                    Máy từng gán: {(SENTIMENT_MAP[item.machineLabel.sentiment] || SENTIMENT_MAP.Neutral).label.toLowerCase()}, {item.machineLabel.categoryLabel || 'không nêu vấn đề'}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {(item.sarcasm?.suspected || item.sarcasm?.verdict === 'sarcastic') && (
            <div className="rounded-lg border border-high/30 bg-high/8 px-4 py-3 text-sm text-ink-mid">
              <p className="font-semibold text-ink-hi">
                {item.sarcasm.verdict === 'sarcastic' ? 'Câu mỉa mai: lời khen ngoài miệng, thật ra là chê' : item.sarcasm.verdict === 'literal' ? 'Đã kiểm tra: không phải mỉa mai' : 'Nghi mỉa mai, chờ xác nhận'}
              </p>
              {item.sarcasm.signals?.length > 0 && <p className="mt-1 text-xs">Dấu hiệu: {item.sarcasm.signals.join('; ')}.</p>}
              {item.sarcasm.reason && <p className="mt-1 text-xs">Mô hình thứ hai: “{item.sarcasm.reason}”</p>}
              {item.needsReview && (
                <Link to="/trust?tab=audit" className="mt-1.5 inline-block text-xs font-semibold text-accent-hi hover:underline">Các mô hình chưa thống nhất, mở hàng cần duyệt</Link>
              )}
            </div>
          )}

          {item.aiSummary && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-hi">Tóm tắt</h3>
              <p className="text-sm leading-relaxed text-ink-mid">{item.aiSummary}</p>
            </div>
          )}

          {t && (
            <div className="border-t border-line-soft pt-5">
              <h3 className="text-sm font-semibold text-ink-hi">{ev.counted ? 'Vì sao phản hồi này được tính' : 'Vì sao phản hồi này không được tính'}</h3>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-hi">
                <EvidenceSwatch kind={ev.kind} size={12} />
                {ev.label}
                {!ev.counted && <Badge tone="crit">{exclusionLabel(t)}</Badge>}
                {ev.counted && t.lowInfo && <Badge>Đánh giá ngắn, ít thông tin</Badge>}
              </p>
              <ProgressBar
                className="mt-4"
                value={t.weight}
                label={`Mức đóng góp vào chỉ số: ${nf2.format(Number(t.weight) || 0)} trên tối đa 1`}
              />
              <p className="mt-2 text-xs leading-relaxed text-ink-lo">
                Mức này phụ thuộc độ tin của nguồn (hạng {t.tier}, tối đa {nf2.format(t.tierWeight ?? 0)}) và giảm dần khi phản hồi cũ đi
                {t.triggeredSignals?.length > 0 ? ' hoặc có dấu hiệu bất thường.' : '.'}
              </p>
              {t.triggeredSignals?.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-ink-mid">Dấu hiệu bất thường</p>
                  <div className="flex flex-wrap gap-2">
                    {t.triggeredSignals.map((s, i) => {
                      const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
                      return <Badge key={i} tone="high" icon={Icon}>{s.signal}</Badge>;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chỉ phản hồi chê mới cần trả lời xin lỗi / xử lý */}
          {item.sentiment === 'Negative' && <ReplyDraft feedbackId={item._id} />}
        </div>
      )}
    </Drawer>
  );
};

export default FeedbackDetail;
