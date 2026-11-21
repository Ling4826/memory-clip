// Step 10b: = ขั้น 10 + ส่งไฟล์ค้างให้ทัน (23 ต.ค.)
//
// ปัญหา: ไฟล์ค้าง 600 กว่าไฟล์ ลดได้แค่รอบละ 1 ไฟล์ เพราะถ่ายภาพใหม่เร็วพอๆ กับที่ส่ง
//   - ไล่รายชื่อด้วย openNextFile() ต้องเปิดทุกไฟล์ ใช้ ~33 วิ จากเวลาส่ง 60 วิ
//     -> ใช้ getNextFileName() อ่านแค่ชื่อจากสารบัญ ไม่ต้องเปิดไฟล์
//   - นับไฟล์ค้างเพื่อส่งสถานะ ไล่ทั้งการ์ดอีกรอบ ~75 วิ -> ใช้ getNextFileName() เหมือนกัน
//   - log.txt (~400 KB) ส่งทุกรอบ 7-11 วิ -> ส่งเฉพาะรอบที่ส่งไฟล์หมดแล้ว
//   - ยังเหลือไฟล์ พัก 5 นาที -> พัก 1 นาที
//
// ---- ส่วนที่เหลือเหมือนขั้น 10 ----
// Step 10: = ขั้น 9 + ส่งสถานะของกล้องให้ server (POST /api/status ทุกรอบที่ต่อคอมได้)
//
// ทำไม: 20 ต.ค. SD card หลวมไปชั่วโมงกว่า บอร์ดไม่ถ่าย ไม่ส่ง และไม่มีร่องรอยเลย
// เพราะ log.txt ก็อยู่บน SD ขั้นนี้จึง
//   - นับความผิดพลาด (SD เปิดไม่ได้, กล้องเปิดไม่ได้, ถ่ายภาพไม่สำเร็จ) ไว้ใน RTC memory ซึ่งไม่ต้องใช้ SD
//   - ส่งสถานะเป็น JSON เล็กๆ ทุกรอบอัปโหลด: ตัวนับข้างบน, พื้นที่ SD, ไฟล์ค้าง, แบต, สัญญาณ, สาเหตุรีสตาร์ท
//   - ถ้า SD เสีย ยังต่อ Wi-Fi ส่งสถานะได้ (ครั้งแรกที่เสียส่งทันที ครั้งต่อไปตามรอบ 30 นาที)
//
// ---- ส่วนที่เหลือเหมือนขั้น 9 ----
// Step 9: เฟิร์มแวร์ตัวจริงสำหรับใส่กล่อง = ขั้น 8c + ปุ่มภายนอก
//
// ปุ่มแยก (ปุ่มกดธรรมดา 2 ขา) ต่อระหว่างขา D1 (GPIO 2) กับ GND
//   - กดแล้วปล่อย       = อัดคลิป 10 วินาที
//   - กดค้าง 2 วินาที   = ส่งไฟล์เข้าคอมเดี๋ยวนี้ (ใช้แทนกด R ซึ่งอยู่ในกล่องกดไม่ได้)
// ปุ่ม B บนบอร์ดยังใช้ได้เหมือนเดิม (เผื่อตอนยังไม่ได้บัดกรีปุ่ม)
//
// ---- ส่วนที่เหลือเหมือนขั้น 8c ----
// - ตื่นทุก 1 นาทีถ่ายภาพ / กดปุ่ม B ตื่นมาอัดคลิป (เหมือน 7b)
// - ทุก 30 นาที (และตอนเปิดเครื่อง) ลองหา hotspot ของคอม ถ้าเจอ:
//     1) ถามเวลาจาก server แล้วตั้งนาฬิกาในชิป
//     2) ส่งไฟล์ที่ยังไม่ได้ส่งทั้งหมด (เหมือน 8a) ส่งแล้วย้ายไป /sent
//   ถ้าไม่เจอ (อยู่นอกบ้าน) เสียเวลาแค่ไม่กี่วินาทีแล้วหลับต่อ ไฟล์รอบนการ์ดจนกว่าจะเจอ
// - ชื่อไฟล์มีเวลาที่ถ่าย เช่น photo_20261020_143500.jpg, clip_20261020_143500/
//   ถ้ายังไม่เคยได้เวลา (เพิ่งเปิดเครื่อง ยังไม่เจอคอม) ใช้ชื่อแบบเดิม photo_00012.jpg

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

const int SD_CS_PIN = 21;                  // ขาเดียวกับ LED ห้ามใช้ LED
const int MIC_CLK_PIN = 42;   // PDM clock
const int MIC_DATA_PIN = 41;  // PDM data
const gpio_num_t BUTTON_PIN = GPIO_NUM_2;  // ปุ่มแยก ต่อขา D1 กับ GND: ปกติ HIGH กดแล้วเป็น LOW
const gpio_num_t ONBOARD_BTN = GPIO_NUM_0;    // ปุ่ม B บนบอร์ด (ใช้ได้เหมือนกัน)
const unsigned long LONG_PRESS_MS = 2000;  // กดค้างนานเท่านี้ = สั่งส่งไฟล์

