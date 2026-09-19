# Khởi động đầy đủ bản demo Customer Radar + ViSoBERT trên máy cục bộ.
# Chạy từ thư mục AISC2026:   pwsh -File .\start-demo.ps1
#
# Mở ba cửa sổ riêng (đóng cửa sổ nào thì tắt dịch vụ đó):
#   1. Dịch vụ ViSoBERT   http://127.0.0.1:8001
#   2. Backend API        http://127.0.0.1:5000
#   3. Giao diện web      http://127.0.0.1:5173
#
# ViSoBERT không bắt buộc: thiếu checkpoint hoặc thiếu venv thì backend tự lùi
# về lớp luật và giao diện ghi rõ "ViSoBERT tắt · dùng luật".

$root = $PSScriptRoot
$python = Join-Path $root 'nlp_service\.venv\Scripts\python.exe'
$checkpoint = Join-Path $root 'nlp_service\checkpoints\visobert-absa\meta.json'

function Test-Port($port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Window($title, $dir, $command) {
  Start-Process pwsh -WorkingDirectory $dir -ArgumentList @(
    '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle = '$title'; $command"
  )
}

if (Test-Port 8001) {
  Write-Host 'ViSoBERT: cổng 8001 đã có dịch vụ chạy, bỏ qua.'
} elseif (-not (Test-Path $python)) {
  Write-Warning 'ViSoBERT: chưa có nlp_service\.venv — xem nlp_service\README.md. Demo chạy bằng lớp luật.'
} else {
  if (-not (Test-Path $checkpoint)) {
    Write-Warning 'ViSoBERT: chưa có checkpoint tinh chỉnh — dịch vụ chỉ cung cấp vector nhúng, chưa gán nhãn.'
  }
  Start-Window 'ViSoBERT :8001' (Join-Path $root 'nlp_service') "`$env:PYTHONIOENCODING='utf-8'; & '$python' service.py"
}

if (Test-Port 5000) {
  Write-Host 'Backend: cổng 5000 đã có dịch vụ chạy, bỏ qua.'
} else {
  Start-Window 'Backend :5000' (Join-Path $root 'backend') 'node server.js'
}

if (Test-Port 5173) {
  Write-Host 'Frontend: cổng 5173 đã có dịch vụ chạy, bỏ qua.'
} else {
  Start-Window 'Frontend :5173' $root 'npx vite --host 127.0.0.1 --port 5173'
}

Write-Host ''
Write-Host 'Chờ khoảng 30 giây cho ViSoBERT nạp mô hình, rồi mở:'
Write-Host '  http://127.0.0.1:5173/lab'
Write-Host 'Thanh bên trái phải hiện "ViSoBERT đang gán nhãn" (chấm xanh).'
