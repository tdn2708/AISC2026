import React from 'react';

/**
 * BỘ DỤNG CỤ CHO BÁO CÁO XUẤT BẢN
 * ==================================================================
 * Tách riêng khỏi Reports.jsx vì hai lý do.
 *
 * 1. Tệp PDF phải in ra GIỐNG HỆT NHAU bất kể người dùng đang ở chế độ
 *    sáng hay tối. Nên bảng màu ở đây viết thẳng bằng hex, không dùng
 *    biến CSS — đây là ngoại lệ có chủ đích so với phần còn lại của ứng
 *    dụng, không phải quên.
 *
 * 2. Các phép biến đổi dữ liệu (Pareto, đỉnh biểu đồ, điểm nhấn) là
 *    hàm thuần, kiểm thử được, và không nên nằm lẫn trong một component
 *    dài 570 dòng lo việc dựng PDF.
 */

/** Bảng màu bản in. Cùng giá trị với hệ thiết kế chính, chỉ khác là hằng số. */
export const REPORT = {
  canvas: '#06080A',
  surface: '#171F25',
  raised: '#232D35',
  border: '#35424B',
  hi: '#E9F0F3',
  mid: '#A6B6BF',
  lo: '#8496A0',
  accent: '#2BA3C7',
  accentHi: '#4FBEDD',
  accentDim: '#12313C',
  crit: '#FF6B5E',
  critDim: '#2E1A18',
  high: '#F0A64B',
  highDim: '#2C2317',
  ok: '#4BC48A',
  okDim: '#15291F'
};

export const fmtInt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n ?? 0));

/** Tiền tệ rút gọn: cấp quản lý đọc "250,4 triệu" nhanh hơn "250.366.547 đ". */
export const fmtVnd = (n) => {
  const v = Number(n) || 0;
  if (v <= 0) return null;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')} tỉ đồng`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} triệu đồng`;
  return `${fmtInt(v)} đồng`;
};

const MONO = "'IBM Plex Mono', ui-monospace, Consolas, monospace";

/**
 * Mũi tên so sánh kỳ trước.
 *
 * Điểm dễ sai nhất: với khiếu nại thì GIẢM mới là tốt. Một mũi tên đỏ đi
 * lên trên thẻ "tỉ lệ khiếu nại" và một mũi tên xanh đi lên trên thẻ
 * "phản hồi hợp lệ" phải cùng tồn tại, nên màu KHÔNG được suy ra từ dấu
 * của con số mà phải suy ra từ `lowerIsBetter` của chính chỉ số đó.
 */
export const DeltaPill = ({ delta, compact = false }) => {
  if (!delta || delta.rel == null || !isFinite(delta.rel)) {
    return (
      <span style={{ fontSize: '11px', color: REPORT.lo, fontFamily: MONO }}>
        chưa đủ dữ liệu kỳ trước
      </span>
    );
  }

  const pct = delta.rel * 100;
  const rising = pct > 0;
  const good = delta.lowerIsBetter ? !rising : rising;
  const flat = Math.abs(pct) < 0.5;

  const color = flat ? REPORT.lo : good ? REPORT.ok : REPORT.crit;
  const bg = flat ? REPORT.raised : good ? REPORT.okDim : REPORT.critDim;
  const arrow = flat ? '=' : rising ? '▲' : '▼';

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: compact ? '1px 6px' : '2px 8px', borderRadius: '99px',
        background: bg, color, fontFamily: MONO,
        fontSize: compact ? '10px' : '11px', fontWeight: 600, whiteSpace: 'nowrap'
      }}
    >
      {arrow} {Math.abs(pct).toFixed(1).replace('.', ',')}%
    </span>
  );
};

/** Chấm mức độ. Hình dạng cộng màu, không chỉ màu — người mù màu vẫn phân biệt được. */
export const SeverityDot = ({ level }) => {
  const map = {
    Critical: { c: REPORT.crit, t: 'Nghiêm trọng' },
    High: { c: REPORT.high, t: 'Cao' },
    Medium: { c: REPORT.accent, t: 'Theo dõi' },
    Low: { c: REPORT.ok, t: 'Thấp' }
  };
  const m = map[level] || map.Medium;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: m.c, flexShrink: 0 }} />
      <span style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: m.c
      }}>
        {m.t}
      </span>
    </span>
  );
};

/**
 * ĐIỂM NHẤN QUẢN TRỊ
 * ------------------------------------------------------------------
 * Bản cũ in nguyên văn cảnh báo thô: "(z = 14.36, p < 0.001)". Một giám
 * đốc vận hành không đọc z-score, và đoạn đó chiếm đúng chỗ của thứ họ
 * cần biết — bao nhiêu khách bị ảnh hưởng, mất bao nhiêu tiền, và phải
 * làm gì.
 *
 * Nhưng KHÔNG xoá hẳn phần thống kê. Toàn bộ giá trị của sản phẩm này
 * nằm ở chỗ mỗi cảnh báo đều chứng minh được; một báo cáo mang đi đàm
 * phán với nhà vận chuyển mà không có bằng chứng thì vô dụng. Nên thống
 * kê bị HẠ XUỐNG một dòng phụ chữ nhỏ ở cuối mỗi mục, chứ không biến
 * mất: quản lý đọc ba dòng đầu, phân tích viên có cái để đối chất.
 */