// วัดแรงดันแบต: BAT+ -[100k]- D5 -[100k]- GND (วงจรแบ่งแรงดัน)
// แบตเต็ม 4.2V แต่ขาชิปรับได้แค่ ~3.1V จึงแบ่งครึ่งก่อน (ได้ ~2.1V) แล้วคูณ 2 กลับในโค้ด
// D5 = GPIO 6 เป็น ADC1 ใช้ได้แม้เปิด Wi-Fi (ADC2 ใช้พร้อม Wi-Fi ไม่ได้)
// เดิมใช้ D0 (GPIO 1) แต่ขาเสีย ดึงไฟลง GND (เจอ 21 ต.ค.) จึงย้ายมา D5
const int BAT_PIN = 6;
const float BAT_DIVIDER = 2.0;  // ตัวต้านทาน 2 ตัวค่าเท่ากัน = หาร 2

const uint64_t INTERVAL_SEC = 60;          // ถ่าย timelapse ทุกกี่วินาที
const uint64_t UPLOAD_EVERY_SEC = 30 * 60; // ลองหา hotspot คอมทุกกี่วินาที
const unsigned long WIFI_TIMEOUT_MS = 6000;   // หาไม่เจอภายในนี้ = ไม่ได้อยู่ใกล้คอม เลิกหา
const unsigned long UPLOAD_LIMIT_MS = 60000;  // ส่งได้นานสุดต่อรอบ ที่เหลือส่งรอบหน้า (Wi-Fi เปิดนาน = ชิปร้อน + เปลืองแบต)
const int MIN_RSSI = -80;                     // สัญญาณอ่อนกว่านี้ไม่ส่ง (ส่งช้ามาก ต้องลองซ้ำ ชิปร้อน) รอให้เข้าใกล้คอมก่อน
const int MAX_FAIL_STREAK = 2;                // ส่งไม่ผ่านติดกันกี่ไฟล์ = สัญญาณแย่ เลิกส่งรอบนี้
const uint64_t RESUME_SEC = 60;               // ส่งไม่หมดเพราะหมดเวลา -> อีกกี่วินาทีค่อยส่งต่อ (ให้ชิปได้พักเย็น; 5 นาทีนานไป ถ่ายใหม่ทันส่ง)
const char *SENT_DIR = "/sent";

const uint32_t SAMPLE_RATE = 16000;  // วัดเสียง 16,000 ครั้งต่อวินาที (พอสำหรับเสียงพูด)
const size_t CLIP_SECONDS = 10;      // อัดกี่วินาทีต่อการกด 1 ครั้ง
const uint32_t PHOTO_INTERVAL_MS = 1000;  // ถ่ายภาพทุกกี่ ms ระหว่างอัดคลิป
const float MAX_GAIN = 32.0;     // ขยายได้มากสุดกี่เท่า (กันไม่ให้ขยายเสียงซ่าตอนเงียบจนดังเกิน)
const size_t SKIP_SAMPLES = SAMPLE_RATE / 5;  // 0.2 วินาทีแรกเป็นเสียงป๊อกตอนไมค์เพิ่งเปิด ทิ้งไป
const float TARGET_RMS = 4000;   // ความดังเฉลี่ยที่ต้องการหลังขยาย (~12% ของเพดาน) เพิ่มถ้าอยากให้ดังขึ้นอีก

// RTC_DATA_ATTR = เก็บไว้ใน RTC memory ค่าไม่หายตอนหลับลึก (แต่หายถ้าถอดไฟหรือกด RESET)
RTC_DATA_ATTR int photoNumber = 0;
RTC_DATA_ATTR int wakeCount = 0;
RTC_DATA_ATTR int64_t nextPhotoUs = 0;   // เวลานัดถ่าย timelapse ภาพถัดไป
RTC_DATA_ATTR int64_t nextUploadUs = 0;  // เวลานัดลองหา hotspot ครั้งถัดไป
RTC_DATA_ATTR bool timeValid = false;    // นาฬิกาในชิปตรงกับเวลาจริงหรือยัง (ได้จาก server แล้ว)

// ---- สถานะ (ขั้น 10) ----
// ตัวนับความผิดพลาดตั้งแต่ส่งสถานะครั้งก่อน เก็บใน RTC memory เพราะตอน SD เสียเขียน log ไม่ได้
// server ได้รับแล้วค่อยรีเซ็ตเป็น 0
const char *FW_VERSION = "step10b";
RTC_DATA_ATTR int sdFailCount = 0;     // ตื่นมาแล้วเปิด SD ไม่ได้กี่ครั้ง
RTC_DATA_ATTR int camFailCount = 0;    // เปิดกล้องไม่ได้กี่ครั้ง
RTC_DATA_ATTR int photoFailCount = 0;  // ถ่าย/บันทึกภาพไม่สำเร็จกี่ภาพ
RTC_DATA_ATTR bool sdAlertSent = false;  // SD เสียรอบนี้แจ้ง server ไปแล้วหรือยัง (กันต่อ Wi-Fi ทุกนาทีจนแบตหมด)
RTC_DATA_ATTR int resetReason = 0;     // สาเหตุที่เปิดเครื่องครั้งล่าสุด (esp_reset_reason) เช่น ไฟเข้า, แบตตก, โค้ดค้าง

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

