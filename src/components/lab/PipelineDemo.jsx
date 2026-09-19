import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  MessageSquare, EyeOff, Languages, ShieldCheck, Puzzle, Brain, Search, ClipboardCheck,
  Play, Pause, FastForward, Loader2, CheckCircle2, XCircle, AlertTriangle, Cpu, Zap
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
    expected: { categories: [null], label: 'Không phải khiếu nại — đây là lời khen' }
  },
  {
    id: 'spam', label: 'Quảng cáo kèm SĐT',
    proves: 'Che PII và chặn rác trước khi phân tích',
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
  { key: 'pii', title: 'Che thông tin cá nhân', icon: EyeOff, why: 'Nghị định 13/2023: số điện thoại, email, mã đơn bị che TRƯỚC khi chạm tới mô hình hay log.' },
  { key: 'normalize', title: 'Chuẩn hóa teencode', icon: Languages, why: 'Từ điển tiếng lóng TMĐT dịch cách viết tắt về tiếng Việt chuẩn cho nhánh luật từ khóa.' },
  { key: 'spam', title: 'Lọc rác và quảng cáo', icon: ShieldCheck, why: 'Tầng T1 của Trust Layer. Ưu tiên Precision: loại nhầm một khiếu nại thật là mất đúng thứ cần nghe.' },
  { key: 'tokens', title: 'ViSoBERT tách token', icon: Puzzle, why: 'Mô hình không đọc chữ, nó đọc token. Bộ tách SentencePiece học trên văn bản mạng xã hội tiếng Việt.' },
  { key: 'inference', title: 'Mô hình suy luận', icon: Brain, why: 'Bốn đầu ra dùng chung một bộ mã hóa: cảm xúc, danh mục, nguyên nhân (giải mã phân cấp), rác.' },
  { key: 'explain', title: 'Vì sao mô hình kết luận vậy', icon: Search, why: 'Bỏ lần lượt từng từ rồi chạy lại mô hình: từ nào làm mô hình mất tự tin nhiều nhất là từ quyết định.' },
  { key: 'final', title: 'Bản ghi có cấu trúc', icon: ClipboardCheck, why: 'Thứ thực sự đi vào dashboard, cảnh báo và chỉ số WCR — so với đáp án kỳ vọng và với luật từ khóa.' }
];

const STEP_DELAY_MS = 1400;

const SENTIMENT_VI = { Positive: 'Tích cực', Negative: 'Tiêu cực', Neutral: 'Trung tính' };

const PII_TOKEN = /(\[(?:SĐT|EMAIL|MÃ ĐƠN|CCCD|SỐ TÀI KHOẢN)\])/;

// ------------------------------------------------------------------
// Thành phần nhỏ dùng chung
// ------------------------------------------------------------------

const Chip = ({ children, tone = 'neutral', mono, title }) => {
  const tones = {
    neutral: { bg: 'var(--raised)', bd: 'var(--border)', fg: 'var(--text-mid)' },
    accent: { bg: 'var(--accent-dim)', bd: 'var(--accent)', fg: 'var(--accent-hi)' },
    ok: { bg: 'var(--sev-ok-dim)', bd: 'var(--sev-ok)', fg: 'var(--sev-ok)' },
    warn: { bg: 'var(--sev-high-dim)', bd: 'var(--sev-high)', fg: 'var(--sev-high)' },
    danger: { bg: 'var(--sev-crit-dim)', bd: 'var(--sev-crit)', fg: 'var(--sev-crit)' }
  }[tone];
  return (
    <span title={title} className={mono ? 'data-num' : undefined} style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      fontSize: '0.76rem', padding: '3px 9px', borderRadius: 99, lineHeight: 1.5,
      background: tones.bg, border: `1px solid ${tones.bd}`, color: tones.fg, fontWeight: 500
    }}>
      {children}
    </span>
  );
};

