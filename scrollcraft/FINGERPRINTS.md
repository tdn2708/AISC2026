# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| gioi-thieu (Customer Radar, `/`, 2026-11-12) | Sổ đối chiếu (mới: một phép trừ là xương sống, cảnh cắt cứng theo nền, một cảnh ghim dài + tối đa một rãnh, cấm video/drift/pointer devices/bộ đếm đếm lên) | tối giản, không cố định: logo + một liên kết "Đăng nhập" (đã đăng nhập: "Vào ứng dụng"), cuộn đi cùng trang | split: chữ trái, ba lớp ảnh chụp app thật bên phải (Bảng số liệu lùi xa, Tổng quan giữa, tờ sổ cắt ra nhấc lên trước), parallax lệch nhịp | parallax(flow) > in(flow, im lặng) > pin 3,8 vh (đỉnh) > reveal(flow) > pan 2,4 vh > in(flow) > tĩnh; 7 nhịp, khoảng 10,3 vh | chốt sổ: gạch đôi, dòng tổng "Được tính vào chỉ số" bằng đúng số đỉnh dừng, một câu, một nút; đứng yên | phép trừ chạy theo thanh cuộn bằng số thật từ API: sổ đối chiếu ghim, mỗi nấc cuộn trừ một dòng, cột chữ số trượt như công tơ, dừng đúng số được tính, kéo ngược thì cộng lại | ảnh chụp app thật + ảnh nhóm, hệ token "Sổ kiểm chứng" màu B, sáng và tối | Vite :5299 (route `/` của app React) |


---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- Ngữ pháp "Sổ đối chiếu" (một phép trừ làm xương sống, cảnh cắt cứng theo nền, chỉ một cảnh ghim dài).
- Màn chốt "chốt sổ": gạch đôi kế toán + dòng tổng nhắc lại số đỉnh dừng + một nút.
- Chữ ký: sổ trừ theo thanh cuộn bằng số thật (`LedgerRun mode="scroll"`).
- Hero split với ba lớp ảnh chụp app, lớp trước là một phần tử cắt ra từ chính màn giữa.
- Dải 7 nhịp, khoảng 10,3 vh.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
