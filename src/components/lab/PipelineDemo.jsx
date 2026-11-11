import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { analyzeText, useBrowserModelStatus } from '../../lib/analyze';
import { browserModelSupported } from '../../lib/visobertBrowser';
import ModelStatus from './ModelStatus';
import { GlassPanel, Button, TextArea } from '../ui';
import {
  MessageSquare, EyeOff, Languages, ShieldCheck, Puzzle, Brain, Search, ClipboardCheck,
  Play, Pause, FastForward, CheckCircle2, XCircle, AlertTriangle, Cpu, Zap
} from 'lucide-react';

/**
 * TRÌNH DIỄN XỬ LÝ NGÔN NGỮ ĐẦU VÀO
 * ==================================================================
 * Màn hình này trả lời một câu hỏi của ban giám khảo: "hệ thống có THẬT
 * SỰ xử lý được tiếng Việt đầu vào không, hay chỉ gọi một API rồi in ra?"
 *
 * Câu trả lời thuyết phục nhất là cho xem TỪNG BƯỚC với dữ liệu trung gian
 * thật: văn bản sau khi che PII, từng cặp teencode đã dịch, token mà mô
 * hình nhìn thấy, phân bố xác suất đầy đủ, và từ nào khiến mô hình kết
 * luận như vậy. Mọi con số trên màn hình đều do API /analyze trả về cho
 * đúng câu đang xét — không có bước nào được vẽ sẵn.
 *
 * Mỗi kịch bản mang theo ĐÁP ÁN KỲ VỌNG của người đọc, và bước cuối so
 * đáp án đó với kết quả thật ngay trên màn hình. Kịch bản mô hình còn sai
 * (câu mỉa mai) được giữ lại có chủ đích: một bản demo chỉ chọn câu chạy
 * đúng thì không chứng minh được gì, còn tự chỉ ra giới hạn thì đáng tin.
 *
 * Style viết tay chỉ còn ở giá trị động: độ rộng thanh xác suất và màu
 * nhiệt theo mức ảnh hưởng của từng từ.
 */

const SCENARIOS = [
  {
    id: 'nokw', label: 'Không chứa từ khóa',
    proves: 'Hiểu nghĩa, không cần khớp chuỗi',
    text: 'mua cục sạc dự phòng xài chưa tới tuần đã phồng lên, cầm nóng ran',
    expected: { categories: ['ProductQuality'], label: 'Khiếu nại chất lượng sản phẩm (lỗi kỹ thuật)' }
  },
  {
    id: 'slang', label: 'Teencode, nhiều vấn đề',
    proves: 'Đọc cách viết mạng xã hội',
    text: 'shipper dth thương mà hàng móp méo quá sốp ơi, app thì lag, thanh toán toàn báo lỗi',
    expected: {
      categories: ['Delivery', 'TechnicalApp', 'Payment'],
      label: 'Ba vấn đề cùng lúc: hàng móp (giao hàng), app lag (ứng dụng), lỗi thanh toán'
    }
  },
  {
    id: 'neg', label: 'Câu phủ định',
    proves: 'Có chữ "móp méo" nhưng là lời khen',
    text: 'Không hề bị móp méo gì như mọi người nói, hàng về nguyên vẹn',
    expected: { categories: [null], label: 'Không phải khiếu nại, đây là lời khen' }
  },
  {
    id: 'spam', label: 'Quảng cáo kèm SĐT',
    proves: 'Che thông tin cá nhân và chặn rác trước khi phân tích',
    text: 'Cần tuyển CTV bán hàng sỉ lẻ toàn quốc, hoa hồng cao, ib mình 0912345678 nhé',
    expected: { spam: true, label: 'Nội dung rác quảng cáo, phải bị chặn' }
  },
  {
    id: 'abbr', label: 'Viết tắt nặng',
    proves: 'Nhiều từ viết tắt trong một câu',
    text: 'đặt hàng 2 tuần r mà vẫn chưa thấy đâu, nhắn shop k ai rep',
    expected: { categories: ['Delivery', 'CustomerService'], label: 'Khiếu nại giao chậm (kèm shop không phản hồi)' }
  },
  {
    id: 'sarcasm', label: 'Mỉa mai (câu khó)',
    proves: 'Kiểm tra giới hạn: nghĩa ngược với chữ',
    text: 'Giao nhanh ghê, đặt có nửa tháng là tới rồi, cảm ơn shop nha',
    expected: { categories: ['Delivery'], label: 'Khiếu nại giao chậm, nói mỉa (nửa tháng mới tới)' }
  }
];

