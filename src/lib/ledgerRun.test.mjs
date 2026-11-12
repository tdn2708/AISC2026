// Test thuần cho phép trừ chạy. Chạy: node --test src/lib/ledgerRun.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLedger, buildLedgerRun, ledgerStateAt, rollerPositions, digitCount, RUN_PHASES } from './ledgerRun.js';

// Bộ số demo (kho mô phỏng) và kho thật, theo mục 7 của bản bàn giao
const DEMO_FLAT = { raw: 15000, spam: 562, inauthentic: 69, pendingNotCounted: 12, pendingCounted: 0, aged: 150, counted: 14207 };
const REAL_FLAT = { raw: 4572, spam: 23, inauthentic: 4, pendingNotCounted: 0, pendingCounted: 0, aged: 43, counted: 4502 };

// Cùng số nhưng ở dạng /trust/health trả về
const asApi = (f) => ({
  rawCollected: f.raw,
  spamRemoved: { count: f.spam, pct: 0 },
  inauthenticFlagged: { count: f.inauthentic, pct: 0, duplicateClusters: 0 },
  pendingReview: { count: f.pendingNotCounted + f.pendingCounted, pct: 0 },
  validForAnalysis: f.counted + f.aged,
  countedForMetrics: f.counted,
  ledger: { spam: f.spam, inauthentic: f.inauthentic, pendingNotCounted: f.pendingNotCounted, pendingCounted: f.pendingCounted, aged: f.aged, counted: f.counted, removedButCounted: 0 }
});

for (const [name, flat] of [['demo', DEMO_FLAT], ['kho thật', REAL_FLAT]]) {
  for (const [shape, input] of [['phẳng', flat], ['API', asApi(flat)]]) {
    test(`${name} (${shape}): phép trừ khớp, bước cuối bằng số được tính`, () => {
      const run = buildLedgerRun(input);
      assert.equal(run.matches, true);
      assert.equal(run.diff, 0);
      assert.equal(run.raw, flat.raw);
      assert.equal(run.counted, flat.counted);
      assert.equal(run.arithmetic, flat.counted);
      const last = run.steps.at(-1);
      assert.equal(last.key, 'counted');
      assert.equal(last.after, flat.counted);
      // Từng bước: after = after bước trước - value
      for (let i = 1; i < run.steps.length - 1; i += 1) {
        assert.equal(run.steps[i].after, run.steps[i - 1].after - run.steps[i].value);
        assert.equal(run.steps[i].sign, '−');
      }
      // Bước trừ cuối cùng rơi đúng số được tính
      assert.equal(run.steps.at(-2).after, flat.counted);
    });

    test(`${name} (${shape}): trạng thái theo tiến độ`, () => {
      const run = buildLedgerRun(input);
      const s0 = ledgerStateAt(run, 0);
      assert.equal(s0.shown, flat.raw);
      assert.equal(s0.reveal.raw, 0);
      const s1 = ledgerStateAt(run, 1);
      assert.equal(s1.remaining, flat.counted);
      assert.equal(s1.shown, flat.counted);
      assert.equal(s1.done, true);
      for (const v of Object.values(s1.reveal)) assert.equal(v, 1);
      // Số còn lại chỉ giảm (khớp thì không bao giờ nảy lên), không vượt khỏi [counted, raw]
      let prev = Infinity;
      for (let i = 0; i <= 400; i += 1) {
        const s = ledgerStateAt(run, i / 400);
        assert.ok(s.remaining <= prev + 1e-9, `tăng ở p=${i / 400}`);
        assert.ok(s.remaining >= flat.counted - 1e-9 && s.remaining <= flat.raw + 1e-9);
        prev = s.remaining;
      }
      // Hết pha trừ thì đã ở đúng số được tính
      assert.equal(ledgerStateAt(run, RUN_PHASES.subEnd).shown, flat.counted);
    });
  }
}

test('demo: đủ 4 dòng trừ, nhãn chờ duyệt như sổ hiện có', () => {
  const run = buildLedgerRun(DEMO_FLAT);
  assert.deepEqual(run.steps.map((s) => s.key), ['raw', 'spam', 'inauthentic', 'pending', 'aged', 'counted']);
  assert.equal(run.steps[3].label, 'Chờ người duyệt');
  assert.equal(run.removed, 562 + 69 + 12 + 150);
  const withCounted = buildLedgerRun({ ...DEMO_FLAT, pendingCounted: 5 });
  assert.equal(withCounted.steps[3].label, 'Chờ duyệt, chưa tính');
});

test('kho thật: bỏ dòng chờ duyệt bằng 0, giữ rác và nghi ảo', () => {
  const run = buildLedgerRun(REAL_FLAT);
  assert.deepEqual(run.steps.map((s) => s.key), ['raw', 'spam', 'inauthentic', 'aged', 'counted']);
  const zero = buildLedgerRun({ raw: 10, spam: 0, inauthentic: 0, aged: 0, counted: 10 });
  assert.deepEqual(zero.steps.map((s) => s.key), ['raw', 'spam', 'inauthentic', 'counted']);
});

test('dữ liệu lệch: không bịa, số cuối vẫn là số API, đánh dấu lệch', () => {
  const run = buildLedgerRun({ ...DEMO_FLAT, counted: 14204 });
  assert.equal(run.matches, false);
  assert.equal(run.diff, 3);
  assert.equal(run.arithmetic, 14207);
  // Các dòng giữ nguyên số thật
  assert.deepEqual(run.steps.slice(1, -1).map((s) => s.value), [562, 69, 12, 150]);
  assert.equal(run.steps.at(-1).after, 14204);
  assert.equal(ledgerStateAt(run, 1).shown, 14204);
});

test('máy chủ cũ không có ledger: suy như sổ cũ', () => {
  const api = asApi(DEMO_FLAT);
  delete api.ledger;
  const l = normalizeLedger(api);
  assert.equal(l.aged, 150);
  assert.equal(l.pending, 12);
  assert.equal(buildLedgerRun(api).matches, true);
});

test('đầu vào rỗng', () => {
  assert.equal(buildLedgerRun(null), null);
  assert.equal(buildLedgerRun({}), null);
  assert.equal(ledgerStateAt(null, 0.5), null);
});

test('trục chữ số: số nguyên ra đúng chữ số, cột đầu vô nghĩa thì ẩn', () => {
  assert.deepEqual(rollerPositions(14207, 5), { positions: [1, 4, 2, 0, 7], visible: [true, true, true, true, true] });
  assert.deepEqual(rollerPositions(4502, 5).visible, [false, true, true, true, true]);
  assert.deepEqual(rollerPositions(4502, 5).positions, [0, 4, 5, 0, 2]);
  // Công tơ: 14209,5 thì hàng chục đang nhích nửa đường sang 1
  const r = rollerPositions(14209.5, 5).positions;
  assert.equal(r[4], 9.5);
  assert.equal(r[3], 0.5);
  assert.equal(r[2], 2);
  assert.equal(digitCount(15000), 5);
  assert.equal(digitCount(0), 1);
});
