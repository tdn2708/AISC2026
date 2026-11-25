#!/usr/bin/env node
/**
 * Sinh hướng dẫn gán nhãn L3 cho người (nlp_service/data/root_guide_gia_dung.md) từ taxonomy.js.
 * Bảng mã, ranh giới và ví dụ lấy thẳng từ ROOT_PACKS nên không bao giờ lệch với code.
 *   node scripts/make_root_guide.js
 */
const fs = require('fs');
const path = require('path');
const taxonomy = require('../services/taxonomy');

const PACK = 'gia_dung';
const roots = taxonomy.flatRootPacks()[PACK];
const out = path.join(__dirname, '..', '..', 'nlp_service', 'data', 'root_guide_gia_dung.md');

const groups = [];
for (const r of roots) {
  const id = `${r.parentCategory}.${r.parentCause}`;
  let g = groups.find((x) => x.id === id);
  if (!g) groups.push((g = { id, cat: r.parentCategory, cause: r.parentCause, items: [] }));
  g.items.push(r);
}

const lines = [];
const p = (s = '') => lines.push(s);

p(`# Hướng dẫn gán nguyên nhân gốc rễ cấp 3, gói \`${PACK}\` (bản 2)`);
p();
p('File này sinh từ `backend/services/taxonomy.js` bằng `node scripts/make_root_guide.js`. Sửa mã thì sửa taxonomy.js rồi chạy lại, không sửa tay file này.');
p();
p('## 1. Ba trường cần gán');
p();
p('| Trường | Gán thế nào | Dùng để làm gì |');
p('|---|---|---|');
p('| Kiểu lỗi (`rootCauses`) | Chọn 0, 1 hoặc nhiều mã trong bảng mục 4 | Biết hỏng cái gì: nguồn, nhiệt, nút, rò nước... |');
p('| Lúc phát hiện (`failureTiming`) | Chọn đúng 1 trong 4 mã ở mục 3, chỉ khi đã có ít nhất 1 mã kiểu lỗi | Tách lỗi lô hàng (hỏng ngay) với lỗi độ bền (hỏng sau vài tuần) |');
p('| Khâu chịu trách nhiệm (`owner`) | Không gán, máy tự suy từ mã kiểu lỗi | Biết việc này giao cho ai: nhà máy, kho vận, gian hàng, bảo hành |');
p();
p('Khâu của từng mã:');
p();
for (const [k, v] of Object.entries(taxonomy.ROOT_OWNERS)) p(`- \`${k}\`: ${v}`);
p();
p('## 2. Cây quyết định cho mỗi câu');
p();
p('1. Câu có chê điều gì không? Khen thuần, hỏi, hay nhận xét chung thì nhóm vấn đề là Không nêu vấn đề, kiểu lỗi để trống, dừng.');
p('2. Chọn nhóm vấn đề (L1) và nguyên nhân (L2) như cũ.');
p('3. L2 đó có mã cấp 3 trong bảng mục 4 không? Không có (giao chậm, thái độ nhân viên, giá cao...) thì để trống kiểu lỗi, dừng. Không ép vào mã gần giống.');
p('4. Câu nêu triệu chứng gì? Chọn mã của triệu chứng. Nêu hai lỗi khác nhau thì chọn cả hai.');
p('5. Chê lỗi máy mà không nói lỗi gì ("máy lỗi", "hàng hỏng") thì chọn `OTHER_DEFECT`. Có nêu triệu chứng thì không dùng `OTHER_DEFECT`.');
p('6. Chọn lúc phát hiện theo mục 3. Câu không nói thì `UNKNOWN`, không đoán.');
p();
p('Quy tắc chung:');
p();
p('- Chỉ gán theo chữ trong câu, không theo hiểu biết riêng về sản phẩm.');
p('- Câu chê nhẹ vẫn là chê: "ngon nhưng hơi ồn" thì chọn `NOISE`.');
p('- Câu phủ định lỗi là khen: "không hề móp, không mùi nhựa" thì để trống.');
p('- Mỉa mai: gán theo ý thật. "5 sao cho shop nhớ gửi thiếu nắp cối" là `MISSING_PART`.');
p('- Phân vân giữa hai mã: chọn mã khách nói tới trước, ghi chú câu đó để họp chốt.');
p();
p('## 3. Lúc phát hiện lỗi');
p();
p('| Mã | Nghĩa | Ví dụ |');
p('|---|---|---|');
const TIMING_EX = {
  ON_ARRIVAL: '"Mở hộp cắm thử không lên đèn"',
  EARLY: '"Dùng được 3 hôm thì nút cảm ứng liệt"',
  LATER: '"Xài hơn 2 tháng thì bong chống dính"',
  UNKNOWN: '"Nồi chiên nóng yếu, thất vọng"'
};
for (const [k, v] of Object.entries(taxonomy.FAILURE_TIMINGS)) {
  p(`| \`${k}\` | ${v.label}. ${v.description || ''} | ${TIMING_EX[k] || ''} |`);
}
p();
p('Lúc phát hiện thay cho mã `EARLY_FAIL` của bản 1. Bản 1 trộn "hỏng gì" với "hỏng lúc nào" nên hai người gán hay lệch nhau; bản 2 tách thành hai trường.');
p();
p(`## 4. Bảng ${roots.length} mã kiểu lỗi`);
p();
let i = 0;
for (const g of groups) {
  p(`### ${taxonomy.categoryLabel(g.cat)}, ${taxonomy.causeLabel ? taxonomy.causeLabel(g.cat, g.cause) || g.cause : g.cause} (\`${g.id}\`, ${g.items.length} mã)`);
  p();
  for (const r of g.items) {
    i += 1;
    p(`#### ${i}. \`${r.key}\`: ${r.label}`);
    p();
    p(`- Là gì: ${r.description}`);
    if (r.notThis) p(`- Không phải: ${r.notThis}`);
    p(`- Khâu: \`${r.owner}\`${r.component ? `, bộ phận: ${r.component}` : ''}`);
    for (const ex of r.examples || []) p(`- Ví dụ: "${ex}"`);
    p();
  }
}
p('## 5. Đo độ ổn định (kappa)');
p();
p('- Web chỉ lưu một nhãn người cho mỗi câu, nên lượt gán đôi làm bằng bảng tính: xuất 150 câu, hai người gán độc lập, không bàn trước.');
p('- Tính Cohen kappa riêng cho: L2, từng mã kiểu lỗi (có hay không), và lúc phát hiện. Mục tiêu: L2 từ 0,70, kiểu lỗi từ 0,60, lúc phát hiện từ 0,60.');
p('- Mã nào kappa dưới 0,40 thì xem lại ranh giới "Không phải" của mã đó trong taxonomy.js trước khi gán tiếp.');
p('- Câu bất đồng: họp chốt một nhãn cuối rồi mới nhập vào web (tab Bộ chuẩn gia dụng).');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`Đã ghi ${out} (${roots.length} mã, ${lines.length} dòng)`);
