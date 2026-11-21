// Step 7c: กดปุ่ม B -> อัดเสียง 10 วินาที พร้อมถ่ายภาพทุก 1 วินาที
// เก็บในโฟลเดอร์เดียวกัน: /clip_0001/audio.wav, img_00.jpg ... img_09.jpg
// server จะเอาภาพ + เสียงไปต่อเป็นวิดีโอ (แบบ ข)
//
// ปัญหา: recordWAV() "บล็อก" คือรอจนอัดครบ 10 วินาทีถึงจะทำบรรทัดต่อไป
//        ถ้าเรียกตรงๆ จะถ่ายภาพระหว่างอัดไม่ได้เลย
// วิธีแก้: ESP32-S3 มี 2 core จึงแยกงานอัดเสียงไปเป็น task ของตัวเองบน core 0
//        ส่วน loop() (อยู่บน core 1) ถ่ายภาพไปพร้อมกัน = ทำ 2 อย่างได้ในเวลาเดียวกัน

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "ESP_I2S.h"
#include "esp_camera.h"

const int SD_CS_PIN = 21;
const int MIC_CLK_PIN = 42;   // PDM clock
const int MIC_DATA_PIN = 41;  // PDM data
const int BUTTON_PIN = 0;     // ปุ่ม B (BOOT) บนบอร์ด: ปกติ HIGH กดแล้วเป็น LOW

const uint32_t SAMPLE_RATE = 16000;  // วัดเสียง 16,000 ครั้งต่อวินาที (พอสำหรับเสียงพูด)
const size_t CLIP_SECONDS = 10;      // อัดกี่วินาทีต่อการกด 1 ครั้ง
const uint32_t PHOTO_INTERVAL_MS = 1000;  // ถ่ายภาพทุกกี่ ms ระหว่างอัด
const float MAX_GAIN = 32.0;     // ขยายได้มากสุดกี่เท่า (กันไม่ให้ขยายเสียงซ่าตอนเงียบจนดังเกิน)
const size_t SKIP_SAMPLES = SAMPLE_RATE / 5;  // 0.2 วินาทีแรกเป็นเสียงป๊อกตอนไมค์เพิ่งเปิด ทิ้งไป
const float TARGET_RMS = 4000;   // ความดังเฉลี่ยที่ต้องการหลังขยาย (~12% ของเพดาน) เพิ่มถ้าอยากให้ดังขึ้นอีก

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

// ตัวแปรที่ 2 task ใช้ร่วมกัน
// volatile = บอก compiler ว่าค่านี้อาจถูกเปลี่ยนจากอีก task ให้อ่านค่าจริงทุกครั้ง ห้ามจำค่าเก่าไว้
volatile bool audioDone = false;
uint8_t *audioWav = NULL;
size_t audioWavSize = 0;