const STEPS = [
  { key: 'input', title: 'Tiếp nhận phản hồi', icon: MessageSquare, why: 'Văn bản thô như khách hàng gõ: sai chính tả, viết tắt, emoji, số điện thoại.' },
  { key: 'pii', title: 'Che thông tin cá nhân', icon: EyeOff, why: 'Nghị định 13/2023: số điện thoại, email, mã đơn bị che TRƯỚC khi chạm tới mô hình hay nhật ký hệ thống.' },
  { key: 'normalize', title: 'Chuẩn hóa teencode', icon: Languages, why: 'Từ điển tiếng lóng thương mại điện tử dịch cách viết tắt về tiếng Việt chuẩn cho nhánh luật từ khóa.' },
  { key: 'spam', title: 'Lọc rác và quảng cáo', icon: ShieldCheck, why: 'Tầng T1 của Trust Layer. Ưu tiên độ chính xác: loại nhầm một khiếu nại thật là mất đúng thứ cần nghe.' },
  { key: 'tokens', title: 'ViSoBERT tách token', icon: Puzzle, why: 'Mô hình không đọc chữ, nó đọc token. Bộ tách SentencePiece học trên văn bản mạng xã hội tiếng Việt.' },
  { key: 'inference', title: 'Mô hình suy luận', icon: Brain, why: 'Bốn đầu ra dùng chung một bộ mã hóa: cảm xúc, danh mục, nguyên nhân (giải mã phân cấp), rác.' },
  { key: 'explain', title: 'Vì sao mô hình kết luận vậy', icon: Search, why: 'Bỏ lần lượt từng từ rồi chạy lại mô hình: từ nào làm mô hình mất tự tin nhiều nhất là từ quyết định.' },
  { key: 'final', title: 'Bản ghi có cấu trúc', icon: ClipboardCheck, why: 'Thứ thực sự đi vào trang Tổng quan, cảnh báo và chỉ số khiếu nại, so với đáp án kỳ vọng và với luật từ khóa.' }
];

const STEP_DELAY_MS = 1400;
const SENTIMENT_VI = { Positive: 'Tích cực', Negative: 'Tiêu cực', Neutral: 'Trung tính' };
const PII_TOKEN = /(\[(?:SĐT|EMAIL|MÃ ĐƠN|CCCD|SỐ TÀI KHOẢN)\])/;

// ------------------------------------------------------------------
// Thành phần nhỏ dùng chung
// ------------------------------------------------------------------

const CHIP_TONE = {
  neutral: 'border-line bg-raised text-ink-mid',
  accent: 'border-accent/50 bg-accent-dim text-accent-hi',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-high/40 bg-high/10 text-high',
  danger: 'border-crit/40 bg-crit/10 text-crit'
};

const Chip = ({ children, tone = 'neutral', mono, title }) => (
  <span title={title} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP_TONE[tone]} ${mono ? 'font-mono' : ''}`}>
    {children}
  </span>
);

const TextBox = ({ children, mono }) => (
  <div className={`rounded-lg border border-line bg-canvas px-3.5 py-3 leading-relaxed break-words text-ink-hi ${mono ? 'font-mono text-sm' : 'text-base'}`}>
    {children}
  </div>
);

const Label = ({ children }) => <p className="mt-4 mb-1.5 text-xs font-semibold text-ink-mid">{children}</p>;

const Note = ({ children }) => <p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-ink-mid">{children}</p>;

const Callout = ({ tone, children }) => {
  const cls = { ok: 'border-ok/40 bg-ok/8', warn: 'border-high/40 bg-high/8', danger: 'border-crit/40 bg-crit/8' }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
};

const Unavailable = ({ reason }) => (
  <Callout tone="warn">
    <strong className="text-high">Bước này cần dịch vụ ViSoBERT.</strong>{' '}
    <span className="text-ink-mid">{reason} Hệ thống vẫn chạy bằng luật từ khóa ở bước cuối.</span>
  </Callout>
);

const BAR_TONE = { accent: 'bg-accent', high: 'bg-high', ok: 'bg-ok', crit: 'bg-crit' };

const ProbBar = ({ label, p, winner, tone = 'accent' }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_3.6rem] items-end gap-3">
    <div className="min-w-0">
      <p className={`truncate text-sm ${winner ? 'font-semibold text-ink-hi' : 'text-ink-mid'}`}>{label}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${winner ? BAR_TONE[tone] : 'bg-line'}`} style={{ width: `${Math.max(0.5, p * 100)}%` }} />
      </div>
    </div>
    <span className={`text-right font-mono text-xs ${winner ? 'text-ink-hi' : 'text-ink-mid'}`}>{(p * 100).toFixed(1).replace('.', ',')}%</span>
  </div>
);

const MaskedText = ({ text }) => (
  <TextBox>
    {String(text).split(new RegExp(PII_TOKEN.source, 'g')).map((part, i) =>
      PII_TOKEN.test(part)
        ? <mark key={i} className="rounded border border-ok/50 bg-ok/12 px-1 font-semibold text-ok">{part}</mark>
        : <span key={i}>{part}</span>
    )}
  </TextBox>
);

const Row = ({ children, className = '' }) => <div className={`flex flex-wrap gap-1.5 ${className}`}>{children}</div>;

// ------------------------------------------------------------------
// Nội dung từng bước
// ------------------------------------------------------------------