I2SClass i2s;

// ตัวแปรที่ task อัดเสียงกับ setup() ใช้ร่วมกัน (เหมือนขั้น 7c)
volatile bool audioDone = false;
uint8_t *audioWav = NULL;
size_t audioWavSize = 0;

// นาฬิกาของชิป: ยังเดินต่อตอนหลับลึก (ต่างจาก millis() ที่เริ่มนับ 0 ใหม่ทุกครั้งที่ตื่น)
int64_t nowUs() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (int64_t)tv.tv_sec * 1000000LL + tv.tv_usec;
}

// ส่วนเวลาในชื่อไฟล์ เช่น "20261020_143500" (เวลาไทย) ถ้ายังไม่รู้เวลาจริงคืนค่าว่าง
String stamp() {
  if (!timeValid) return "";
  time_t t = time(NULL);
  struct tm lt;
  localtime_r(&t, &lt);
  char buf[20];
  strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &lt);
  return String(buf);
}

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
  config.fb_count = 2;                     // 2 buffer + GRAB_LATEST ได้ภาพ "ตอนนี้" (เหมือนขั้น 7c)
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

// จดบันทึกลงการ์ด เพราะตอนใช้แบตไม่มี Serial Monitor ให้ดู (มีเวลานำหน้าถ้ารู้เวลาแล้ว)
void writeLog(const char *msg) {
  String line = stamp();
  line += (line.length() ? "  " : "");
  line += msg;
  File f = SD.open("/log.txt", FILE_APPEND);  // APPEND = ต่อท้ายไฟล์เดิม ไม่เขียนทับ
  if (f) {
    f.println(line);
    f.close();
  }
  Serial.println(line);
}

bool savePhoto(const String &path) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return false;
  File f = SD.open(path, FILE_WRITE);
  bool ok = false;
  if (f) {
    ok = f.write(fb->buf, fb->len) == fb->len;
    f.close();
  }
  esp_camera_fb_return(fb);  // คืน buffer ให้กล้อง ไม่งั้นภาพต่อไปจะถ่ายไม่ได้
  return ok;
}

// ---------- งานที่ 1: ภาพ timelapse (เหมือนขั้น 5) ----------
// อ่านแรงดันแบต (mV) เฉลี่ย 16 ครั้ง ลดสัญญาณรบกวน
// ตอนเสียบ USB ค่าจะเป็นแรงดันตอนชาร์จ (สูงกว่าจริง)
int readBatteryMv() {
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(BAT_PIN);
  return (int)(sum / 16 * BAT_DIVIDER);
}

void takeTimelapsePhoto() {
  photoNumber++;
  saveLastNumber(photoNumber);
  // รู้เวลา -> ใช้เวลาเป็นชื่อ, ไม่รู้ -> ใช้เลขลำดับ (เลขไม่ซ้ำเพราะจำไว้ใน counter.txt)
  String s = stamp();
  char path[40];
  if (s.length()) snprintf(path, sizeof(path), "/photo_%s.jpg", s.c_str());
  else snprintf(path, sizeof(path), "/photo_%05d.jpg", photoNumber);
  bool ok = savePhoto(String(path));
  if (!ok) photoFailCount++;

  char msg[96];
  // "bat 3912mV" ท้ายบรรทัด: server อ่าน log นี้ไปทำกราฟแบตในหน้าเว็บ
  snprintf(msg, sizeof(msg), "wake#%d  %s  %s  bat %dmV", wakeCount, path, ok ? "OK" : "FAILED", readBatteryMv());
  writeLog(msg);
}

// ---------- งานที่ 2: คลิป (เหมือนขั้น 7c) ----------
// ชื่อโฟลเดอร์คลิป: มีเวลาก็ใช้เวลา ไม่มีก็ใช้เลขที่ยังไม่เคยใช้
// (ต้องเช็กใน /sent ด้วย ไม่งั้นเลขของคลิปที่ส่งไปแล้วจะถูกใช้ซ้ำ แล้วไปทับไฟล์บน server)
String nextClipFolder() {
  String s = stamp();
  if (s.length()) return "/clip_" + s;
  char path[32], sent[40];
  for (int i = 1; i < 10000; i++) {
    snprintf(path, sizeof(path), "/clip_%04d", i);
    snprintf(sent, sizeof(sent), "%s%s", SENT_DIR, path);
    if (!SD.exists(path) && !SD.exists(sent)) return String(path);
  }
  return String("/clip_overflow");
}

