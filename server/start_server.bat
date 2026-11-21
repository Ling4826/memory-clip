@echo off
rem ดับเบิลคลิกไฟล์นี้เพื่อเปิดทุกอย่างของ Memory Clip:
rem   1) เปิด hotspot ของคอม (ให้บอร์ดต่อเข้ามาส่งไฟล์)
rem   2) เปิดหน้าเว็บผ่าน Tailscale (มือถือ/iPad ดูรูปได้ที่ https://<your-tailnet-host>:8443)
rem   3) รัน server.py (ปิดหน้าต่างนี้ = ปิด server)
chcp 65001 >nul
title Memory Clip server
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0hotspot_on.ps1"

set TS="C:\Program Files\Tailscale\tailscale.exe"
if exist %TS% (
  %TS% serve --bg --https=8443 http://127.0.0.1:8000 >nul 2>&1
  echo tailscale: https://<your-tailnet-host>:8443
) else (
  echo tailscale: ไม่พบ Tailscale ดูรูปได้แค่บนคอม http://127.0.0.1:8000
)

echo.
python server.py
pause