void stopHere() {
  Serial.println("หยุดทำงาน");
  while (true) delay(1000);
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
  // ต่างจากขั้น 5: ใช้ 2 buffer + GRAB_LATEST เพื่อให้ได้ภาพ "ตอนนี้"
  // ถ้ามี buffer เดียว ภาพที่ได้อาจเป็นภาพที่ค้างไว้ตั้งแต่รอบก่อน (ช้าไป ~1 วินาที)
  config.fb_count = 2;
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
// 1) ลบ DC offset: ค่าเฉลี่ยของเสียงควรเป็น 0 แต่ไมค์มักเพี้ยนไปจากศูนย์นิดหน่อย
// 2) วัดความดังเฉลี่ย (RMS) แล้วคำนวณ gain ให้ได้ TARGET_RMS
// 3) คูณทุก sample ด้วย gain แล้วทำ soft clip ให้ยอดเสียงที่เกินโค้งลงแทนที่จะแตก
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

// task อัดเสียง: ทำงานบน core 0 แยกจาก loop()
// อัดเสร็จแล้วบอกด้วย audioDone = true แล้วลบตัวเองทิ้ง
// (ไม่เขียน SD ในนี้ เพราะ loop() กำลังเขียนภาพอยู่ ถ้า 2 task เขียน SD พร้อมกันไฟล์อาจพัง)
void audioTask(void *param) {
  audioWav = i2s.recordWAV(CLIP_SECONDS, &audioWavSize);  // 10 วินาที = ~320KB อยู่ใน PSRAM
  audioDone = true;
  vTaskDelete(NULL);
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

void recordClip() {
  String folder = nextClipFolder();
  if (!SD.mkdir(folder)) {
    Serial.println("สร้างโฟลเดอร์ไม่ได้");
    return;
  }
  Serial.printf("\n[%s] กำลังอัด %u วินาที...\n", folder.c_str(), CLIP_SECONDS);

  audioDone = false;
  audioWav = NULL;
  // สร้าง task อัดเสียง: ชื่อ "audio", stack 8KB, priority 5 (สูงกว่า loop จะได้ไม่พลาดเสียง), core 0
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 5, NULL, 0);

  uint32_t start = millis();
  int photos = 0;
  for (int i = 0; i < CLIP_SECONDS * 1000 / PHOTO_INTERVAL_MS; i++) {
    // รอให้ถึงเวลาของภาพที่ i (นับจากจุดเริ่ม ไม่ใช่จากภาพก่อน เวลาจะได้ไม่เลื่อนสะสม)
    while (millis() - start < i * PHOTO_INTERVAL_MS) delay(1);
    char path[48];
    snprintf(path, sizeof(path), "%s/img_%02d.jpg", folder.c_str(), i);
    uint32_t t = millis() - start;
    bool ok = savePhoto(String(path));
    if (ok) photos++;
    Serial.printf("  %s  t=%u ms  ใช้เวลา %u ms  %s\n", path, t, millis() - start - t, ok ? "OK" : "FAILED");
  }

  while (!audioDone) delay(10);  // รอ task เสียงอัดให้ครบ
  if (audioWav == NULL) {
    Serial.println("Record FAILED");
    return;
  }
  applyGain(audioWav, audioWavSize);

  String path = folder + "/audio.wav";
  File f = SD.open(path, FILE_WRITE);
  if (f) {
    size_t written = f.write(audioWav, audioWavSize);
    f.close();
    Serial.printf("บันทึก %s (%u bytes) %s\n", path.c_str(), audioWavSize, written == audioWavSize ? "OK" : "เขียนไม่ครบ!");
  } else {
    Serial.println("สร้างไฟล์เสียงไม่ได้");
  }
  free(audioWav);
  audioWav = NULL;
  Serial.printf("ภาพ %d รูป\n", photos);
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 10000) delay(10);
  delay(500);
  Serial.println("=== Memory Clip: Step 7c (Button -> Photos + Audio) ===");

  // INPUT_PULLUP: เปิดตัวต้านทานในชิปดึงขาไว้ที่ HIGH ตอนไม่กด กดปุ่มแล้วอ่านได้ LOW
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD.begin FAILED");
    stopHere();
  }
  if (!initCamera()) {
    Serial.println("Camera init FAILED");
    stopHere();
  }

  i2s.setPinsPdmRx(MIC_CLK_PIN, MIC_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("Mic (I2S) init FAILED");
    stopHere();
  }

  Serial.println("พร้อมแล้ว กดปุ่ม B เพื่ออัดคลิป");
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(30);  // debounce: ปุ่มจริงเด้งไปมาหลายครั้งในช่วงไม่กี่ ms รอให้นิ่งก่อน
    if (digitalRead(BUTTON_PIN) == LOW) {
      recordClip();
      while (digitalRead(BUTTON_PIN) == LOW) delay(10);  // รอปล่อยปุ่ม ไม่งั้นกดค้างจะอัดซ้ำ
      Serial.println("พร้อมแล้ว กดปุ่ม B เพื่ออัดคลิป");
    }
  }
  delay(10);
}
