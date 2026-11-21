// Step 7b: รวมขั้น 5 + 7c เข้าด้วยกัน = เฟิร์มแวร์ตัวจริงของ Memory Clip
// - ปกติหลับลึก (deep sleep) แล้วตื่นมาถ่ายภาพทุก 1 นาที เหมือนขั้น 5
// - กดปุ่ม B ตอนไหนก็ได้ -> ตื่นมาอัดคลิป (เสียง 10 วิ + ภาพทุก 1 วิ) เหมือนขั้น 7c แล้วหลับต่อ
//
// ตื่นได้ 2 ทาง (ตั้งไว้ทั้งคู่ก่อนหลับ อันไหนมาก่อนก็ตื่นด้วยอันนั้น):
//   1) นาฬิกาปลุก (timer)  -> ถ่ายภาพ timelapse
//   2) ปุ่ม B (ext0)       -> อัดคลิป
// ตื่นมาแล้วถาม esp_sleep_get_wakeup_cause() ว่าตื่นเพราะอะไร จะได้ทำงานให้ถูก

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "ESP_I2S.h"
#include "esp_camera.h"
#include "esp_sleep.h"
#include "driver/rtc_io.h"
#include <sys/time.h>

const int SD_CS_PIN = 21;                  // ขาเดียวกับ LED ห้ามใช้ LED
const int MIC_CLK_PIN = 42;   // PDM clock
const int MIC_DATA_PIN = 41;  // PDM data
const gpio_num_t BUTTON_PIN = GPIO_NUM_0;  // ปุ่ม B (BOOT): ปกติ HIGH กดแล้วเป็น LOW

const uint64_t INTERVAL_SEC = 60;          // ถ่าย timelapse ทุกกี่วินาที
const uint32_t SAMPLE_RATE = 16000;  // วัดเสียง 16,000 ครั้งต่อวินาที (พอสำหรับเสียงพูด)
const size_t CLIP_SECONDS = 10;      // อัดกี่วินาทีต่อการกด 1 ครั้ง
const uint32_t PHOTO_INTERVAL_MS = 1000;  // ถ่ายภาพทุกกี่ ms ระหว่างอัดคลิป
const float MAX_GAIN = 32.0;     // ขยายได้มากสุดกี่เท่า (กันไม่ให้ขยายเสียงซ่าตอนเงียบจนดังเกิน)
const size_t SKIP_SAMPLES = SAMPLE_RATE / 5;  // 0.2 วินาทีแรกเป็นเสียงป๊อกตอนไมค์เพิ่งเปิด ทิ้งไป
const float TARGET_RMS = 4000;   // ความดังเฉลี่ยที่ต้องการหลังขยาย (~12% ของเพดาน) เพิ่มถ้าอยากให้ดังขึ้นอีก

// RTC_DATA_ATTR = เก็บไว้ใน RTC memory ค่าไม่หายตอนหลับลึก (แต่หายถ้าถอดไฟหรือกด RESET)
RTC_DATA_ATTR int photoNumber = 0;
RTC_DATA_ATTR int wakeCount = 0;
// เวลาที่ต้องถ่าย timelapse ภาพถัดไป (หน่วย microsecond)
// ต่างจากขั้น 5: ตอนนี้ตื่นเพราะปุ่มได้ด้วย จึงนับ "เหลืออีก 60 วินาที" แบบเดิมไม่ได้
// ต้องจำเวลานัดไว้ แล้วตื่นมาเทียบกับนาฬิกาว่าถึงเวลาหรือยัง
RTC_DATA_ATTR int64_t nextPhotoUs = 0;

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

