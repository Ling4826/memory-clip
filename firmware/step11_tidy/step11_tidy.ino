// Step 11: = ขั้น 10 ที่จัดโค้ดใหม่ (การทำงานเหมือนขั้น 10 ทุกอย่าง แค่แยกเป็นไฟล์ตามหน้าที่)
//
// Memory Clip ทำอะไรบ้าง
// - ตื่นทุก 1 นาทีถ่ายภาพ แล้วหลับลึก (deep sleep) ประหยัดแบต
// - กดปุ่มสั้น = อัดคลิป 10 วินาที (เสียง + ภาพทุกวินาที), กดค้าง 2 วินาที = ส่งไฟล์เข้าคอมเดี๋ยวนี้
//   ปุ่มแยกต่อระหว่างขา D1 (GPIO 2) กับ GND, ปุ่ม B บนบอร์ดใช้ได้เหมือนกัน
// - ทุก 30 นาที (และตอนเปิดเครื่อง) ลองหา hotspot ของคอม ถ้าเจอ:
//     1) ถามเวลาจาก server แล้วตั้งนาฬิกาในชิป
//     2) ส่งไฟล์ที่ยังไม่ได้ส่งทั้งหมด ส่งแล้วย้ายไป /sent
//     3) ส่งสถานะ (SD, กล้อง, แบต, สัญญาณ) ให้หน้าเว็บโชว์
//   ถ้าไม่เจอ (อยู่นอกบ้าน) เสียเวลาแค่ไม่กี่วินาทีแล้วหลับต่อ ไฟล์รอบนการ์ดจนกว่าจะเจอ
// - ชื่อไฟล์มีเวลาที่ถ่าย เช่น photo_20261020_143500.jpg, clip_20261020_143500/
//   ถ้ายังไม่เคยได้เวลา (เพิ่งเปิดเครื่อง ยังไม่เจอคอม) ใช้ชื่อแบบเลขลำดับ photo_00012.jpg
//
// ไฟล์ (แท็บใน Arduino IDE):
//   step11_tidy.ino  ไฟล์นี้: setup() ตื่นมาทำอะไรตามลำดับ + หลับ
//   config.h         ขาที่ต่อ + ค่าตั้งทั้งหมด
//   state.h          ตัวแปรที่ใช้ร่วมกัน (รวมค่าที่จำไว้ข้ามการหลับ)
//   wifi_secrets.h   ชื่อ/รหัส hotspot + รหัส server (ห้ามแชร์)
//   battery.ino      วัดแบต
//   camera.ino       เปิดกล้อง + ถ่ายภาพ timelapse
//   clip.ino         อัดคลิป (เสียง + ภาพ)
//   clock.ino        นาฬิกาในชิป + เวลาในชื่อไฟล์
//   sdcard.ino       เลขภาพ + log.txt บนการ์ด
//   status.ino       ส่งสถานะให้ server
//   upload.ino       ต่อ Wi-Fi + ส่งไฟล์
//
// อัปโหลดผ่าน Arduino IDE: Board = XIAO_ESP32S3, PSRAM = OPI PSRAM

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "ESP_I2S.h"
#include "esp_camera.h"
#include "esp_sleep.h"
#include "esp_task_wdt.h"
#include "driver/rtc_io.h"
#include <sys/time.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "wifi_secrets.h"
#include "config.h"
#include "state.h"

// setup() ทำงานครั้งเดียวต่อการตื่นหนึ่งรอบ แล้วจบด้วยการหลับเสมอ
void setup() {
  startWatchdog();

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  bool coldBoot = (cause != ESP_SLEEP_WAKEUP_TIMER && cause != ESP_SLEEP_WAKEUP_EXT1);  // เพิ่งเสียบไฟ/กด R
  bool buttonWake = (cause == ESP_SLEEP_WAKEUP_EXT1);
  wakeCount++;

  // เวลาไทย (UTC+7) สำหรับแปลงนาฬิกาในชิปเป็นวันเวลาในชื่อไฟล์ ("ICT-7" = เขียนกลับด้านแบบ POSIX)
  setenv("TZ", "ICT-7", 1);
  tzset();

  setupButtons();
  bool longPress = buttonWake && isLongPress();

  Serial.begin(115200);
  if (coldBoot) {
    delay(2000);  // รอ Serial Monitor เฉพาะตอนเปิดเครื่องครั้งแรก
    Serial.println("=== Memory Clip: Step 11 ===");
    resetReason = esp_reset_reason();
    timeValid = false;      // ไฟเพิ่งเข้า นาฬิกาเริ่มนับใหม่ ยังไม่รู้เวลาจริง
    nextPhotoUs = nowUs();  // เปิดเครื่องแล้วถ่ายภาพแรกเลย
    nextUploadUs = nowUs(); // และลองหาคอมเลย (กด RESET ตอนอยู่ใกล้คอม = สั่งส่งไฟล์ทันที)
  }

  // 1) การ์ด: เปิดไม่ได้ -> ทำอะไรไม่ได้ แจ้ง server (ถ้าถึงเวลา) แล้วหลับ
  if (!psramFound() || !SD.begin(SD_CS_PIN)) {
    Serial.println("PSRAM หรือ SD card มีปัญหา -> หลับแล้วลองใหม่รอบหน้า");
    sdFailCount++;
    // แจ้งคอมทันทีครั้งแรกที่เสีย (กับตอนกดค้างสั่งส่ง) ที่เหลือรอรอบ 30 นาที
    if (!sdAlertSent || longPress || nowUs() >= nextUploadUs) statusOnlyRound();
    nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;
    goToSleep();
  }
  if (coldBoot) {
    photoNumber = loadLastNumber();
    char msg[64];
    snprintf(msg, sizeof(msg), "--- power on, continue from photo %d ---", photoNumber);
    writeLog(msg);
  }

  // 2) กล้อง
  if (!initCamera()) {
    writeLog("Camera init FAILED");
    camFailCount++;
    nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;
    goToSleep();
  }
  warmUpCamera();

  // 3) ปุ่ม: กดค้าง = ส่งไฟล์เดี๋ยวนี้, กดสั้น = อัดคลิป
  if (longPress) nextUploadUs = nowUs();
  else if (buttonWake) recordClip();

  // 4) ภาพ timelapse (ตื่นเพราะ timer = ถึงเวลาแน่นอน, ตื่นเพราะปุ่ม = อาจยังไม่ถึง)
  if (nowUs() >= nextPhotoUs) {
    takeTimelapsePhoto();
    nextPhotoUs += INTERVAL_SEC * 1000000LL;
  }

  // 5) ส่งไฟล์ (ทำหลังถ่ายภาพ จะได้ไม่พลาดภาพ)
  if (nowUs() >= nextUploadUs) tryUpload();

  // ถ้าอัดคลิปหรืออัปโหลดนานจนเลยนัดถ่ายภาพไปแล้ว ไม่ต้องถ่ายย้อนหลัง นับใหม่จากตอนนี้
  if (nextPhotoUs <= nowUs()) nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;

  goToSleep();
}

