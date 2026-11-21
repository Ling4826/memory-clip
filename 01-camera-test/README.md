# ขั้นที่ 1: ทดสอบกล้องด้วย CameraWebServer

คัดลอกมาจากตัวอย่างของ esp32 core 3.3.12 โดยแก้สองจุด
- `board_config.h` เลือก `CAMERA_MODEL_XIAO_ESP32S3`
- ย้ายชื่อและรหัส Wi-Fi ไปไว้ที่ `wifi_secrets.h`

## วิธีใช้
1. แก้ `CameraWebServer/wifi_secrets.h` ใส่ Wi-Fi แบบ 2.4GHz
2. เสียบ XIAO ผ่าน USB-C แล้วดูว่าได้พอร์ตไหน: `arduino-cli board list`
3. อัปโหลด (เปลี่ยน COMx เป็นพอร์ตที่เห็น)
   ```
   arduino-cli compile -u -p COMx -b "esp32:esp32:XIAO_ESP32S3:PSRAM=opi,PartitionScheme=default_8MB" CameraWebServer
   ```
4. เปิด Serial Monitor เพื่อดู IP: `arduino-cli monitor -p COMx -c baudrate=115200`
5. เปิด IP นั้นในเบราว์เซอร์แล้วกด Start Stream

## ถ้ามีปัญหา
- อัปโหลดไม่ได้หรือหาพอร์ตไม่เจอ: กดปุ่ม BOOT ค้างไว้ แล้วเสียบ USB จากนั้นจึงปล่อย
- ขึ้นว่า `Camera init failed`: ตรวจว่าเสียบบอร์ดกล้อง Sense แน่นหรือยัง และต้องใช้ `PSRAM=opi`