export function buildTakeaways(recommendations = [], limit = 4) {
  return recommendations.slice(0, limit).map((r) => {
    const a = r.alert || {};
    const st = r.evidence?.statistics || {};
    const rev = r.dataProfile?.revenue || {};

    const scope = [a.productName, r.dataProfile?.slots?.region]
      .filter(Boolean)
      .join(' · ');

    const problem = [a.categoryLabel, a.causeLabel].filter(Boolean).join(' — ');

    // Mức ảnh hưởng: ưu tiên tiền, vì đó là đại lượng cấp quản lý ra
    // quyết định trên đó. Không đối soát được thì lùi về số khách hàng.
    const impact = [];
    if (r.evidence?.affectedCustomers) {
      impact.push(`${fmtInt(r.evidence.affectedCustomers)} khách hàng bị ảnh hưởng`);
    }
    const money = rev.measurable ? fmtVnd(rev.extrapolatedVnd || rev.atRiskVnd) : null;
    if (money) {
      impact.push(`giá trị đơn liên quan ${money}${rev.isLowerBound ? ' trở lên' : ''}`);
    }
    if (st.currentRate != null && st.baselineRate != null) {
      impact.push(
        `tỉ lệ tăng từ ${(st.baselineRate * 100).toFixed(1).replace('.', ',')}% ` +
        `lên ${(st.currentRate * 100).toFixed(1).replace('.', ',')}%`
      );
    }

    // Hành động: lấy việc xếp hạng cao nhất mà KHÔNG phải việc thu thập
    // thêm dữ liệu — trong một bản tóm tắt điều hành, "bổ sung trường dữ
    // liệu" không phải thứ nên đứng đầu trang.
    const step =
      (r.steps || []).find((s) => !s.isInstrumentation) || (r.steps || [])[0] || null;

    const evidence = [
      `${fmtInt(r.evidence?.evidenceCount)} phản hồi hợp lệ`,
      st.sampleBaseline ? `nền ${fmtInt(st.sampleBaseline)} phản hồi` : null,
      st.z != null ? `z = ${String(st.z).replace('.', ',')}` : null,
      st.pValueDisplay ? st.pValueDisplay.replace('.', ',') : null,
      r.evidence?.excludedByTrust ? `đã loại ${fmtInt(r.evidence.excludedByTrust)} phản hồi không đạt ngưỡng tin cậy` : null
    ].filter(Boolean).join(' · ');

    return {
      id: r.alertId,
      severity: a.severity || 'Medium',
      problem,
      scope,
      impact,
      action: step ? step.text : null,
      approval: step?.requiresApproval ? step.approvalRole : null,
      owner: r.owner,
      sla: a.sla,
      evidence
    };
  });
}

/**
 * PARETO
 * ------------------------------------------------------------------
 * Donut buộc mắt so sánh góc, việc mà mắt người làm rất kém, và với bảy
 * hạng mục thì phải đối chiếu qua lại với chú giải. Pareto trả lời thẳng
 * câu hỏi mà cấp quản lý thực sự hỏi: "xử lý mấy nhóm đầu là giải quyết
 * được bao nhiêu phần trăm vấn đề".
 *
 * Đường luỹ kế cộng mốc 80% cho biết ranh giới ưu tiên. Các nhóm nằm
 * bên trái chỗ đường cắt mốc 80% là các nhóm đáng dồn nguồn lực.
 */
export function buildPareto(categories = []) {
  // Nhóm "Khác" bị LOẠI khỏi bảng xếp hạng ưu tiên, có chủ đích.
  //
  // Pareto tồn tại để trả lời "nên dồn nguồn lực vào đâu". "Khác" không
  // phải một việc có thể giao cho ai, nên để nó đứng đầu bảng thì đường
  // luỹ kế và mốc 80% đều mất ý nghĩa: báo cáo sẽ khuyên doanh nghiệp ưu
  // tiên xử lý một cái tên không chỉ ra vấn đề gì.
  //
  // Nhưng cũng không giấu nó đi. Kích thước của nhóm "Khác" chính là
  // thước đo taxonomy đang phân loại sót bao nhiêu, và đó là một phát
  // hiện riêng — được trả về ở `unclassified` để panel nói rõ.
  const all = [...categories].filter((c) => (c?.value ?? 0) > 0);
  const otherRow = all.find((c) => c.key === 'Other' || c.name === 'Khác');
  const grandTotal = all.reduce((s, r) => s + r.value, 0) || 1;

  const rows = all
    .filter((c) => c !== otherRow)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  let run = 0;

  const data = rows.map((r) => {
    run += r.value;
    return {
      name: r.name,
      short: r.name.length > 14 ? r.name.slice(0, 13) + '…' : r.name,
      value: r.value,
      share: (r.value / total) * 100,
      cumulative: Number(((run / total) * 100).toFixed(1))
    };
  });

  // Số nhóm đầu tiên gánh tới 80% khối lượng khiếu nại
  const vitalFew = data.findIndex((d) => d.cumulative >= 80);

  return {
    data,
    total,
    vitalFew: vitalFew === -1 ? data.length : vitalFew + 1,
    unclassified: otherRow
      ? { value: otherRow.value, share: Number(((otherRow.value / grandTotal) * 100).toFixed(1)) }
      : null
  };
}

/**
 * Tìm đỉnh khiếu nại trong chuỗi thời gian, để neo một chú thích ngay
 * trên biểu đồ. Một cái đỉnh không được giải thích thì người đọc phải tự
 * đoán, và thường đoán sai.
 */
export function findPeak(trend = []) {
  if (!Array.isArray(trend) || trend.length === 0) return null;
  let best = null;
  for (const d of trend) {
    const v = Number(d?.complaints ?? 0);
    if (!best || v > best.value) best = { name: d.name, value: v };
  }
  if (!best || best.value <= 0) return null;

  const avg = trend.reduce((s, d) => s + Number(d?.complaints ?? 0), 0) / trend.length;
  // Chỉ gọi là đỉnh khi nó thật sự nhô lên so với phần còn lại. Neo chú
  // thích vào một đường phẳng thì chú thích đó nói dối.
  return best.value >= avg * 1.3 ? { ...best, avg } : null;
}