// จดบันทึกลงการ์ด เพราะตอนใช้แบตไม่มี Serial Monitor ให้ดู
void writeLog(const char *msg) {
  File f = SD.open("/log.txt", FILE_APPEND);  // APPEND = ต่อท้ายไฟล์เดิม ไม่เขียนทับ
  if (f) {
    f.println(msg);
    f.close();
  }
  Serial.println(msg);
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
void takeTimelapsePhoto() {
  photoNumber++;
  char path[32];
  snprintf(path, sizeof(path), "/photo_%05d.jpg", photoNumber);
  bool ok = savePhoto(String(path));
  saveLastNumber(photoNumber);

  char msg[64];
  snprintf(msg, sizeof(msg), "wake#%d  %s  %s", wakeCount, path, ok ? "OK" : "FAILED");
  writeLog(msg);
}

// ---------- งานที่ 2: คลิป (เหมือนขั้น 7c) ----------
// หาชื่อโฟลเดอร์ที่ยังไม่มีบนการ์ด เพื่อไม่ให้เขียนทับคลิปเก่า
String nextClipFolder() {
  char path[32];
  for (int i = 1; i < 10000; i++) {
    snprintf(path, sizeof(path), "/clip_%04d", i);
    if (!SD.exists(path)) return String(path);
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

  char msg[96];
  snprintf(msg, sizeof(msg), "wake#%d  %s  ภาพ %d รูป  เสียง %s",
           wakeCount, folder.c_str(), photos, audioOk ? "OK" : "FAILED");
  writeLog(msg);
}

void goToSleep() {
  // ถ้ายังกดปุ่มค้างอยู่ รอปล่อยก่อน ไม่งั้นพอหลับปุ๊บจะถูกปลุกด้วยปุ่มทันที
  while (digitalRead(BUTTON_PIN) == LOW) delay(10);

  // ตั้งนาฬิกาปลุกให้ตื่นตรงเวลานัดภาพถัดไป
  int64_t waitUs = nextPhotoUs - nowUs();
  if (waitUs < 1000000LL) waitUs = 1000000LL;  // อย่างน้อย 1 วินาที กันค่าติดลบ
  esp_sleep_enable_timer_wakeup((uint64_t)waitUs);

  // ตั้งให้ปุ่มปลุกได้: ext0 = ปลุกเมื่อขานี้เป็นระดับที่กำหนด (0 = LOW = กดปุ่ม)
  // ตอนหลับ pinMode ธรรมดาไม่ทำงาน ต้องเปิดตัวต้านทานดึงขึ้นของส่วน RTC แทน
  // ไม่งั้นขาจะลอย อ่านค่ามั่วแล้วตื่นเองแบบสุ่ม
  rtc_gpio_pullup_en(BUTTON_PIN);
  rtc_gpio_pulldown_dis(BUTTON_PIN);
  esp_sleep_enable_ext0_wakeup(BUTTON_PIN, 0);

  SD.end();
  esp_deep_sleep_start();  // หลับ! บรรทัดถัดไปจะไม่มีวันได้ทำงาน
}

void setup() {
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  bool coldBoot = (cause != ESP_SLEEP_WAKEUP_TIMER && cause != ESP_SLEEP_WAKEUP_EXT0);
  bool buttonWake = (cause == ESP_SLEEP_WAKEUP_EXT0);
  wakeCount++;

  // ก่อนหลับเราให้ขาปุ่มไปอยู่ใต้การควบคุมของส่วน RTC ตื่นมาต้องคืนให้ GPIO ธรรมดา
  // ไม่งั้น digitalRead() จะอ่านขานี้ไม่ได้
  rtc_gpio_deinit(BUTTON_PIN);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(115200);
  if (coldBoot) {
    delay(2000);  // รอ Serial Monitor เฉพาะตอนเปิดเครื่องครั้งแรก
    Serial.println("=== Memory Clip: Step 7b (Timelapse + Button clip) ===");
    nextPhotoUs = nowUs();  // เปิดเครื่องแล้วถ่ายภาพแรกเลย
  }

  if (!psramFound() || !SD.begin(SD_CS_PIN)) {
    Serial.println("PSRAM หรือ SD card มีปัญหา -> หลับแล้วลองใหม่รอบหน้า");
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
    nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;
    goToSleep();
  }

  // กล้องเพิ่งเปิดใหม่ทุกรอบ ต้องให้เวลาปรับแสงทุกครั้ง
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }

  if (buttonWake) recordClip();

  // ถึงเวลาถ่าย timelapse หรือยัง (ตื่นเพราะ timer = ถึงแน่นอน, ตื่นเพราะปุ่ม = อาจยังไม่ถึง)
  if (nowUs() >= nextPhotoUs) {
    takeTimelapsePhoto();
    nextPhotoUs += INTERVAL_SEC * 1000000LL;
    // ถ้าอัดคลิปนานจนเลยนัดถัดไปไปแล้ว ไม่ต้องถ่ายย้อนหลัง นับใหม่จากตอนนี้
    if (nextPhotoUs <= nowUs()) nextPhotoUs = nowUs() + INTERVAL_SEC * 1000000LL;
  }

  goToSleep();
}

void loop() {
  // ไม่มีวันมาถึงตรงนี้ เพราะ setup() จบด้วยการหลับทุกครั้ง
}
