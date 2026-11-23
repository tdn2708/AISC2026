"""Tải bản ghi chat (live_chat replay) của livestream YouTube đã kết thúc và chuyển thành CSV.
Cách dùng: python yt_chat.py OUT_DIR VIDEO_ID [VIDEO_ID ...]
Không cần đăng nhập. Tên người bình luận được băm (SHA-256 + muối), SĐT/email bị che."""
import sys, json, os, re, hashlib, csv, datetime as dt
import yt_dlp

SALT = os.environ.get("PII_SALT", "aisc2026-live")
PHONE = re.compile(r"(?:\+?84|0)(?:[\s.\-]?\d){8,10}")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")

def h(x):
    return hashlib.sha256((SALT + (x or "")).encode()).hexdigest()[:12]

def mask(t):
    has_phone = bool(PHONE.search(t))
    return EMAIL.sub("[EMAIL]", PHONE.sub("[SĐT]", t)), has_phone

def runs_text(msg):
    out = []
    for r in msg.get("runs", []):
        if "text" in r: out.append(r["text"])
        elif "emoji" in r:
            e = r["emoji"]; out.append(e.get("emojiId") if not e.get("isCustomEmoji") else (e.get("shortcuts") or [""])[0])
    return "".join(out)

def parse(path, meta):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try: d = json.loads(line)
            except Exception: continue
            act = d.get("replayChatItemAction", {})
            off = act.get("videoOffsetTimeMsec")
            for a in act.get("actions", []):
                it = a.get("addChatItemAction", {}).get("item", {})
                for kind, key in (("text", "liveChatTextMessageRenderer"), ("superchat", "liveChatPaidMessageRenderer")):
                    r = it.get(key)
                    if not r: continue
                    text = runs_text(r.get("message", {})).strip()
                    if not text: continue
                    text, hp = mask(text)
                    ts = int(r.get("timestampUsec", 0)) / 1e6
                    rows.append({
                        "platform": "youtube", "session_id": meta["id"], "msg_id": r.get("id"),
                        "ts_utc": dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat() if ts else "",
                        "offset_sec": round(int(off) / 1000, 1) if off else "",
                        "author_hash": h(r.get("authorExternalChannelId")),
                        "msg_type": kind, "text": text, "has_phone": hp,
                    })
    return rows

def main():
    out, ids = sys.argv[1], sys.argv[2:]
    sess, allrows = [], []
    for vid in ids:
        url = f"https://www.youtube.com/watch?v={vid}"
        opts = {"skip_download": True, "writesubtitles": True, "subtitleslangs": ["live_chat"],
                "outtmpl": os.path.join(out, "%(id)s.%(ext)s"), "quiet": True, "no_warnings": True}
        try:
            with yt_dlp.YoutubeDL(opts) as y:
                info = y.extract_info(url, download=True)
        except Exception as e:
            print(vid, "LỖI", str(e)[:120]); continue
        p = os.path.join(out, f"{vid}.live_chat.json")
        if not os.path.exists(p):
            print(vid, "không có bản ghi chat"); continue
        rows = parse(p, info); allrows += rows
        sess.append({"platform": "youtube", "session_id": vid, "url": url, "channel": info.get("channel"),
                     "title": info.get("title"), "start_utc": dt.datetime.fromtimestamp(info["release_timestamp"], dt.timezone.utc).isoformat() if info.get("release_timestamp") else "",
                     "duration_sec": info.get("duration"), "view_count_final": info.get("view_count"),
                     "like_count_final": info.get("like_count"), "n_comments": len(rows),
                     "collected_at": dt.datetime.now(dt.timezone.utc).isoformat(), "method": "yt-dlp live_chat replay"})
        print(vid, len(rows), "bình luận |", info.get("title", "")[:60])
    with open(os.path.join(out, "yt_comments.csv"), "w", newline="", encoding="utf-8-sig") as f:
        if allrows:
            w = csv.DictWriter(f, fieldnames=list(allrows[0])); w.writeheader(); w.writerows(allrows)
    with open(os.path.join(out, "yt_sessions.csv"), "w", newline="", encoding="utf-8-sig") as f:
        if sess:
            w = csv.DictWriter(f, fieldnames=list(sess[0])); w.writeheader(); w.writerows(sess)

if __name__ == "__main__":
    main()
