// Step 5: ถ่ายภาพทุก 1 นาทีลง SD card แบบประหยัดแบต
// ตื่น -> เปิดกล้อง -> ถ่าย -> บันทึก -> หลับลึก (deep sleep) -> ตื่นใหม่ ...
//
// ตอนหลับลึก ชิปเกือบดับทั้งหมด ตัวแปรธรรมดาจะหายหมด
// ตื่นมาเหมือนกด RESET ใหม่ทุกครั้ง: setup() เริ่มใหม่ และ loop() ไม่เคยได้ทำงาน

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "esp_camera.h"
#include "esp_sleep.h"

const int SD_CS_PIN = 21;                  // ขาเดียวกับ LED ห้ามใช้ LED
const uint64_t INTERVAL_SEC = 60;          // ถ่ายทุกกี่วินาที

// RTC_DATA_ATTR = เก็บตัวแปรไว้ในหน่วยความจำส่วนพิเศษ (RTC memory)
// ที่ยังมีไฟเลี้ยงตอนหลับลึก ค่าจึงไม่หาย (แต่หายถ้าถอดไฟหรือกด RESET)
RTC_DATA_ATTR int photoNumber = 0;
RTC_DATA_ATTR int wakeCount = 0;

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

bool initCamera() {
  camera_config_t config = {};
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_UXGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;

  if (esp_camera_init(&config) != ESP_OK) return false;

  sensor_t *s = esp_camera_sensor_get();
  s->set_contrast(s, 1);     // เพิ่มคอนทราสต์ แก้ภาพซีด
  s->set_saturation(s, 1);   // สีสดขึ้น
  s->set_ae_level(s, -1);    // มืดลง 1 ระดับ แก้ภาพสว่างเกิน
  s->set_lenc(s, 1);         // แก้ขอบภาพมืด
  return true;
}

// เปิดเครื่องครั้งแรก (ไม่ใช่ตื่นจากหลับ): อ่านเลขภาพล่าสุดจากการ์ด
// เพื่อไม่ให้เขียนทับภาพเก่าเมื่อเปลี่ยนแบตหรือกด RESET
int loadLastNumber() {
  File f = SD.open("/counter.txt", FILE_READ);
  if (!f) return 0;
  int n = f.parseInt();
  f.close();
  return n;
}

void saveLastNumber(int n) {
  File f = SD.open("/counter.txt", FILE_WRITE);
  if (f) {
    f.print(n);
    f.close();
  }
}

// จดบันทึกลงการ์ด เพราะตอนใช้แบตไม่มี Serial Monitor ให้ดู
void writeLog(const char *msg) {
  File f = SD.open("/log.txt", FILE_APPEND);  // APPEND = ต่อท้ายไฟล์เดิม ไม่เขียนทับ
  if (f) {
    f.println(msg);
    f.close();
  }
  Serial.println(msg);
}

void goToSleep(unsigned long awakeMs) {
  // หักเวลาที่ตื่นออก เพื่อให้ถ่ายตรงทุก 60 วินาทีพอดี
  uint64_t sleepUs = INTERVAL_SEC * 1000000ULL;
  uint64_t awakeUs = (uint64_t)awakeMs * 1000ULL;
  sleepUs = (awakeUs < sleepUs) ? sleepUs - awakeUs : 1000000ULL;

  esp_sleep_enable_timer_wakeup(sleepUs);  // ตั้งนาฬิกาปลุก
  esp_deep_sleep_start();                  // หลับ! บรรทัดถัดไปจะไม่มีวันได้ทำงาน
}

void setup() {
  unsigned long t0 = millis();
  bool coldBoot = (esp_sleep_get_wakeup_cause() != ESP_SLEEP_WAKEUP_TIMER);
  wakeCount++;

  Serial.begin(115200);
  if (coldBoot) {
    delay(2000);  // รอ Serial Monitor เฉพาะตอนเปิดเครื่องครั้งแรก ตื่นรอบอื่นไม่ต้องรอ ประหยัดแบต
    Serial.println("=== Memory Clip: Step 5 (Timelapse + Deep sleep) ===");
  }

  if (!psramFound() || !SD.begin(SD_CS_PIN)) {
    Serial.println("PSRAM หรือ SD card มีปัญหา -> หลับแล้วลองใหม่รอบหน้า");
    goToSleep(millis() - t0);
  }

  if (coldBoot) {
    photoNumber = loadLastNumber();
    char msg[64];
    snprintf(msg, sizeof(msg), "--- power on, continue from photo %d ---", photoNumber);
    writeLog(msg);
  }

  if (!initCamera()) {
    writeLog("Camera init FAILED");
    goToSleep(millis() - t0);
  }

  // กล้องเพิ่งเปิดใหม่ทุกรอบ ต้องให้เวลาปรับแสงทุกครั้ง
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (fb) {
    photoNumber++;
    char path[32];
    snprintf(path, sizeof(path), "/photo_%05d.jpg", photoNumber);
    File f = SD.open(path, FILE_WRITE);
    if (f) {
      f.write(fb->buf, fb->len);
      f.close();
    }
    saveLastNumber(photoNumber);

    char msg[96];
    snprintf(msg, sizeof(msg), "wake#%d  %s  %u bytes  awake %lu ms",
             wakeCount, path, fb->len, millis() - t0);
    writeLog(msg);
    esp_camera_fb_return(fb);
  } else {
    writeLog("Capture FAILED");
  }

  SD.end();
  goToSleep(millis() - t0);
}

void loop() {
  // ไม่มีวันมาถึงตรงนี้ เพราะ setup() จบด้วยการหลับทุกครั้ง
}