// ขยายเสียงในโค้ด (digital gain) แบบปรับเองตามความดังของแต่ละไฟล์ (เหมือนขั้น 6)
// 1) ลบ DC offset  2) คำนวณ gain ให้ได้ TARGET_RMS  3) คูณ gain แล้วทำ soft clip
void applyGain(uint8_t *wav, size_t wavSize) {
  const size_t HEADER = 44;  // ไฟล์ WAV มีส่วนหัว 44 byte ก่อนข้อมูลเสียง
  int16_t *samples = (int16_t *)(wav + HEADER);
  size_t count = (wavSize - HEADER) / 2;  // 1 sample = 16 bit = 2 byte

  long long sum = 0;
  for (size_t i = SKIP_SAMPLES; i < count; i++) sum += samples[i];
  int offset = sum / (long long)(count - SKIP_SAMPLES);

  double sumSquares = 0;
  for (size_t i = SKIP_SAMPLES; i < count; i++) {
    double v = samples[i] - offset;
    sumSquares += v * v;
  }
  double rms = sqrt(sumSquares / (count - SKIP_SAMPLES));
  if (rms < 1) rms = 1;  // กันหารด้วยศูนย์ถ้าไฟล์เงียบสนิท
  float gain = TARGET_RMS / rms;
  if (gain > MAX_GAIN) gain = MAX_GAIN;
  Serial.printf("DC offset: %d  RMS: %d  Gain: x%.2f\n", offset, (int)rms, gain);

  for (size_t i = 0; i < SKIP_SAMPLES; i++) samples[i] = 0;  // ช่วงป๊อกเปลี่ยนเป็นความเงียบ (ไฟล์ยาวเท่าเดิม)

  for (size_t i = SKIP_SAMPLES; i < count; i++) {
    float x = (samples[i] - offset) * gain;
    float y = x / (1 + fabsf(x) / 32767);  // soft clip: ไม่มีวันเกิน 32767
    samples[i] = (int16_t)y;
  }
}

// task อัดเสียง: ทำงานบน core 0 ขณะที่ core 1 ถ่ายภาพ (เหมือนขั้น 7c)
void audioTask(void *param) {
  audioWav = i2s.recordWAV(CLIP_SECONDS, &audioWavSize);  // 10 วินาที = ~320KB อยู่ใน PSRAM
  audioDone = true;
  vTaskDelete(NULL);
}

void recordClip() {
  // เปิดไมค์เฉพาะตอนจะอัดคลิป ตื่นมาถ่าย timelapse ไม่ต้องเปิด ประหยัดเวลาและแบต
  i2s.setPinsPdmRx(MIC_CLK_PIN, MIC_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    writeLog("Mic (I2S) init FAILED");
    return;
  }

  String folder = nextClipFolder();
  if (!SD.mkdir(folder)) {
    writeLog("สร้างโฟลเดอร์คลิปไม่ได้");
    return;
  }
  Serial.printf("[%s] กำลังอัด %u วินาที...\n", folder.c_str(), CLIP_SECONDS);

  audioDone = false;
  audioWav = NULL;
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 5, NULL, 0);

  uint32_t start = millis();
  int photos = 0;
  for (int i = 0; i < CLIP_SECONDS * 1000 / PHOTO_INTERVAL_MS; i++) {
    while (millis() - start < i * PHOTO_INTERVAL_MS) delay(1);
    char path[48];
    snprintf(path, sizeof(path), "%s/img_%02d.jpg", folder.c_str(), i);
    if (savePhoto(String(path))) photos++;
  }

  while (!audioDone) delay(10);  // รอ task เสียงอัดให้ครบ
  bool audioOk = false;
  if (audioWav != NULL) {
    applyGain(audioWav, audioWavSize);
    File f = SD.open(folder + "/audio.wav", FILE_WRITE);
    if (f) {
      audioOk = f.write(audioWav, audioWavSize) == audioWavSize;
      f.close();
    }
    free(audioWav);
    audioWav = NULL;
  }
  i2s.end();

  char msg[128];
  snprintf(msg, sizeof(msg), "wake#%d  %s  ภาพ %d รูป  เสียง %s",
           wakeCount, folder.c_str(), photos, audioOk ? "OK" : "FAILED");
  writeLog(msg);
}

// ---------- งานที่ 3: อัปโหลด (เหมือนขั้น 8a) ----------
int sentFiles = 0;
int failedFiles = 0;
unsigned long uploadStart = 0;
bool uploadCut = false;  // ส่งนานจนครบเวลาจำกัด เหลือไฟล์ค้าง
int failStreak = 0;      // ส่งไม่ผ่านติดกันกี่ไฟล์แล้ว

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) return false;
    delay(200);
  }
  // ปกติ ESP32 ปิด-เปิดวิทยุสลับไปมาเพื่อประหยัดไฟ ทำให้ส่งไฟล์ช้าและสะดุด ตอนอัปโหลดให้เปิดค้างไว้
  WiFi.setSleep(false);
  return true;
}

