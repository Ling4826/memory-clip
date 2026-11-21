# Memory Clip

A small camera you wear on your chest. It takes a photo every minute, records a short clip with sound when you press the button, and sends everything to your PC over Wi-Fi. The PC server turns each day into a highlight video with AI captions.

**Real use: 5 days, 2,861 photos, 60 clips.**

Solo project: firmware, server, web app and 3D-printed case.

## How it works

```
XIAO ESP32-S3 Sense ──Wi-Fi (PC hotspot)──> Flask server on the PC ──> web app (phone / iPad via Tailscale)
  photo every 1 min                           stores photos and clips      daily cards, delete + undo, share
  button = 10 s clip + audio                  AI captions (local VLM)
  deep sleep between shots                    daily highlight video
```

## Hardware
- Seeed XIAO ESP32-S3 Sense (camera + PDM mic, 8 MB PSRAM)
- 603450 LiPo battery, external button
- 3D-printed case designed in Three.js (`case3d/`), with a drop-test simulation

## What the firmware does
- Wakes from deep sleep for about 1.2 s per photo (~60 KB each), then sleeps again
- Button wakes the board and records a 10 s clip: audio on core 0, camera on core 1, so the sound does not drop out
- Audio clean-up: removes DC offset, mutes the mic pop, auto gain by RMS, soft clipping
- Every 30 minutes it looks for the PC hotspot and uploads (~300 KB/s), retrying 3 times; uploads are checked with a shared token
- Reports battery voltage and status to the server

The firmware is built step by step in `firmware/step01_hello` … `firmware/step11_tidy`. Each step was tested on the board before the next one.

## Server (`server/`)
- Python + Flask: receives uploads, serves the web app
- AI captions with a local vision model (no cloud)
- Daily highlight video: cover, best photos with captions, clips with sound, music
- Delete moves files to a trash folder with an 8 s undo

## Run it
1. Copy `firmware/wifi_secrets.h.example` to `wifi_secrets.h` next to the sketch and fill in your hotspot name, password, server URL and token.
2. Flash `firmware/step11_tidy` with Arduino IDE (board: XIAO_ESP32S3, PSRAM: OPI PSRAM).
3. Put the same token in `server/secret.txt`, then run `server/start_server.bat` (opens the Windows hotspot, Tailscale serve and `server.py`).

## Repo layout
| Folder | What |
|---|---|
| `firmware/` | Arduino sketches, one folder per step |
| `01-camera-test/` | First camera test (Espressif CameraWebServer example) |
| `server/` | Flask server, AI captions, highlight video, web app |
| `case3d/` | Three.js case model, print files, drop simulation |
| `tools/` | Small Windows control app and test scripts |
