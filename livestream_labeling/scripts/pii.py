"""Che thông tin cá nhân trong nội dung bình luận (áp dụng sau khi đã tính clean_id)."""
import re

BANK = re.compile(r"\b(stk|ctk|số tài khoản|so tai khoan|chuyển khoản qua|chuyen khoan qua)\b", re.I)
DIGITS = re.compile(r"(?<!\d)(?:\+?84|0)?(?:[\s.\-]?\d){8,11}(?!\d)")
MENTION = re.compile(r"@(?!\[)[^\s@,.!?:;]+(?:\s+[A-ZÀ-Ỹ][^\s@,.!?:;]*){0,3}")
# Địa chỉ nhà (thêm 19/11/2026 sau soát độc lập đợt 5): >=3 dấu hiệu địa chỉ, hoặc >=2 dấu hiệu + chữ số,
# hoặc "địa chỉ" + số -> che cả câu (thường kèm tên người). Đã thử trên file sạch: 7 câu, không che nhầm.
ADDR = re.compile(r"(số nhà|so nha|\bsn\s*\d|hẻm|\bhem\s*\d|ngõ\s*\d|ngách|khu phố|khu pho|\bkp\b|\bấp\b|\bxã\b|phường|"
                  r"thị trấn|\btổ\s*\d|đường|\bq\.?\s*\d{1,2}\b|quận|\btp\b|thành phố|tỉnh|huyện)", re.I)
DIACHI = re.compile(r"(địa chỉ|dia chi|đ/c)\s*:?\s*\d", re.I)


def is_address(t):
    keys = {m.group(0).lower()[:4] for m in ADDR.finditer(t)}
    return bool(DIACHI.search(t)) or len(keys) >= 3 or (len(keys) >= 2 and re.search(r"\d", t) is not None)


def mask_pii(t):
    t = str(t)
    if BANK.search(t) and (re.search(r"\d{6,}", t) or re.search(r"(là|la|tên|ten)\s+[A-ZÀ-Ỹ]\S+\s+[A-ZÀ-Ỹ]", t)):
        return "[THÔNG TIN CHUYỂN KHOẢN ĐÃ CHE]"
    if is_address(t):
        return "[ĐỊA CHỈ ĐÃ CHE]"
    t = DIGITS.sub(lambda m: " [SĐT]" if m.group(0)[:1].isspace() else "[SĐT]", t)
    t = MENTION.sub("@[USER]", t)
    return t
