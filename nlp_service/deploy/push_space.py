"""
ĐẨY DỊCH VỤ VISOBERT LÊN HUGGING FACE SPACES
==================================================================
Chạy:  .venv/Scripts/python.exe deploy/push_space.py

Đọc từ nlp_service/.env (tệp này đã nằm trong .gitignore):
  HF_TOKEN          token Hugging Face quyền "write"
  HF_SPACE          tên Space, dạng <tài khoản>/<tên>  (vd. tdn2708/customer-radar-visobert)
  VISOBERT_API_KEY  khóa backend dùng để gọi dịch vụ; để trống thì script tự sinh
  HF_SPACE_PRIVATE  1 = Space riêng tư (mặc định 0 = công khai)

Việc script làm:
  1. Dựng thư mục tạm gồm mã suy luận + checkpoint tinh chỉnh (không trọng số gốc)
  2. Tạo Space (Docker, CPU miễn phí, RIÊNG TƯ theo mặc định) nếu chưa có
  3. Đặt VISOBERT_API_KEY làm secret của Space, tải mọi tệp lên
  4. In ra URL dịch vụ và khóa để đặt vào biến môi trường của Render

HAI CHẾ ĐỘ
  Công khai (mặc định): ai cũng mở được trang Space và TẢI ĐƯỢC trọng số tinh
    chỉnh trong tab Files; suy luận được khóa bằng VISOBERT_API_KEY.
  Riêng tư (HF_SPACE_PRIVATE=1): trọng số không lộ ra. Proxy của Hugging Face
    tự chặn mọi request thiếu token HF, nên backend dùng TOKEN HF (quyền đọc)
    làm VISOBERT_API_KEY và Space không đặt khóa riêng.
"""

import secrets
import shutil
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from huggingface_hub import HfApi

HERE = Path(__file__).resolve().parent
SERVICE = HERE.parent
CHECKPOINT = SERVICE / "checkpoints" / "visobert-absa"
ENV_FILE = SERVICE / ".env"


def read_env():
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main():
    env = read_env()
    token, space = env.get("HF_TOKEN"), env.get("HF_SPACE")
    if not token or not space:
        sys.exit(f"Thiếu HF_TOKEN hoặc HF_SPACE trong {ENV_FILE}")
    if not (CHECKPOINT / "meta.json").exists():
        sys.exit(f"Không thấy checkpoint tại {CHECKPOINT}")

    private = env.get("HF_SPACE_PRIVATE", "0") == "1"
    api_key = env.get("VISOBERT_API_KEY") or secrets.token_urlsafe(32)
    if not private and not env.get("VISOBERT_API_KEY"):
        with ENV_FILE.open("a", encoding="utf-8") as f:
            f.write(f"\nVISOBERT_API_KEY={api_key}\n")
        print(f"Đã sinh VISOBERT_API_KEY mới và lưu vào {ENV_FILE}")

    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        shutil.copy(SERVICE / "service.py", stage)
        shutil.copy(SERVICE / "visobert_model.py", stage)
        shutil.copy(HERE / "Dockerfile", stage)
        shutil.copy(HERE / "requirements.txt", stage)
        shutil.copy(HERE / "space_README.md", stage / "README.md")
        shutil.copytree(CHECKPOINT, stage / "checkpoints" / "visobert-absa")

        api = HfApi(token=token)
        print(f"Tài khoản: {api.whoami()['name']}")
        api.create_repo(space, repo_type="space", space_sdk="docker", private=private, exist_ok=True)
        if not private:
            api.add_space_secret(space, "VISOBERT_API_KEY", api_key)
        print(f"Chế độ: {'riêng tư' if private else 'công khai'}")
        print("Đang tải lên (checkpoint ~373 MB, vài phút)...")
        api.upload_folder(
            repo_id=space, repo_type="space", folder_path=str(stage),
            commit_message="Triển khai dịch vụ ViSoBERT cho Customer Radar",
        )

    owner, name = space.split("/", 1)
    url = f"https://{owner.lower()}-{name.lower().replace('_', '-').replace('.', '-')}.hf.space"
    print("\nXONG. Space sẽ tự build Docker (~5-10 phút lần đầu).")
    print(f"  Trang Space : https://huggingface.co/spaces/{space}")
    print(f"  URL dịch vụ : {url}")
    print("\nĐặt trên Render (Environment) của backend:")
    print(f"  VISOBERT_URL={url}")
    print("  VISOBERT_API_KEY=" + ("<token HF quyền đọc>" if private else "<giá trị VISOBERT_API_KEY trong nlp_service/.env>"))


if __name__ == "__main__":
    main()