function StepInput({ t }) {
  return (
    <>
      <TextBox>{t.input.text}</TextBox>
      <Row className="mt-2.5">
        <Chip mono>{t.input.chars} ký tự</Chip>
        <Chip mono>{t.input.words} từ</Chip>
        {t.input.hasDigits && <Chip tone="warn">có chữ số</Chip>}
        {t.input.hasEmoji && <Chip tone="warn">có emoji</Chip>}
      </Row>
    </>
  );
}

function StepPii({ t }) {
  const found = t.pii.types.length > 0;
  return (
    <>
      <MaskedText text={t.pii.masked} />
      <Row className="mt-2.5">
        {found
          ? t.pii.types.map((x) => <Chip key={x} tone="ok"><EyeOff size={12} aria-hidden="true" /> đã che: {x}</Chip>)
          : <Chip>Không phát hiện thông tin cá nhân</Chip>}
      </Row>
      <Note>Từ bước này trở đi, văn bản gốc chứa thông tin cá nhân không còn được dùng ở bất kỳ đâu.</Note>
    </>
  );
}

function StepNormalize({ t }) {
  const reps = t.normalize.replacements;
  return (
    <>
      <Label>{reps.length} cặp đã dịch</Label>
      <Row>
        {reps.length === 0 && <Chip>Không có teencode trong từ điển</Chip>}
        {reps.map((r, i) => <Chip key={i} tone="accent" mono>{r.from} <span className="opacity-60" aria-hidden="true">›</span><span className="sr-only">thành</span> {r.to}</Chip>)}
      </Row>
      <Label>Kết quả chuẩn hóa</Label>
      <TextBox mono>{t.normalize.normalized}</TextBox>
      <Note>
        Văn bản này dùng cho nhánh luật từ khóa. ViSoBERT thì đọc văn bản gốc đã che thông tin cá nhân ở bước 5,
        vì mô hình được huấn luyện trên chính teencode thật; dịch trước có thể làm mất sắc thái.
      </Note>
    </>
  );
}