// ถามเวลาจาก server แล้วตั้งนาฬิกาในชิป
// ระวัง: นาฬิกากระโดด แต่เวลานัดถ่ายภาพ (nextPhotoUs) ยังนับแบบเก่า ต้องเลื่อนตามไปเท่ากัน
bool syncTime() {
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/time");
  http.setTimeout(5000);
  int code = http.GET();
  String body = http.getString();
  http.end();
  long long epoch = body.toInt();
  if (code != 200 || epoch < 1700000000LL) return false;  // ค่าแปลกๆ (ก่อนปี 2023) ไม่เชื่อ

  int64_t before = nowUs();
  struct timeval tv = {(time_t)epoch, 0};
  settimeofday(&tv, NULL);
  int64_t shift = nowUs() - before;
  nextPhotoUs += shift;
  nextUploadUs += shift;
  timeValid = true;
  return true;
}

// อ่านทั้งไฟล์เข้า PSRAM แล้วส่ง ส่งไม่สำเร็จลองใหม่สูงสุด 3 ครั้ง (เหมือน 8a)
bool uploadFile(const String &path) {
  File f = SD.open(path, FILE_READ);
  if (!f) return false;
  size_t size = f.size();
  if (size == 0) {
    // ไฟล์ว่าง = ตอนนั้นเขียนภาพไม่สำเร็จ (เช่นไฟดับกลางคลิป) ไม่มีอะไรให้ส่ง ลบทิ้งเลย
    f.close();
    SD.remove(path);
    Serial.printf("  %-34s ว่าง ลบทิ้ง\n", path.c_str());
    return false;
  }
  uint8_t *buf = (uint8_t *)ps_malloc(size);
  if (!buf) {
    f.close();
    return false;
  }
  size_t got = f.read(buf, size);
  f.close();

  bool ok = false;
  for (int attempt = 1; attempt <= 2 && !ok && got == size; attempt++) {
    HTTPClient http;
    http.begin(String(SERVER_URL) + "/upload?path=" + path);
    http.addHeader("Content-Type", "application/octet-stream");
    http.addHeader("X-Clip-Token", CLIP_TOKEN);  // รหัสลับ: server ไม่รับไฟล์จากเครื่องที่ไม่รู้รหัส
    http.setTimeout(8000);
    int code = http.POST(buf, size);
    String reply = http.getString();
    http.end();
    ok = (code == 200 && reply.toInt() == (long)size);  // server ตอบขนาดที่ได้รับ ต้องตรงกัน
    if (!ok) delay(500);
  }
  free(buf);
  ok ? sentFiles++ : failedFiles++;
  failStreak = ok ? 0 : failStreak + 1;
  Serial.printf("  %-34s %s\n", path.c_str(), ok ? "OK" : "FAILED");
  return ok;
}

// ย้ายไฟล์ไป /sent ทันทีที่ส่งสำเร็จ (ทีละไฟล์) ครั้งหน้าจะได้ไม่ส่งซ้ำ
// เช่น /clip_0005/img_03.jpg -> /sent/clip_0005/img_03.jpg
// ถ้าใน /sent มีชื่อซ้ำอยู่แล้ว (เคยส่งไปแล้ว) ลบทิ้งแทน
void markSent(const String &path) {
  String dst = String(SENT_DIR) + path;
  int slash = dst.lastIndexOf('/');
  String dstDir = dst.substring(0, slash);
  if (!SD.exists(dstDir)) SD.mkdir(dstDir);
  if (!SD.rename(path, dst)) SD.remove(path);
}

// หยุดส่งเมื่อ: ส่งนานครบเวลาจำกัด หรือส่งไม่ผ่านติดกันหลายไฟล์ (สัญญาณแย่ ส่งต่อไปก็เปลืองแบตเปล่าๆ)
bool timeUp() {
  if (failStreak >= MAX_FAIL_STREAK) return true;
  if (millis() - uploadStart < UPLOAD_LIMIT_MS) return false;
  uploadCut = true;
  return true;
}

void uploadClipFolder(const String &dir) {
  String names[32];  // คลิปหนึ่งมี 11 ไฟล์ (ภาพ 10 + เสียง 1)
  int n = 0;
  File d = SD.open(dir);
  bool sub;
  // getNextFileName() ได้ชื่อเต็ม (/clip_0005/img_03.jpg) และหมดแล้วได้ "" กลับมา
  for (String p = d.getNextFileName(&sub); p.length() && n < 32; p = d.getNextFileName(&sub)) {
    if (!sub) names[n++] = p;
  }
  d.close();

  // ไฟล์ไหนส่งผ่านย้ายไฟล์นั้นเลย ไฟล์ที่ไม่ผ่านค้างไว้ส่งรอบหน้า (ไม่ต้องส่งทั้งโฟลเดอร์ใหม่)
  for (int i = 0; i < n && !timeUp(); i++) {
    if (uploadFile(names[i])) markSent(names[i]);
  }
  SD.rmdir(dir);  // ลบโฟลเดอร์คลิปเดิมถ้าว่างแล้ว (ถ้ายังมีไฟล์ค้าง rmdir จะไม่ยอมลบเอง)
}

