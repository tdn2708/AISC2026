import React from 'react';
import { SentimentFace, Badge, EvidenceTag, Skeleton } from '../ui';
import { fmtDateTime, SENTIMENT_MAP, evidenceOf, exclusionLabel, sarcasmTag } from '../../lib/format';

/**
 * BẢNG PHẢN HỒI dùng chung cho trang Phản hồi và "Phản hồi gần đây" trên Tổng
 * quan: cùng cột, cùng cách hiện cảm xúc và bằng chứng, bấm dòng nào mở chi
 * tiết dòng đó. Dưới 760px mỗi dòng thành một thẻ (CSS .fb-table trong index.css).
 *
 * @param {{ items: object[], showProduct?: boolean, onSelect?: (item) => void, dimmed?: boolean }} props
 */

const WIDTHS = {
  withProduct: ['18%', '26%', '13%', '11%', '10%', '11%', '11%'],
  plain: ['18%', '36%', '13%', '11%', '12%', '10%']
};

const FeedbackList = ({ items, showProduct = false, onSelect, dimmed = false }) => (
  <div className="paper mx-3 mb-3">
  <div className={`overflow-x-auto transition-opacity duration-short ${dimmed ? 'opacity-60' : ''}`}>
    <table className="fb-table">
      <colgroup>
        {(showProduct ? WIDTHS.withProduct : WIDTHS.plain).map((w, i) => <col key={i} style={{ width: w }} />)}
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Khách hàng</th>
          <th scope="col">Nội dung</th>
          {showProduct && <th scope="col">Sản phẩm</th>}
          <th scope="col">Nhóm vấn đề</th>
          <th scope="col">Cảm xúc</th>
          <th scope="col">Bằng chứng</th>
          <th scope="col">Nguồn</th>
        </tr>
      </thead>
      <tbody>
        {items.map((f, i) => {
          const author = f.author || 'Ẩn danh';
          const s = SENTIMENT_MAP[f.sentiment] || SENTIMENT_MAP.Neutral;
          const ev = evidenceOf(f);
          const sarcasm = sarcasmTag(f);
          const open = () => onSelect?.(f);
          return (
            <tr
              key={f._id || i}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? open : undefined}
              onKeyDown={onSelect ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()) : undefined}
              className={onSelect ? 'lift cursor-pointer focus-visible:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent' : undefined}
            >
              <td className="fb-c-user">
                <div className="fb-user">
                  <div className="fb-user-text">
                    <div className="fb-user-name" title={author}>{author}</div>
                    <div className="fb-meta">{fmtDateTime(f.timestamp)}</div>
                  </div>
                </div>
              </td>
              <td className="fb-c-text"><div className="fb-clamp" title={f.originalText}>{f.originalText}</div></td>
              {showProduct && (
                <td className="fb-c-product"><div className="fb-clamp fb-product" title={f.productName}>{f.productName || '—'}</div></td>
              )}
              <td className="fb-c-cat">
                {f.categoryLabel && f.category !== 'Other'
                  ? <span className="fb-chip" title={f.causeLabel ? `${f.categoryLabel}: ${f.causeLabel}` : f.categoryLabel}>{f.categoryLabel}</span>
                  : <span className="text-ink-lo" title="Không nêu vấn đề cụ thể" aria-label="Không nêu vấn đề cụ thể">{'—'}</span>}
              </td>
              <td className="fb-c-sent">
                <span className="inline-flex items-center gap-2 text-sm text-ink-mid">
                  <SentimentFace sentiment={f.sentiment} size={22} />
                  {s.label}
                </span>
                {(sarcasm || f.needsReview) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {sarcasm && <Badge tone={sarcasm.tone}>{sarcasm.label}</Badge>}
                    {f.needsReview && <Badge>Chờ duyệt</Badge>}
                  </span>
                )}
              </td>
              <td className="fb-c-trust">
                {ev.counted ? <EvidenceTag evidence={ev} /> : <Badge tone="crit">{exclusionLabel(f.trust)}</Badge>}
              </td>
              <td className="fb-c-src"><span className="fb-source">{f.source}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  </div>
);

/** Khung chờ cùng chiều cao với bảng thật, để trang không nhảy khi dữ liệu về */
export const FeedbackListSkeleton = ({ rows = 8 }) => (
  <div className="flex flex-col" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-4 border-b border-line-soft px-6 py-4 last:border-b-0">
        <Skeleton as="span" className="size-8 shrink-0 rounded-full bg-raised" />
        <Skeleton as="span" className="h-3 w-28 rounded-ctrl bg-raised" />
        <Skeleton as="span" className="h-3 flex-1 rounded-ctrl bg-raised" />
        <Skeleton as="span" className="hidden h-3 w-20 rounded-ctrl bg-raised sm:block" />
        <Skeleton as="span" className="hidden h-3 w-16 rounded-ctrl bg-raised sm:block" />
      </div>
    ))}
  </div>
);

export default FeedbackList;