function StepSpam({ t }) {
  const s = t.spam;
  const signals = [
    ['hasContact', 'Lời mời liên hệ (ib, zalo, inbox…)'],
    ['hasCommerce', 'Lời chào mời buôn bán, tuyển CTV'],
    ['hasPhone', 'Số điện thoại'],
    ['hasUrl', 'Đường dẫn'],
    ['hasPromoCode', 'Mã giảm giá lạ']
  ];
  return (
    <>
      <ul className="grid list-none gap-1.5 sm:grid-cols-2">
        {signals.map(([k, label]) => (
          <li key={k} className={`flex items-center gap-2 text-sm ${s.signals[k] ? 'text-ink-hi' : 'text-ink-lo'}`}>
            {s.signals[k] ? <AlertTriangle size={15} className="text-high" aria-hidden="true" /> : <CheckCircle2 size={15} className="text-line" aria-hidden="true" />}
            {label}
            <span className="sr-only">{s.signals[k] ? ': có' : ': không'}</span>
          </li>
        ))}
      </ul>

      {s.modelScore != null && (
        <>
          <Label>Xác suất rác do ViSoBERT chấm, ngưỡng {s.threshold}</Label>
          <ProbBar label="Nội dung rác, quảng cáo" p={s.modelScore} winner tone={s.modelScore >= s.threshold ? 'high' : 'accent'} />
          <Note>Mô hình không được một mình chặn phản hồi: chỉ chặn khi điểm vượt ngưỡng VÀ có ít nhất một dấu hiệu liên hệ hoặc chào mời.</Note>
        </>
      )}

      <div className="mt-3.5">
        {s.isSpam ? (
          <Callout tone="warn">
            <strong className="text-high">Bị chặn là nội dung rác.</strong>
            <ul className="mt-1.5 list-disc pl-5 text-ink-mid">
              {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <p className="mt-1.5 text-ink-mid">Trong hệ thống thật, câu này dừng ở đây. Các bước sau vẫn chạy để minh họa.</p>
          </Callout>
        ) : (
          <Callout tone="ok"><strong className="text-ok">Qua bộ lọc, được đưa vào phân tích.</strong></Callout>
        )}
      </div>
    </>
  );
}

function StepTokens({ t }) {
  const m = t.model;
  if (!m.available) return <Unavailable reason={m.reason} />;
  return (
    <>
      <Label>Văn bản mô hình nhận ({m.inputMode === 'masked' ? 'đã che thông tin cá nhân, giữ nguyên teencode' : 'đã chuẩn hóa'})</Label>
      <MaskedText text={m.modelInput} />
      <Label>{m.tokenCount} token, tối đa {m.maxLength}{m.truncated ? ', đã cắt bớt' : ''}</Label>
      <div className="flex flex-wrap gap-1">
        {m.tokens.map((tok, i) => {
          const special = /^<.*>$/.test(tok);
          const wordStart = tok.startsWith('▁');
          const cls = special
            ? 'border-dashed border-line text-ink-lo'
            : wordStart ? 'border-accent/60 bg-accent-dim text-ink-hi' : 'border-line bg-raised text-ink-hi';
          return (
            <span
              key={i}
              title={special ? 'token đặc biệt' : wordStart ? 'bắt đầu một từ' : 'mảnh ghép tiếp theo của từ'}
              className={`rounded border px-1.5 py-0.5 font-mono text-xs ${cls} ${wordStart && i > 1 ? 'ml-1.5' : ''}`}
            >
              {wordStart ? tok.slice(1) || '␣' : tok}
            </span>
          );
        })}
      </div>
      <Note>
        Viền xanh: token mở đầu một từ. Viền xám: mảnh ghép nối tiếp. Từ phổ biến trên mạng xã hội (kể cả teencode như
        "dth", "sốp", "rep") thường là MỘT token nguyên vẹn, vì bộ từ vựng học từ chính loại văn bản đó.
      </Note>
    </>
  );
}

function StepInference({ t }) {
  const m = t.model;
  if (!m.available) return <Unavailable reason={m.reason} />;
  const d = m.distributions;
  const group = (title, rows, tone, max = 5) => rows && rows.length > 0 && (
    <div className="min-w-0">
      <Label>{title}</Label>
      <div className="flex flex-col gap-2">
        {rows.slice(0, max).map((r, i) => <ProbBar key={r.label} label={r.labelVi || r.label} p={r.p} winner={i === 0} tone={tone} />)}
      </div>
    </div>
  );
  return (
    <>
      <div className="grid gap-x-8 gap-y-2 md:grid-cols-3">
        {group('Cảm xúc', d.sentiment, 'high', 3)}
        {group('Danh mục (Level 1)', d.category, 'accent', 5)}
        {d.cause
          ? group('Nguyên nhân trong danh mục', d.cause, 'accent', 3)
          : (
            <div>
              <Label>Nguyên nhân</Label>
              <p className="text-sm text-ink-mid">Không phải khiếu nại nên không xét nguyên nhân.</p>
            </div>
          )}
      </div>
      <Row className="mt-4">
        <Chip mono><Cpu size={12} aria-hidden="true" /> {m.device}</Chip>
        <Chip mono><Zap size={12} aria-hidden="true" /> tách token {m.timings.tokenizeMs} ms</Chip>
        <Chip mono><Zap size={12} aria-hidden="true" /> suy luận {m.timings.inferenceMs} ms</Chip>
      </Row>
      <Note>
        Nguyên nhân chỉ được chọn trong danh mục đã chọn, nên không có tổ hợp vô nghĩa như “Giao hàng: Trừ tiền hai lần”.
        {m.multiLabel
          ? ` Danh mục dùng xác suất ĐỘC LẬP (sigmoid) nên các cột không cộng lại thành 100%: mọi danh mục vượt ngưỡng ${m.thresholds?.category ?? 0.5} đều được ghi nhận, nhờ vậy một câu nêu được nhiều vấn đề.`
          : ' Danh mục dùng softmax nên tổng bằng 100% và chỉ chọn được một danh mục.'}
        {m.calibrated
          ? ` Xác suất cảm xúc đã được HIỆU CHỈNH bằng temperature scaling học trên tập dev (T = ${m.calibration?.sentimentTemperature ?? '—'}), nên con số đọc được sát với tần suất đúng thật hơn.`
          : ' Mô hình hiện tự tin quá mức: đọc thứ hạng, đừng đọc như xác suất đã hiệu chỉnh.'}
      </Note>
    </>
  );
}

function StepExplain({ t }) {
  const m = t.model;
  const [task, setTask] = useState('category');
  if (!m.available) return <Unavailable reason={m.reason} />;
  if (!m.importance) {
    return <p className="text-sm text-ink-mid">Câu quá ngắn hoặc quá dài để đo mức ảnh hưởng từng từ.</p>;
  }
  const imp = m.importance[task] || m.importance.category || m.importance.sentiment;
  const maxPos = Math.max(0.05, ...imp.values);
  const maxNeg = Math.max(0.05, ...imp.values.map((v) => -v));
  const ranked = m.words
    .map((w, i) => ({ w, v: imp.values[i], after: imp.probAfter?.[i] }))
    .filter((x) => x.v > 0.05)
    .sort((a, b) => b.v - a.v)
    .slice(0, 4);

  return (
    <>
      <div role="group" aria-label="Giải thích nhãn nào" className="mb-3 flex flex-wrap gap-1.5">
        {[['category', 'Vì sao ra danh mục này'], ['sentiment', 'Vì sao ra cảm xúc này']]
          .filter(([k]) => m.importance[k])
          .map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={task === k}
              onClick={() => setTask(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${task === k ? 'border-accent bg-accent-dim text-accent-hi' : 'border-line text-ink-mid hover:border-ink-lo'}`}
            >
              {label}
            </button>
          ))}
      </div>

      <p className="mb-2 text-sm text-ink-mid">
        Nhãn được giải thích: <strong className="text-ink-hi">{imp.targetVi || imp.target}</strong> (xác suất {(imp.base * 100).toFixed(1).replace('.', ',')}%)
      </p>

      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-canvas px-3 py-2.5 leading-loose">
        {m.words.map((w, i) => {
          const v = imp.values[i];
          const after = imp.probAfter?.[i];
          const a = v >= 0 ? Math.min(1, v / maxPos) : Math.min(1, -v / maxNeg);
          // Màu nhiệt động: cam ủng hộ kết luận, xanh kéo ngược; đậm nhạt theo mức ảnh hưởng
          const bg = v >= 0 ? `rgb(var(--viz-support) / ${0.1 + a * 0.62})` : `rgb(var(--viz-oppose) / ${0.1 + a * 0.45})`;
          return (
            <span
              key={i}
              title={after != null ? `Bỏ từ này: xác suất còn ${(after * 100).toFixed(2).replace('.', ',')}%` : ''}
              className={`rounded px-1.5 text-base text-ink-hi ${v > 0 && a > 0.5 ? 'font-semibold' : ''}`}
              style={{ background: Math.abs(v) < 0.05 ? 'transparent' : bg }}
            >
              {w}
            </span>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-mid">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[rgb(var(--viz-support)/0.7)]" aria-hidden="true" />ủng hộ kết luận</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[rgb(var(--viz-oppose)/0.55)]" aria-hidden="true" />kéo ngược kết luận</span>
        <span>rê chuột lên từng từ để xem xác suất khi bỏ từ đó</span>
      </div>

      {ranked.length > 0 && (
        <>
          <Label>Từ quyết định nhất</Label>
          <div className="flex max-w-xl flex-col gap-2">
            {ranked.map((x) => (
              <div key={x.w} className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_auto] items-center gap-3">
                <strong className="truncate text-sm text-ink-hi">"{x.w}"</strong>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-high" style={{ width: `${(x.v / maxPos) * 100}%` }} />
                </div>
                <span className="font-mono text-xs whitespace-nowrap text-ink-mid">
                  bỏ đi còn {x.after != null ? (x.after * 100).toFixed(1).replace('.', ',') : '—'}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {ranked.length === 0 && (
        <Note>Không từ đơn lẻ nào đủ sức làm đổi kết luận: mô hình dựa vào nhiều từ cùng lúc, bỏ một từ thì các từ còn lại vẫn đủ.</Note>
      )}
      <Note>
        Cách đọc trung thực: nếu từ quyết định KHÔNG mang nghĩa của nhãn (ví dụ "tuần", "mua" cho nhãn lỗi kỹ thuật), mô hình đang dựa
        vào lối tắt học từ dữ liệu huấn luyện sinh theo khung câu, chứ chưa hiểu đúng lý do. Đây là phát hiện cần báo cáo, và là lý do
        cần tập gán nhãn thật.
      </Note>
      <Note>
        Đo bằng {m.words.length} lần chạy lại mô hình ({m.timings.explainMs} ms), mỗi lần bỏ một từ. Độ mạnh tính theo mức giảm
        log-odds: khi mô hình đã chắc gần 100%, xác suất gần như không nhúc nhích dù bỏ từ quan trọng, còn log-odds thì có. Đây là
        phép thử trên chính câu này, không phải trọng số attention.
      </Note>
    </>
  );
}

function expectationResult(t, scenario) {
  const exp = scenario?.expected;
  if (!exp) return null;
  const f = t.final;
  if (exp.spam) return { ok: f.blocked, label: exp.label };

  const detected = new Set((f.aspects || []).map((a) => a.category));
  if (f.category) detected.add(f.category);

  // Câu kỳ vọng "không phải khiếu nại": đúng khi hệ thống không gắn khía cạnh nào
  if (exp.categories.length === 1 && exp.categories[0] === null) {
    return { ok: !f.blocked && detected.size === 0, label: exp.label };
  }

  const wanted = exp.categories.filter(Boolean);
  const hit = wanted.filter((c) => detected.has(c));
  return {
    ok: !f.blocked && hit.length === wanted.length,
    partial: hit.length > 0 && hit.length < wanted.length,
    coverage: `${hit.length}/${wanted.length}`,
    label: exp.label
  };
}

function StepFinal({ t, scenario }) {
  const f = t.final;
  const r = t.rules.matches;
  const expect = expectationResult(t, scenario);
  const ruleCategories = [...new Set(r.map((x) => x.category))];
  const aspects = f.aspects || [];

  /** Chấm một nhánh (luật hoặc mô hình) theo đáp án kỳ vọng của kịch bản */
  const branchScore = (categories) => {
    const exp = scenario?.expected;
    if (!exp || exp.spam) return null;
    if (exp.categories.length === 1 && exp.categories[0] === null) {
      return categories.size === 0
        ? { ok: true, text: 'đúng, không phải khiếu nại' }
        : { ok: false, text: 'sai, nhận nhầm là khiếu nại' };
    }
    const wanted = exp.categories.filter(Boolean);
    const hit = wanted.filter((c) => categories.has(c)).length;
    return { ok: hit === wanted.length, text: `bắt ${hit}/${wanted.length} vấn đề` };
  };
  const ruleScore = branchScore(new Set(ruleCategories));
  const modelScore = branchScore(new Set(aspects.map((a) => a.category)));
  const rows = [
    ['Nguồn nhãn', f.source === 'visobert' ? 'ViSoBERT tinh chỉnh' : 'Luật từ khóa (dự phòng)'],
    ['Danh mục chính', f.categoryLabel],
    ['Nguyên nhân', f.causeLabel || '—'],
    ['Cảm xúc', SENTIMENT_VI[f.sentiment] || f.sentiment],
    ['Bộ phận xử lý', f.owner || '—'],
    ['Trust Layer (T1)', f.blocked ? 'Bị chặn, nội dung rác' : 'Qua bộ lọc']
  ];
  return (
    <>
      {expect && (
        <div className={`mb-1 flex items-start gap-3 rounded-lg border px-4 py-3 ${expect.ok ? 'border-ok/40 bg-ok/8' : 'border-crit/40 bg-crit/8'}`}>
          {expect.ok
            ? <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
            : <XCircle size={19} className="mt-0.5 shrink-0 text-crit" aria-hidden="true" />}
          <div className="text-sm leading-relaxed">
            <p className="text-ink-mid">Người đọc kỳ vọng: <strong className="text-ink-hi">{expect.label}</strong></p>
            <p className={`font-semibold ${expect.ok ? 'text-ok' : 'text-crit'}`}>
              {expect.ok
                ? `Hệ thống kết luận khớp kỳ vọng${expect.coverage ? ` (bắt được ${expect.coverage} vấn đề)` : ''}.`
                : expect.partial
                  ? `Hệ thống mới bắt được ${expect.coverage} vấn đề, thiếu phần còn lại. Không che đi.`
                  : 'Hệ thống kết luận KHÔNG khớp kỳ vọng. Đây là giới hạn thật của mô hình hiện tại, không che đi.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <Label>Bản ghi đi vào hệ thống, kết quả chính thức</Label>
          <p className="-mt-0.5 mb-2 text-xs leading-relaxed text-ink-mid">
            Do <strong className="text-accent-hi">{f.source === 'visobert' ? 'ViSoBERT' : 'luật từ khóa'}</strong> sinh ra. Đây là bản ghi được
            lưu, được đếm vào chỉ số và có thể kích hoạt cảnh báo.
          </p>
          <dl className="overflow-hidden rounded-lg border border-accent/50">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 px-3.5 py-2 text-sm odd:bg-raised">
                <dt className="text-ink-mid">{k}</dt>
                <dd className="font-semibold text-ink-hi">{v}</dd>
              </div>
            ))}
          </dl>

          <Label>Khía cạnh phát hiện được ({aspects.length})</Label>
          {aspects.length === 0 ? (
            <p className="text-sm text-ink-mid">Không có khía cạnh khiếu nại nào.</p>
          ) : (
            <ul className="flex list-none flex-col gap-1.5">
              {aspects.map((a, i) => (
                <li key={a.category + i} className={`flex flex-wrap justify-between gap-2 rounded-lg border-l-2 bg-raised px-3 py-2 ${i === 0 ? 'border-accent' : 'border-line'}`}>
                  <span className="text-sm text-ink-hi">
                    {a.categoryLabel}: {a.causeLabel || 'chưa rõ nguyên nhân'}
                    {a.causeUncertain && <span className="text-high">, nguyên nhân chưa chắc</span>}
                    {i === 0 && <span className="text-ink-mid">, chính</span>}
                  </span>
                  <span className="font-mono text-xs text-ink-mid">{a.owner}{a.confidence != null ? `, ${a.confidence}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <Note>{f.note}</Note>
        </div>

        <div className="min-w-0">
          <Label>Đối chiếu: luật từ khóa thấy gì</Label>
          <p className="-mt-0.5 mb-2 text-xs leading-relaxed text-ink-mid">
            {f.source === 'visobert'
              ? <>Nhánh đối chứng B1, <strong className="text-high">không dùng để ghi nhận</strong>. Để đây chỉ để thấy luật bỏ sót hay bắt được gì.</>
              : <>Hiện đây <strong className="text-high">đang là nguồn nhãn chính</strong>, vì dịch vụ ViSoBERT không sẵn sàng.</>}
          </p>
          {r.length === 0 ? (
            <TextBox>
              Không khớp từ khóa nào, nên nhánh luật kết luận <strong>không phải khiếu nại</strong>
              {f.source === 'visobert' && <>, nhưng kết luận này <strong>không thay thế</strong> bản ghi bên trái</>}.
            </TextBox>
          ) : (
            <ul className="flex list-none flex-col gap-2">
              {r.slice(0, 4).map((x, i) => (
                <li key={i} className="rounded-lg bg-raised px-3.5 py-2.5">
                  <p className="text-sm font-semibold text-ink-hi">{x.categoryLabel}: {x.causeLabel}</p>
                  <Row className="mt-1.5">{x.keywords.map((k) => <Chip key={k} mono>khớp "{k}"</Chip>)}</Row>
                </li>
              ))}
            </ul>
          )}
          {t.model.available && (
            <Row className="mt-3">
              {/* Có đáp án kỳ vọng thì chấm RIÊNG từng nhánh. So danh mục chính
                  thôi là sai: câu ba vấn đề thì luật có thể bắt đủ 3/3 trong khi
                  mô hình chỉ bắt 2/3, dù danh mục chính của hai bên trùng nhau. */}
              {ruleScore && modelScore ? (
                <>
                  <Chip tone={ruleScore.ok ? 'ok' : 'danger'}>
                    {ruleScore.ok ? <CheckCircle2 size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />} Luật: {ruleScore.text}
                  </Chip>
                  <Chip tone={modelScore.ok ? 'ok' : 'danger'}>
                    {modelScore.ok ? <CheckCircle2 size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />} ViSoBERT: {modelScore.text}
                  </Chip>
                </>
              ) : (
                <Chip tone={f.agreeWithRules ? 'ok' : 'warn'}>
                  {f.agreeWithRules ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                  {f.agreeWithRules ? 'Luật và mô hình cùng kết luận danh mục chính' : 'Luật và mô hình kết luận khác nhau'}
                </Chip>
              )}
            </Row>
          )}
          {t.model.available && (ruleCategories.length > 1 || aspects.length > 1) && (
            <Note>
              Câu này có nhiều vấn đề: luật khớp {ruleCategories.length} danh mục, mô hình phát hiện {aspects.length}. Mô hình dùng đầu ra đa
              nhãn (mỗi danh mục một xác suất độc lập) nên nêu được đồng thời nhiều vấn đề, còn bản ghi vẫn giữ một danh mục chính để đếm chỉ số.
            </Note>
          )}
          <Note>
            Luật chỉ nhận ra chuỗi ký tự đã có trong từ điển. Mô hình không tra từ điển nào; kết luận của nó đến từ ngữ cảnh của cả câu, như bước 7 cho thấy.
          </Note>
        </div>
      </div>
    </>
  );
}

const STEP_BODY = {
  input: StepInput, pii: StepPii, normalize: StepNormalize, spam: StepSpam,
  tokens: StepTokens, inference: StepInference, explain: StepExplain, final: StepFinal
};

function stepMs(t, key) {
  if (!t) return null;
  if (key === 'tokens') return t.model.available ? t.model.timings.tokenizeMs : null;
  if (key === 'inference') return t.model.available ? t.model.timings.inferenceMs : null;
  if (key === 'explain') return t.model.available ? t.model.timings.explainMs : null;
  return t[key]?.ms ?? null;
}

// ------------------------------------------------------------------
// Màn hình chính
// ------------------------------------------------------------------

export default function PipelineDemo() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [text, setText] = useState(SCENARIOS[0].text);
  const [trace, setTrace] = useState(null);
  const [ranScenario, setRanScenario] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [nlp, setNlp] = useState(null);
  const stepRefs = useRef([]);

  useEffect(() => {
    axios.get('/nlp/status').then((r) => setNlp(r.data)).catch(() => setNlp(null));
  }, []);

  const run = async (present) => {
    const value = text.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const data = await analyzeText(value);
      setTrace(data.trace);
      // Chỉ gắn đáp án kỳ vọng khi câu chạy đúng là câu của kịch bản, chưa bị sửa
      const sc = SCENARIOS.find((s) => s.id === scenarioId);
      setRanScenario(sc && sc.text === value ? sc : null);
      setRevealed(present ? 1 : STEPS.length);
      setPlaying(present);
    } catch (e) {
      setError(e.response?.data?.error || 'Không gọi được API phân tích. Kiểm tra kết nối tới máy chủ rồi thử lại.');
      setTrace(null);
    } finally {
      setLoading(false);
    }
  };

  // Tự mở bước kế tiếp khi đang trình diễn
  useEffect(() => {
    if (!playing || !trace) return undefined;
    if (revealed >= STEPS.length) {
      setPlaying(false);
      return undefined;
    }
    const id = setTimeout(() => setRevealed((r) => r + 1), STEP_DELAY_MS);
    return () => clearTimeout(id);
  }, [playing, revealed, trace]);

  useEffect(() => {
    if (!trace || !playing || revealed < 1) return;
    stepRefs.current[revealed - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [revealed, trace, playing]);

  // Sẵn sàng khi máy chủ có mô hình, HOẶC trình duyệt chạy được bản ONNX
  const browserStatus = useBrowserModelStatus();
  const inBrowser = !nlp?.canLabel && browserModelSupported() && browserStatus.phase !== 'error';
  const modelReady = nlp?.canLabel || inBrowser;
  const done = trace && revealed >= STEPS.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Khối nhập liệu và kịch bản */}
      <GlassPanel tone="strong" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[70ch]">
            <h3 className="text-heading font-semibold text-ink-hi">Hành trình của một câu phản hồi</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-mid">
              Chọn một thử thách ngôn ngữ hoặc tự gõ câu bất kỳ. Mỗi bước bên dưới hiện dữ liệu thật của đúng câu đó khi đi qua hệ
              thống, từ chữ thô tới bản ghi có cấu trúc.
            </p>
          </div>
          <Chip tone={modelReady ? 'ok' : 'warn'} title={nlp?.reason || ''}>
            <Cpu size={13} aria-hidden="true" />
            {nlp?.canLabel
              ? `ViSoBERT sẵn sàng, train ${nlp.checkpoint?.trainedAt ? new Date(nlp.checkpoint.trainedAt).toLocaleDateString('vi-VN') : ''}`
              : inBrowser
                ? (browserStatus.phase === 'ready' ? 'ViSoBERT chạy trên trình duyệt' : 'ViSoBERT đang tải về trình duyệt')
                : 'ViSoBERT chưa sẵn sàng, bước 5 đến 7 sẽ trống'}
          </Chip>
        </div>

        <Label>Thử thách ngôn ngữ</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => {
            const active = scenarioId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                title={s.text}
                aria-pressed={active}
                onClick={() => { setScenarioId(s.id); setText(s.text); }}
                className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${active ? 'border-accent bg-accent-dim' : 'border-line bg-raised hover:border-ink-lo'}`}
              >
                <span className={`block text-sm font-semibold ${active ? 'text-accent-hi' : 'text-ink-hi'}`}>{s.label}</span>
                <span className="mt-0.5 block text-xs text-ink-mid">{s.proves}</span>
              </button>
            );
          })}
        </div>

        {!nlp?.canLabel && <ModelStatus className="mt-4" />}

        <TextArea
          id="lab-input"
          className="mt-4"
          label="Câu phản hồi"
          rows={2}
          // Khớp trần của máy chủ và nlp_service (2000 ký tự)
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button icon={Play} loading={loading} disabled={loading || !text.trim()} onClick={() => run(true)}>Trình diễn từng bước</Button>
          <Button variant="secondary" icon={FastForward} disabled={loading || !text.trim()} onClick={() => run(false)}>Chạy nhanh</Button>
          {trace && !done && (
            <>
              <Button variant="ghost" icon={playing ? Pause : Play} onClick={() => setPlaying((p) => !p)}>{playing ? 'Tạm dừng' : 'Tiếp tục'}</Button>
              <Button variant="ghost" onClick={() => { setPlaying(false); setRevealed(STEPS.length); }}>Hiện tất cả</Button>
            </>
          )}
          {trace && <span className="font-mono text-xs text-ink-mid">toàn bộ quy trình: {trace.totalMs} ms</span>}
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg border border-crit/30 bg-crit/8 px-4 py-2.5 text-sm text-crit">
            <XCircle size={15} aria-hidden="true" /> {error}
          </p>
        )}
      </GlassPanel>

      {/* Thanh tiến trình tám bước */}
      <nav aria-label="Tám bước xử lý" className="overflow-x-auto">
        <ol className="flex min-w-max list-none gap-1.5">
          {STEPS.map((s, i) => {
            const on = trace && i < revealed;
            const ms = stepMs(trace, s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={!on}
                  onClick={() => stepRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${on ? 'border-accent bg-accent-dim text-accent-hi' : 'border-line bg-surface text-ink-lo'}`}
                >
                  <span className="font-mono font-semibold">{i + 1}</span>
                  <span className="whitespace-nowrap">{s.title}</span>
                  {on && ms != null && <span className="font-mono opacity-75">{ms} ms</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Các bước */}
      {!trace && !loading && (
        <GlassPanel tone="strong" className="px-5 py-10 text-center text-sm text-ink-mid">
          Bấm <strong className="text-ink-hi">Trình diễn từng bước</strong> để xem câu văn đi qua tám bước xử lý.
        </GlassPanel>
      )}

      {trace && (
        <div className="flex flex-col gap-3">
          {STEPS.map((s, i) => {
            const Body = STEP_BODY[s.key];
            const Icon = s.icon;
            const visible = i < revealed;
            const ms = stepMs(trace, s.key);
            return (
              <GlassPanel
                as="section"
                key={s.key}
                ref={(el) => { stepRefs.current[i] = el; }}
                tone="strong"
                aria-labelledby={`step-${s.key}`}
                className={`scroll-mt-24 overflow-hidden border-l-[3px] p-5 transition-opacity duration-300 ${visible ? 'border-l-accent' : 'border-l-line opacity-40'}`}
              >
                <div className="flex items-start gap-3.5">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full border ${visible ? 'border-accent bg-accent-dim text-accent-hi' : 'border-line bg-raised text-ink-lo'}`}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 id={`step-${s.key}`} className="text-base font-semibold text-ink-hi">
                        <span className="mr-1.5 font-mono text-ink-lo">Bước {i + 1}</span>{s.title}
                      </h4>
                      {visible && ms != null && <span className="font-mono text-xs text-ink-mid">{ms} ms</span>}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-mid">{s.why}</p>
                    {visible && (
                      <div className="mt-4 animate-fade-up">
                        <Body t={trace} scenario={ranScenario} />
                      </div>
                    )}
                  </div>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