void uploadAll() {
  uploadStart = millis();
  // ไล่รายชื่อก่อน แล้วค่อยส่ง/ย้าย (ย้ายไฟล์ระหว่างไล่รายชื่อ ลำดับจะเพี้ยนจนข้ามบางไฟล์)
  // static = ไม่จองบน stack ที่มีแค่ 8KB
  static String names[400];
  static bool isDir[400];
  int n = 0;
  // getNextFileName() อ่านแค่ชื่อจากสารบัญ ไม่ต้องเปิดทีละไฟล์แบบ openNextFile() (600 ไฟล์ เดิมใช้ ~33 วิ)
  File root = SD.open("/");
  bool dir;
  for (String p = root.getNextFileName(&dir); p.length() && n < 400; p = root.getNextFileName(&dir)) {
    if (p.startsWith("/photo_") || p.startsWith("/clip_")) {
      names[n] = p;
      isDir[n] = dir;
      n++;
    }
  }
  root.close();
  if (n == 400) uploadCut = true;  // การ์ดมีมากกว่าที่ไล่ได้ในรอบเดียว รอบหน้าค่อยต่อ

  for (int i = 0; i < n && !timeUp(); i++) {
    if (isDir[i]) uploadClipFolder(names[i]);
    else if (uploadFile(names[i])) markSent(names[i]);
  }
  // log ส่งไปให้ดูด้วย แต่ไม่ย้าย เพราะบอร์ดยังต้องเขียนต่อ
  // ส่งเฉพาะรอบที่ส่งหมดแล้ว: log ใหญ่ ~400 KB ส่งทุกรอบเสียเวลา 7-11 วิ
  if (!uploadCut) uploadFile("/log.txt");
}

// ---------- งานที่ 4: ส่งสถานะ (ขั้น 10) ----------
// นับภาพ/คลิปที่ยังไม่ได้ส่ง (คลิป 1 โฟลเดอร์นับเป็น 1)
int countPending() {
  int n = 0;
  File root = SD.open("/");
  for (String p = root.getNextFileName(); p.length(); p = root.getNextFileName()) {
    if (p.startsWith("/photo_") || p.startsWith("/clip_")) n++;
  }
  root.close();
  return n;
}

const char *resetName(int r) {
  switch (r) {
    case ESP_RST_POWERON: return "poweron";    // เสียบไฟ/ต่อแบต หรือกด R
    case ESP_RST_BROWNOUT: return "brownout";  // ไฟตก (แบตใกล้หมด)
    case ESP_RST_PANIC: return "crash";        // โค้ดพัง
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "watchdog";       // โค้ดค้างจนชิปรีเซ็ตตัวเอง
    case ESP_RST_SW: return "software";
    case ESP_RST_USB: return "usb";            // รีเซ็ตผ่านสาย USB (เช่นตอนอัปโหลดโค้ด/เปิด Serial)
    default: return "other";
  }
}

// ส่ง JSON เล็กๆ (~250 byte) ไปที่ server ต้องต่อ Wi-Fi อยู่แล้ว
// sdOk = false: SD เปิดไม่ได้ ข้อมูลที่ต้องอ่านจาก SD (ไฟล์ค้าง) ส่งเป็น -1
// ไม่ส่งพื้นที่ SD ที่ใช้ไป: SD.usedBytes() ต้องไล่อ่านตาราง FAT ทั้งการ์ด (การ์ด 32GB อ่านนานมาก)
// รุ่นแรกเรียกตัวนี้แล้วบอร์ดค้างหลังส่งไฟล์ (20 ต.ค. 11:48) จึงตัดออก
void sendStatus(int rssi, bool sdOk) {
  long totalMb = -1, usedMb = -1;
  int pending = -1;
  Serial.println("status: เริ่ม");
  if (sdOk) {
    totalMb = SD.cardSize() / (1024 * 1024);  // อ่านจากข้อมูลการ์ดตรงๆ ไม่ต้องไล่ไฟล์ เร็ว
    pending = countPending();
  }
  Serial.printf("status: การ์ด %ld MB, รอส่ง %d\n", totalMb, pending);
  char json[320];
  snprintf(json, sizeof(json),
           "{\"fw\":\"%s\",\"wake\":%d,\"reset\":\"%s\",\"sd_ok\":%s,\"sd_fail\":%d,\"cam_fail\":%d,"
           "\"photo_fail\":%d,\"sd_total_mb\":%ld,\"sd_used_mb\":%ld,\"pending\":%d,\"sent\":%d,"
           "\"failed\":%d,\"cut\":%s,\"bat_mv\":%d,\"rssi\":%d}",
           FW_VERSION, wakeCount, resetName(resetReason), sdOk ? "true" : "false", sdFailCount, camFailCount,
           photoFailCount, totalMb, usedMb, pending, sentFiles, failedFiles, uploadCut ? "true" : "false",
           readBatteryMv(), rssi);

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/status");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Clip-Token", CLIP_TOKEN);
  http.setTimeout(5000);
  int code = http.POST((uint8_t *)json, strlen(json));
  http.end();
  Serial.printf("status: %s -> HTTP %d\n", json, code);
  if (code == 200) {
    // server ได้รับแล้ว เริ่มนับใหม่ (ถ้าส่งไม่ผ่าน เก็บตัวเลขไว้รวมกับรอบหน้า)
    sdFailCount = camFailCount = photoFailCount = 0;
    if (sdOk) sdAlertSent = false;
  }
}