void loop() {
  // ไม่มีวันมาถึงตรงนี้ เพราะ setup() จบด้วยการหลับทุกครั้ง
}

// ---------- watchdog ----------
// ถ้ารอบนี้ทำงานนานเกิน 3 นาที (ปกติไม่เกิน ~1.5 นาที: คลิป 10 วิ + ส่งไฟล์ 60 วิ)
// แปลว่าค้างที่ไหนสักแห่ง ให้ชิปรีเซ็ตตัวเอง ดีกว่าค้างจนแบตหมดโดยไม่ถ่ายภาพ (เจอ 20 ต.ค.)
// รีเซ็ตแล้ว server จะเห็น reset = "watchdog" ในสถานะ
void startWatchdog() {
  esp_task_wdt_config_t wdt = {.timeout_ms = WATCHDOG_MS, .idle_core_mask = 0, .trigger_panic = true};
  esp_task_wdt_reconfigure(&wdt);
  esp_task_wdt_add(NULL);
}

// ---------- ปุ่ม ----------
void setupButtons() {
  // ก่อนหลับเราให้ขาปุ่มไปอยู่ใต้การควบคุมของส่วน RTC ตื่นมาต้องคืนให้ GPIO ธรรมดา
  rtc_gpio_deinit(BUTTON_PIN);
  rtc_gpio_deinit(ONBOARD_BTN);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(ONBOARD_BTN, INPUT_PULLUP);
}

bool buttonDown() {
  return digitalRead(BUTTON_PIN) == LOW || digitalRead(ONBOARD_BTN) == LOW;
}

// ตื่นเพราะปุ่ม: กดค้างถึง LONG_PRESS_MS ไหม
bool isLongPress() {
  // นับจาก millis() = 0 ตอนตื่น ไม่ใช่จากตอนเริ่มเช็ก เพราะตอนบอร์ดกำลังตื่น (~0.3 วิ) ผู้ใช้กดค้างอยู่แล้ว
  // ถ้านับใหม่ตรงนี้ กดค้าง 2 วิพอดีจะถูกนับว่ากดสั้น แล้วกลายเป็นอัดคลิปแทน
  while (buttonDown()) {
    if (millis() > LONG_PRESS_MS) return true;
    delay(10);
  }
  return false;
}

// ---------- หลับ ----------
void goToSleep() {
  // ถ้ายังกดปุ่มค้างอยู่ รอปล่อยก่อน ไม่งั้นพอหลับปุ๊บจะถูกปลุกด้วยปุ่มทันที
  while (buttonDown()) delay(10);

  // ตั้งนาฬิกาปลุกให้ตื่นตรงเวลานัดภาพถัดไป
  int64_t waitUs = nextPhotoUs - nowUs();
  if (waitUs < 1000000LL) waitUs = 1000000LL;  // อย่างน้อย 1 วินาที กันค่าติดลบ
  esp_sleep_enable_timer_wakeup((uint64_t)waitUs);

  // ตั้งให้ปุ่มปลุกได้ 2 ปุ่ม: ext1 = ปลุกเมื่อขาใดขาหนึ่งในกลุ่มเป็น LOW (ext0 ดูได้ขาเดียว)
  // ตอนหลับ pinMode ธรรมดาไม่ทำงาน ต้องเปิดตัวต้านทานดึงขึ้นของส่วน RTC แทน
  // และต้องสั่งไม่ให้ปิดไฟส่วน RTC peripheral ตอนหลับ ไม่งั้นตัวต้านทานดึงขึ้นดับไปด้วย ขาลอยแล้วตื่นมั่ว
  const gpio_num_t pins[] = {BUTTON_PIN, ONBOARD_BTN};
  for (gpio_num_t pin : pins) {
    rtc_gpio_pullup_en(pin);
    rtc_gpio_pulldown_dis(pin);
  }
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_ON);
  esp_sleep_enable_ext1_wakeup((1ULL << BUTTON_PIN) | (1ULL << ONBOARD_BTN), ESP_EXT1_WAKEUP_ANY_LOW);

  SD.end();
  esp_deep_sleep_start();  // หลับ! บรรทัดถัดไปจะไม่มีวันได้ทำงาน
}
