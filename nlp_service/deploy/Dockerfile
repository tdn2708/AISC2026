# Dịch vụ ViSoBERT cho Hugging Face Spaces (Docker, CPU).
# Gói này do deploy/push_space.py dựng: chỉ gồm mã suy luận + checkpoint tinh
# chỉnh, không mang trọng số gốc (xem service.py: /embed đóng, /predict chạy).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HF_HOME=/tmp/hf \
    VISOBERT_HOST=0.0.0.0 \
    VISOBERT_PORT=7860 \
    VISOBERT_CHECKPOINT=/app/checkpoints/visobert-absa \
    VISOBERT_BASE=/app/no-base-weights

# Spaces chạy container bằng người dùng uid 1000
RUN useradd -m -u 1000 user
WORKDIR /app

COPY requirements.txt .
# torch bản CPU cài riêng để khỏi kéo theo CUDA (~2 GB)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY --chown=user . .
USER user

EXPOSE 7860
CMD ["python", "service.py"]