// SD เสีย: ไม่มีไฟล์ให้ส่ง แต่ยังต่อคอมเพื่อแจ้งสถานะได้
void statusOnlyRound() {
  if (!connectWiFi()) {
    WiFi.mode(WIFI_OFF);
    nextUploadUs = nowUs() + UPLOAD_EVERY_SEC * 1000000LL;
    return;
  }
  syncTime();
  sendStatus(WiFi.RSSI(), false);
  sdAlertSent = true;  // แจ้งแล้ว ครั้งต่อไปรอตามรอบ 30 นาที
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  nextUploadUs = nowUs() + UPLOAD_EVERY_SEC * 1000000LL;
}

void tryUpload() {
  esp_camera_deinit();  // ไม่ใช้กล้องแล้ว ปิดก่อน ประหยัดไฟและคืน PSRAM ให้ใช้ส่งไฟล์
  unsigned long t0 = millis();
  if (!connectWiFi()) {
    Serial.println("ไม่เจอ hotspot คอม (อยู่นอกบ้าน?) -> หลับต่อ");
    WiFi.mode(WIFI_OFF);
    nextUploadUs = nowUs() + UPLOAD_EVERY_SEC * 1000000LL;
    return;
  }
  bool hadTime = timeValid;
  if (syncTime() && !hadTime) writeLog("ได้เวลาจาก server แล้ว");

  // ได้เวลาแล้วแต่สัญญาณอ่อนมาก (อยู่ไกลคอม/เสาอากาศหลุด) -> ไม่ส่งไฟล์ รอบหน้าค่อยลองใหม่
  int rssi = WiFi.RSSI();
  if (rssi < MIN_RSSI) {
    char msg[128];  // ภาษาไทย 1 ตัวใช้ 3 byte (UTF-8) buffer ต้องใหญ่พอ ไม่งั้นข้อความขาดกลางตัวอักษร
    snprintf(msg, sizeof(msg), "upload: สัญญาณอ่อน %d dBm ไม่ส่ง (เช็กเสาอากาศ?)", rssi);
    writeLog(msg);
    sendStatus(rssi, true);  // ไฟล์ไม่ส่ง แต่สถานะเล็กนิดเดียว ส่งได้
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    nextUploadUs = nowUs() + UPLOAD_EVERY_SEC * 1000000LL;
    return;
  }

  if (!SD.exists(SENT_DIR)) SD.mkdir(SENT_DIR);
  uploadAll();
  char msg[192];  // ภาษาไทย 1 ตัว = 3 byte buffer ต้องใหญ่พอ
  snprintf(msg, sizeof(msg), "upload: ส่ง %d ไฟล์ ไม่สำเร็จ %d ไฟล์ %s %d dBm ใช้เวลา %lu วินาที  bat %dmV",
           sentFiles, failedFiles, uploadCut ? "(ยังเหลือ)" : "", rssi, (millis() - t0) / 1000, readBatteryMv());
  writeLog(msg);
  sendStatus(rssi, true);

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  // ยังเหลือไฟล์ -> พัก 5 นาทีแล้วส่งต่อ, ส่งหมดแล้วหรือสัญญาณแย่ -> อีก 30 นาทีค่อยลองใหม่
  bool resume = uploadCut && failStreak < MAX_FAIL_STREAK;
  nextUploadUs = nowUs() + (resume ? RESUME_SEC : UPLOAD_EVERY_SEC) * 1000000LL;
}

bool buttonDown() {
  return digitalRead(BUTTON_PIN) == LOW || digitalRead(ONBOARD_BTN) == LOW;
}

