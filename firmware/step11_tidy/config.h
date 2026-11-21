// ค่าตั้งทั้งหมดของเฟิร์มแวร์: ขาที่ต่อ, ช่วงเวลา, ค่าเสียง
// อยากเปลี่ยนพฤติกรรม (เช่น ถ่ายทุก 2 นาที) แก้ที่ไฟล์นี้ที่เดียว
#pragma once

const char *FW_VERSION = "step11";  // ส่งไปกับสถานะ ให้ server รู้ว่าบอร์ดใช้เฟิร์มแวร์ตัวไหน

// ---------- ขา ----------
const int SD_CS_PIN = 21;                     // ขาเดียวกับ LED ห้ามใช้ LED
const int MIC_CLK_PIN = 42;                   // ไมค์ PDM: clock
const int MIC_DATA_PIN = 41;                  // ไมค์ PDM: data
const gpio_num_t BUTTON_PIN = GPIO_NUM_2;     // ปุ่มแยก ต่อขา D1 กับ GND: ปกติ HIGH กดแล้วเป็น LOW
const gpio_num_t ONBOARD_BTN = GPIO_NUM_0;    // ปุ่ม B บนบอร์ด (ใช้ได้เหมือนกัน)

// วัดแรงดันแบต: BAT+ -[100k]- D5 -[100k]- GND (วงจรแบ่งแรงดัน)
// แบตเต็ม 4.2V แต่ขาชิปรับได้แค่ ~3.1V จึงแบ่งครึ่งก่อน (ได้ ~2.1V) แล้วคูณ 2 กลับในโค้ด
// D5 = GPIO 6 เป็น ADC1 ใช้ได้แม้เปิด Wi-Fi (ADC2 ใช้พร้อม Wi-Fi ไม่ได้)
// เดิมใช้ D0 (GPIO 1) แต่ขาเสีย ดึงไฟลง GND (เจอ 21 ต.ค.) จึงย้ายมา D5
const int BAT_PIN = 6;
const float BAT_DIVIDER = 2.0;  // ตัวต้านทาน 2 ตัวค่าเท่ากัน = หาร 2

// ขากล้องของ XIAO ESP32S3 Sense (ตายตัวตามบอร์ด)
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  10
#define SIOD_GPIO_NUM  40
#define SIOC_GPIO_NUM  39
#define Y9_GPIO_NUM    48
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  47
#define PCLK_GPIO_NUM  13

// ---------- ปุ่ม ----------
const unsigned long LONG_PRESS_MS = 2000;  // กดค้างนานเท่านี้ = สั่งส่งไฟล์

// ---------- เวลา ----------
const uint64_t INTERVAL_SEC = 60;             // ถ่าย timelapse ทุกกี่วินาที
const uint32_t WATCHDOG_MS = 180000;          // รอบไหนทำงานนานเกินนี้ = ค้าง ให้ชิปรีเซ็ตตัวเอง

// ---------- คลิป ----------
const uint32_t SAMPLE_RATE = 16000;           // วัดเสียง 16,000 ครั้งต่อวินาที (พอสำหรับเสียงพูด)
const size_t CLIP_SECONDS = 10;               // อัดกี่วินาทีต่อการกด 1 ครั้ง
const uint32_t PHOTO_INTERVAL_MS = 1000;      // ถ่ายภาพทุกกี่ ms ระหว่างอัดคลิป
const float MAX_GAIN = 32.0;                  // ขยายได้มากสุดกี่เท่า (กันไม่ให้ขยายเสียงซ่าตอนเงียบจนดังเกิน)
const size_t SKIP_SAMPLES = SAMPLE_RATE / 5;  // 0.2 วินาทีแรกเป็นเสียงป๊อกตอนไมค์เพิ่งเปิด ทิ้งไป
const float TARGET_RMS = 4000;                // ความดังเฉลี่ยที่ต้องการหลังขยาย (~12% ของเพดาน) เพิ่มถ้าอยากให้ดังขึ้นอีก

// ---------- อัปโหลด ----------
const uint64_t UPLOAD_EVERY_SEC = 30 * 60;    // ลองหา hotspot คอมทุกกี่วินาที
const uint64_t RESUME_SEC = 5 * 60;           // ส่งไม่หมดเพราะหมดเวลา -> อีกกี่วินาทีค่อยส่งต่อ (ให้ชิปได้พักเย็น)
const unsigned long WIFI_TIMEOUT_MS = 6000;   // หาไม่เจอภายในนี้ = ไม่ได้อยู่ใกล้คอม เลิกหา
const unsigned long UPLOAD_LIMIT_MS = 60000;  // ส่งได้นานสุดต่อรอบ ที่เหลือส่งรอบหน้า (Wi-Fi เปิดนาน = ชิปร้อน + เปลืองแบต)
const int MIN_RSSI = -80;                     // สัญญาณอ่อนกว่านี้ไม่ส่ง (ส่งช้ามาก ต้องลองซ้ำ ชิปร้อน) รอให้เข้าใกล้คอมก่อน
const int MAX_FAIL_STREAK = 2;                // ส่งไม่ผ่านติดกันกี่ไฟล์ = สัญญาณแย่ เลิกส่งรอบนี้
const char *SENT_DIR = "/sent";               // ไฟล์ที่ส่งแล้วย้ายมาไว้ที่นี่ (ไม่ลบ เผื่อ server หาย)