const TextBox = ({ children, mono }) => (
  <div className={mono ? 'data-num' : undefined} style={{
    background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)',
    padding: '0.7rem 0.85rem', fontSize: mono ? '0.82rem' : '0.92rem', lineHeight: 1.7,
    color: 'var(--text-hi)', wordBreak: 'break-word'
  }}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <div style={{
    fontSize: '0.66rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
    color: 'var(--text-lo)', margin: '0.9rem 0 0.4rem'
  }}>
    {children}
  </div>
);

const Note = ({ children }) => (
  <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--text-lo)', lineHeight: 1.6 }}>{children}</p>
);

const Unavailable = ({ reason }) => (
  <div style={{
    padding: '0.8rem 0.95rem', borderRadius: 'var(--r-ctrl)', background: 'var(--sev-high-dim)',
    border: '1px solid var(--sev-high)', color: 'var(--text-mid)', fontSize: '0.84rem', lineHeight: 1.6
  }}>
    <strong style={{ color: 'var(--sev-high)' }}>Bước này cần dịch vụ ViSoBERT.</strong> {reason}
    {' '}Hệ thống vẫn chạy bằng luật từ khóa ở bước cuối.
  </div>
);

const ProbBar = ({ label, p, winner, tone = 'var(--accent)' }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 3.6rem', gap: '0.6rem', alignItems: 'end' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: '0.8rem', color: winner ? 'var(--text-hi)' : 'var(--text-mid)', fontWeight: winner ? 600 : 400,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      }}>
        {label}
      </div>
      <div style={{ height: 7, background: 'var(--raised)', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
        <div style={{
          width: `${Math.max(0.5, p * 100)}%`, height: '100%', borderRadius: 99,
          background: winner ? tone : 'var(--border)', transition: 'width 700ms var(--ease)'
        }} />
      </div>
    </div>
    <span className="data-num" style={{ fontSize: '0.76rem', textAlign: 'right', color: winner ? 'var(--text-hi)' : 'var(--text-lo)' }}>
      {(p * 100).toFixed(1)}%
    </span>
  </div>
);

const MaskedText = ({ text }) => (
  <TextBox>
    {String(text).split(new RegExp(PII_TOKEN.source, 'g')).map((part, i) =>
      PII_TOKEN.test(part) ? (
        <mark key={i} style={{
          background: 'var(--sev-ok-dim)', color: 'var(--sev-ok)', border: '1px solid var(--sev-ok)',
          borderRadius: 4, padding: '0 4px', fontWeight: 600
        }}>{part}</mark>
      ) : <span key={i}>{part}</span>
    )}
  </TextBox>
);

// ------------------------------------------------------------------
// Nội dung từng bước
// ------------------------------------------------------------------

function StepInput({ t }) {
  return (
    <>
      <TextBox>{t.input.text}</TextBox>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
        <Chip mono>{t.input.chars} ký tự</Chip>
        <Chip mono>{t.input.words} từ</Chip>
        {t.input.hasDigits && <Chip tone="warn">có chữ số</Chip>}
        {t.input.hasEmoji && <Chip tone="warn">có emoji</Chip>}
      </div>
    </>
  );
}

function StepPii({ t }) {
  const found = t.pii.types.length > 0;
  return (
    <>
      <MaskedText text={t.pii.masked} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
        {found
          ? t.pii.types.map((x) => <Chip key={x} tone="ok"><EyeOff size={11} /> đã che: {x}</Chip>)
          : <Chip>Không phát hiện thông tin cá nhân</Chip>}
      </div>
      <Note>Từ bước này trở đi, văn bản gốc chứa PII không còn được dùng ở bất kỳ đâu.</Note>
    </>
  );
}

function StepNormalize({ t }) {
  const reps = t.normalize.replacements;
  return (
    <>
      <Label>{reps.length} cặp đã dịch</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {reps.length === 0 && <Chip>Không có teencode trong từ điển</Chip>}
        {reps.map((r, i) => (
          <Chip key={i} tone="accent" mono>{r.from} <span style={{ opacity: 0.7 }}>→</span> {r.to}</Chip>
        ))}
      </div>
      <Label>Kết quả chuẩn hóa</Label>
      <TextBox mono>{t.normalize.normalized}</TextBox>
      <Note>
        Văn bản này dùng cho nhánh luật từ khóa. ViSoBERT thì đọc văn bản gốc đã che PII ở bước 5,
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.4rem' }}>
        {signals.map(([k, label]) => (
          <div key={k} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem',
            color: s.signals[k] ? 'var(--text-hi)' : 'var(--text-lo)'
          }}>
            {s.signals[k]
              ? <AlertTriangle size={14} color="var(--sev-high)" />
              : <CheckCircle2 size={14} color="var(--border)" />}
            {label}
          </div>
        ))}
      </div>

      {s.modelScore != null && (
        <>
          <Label>Xác suất rác do ViSoBERT chấm · ngưỡng {s.threshold}</Label>
          <ProbBar label="Nội dung rác / quảng cáo" p={s.modelScore} winner tone={s.modelScore >= s.threshold ? 'var(--sev-high)' : 'var(--accent)'} />
          <Note>Mô hình không được một mình chặn phản hồi — chỉ chặn khi điểm vượt ngưỡng VÀ có ít nhất một dấu hiệu liên hệ hoặc chào mời.</Note>
        </>
      )}

      <div style={{
        marginTop: '0.85rem', padding: '0.7rem 0.9rem', borderRadius: 'var(--r-ctrl)',
        background: s.isSpam ? 'var(--sev-high-dim)' : 'var(--sev-ok-dim)',
        border: `1px solid ${s.isSpam ? 'var(--sev-high)' : 'var(--sev-ok)'}`, fontSize: '0.86rem'
      }}>
        {s.isSpam ? (
          <>
            <strong style={{ color: 'var(--sev-high)' }}>Bị chặn là nội dung rác.</strong>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', color: 'var(--text-mid)' }}>
              {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div style={{ marginTop: '0.35rem', color: 'var(--text-mid)' }}>
              Trong hệ thống thật, câu này dừng ở đây. Các bước sau vẫn chạy để minh họa.
            </div>
          </>
        ) : (
          <strong style={{ color: 'var(--sev-ok)' }}>Qua bộ lọc — được đưa vào phân tích.</strong>
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
      <Label>Văn bản mô hình nhận ({m.inputMode === 'masked' ? 'đã che PII, giữ nguyên teencode' : 'đã chuẩn hóa'})</Label>
      <MaskedText text={m.modelInput} />
      <Label>{m.tokenCount} token · tối đa {m.maxLength}{m.truncated ? ' · đã cắt bớt' : ''}</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {m.tokens.map((tok, i) => {
          const special = /^<.*>$/.test(tok);
          const wordStart = tok.startsWith('▁');
          return (
            <span key={i} className="data-num" title={special ? 'token đặc biệt' : wordStart ? 'bắt đầu một từ' : 'mảnh ghép tiếp theo của từ'} style={{
              fontSize: '0.78rem', padding: '2px 7px', borderRadius: 4,
              marginLeft: wordStart && i > 1 ? '0.35rem' : 0,
              background: special ? 'transparent' : wordStart ? 'var(--accent-dim)' : 'var(--raised)',
              border: `1px ${special ? 'dashed' : 'solid'} ${special ? 'var(--border)' : wordStart ? 'var(--accent)' : 'var(--border)'}`,
              color: special ? 'var(--text-lo)' : 'var(--text-hi)'
            }}>
              {wordStart ? tok.slice(1) || '␣' : tok}
            </span>
          );
        })}
      </div>
      <Note>
        Viền xanh: token mở đầu một từ. Viền xám: mảnh ghép nối tiếp. Từ phổ biến trên mạng xã hội
        (kể cả teencode như "dth", "sốp", "rep") thường là MỘT token nguyên vẹn, vì bộ từ vựng học từ chính loại văn bản đó.
      </Note>
    </>
  );
}

function StepInference({ t }) {
  const m = t.model;
  if (!m.available) return <Unavailable reason={m.reason} />;
  const d = m.distributions;
  const group = (title, rows, tone, max = 5) => rows && rows.length > 0 && (
    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
      <Label>{title}</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.slice(0, max).map((r, i) => <ProbBar key={r.label} label={r.labelVi || r.label} p={r.p} winner={i === 0} tone={tone} />)}
      </div>
    </div>
  );
  return (
    <>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {group('Cảm xúc', d.sentiment, 'var(--sev-high)', 3)}
        {group('Danh mục (Level 1)', d.category, 'var(--accent)', 5)}
        {d.cause
          ? group('Nguyên nhân trong danh mục', d.cause, 'var(--accent)', 3)
          : (
            <div style={{ flex: '1 1 240px' }}>
              <Label>Nguyên nhân</Label>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-lo)' }}>Không phải khiếu nại nên không xét nguyên nhân.</p>
            </div>
          )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.9rem' }}>
        <Chip mono><Cpu size={11} /> {m.device}</Chip>
        <Chip mono><Zap size={11} /> tách token {m.timings.tokenizeMs} ms</Chip>
        <Chip mono><Zap size={11} /> suy luận {m.timings.inferenceMs} ms</Chip>
      </div>
      <Note>
        Nguyên nhân chỉ được chọn trong danh mục đã chọn, nên không có tổ hợp vô nghĩa như "Giao hàng → Trừ tiền hai lần".
        {m.multiLabel
          ? ` Danh mục dùng xác suất ĐỘC LẬP (sigmoid) nên các cột không cộng lại thành 100%: mọi danh mục vượt ngưỡng ${m.thresholds?.category ?? 0.5} đều được ghi nhận, nhờ vậy một câu nêu được nhiều vấn đề.`
          : ' Danh mục dùng softmax nên tổng bằng 100% và chỉ chọn được một danh mục.'}
        {' '}Mô hình hiện tự tin quá mức: đọc thứ hạng, đừng đọc như xác suất đã hiệu chỉnh.
      </Note>
    </>
  );
}

function StepExplain({ t }) {
  const m = t.model;
  const [task, setTask] = useState('category');
  if (!m.available) return <Unavailable reason={m.reason} />;
  if (!m.importance) {
    return <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-lo)' }}>Câu quá ngắn hoặc quá dài để đo mức ảnh hưởng từng từ.</p>;
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
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        {[['category', 'Vì sao ra danh mục này'], ['sentiment', 'Vì sao ra cảm xúc này']]
          .filter(([k]) => m.importance[k])
          .map(([k, label]) => (
            <button key={k} onClick={() => setTask(k)} style={{
              fontFamily: 'inherit', fontSize: '0.78rem', padding: '4px 11px', borderRadius: 99, cursor: 'pointer',
              background: task === k ? 'var(--accent-dim)' : 'transparent',
              border: `1px solid ${task === k ? 'var(--accent)' : 'var(--border)'}`,
              color: task === k ? 'var(--accent-hi)' : 'var(--text-mid)'
            }}>{label}</button>
          ))}
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--text-mid)', marginBottom: '0.5rem' }}>
        Nhãn được giải thích: <strong style={{ color: 'var(--text-hi)' }}>{imp.targetVi || imp.target}</strong>
        {' '}(xác suất {(imp.base * 100).toFixed(1)}%)
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.3rem', lineHeight: 2,
        background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)', padding: '0.7rem 0.8rem'
      }}>
        {m.words.map((w, i) => {
          const v = imp.values[i];
          const after = imp.probAfter?.[i];
          const a = v >= 0 ? Math.min(1, v / maxPos) : Math.min(1, -v / maxNeg);
          const bg = v >= 0 ? `rgba(240, 166, 75, ${0.1 + a * 0.62})` : `rgba(43, 163, 199, ${0.1 + a * 0.45})`;
          return (
            <span key={i} title={after != null ? `Bỏ từ này: xác suất còn ${(after * 100).toFixed(2)}%` : ''} style={{
              padding: '1px 6px', borderRadius: 4, fontSize: '0.92rem', color: 'var(--text-hi)',
              background: Math.abs(v) < 0.05 ? 'transparent' : bg, fontWeight: v > 0 && a > 0.5 ? 600 : 400
            }}>{w}</span>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.55rem', fontSize: '0.74rem', color: 'var(--text-lo)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(240,166,75,0.7)', marginRight: 5 }} />ủng hộ kết luận</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(43,163,199,0.55)', marginRight: 5 }} />kéo ngược kết luận</span>
        <span>rê chuột lên từng từ để xem xác suất khi bỏ từ đó</span>
      </div>

      {ranked.length > 0 && (
        <>
          <Label>Từ quyết định nhất</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxWidth: 560 }}>
            {ranked.map((x) => (
              <div key={x.w} style={{ display: 'grid', gridTemplateColumns: 'minmax(6rem, 9rem) minmax(0, 1fr) auto', gap: '0.6rem', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.86rem', color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{x.w}"</strong>
                <div style={{ height: 7, background: 'var(--raised)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(x.v / maxPos) * 100}%`, height: '100%', background: 'var(--sev-high)', borderRadius: 99 }} />
                </div>
                <span className="data-num" style={{ fontSize: '0.74rem', color: 'var(--text-lo)', whiteSpace: 'nowrap' }}>
                  bỏ đi → còn {x.after != null ? (x.after * 100).toFixed(1) : '—'}%
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
        Cách đọc trung thực: nếu từ quyết định KHÔNG mang nghĩa của nhãn (ví dụ "tuần", "mua" cho nhãn lỗi kỹ thuật),
        mô hình đang dựa vào lối tắt học từ dữ liệu huấn luyện sinh theo khung câu, chứ chưa hiểu đúng lý do.
        Đây là phát hiện cần báo cáo, và là lý do cần tập gán nhãn thật.
      </Note>
      <Note>
        Đo bằng {m.words.length} lần chạy lại mô hình ({m.timings.explainMs} ms), mỗi lần bỏ một từ. Độ mạnh tính theo mức
        giảm log-odds: khi mô hình đã chắc gần 100%, xác suất gần như không nhúc nhích dù bỏ từ quan trọng, còn log-odds thì có.
        Đây là phép thử trên chính câu này, không phải trọng số attention.
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
    ['Trust Layer (T1)', f.blocked ? 'Bị chặn — nội dung rác' : 'Qua bộ lọc']
  ];
  return (
    <>
      {expect && (
        <div style={{
          display: 'flex', gap: '0.7rem', alignItems: 'flex-start', padding: '0.75rem 0.9rem', marginBottom: '0.3rem',
          borderRadius: 'var(--r-ctrl)', background: expect.ok ? 'var(--sev-ok-dim)' : 'var(--sev-crit-dim)',
          border: `1px solid ${expect.ok ? 'var(--sev-ok)' : 'var(--sev-crit)'}`
        }}>
          {expect.ok
            ? <CheckCircle2 size={18} color="var(--sev-ok)" style={{ flexShrink: 0, marginTop: 1 }} />
            : <XCircle size={18} color="var(--sev-crit)" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
            <div style={{ color: 'var(--text-mid)' }}>Người đọc kỳ vọng: <strong style={{ color: 'var(--text-hi)' }}>{expect.label}</strong></div>
            <div style={{ color: expect.ok ? 'var(--sev-ok)' : 'var(--sev-crit)', fontWeight: 600 }}>
              {expect.ok
                ? `Hệ thống kết luận khớp kỳ vọng${expect.coverage ? ` (bắt được ${expect.coverage} vấn đề)` : ''}.`
                : expect.partial
                  ? `Hệ thống mới bắt được ${expect.coverage} vấn đề — thiếu phần còn lại, không che đi.`
                  : 'Hệ thống kết luận KHÔNG khớp kỳ vọng — đây là giới hạn thật của mô hình hiện tại, không che đi.'}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <Label>Bản ghi đi vào hệ thống · kết quả chính thức</Label>
          <p style={{ margin: '-0.15rem 0 0.5rem', fontSize: '0.76rem', color: 'var(--text-lo)', lineHeight: 1.55 }}>
            Do <strong style={{ color: 'var(--accent-hi)' }}>{f.source === 'visobert' ? 'ViSoBERT' : 'luật từ khóa'}</strong> sinh ra.
            Đây là bản ghi được lưu, được đếm vào chỉ số và có thể kích hoạt cảnh báo.
          </p>
          <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--r-ctrl)', overflow: 'hidden' }}>
            {rows.map(([k, v], i) => (
              <div key={k} style={{
                display: 'grid', gridTemplateColumns: '9.5rem minmax(0, 1fr)', gap: '0.6rem',
                padding: '0.5rem 0.8rem', fontSize: '0.84rem',
                background: i % 2 ? 'transparent' : 'var(--raised)'
              }}>
                <span style={{ color: 'var(--text-lo)' }}>{k}</span>
                <span style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          <Label>Khía cạnh phát hiện được ({aspects.length})</Label>
          {aspects.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-lo)' }}>Không có khía cạnh khiếu nại nào.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {aspects.map((a, i) => (
                <div key={a.category + i} style={{
                  display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap',
                  padding: '0.45rem 0.7rem', background: 'var(--raised)', borderRadius: 'var(--r-ctrl)',
                  borderLeft: `2px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'}`
                }}>
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-hi)' }}>
                    {a.categoryLabel} → {a.causeLabel || 'chưa rõ nguyên nhân'}
                    {a.causeUncertain && <span style={{ color: 'var(--sev-high)' }}> · nguyên nhân chưa chắc</span>}
                    {i === 0 && <span style={{ color: 'var(--text-lo)' }}> · chính</span>}
                  </span>
                  <span className="data-num" style={{ fontSize: '0.74rem', color: 'var(--text-lo)' }}>
                    {a.owner}{a.confidence != null ? ` · ${a.confidence}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Note>{f.note}</Note>
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <Label>Đối chiếu: luật từ khóa thấy gì</Label>
          <p style={{ margin: '-0.15rem 0 0.5rem', fontSize: '0.76rem', color: 'var(--text-lo)', lineHeight: 1.55 }}>
            {f.source === 'visobert'
              ? <>Nhánh đối chứng B1, <strong style={{ color: 'var(--sev-high)' }}>không dùng để ghi nhận</strong>. Để đây chỉ để thấy luật bỏ sót hay bắt được gì.</>
              : <>Hiện đây <strong style={{ color: 'var(--sev-high)' }}>đang là nguồn nhãn chính</strong>, vì dịch vụ ViSoBERT không sẵn sàng.</>}
          </p>
          {r.length === 0 ? (
            <TextBox>
              Không khớp từ khóa nào → nhánh luật kết luận <strong>không phải khiếu nại</strong>
              {f.source === 'visobert' && <>, nhưng kết luận này <strong>không thay thế</strong> bản ghi bên trái</>}.
            </TextBox>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {r.slice(0, 4).map((x, i) => (
                <div key={i} style={{ padding: '0.55rem 0.75rem', background: 'var(--raised)', borderRadius: 'var(--r-ctrl)' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-hi)' }}>{x.categoryLabel} → {x.causeLabel}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
                    {x.keywords.map((k) => <Chip key={k} mono>khớp "{k}"</Chip>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {t.model.available && (
            <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {/* Có đáp án kỳ vọng thì chấm RIÊNG từng nhánh. So danh mục chính
                  thôi là sai: câu ba vấn đề thì luật có thể bắt đủ 3/3 trong khi
                  mô hình chỉ bắt 2/3, dù danh mục chính của hai bên trùng nhau. */}
              {ruleScore && modelScore ? (
                <>
                  <Chip tone={ruleScore.ok ? 'ok' : 'danger'}>
                    {ruleScore.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} Luật: {ruleScore.text}
                  </Chip>
                  <Chip tone={modelScore.ok ? 'ok' : 'danger'}>
                    {modelScore.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} ViSoBERT: {modelScore.text}
                  </Chip>
                </>
              ) : (
                <Chip tone={f.agreeWithRules ? 'ok' : 'warn'}>
                  {f.agreeWithRules ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {f.agreeWithRules ? 'Luật và mô hình cùng kết luận danh mục chính' : 'Luật và mô hình kết luận khác nhau'}
                </Chip>
              )}
            </div>
          )}
          {t.model.available && (ruleCategories.length > 1 || aspects.length > 1) && (
            <Note>
              Câu này có nhiều vấn đề: luật khớp {ruleCategories.length} danh mục, mô hình phát hiện {aspects.length}.
              Mô hình dùng đầu ra đa nhãn (mỗi danh mục một xác suất độc lập) nên nêu được đồng thời nhiều vấn đề,
              còn bản ghi vẫn giữ một danh mục chính để đếm chỉ số.
            </Note>
          )}
          <Note>
            Luật chỉ nhận ra chuỗi ký tự đã có trong từ điển. Mô hình không tra từ điển nào — kết luận của nó đến từ
            ngữ cảnh của cả câu, như bước 7 cho thấy.
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
      const res = await axios.post('/analyze', { text: value });
      setTrace(res.data.trace);
      // Chỉ gắn đáp án kỳ vọng khi câu chạy đúng là câu của kịch bản, chưa bị sửa
      const sc = SCENARIOS.find((s) => s.id === scenarioId);
      setRanScenario(sc && sc.text === value ? sc : null);
      setRevealed(present ? 1 : STEPS.length);
      setPlaying(present);
    } catch (e) {
      setError(e.response?.data?.error || 'Không gọi được API phân tích. Kiểm tra máy chủ backend.');
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

  const modelReady = nlp?.canLabel;
  const done = trace && revealed >= STEPS.length;

  return (
    <div>
      {/* Khối nhập liệu và kịch bản */}
      <div className="glass-panel" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, maxWidth: '70ch' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Hành trình của một câu phản hồi</h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--text-mid)', lineHeight: 1.55 }}>
              Chọn một thử thách ngôn ngữ hoặc tự gõ câu bất kỳ. Mỗi bước bên dưới hiện dữ liệu thật của đúng câu đó
              khi đi qua hệ thống — từ chữ thô tới bản ghi có cấu trúc.
            </p>
          </div>
          <Chip tone={modelReady ? 'ok' : 'warn'} title={nlp?.reason || ''}>
            <Cpu size={12} />
            {modelReady
              ? `ViSoBERT sẵn sàng · train ${nlp.checkpoint?.trainedAt ? new Date(nlp.checkpoint.trainedAt).toLocaleDateString('vi-VN') : ''}`
              : 'ViSoBERT chưa sẵn sàng · bước 5–7 sẽ trống'}
          </Chip>
        </div>

        <Label>Thử thách ngôn ngữ</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.5rem' }}>
          {SCENARIOS.map((s) => {
            const active = scenarioId === s.id;
            return (
              <button key={s.id} title={s.text} onClick={() => { setScenarioId(s.id); setText(s.text); }} style={{
                textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: '0.6rem 0.75rem',
                borderRadius: 'var(--r-ctrl)', background: active ? 'var(--accent-dim)' : 'var(--raised)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)'
              }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: active ? 'var(--accent-hi)' : 'var(--text-hi)' }}>{s.label}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-lo)', marginTop: 2 }}>{s.proves}</div>
              </button>
            );
          })}
        </div>

        <Label>Câu phản hồi</Label>
        <textarea
          id="lab-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          style={{
            width: '100%', padding: '0.8rem 0.95rem', resize: 'vertical', boxSizing: 'border-box',
            background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 'var(--r-ctrl)',
            color: 'var(--text-hi)', fontSize: '0.95rem', fontFamily: 'inherit', lineHeight: 1.6
          }}
        />

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.8rem' }}>
          <button onClick={() => run(true)} disabled={loading || !text.trim()} style={primaryBtn(loading || !text.trim())}>
            {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={15} />}
            Trình diễn từng bước
          </button>
          <button onClick={() => run(false)} disabled={loading || !text.trim()} style={secondaryBtn}>
            <FastForward size={15} /> Chạy nhanh
          </button>
          {trace && !done && (
            <>
              <button onClick={() => setPlaying((p) => !p)} style={secondaryBtn}>
                {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Tạm dừng' : 'Tiếp tục'}
              </button>
              <button onClick={() => { setPlaying(false); setRevealed(STEPS.length); }} style={secondaryBtn}>
                Hiện tất cả
              </button>
            </>
          )}
          {trace && (
            <span className="data-num" style={{ fontSize: '0.76rem', color: 'var(--text-lo)' }}>
              toàn bộ pipeline: {trace.totalMs} ms
            </span>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: '0.9rem', padding: '0.75rem 0.9rem', fontSize: '0.84rem', borderRadius: 'var(--r-ctrl)',
            background: 'var(--sev-crit-dim)', border: '1px solid var(--sev-crit)', color: 'var(--sev-crit)'
          }}>
            <XCircle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />{error}
          </div>
        )}
      </div>

      {/* Thanh tiến trình tám bước */}
      <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', minWidth: 'max-content' }}>
          {STEPS.map((s, i) => {
            const on = trace && i < revealed;
            const ms = stepMs(trace, s.key);
            return (
              <button key={s.key} onClick={() => { if (on) stepRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.7rem',
                borderRadius: 'var(--r-ctrl)', fontFamily: 'inherit', cursor: on ? 'pointer' : 'default',
                background: on ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                color: on ? 'var(--accent-hi)' : 'var(--text-lo)', fontSize: '0.76rem',
                transition: 'background-color var(--dur-base) var(--ease), border-color var(--dur-base) var(--ease)'
              }}>
                <span className="data-num" style={{ fontWeight: 700 }}>{i + 1}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{s.title}</span>
                {on && ms != null && <span className="data-num" style={{ opacity: 0.75 }}>{ms}ms</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Các bước */}
      {!trace && !loading && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-lo)', fontSize: '0.88rem' }}>
          Bấm <strong style={{ color: 'var(--text-hi)' }}>Trình diễn từng bước</strong> để xem câu văn đi qua tám bước xử lý.
        </div>
      )}

      {trace && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {STEPS.map((s, i) => {
            const Body = STEP_BODY[s.key];
            const Icon = s.icon;
            const visible = i < revealed;
            const ms = stepMs(trace, s.key);
            return (
              <section
                key={s.key}
                ref={(el) => { stepRefs.current[i] = el; }}
                className="glass-panel"
                style={{
                  opacity: visible ? 1 : 0.38,
                  borderLeft: `3px solid ${visible ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'opacity 400ms var(--ease), border-color 400ms var(--ease)'
                }}
              >
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                  <span style={{
                    width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                    background: visible ? 'var(--accent-dim)' : 'var(--raised)',
                    border: `1px solid ${visible ? 'var(--accent)' : 'var(--border)'}`,
                    color: visible ? 'var(--accent-hi)' : 'var(--text-lo)'
                  }}>
                    <Icon size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-hi)' }}>
                        <span className="data-num" style={{ color: 'var(--text-lo)', marginRight: 6 }}>Bước {i + 1}</span>
                        {s.title}
                      </h4>
                      {visible && ms != null && <span className="data-num" style={{ fontSize: '0.74rem', color: 'var(--text-lo)' }}>{ms} ms</span>}
                    </div>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-lo)', lineHeight: 1.55 }}>{s.why}</p>
                    {visible && (
                      <div style={{ marginTop: '0.85rem', animation: 'fadeIn 400ms var(--ease)' }}>
                        <Body t={trace} scenario={ranScenario} />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function primaryBtn(disabled) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'inherit',
    background: 'var(--accent)', color: '#04171D', border: '1px solid var(--accent)',
    padding: '0.6rem 1.15rem', borderRadius: 'var(--r-ctrl)', fontWeight: 600, fontSize: '0.86rem',
    cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1
  };
}

const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'inherit',
  background: 'transparent', color: 'var(--text-hi)', border: '1px solid var(--border)',
  padding: '0.6rem 1rem', borderRadius: 'var(--r-ctrl)', fontWeight: 500, fontSize: '0.84rem', cursor: 'pointer'
};