void goToSleep() {
  // ถ้ายังกดปุ่มค้างอยู่ รอปล่อยก่อน ไม่งั้นพอหลับปุ๊บจะถูกปลุกด้วยปุ่มทันที
  while (buttonDown()) delay(10);

  // ตั้งนาฬิกาปลุกให้ตื่นตรงเวลานัดภาพถัดไป
  int64_t waitUs = nextPhotoUs - nowUs();
  if (waitUs < 1000000LL) waitUs = 1000000LL;  // อย่างน้อย 1 วินาที กันค่าติดลบ
  esp_sleep_enable_timer_wakeup((uint64_t)waitUs);

  // ตั้งให้ปุ่มปลุกได้ 2 ปุ่ม: ext1 = ปลุกเมื่อขาใดขาหนึ่งในกลุ่มเป็น LOW (ext0 ที่ใช้ใน 7b ดูได้ขาเดียว)
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

void setup() {
  // watchdog: ถ้ารอบนี้ทำงานนานเกิน 3 นาที (ปกติไม่เกิน ~1.5 นาที: คลิป 10 วิ + ส่งไฟล์ 60 วิ)
  // แปลว่าค้างที่ไหนสักแห่ง ให้ชิปรีเซ็ตตัวเอง ดีกว่าค้างจนแบตหมดโดยไม่ถ่ายภาพ (เจอ 20 ต.ค.)
  // รีเซ็ตแล้ว server จะเห็น reset = "watchdog" ในสถานะ
  esp_task_wdt_config_t wdt = {.timeout_ms = 180000, .idle_core_mask = 0, .trigger_panic = true};
  esp_task_wdt_reconfigure(&wdt);
  esp_task_wdt_add(NULL);

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  bool coldBoot = (cause != ESP_SLEEP_WAKEUP_TIMER && cause != ESP_SLEEP_WAKEUP_EXT1);
  bool buttonWake = (cause == ESP_SLEEP_WAKEUP_EXT1);
  wakeCount++;

  // เวลาไทย (UTC+7) สำหรับแปลงนาฬิกาในชิปเป็นวันเวลาในชื่อไฟล์ ("ICT-7" = เขียนกลับด้านแบบ POSIX)
  setenv("TZ", "ICT-7", 1);
  tzset();

  // ก่อนหลับเราให้ขาปุ่มไปอยู่ใต้การควบคุมของส่วน RTC ตื่นมาต้องคืนให้ GPIO ธรรมดา
  rtc_gpio_deinit(BUTTON_PIN);
  rtc_gpio_deinit(ONBOARD_BTN);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(ONBOARD_BTN, INPUT_PULLUP);

  // ตื่นเพราะปุ่ม: ดูว่ากดสั้นหรือกดค้าง
  bool longPress = false;
  if (buttonWake) {
    // นับจาก millis() = 0 ตอนตื่น ไม่ใช่จากตอนเริ่มเช็ก เพราะตอนบอร์ดกำลังตื่น (~0.3 วิ) ผู้ใช้กดค้างอยู่แล้ว
    // ถ้านับใหม่ตรงนี้ กดค้าง 2 วิพอดีจะถูกนับว่ากดสั้น แล้วกลายเป็นอัดคลิปแทน
    while (buttonDown()) {
      if (millis() > LONG_PRESS_MS) {
        longPress = true;
        break;
      }
      delay(10);
    }
  }
  Serial.begin(115200);
  if (coldBoot) {
    delay(2000);  // รอ Serial Monitor เฉพาะตอนเปิดเครื่องครั้งแรก
    Serial.println("=== Memory Clip: Step 10 (Status) ===");
    resetReason = esp_reset_reason();
    timeValid = false;      // ไฟเพิ่งเข้า นาฬิกาเริ่มนับใหม่ ยังไม่รู้เวลาจริง
    nextPhotoUs = nowUs();  // เปิดเครื่องแล้วถ่ายภาพแรกเลย
    nextUploadUs = nowUs(); // และลองหาคอมเลย (กด RESET ตอนอยู่ใกล้คอม = สั่งส่งไฟล์ทันที)
  }

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

  if (!initCamera()) {
    writeLog("Camera init FAILED");
    camFailCount++;
    nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;
    goToSleep();
  }

  // กล้องเพิ่งเปิดใหม่ทุกรอบ ต้องให้เวลาปรับแสงทุกครั้ง
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }

  if (longPress) nextUploadUs = nowUs();      // กดค้าง = ส่งไฟล์เดี๋ยวนี้
  else if (buttonWake) recordClip();          // กดสั้น = อัดคลิป

  // ถึงเวลาถ่าย timelapse หรือยัง (ตื่นเพราะ timer = ถึงแน่นอน, ตื่นเพราะปุ่ม = อาจยังไม่ถึง)
  if (nowUs() >= nextPhotoUs) {
    takeTimelapsePhoto();
    nextPhotoUs += INTERVAL_SEC * 1000000LL;
  }

  // ถึงเวลาลองหาคอมหรือยัง (ทำหลังถ่ายภาพ จะได้ไม่พลาดภาพ)
  if (nowUs() >= nextUploadUs) tryUpload();

  // ถ้าอัดคลิปหรืออัปโหลดนานจนเลยนัดถ่ายภาพไปแล้ว ไม่ต้องถ่ายย้อนหลัง นับใหม่จากตอนนี้
  if (nextPhotoUs <= nowUs()) nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;

  goToSleep();
}

void loop() {
  // ไม่มีวันมาถึงตรงนี้ เพราะ setup() จบด้วยการหลับทุกครั้ง
}
