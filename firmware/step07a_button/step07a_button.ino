// Step 7a: กดปุ่ม B (BOOT) บนบอร์ด -> อัดเสียง 10 วินาทีลง SD card
// แต่ละคลิปเก็บในโฟลเดอร์ของตัวเอง: /clip_0001/audio.wav, /clip_0002/audio.wav, ...
// (ขั้น 7c จะถ่ายภาพทุก 1 วินาทีใส่โฟลเดอร์เดียวกันนี้ ให้ server ต่อเป็นวิดีโอ)
//
// ต่อจากขั้น 6: ใช้ applyGain เดิม (ลบ DC offset + ทิ้งป๊อก + ขยายตาม RMS + soft clip)

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "ESP_I2S.h"

const int SD_CS_PIN = 21;
const int MIC_CLK_PIN = 42;   // PDM clock
const int MIC_DATA_PIN = 41;  // PDM data
const int BUTTON_PIN = 0;     // ปุ่ม B (BOOT) บนบอร์ด: ปกติ HIGH กดแล้วเป็น LOW

const uint32_t SAMPLE_RATE = 16000;  // วัดเสียง 16,000 ครั้งต่อวินาที (พอสำหรับเสียงพูด)
const size_t CLIP_SECONDS = 10;      // อัดกี่วินาทีต่อการกด 1 ครั้ง
const float MAX_GAIN = 32.0;     // ขยายได้มากสุดกี่เท่า (กันไม่ให้ขยายเสียงซ่าตอนเงียบจนดังเกิน)
const size_t SKIP_SAMPLES = SAMPLE_RATE / 5;  // 0.2 วินาทีแรกเป็นเสียงป๊อกตอนไมค์เพิ่งเปิด ทิ้งไป
const float TARGET_RMS = 4000;   // ความดังเฉลี่ยที่ต้องการหลังขยาย (~12% ของเพดาน) เพิ่มถ้าอยากให้ดังขึ้นอีก

I2SClass i2s;

void stopHere() {
  Serial.println("หยุดทำงาน");
  while (true) delay(1000);
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

void recordClip() {
  String folder = nextClipFolder();
  if (!SD.mkdir(folder)) {
    Serial.println("สร้างโฟลเดอร์ไม่ได้");
    return;
  }
  Serial.printf("\n[%s] กำลังอัด %u วินาที...\n", folder.c_str(), CLIP_SECONDS);

  size_t wavSize = 0;
  uint8_t *wav = i2s.recordWAV(CLIP_SECONDS, &wavSize);  // 10 วินาที = ~320KB อยู่ใน PSRAM
  if (wav == NULL) {
    Serial.println("Record FAILED");
    return;
  }
  applyGain(wav, wavSize);

  String path = folder + "/audio.wav";
  File f = SD.open(path, FILE_WRITE);
  if (f) {
    size_t written = f.write(wav, wavSize);
    f.close();
    Serial.printf("บันทึก %s (%u bytes) %s\n", path.c_str(), wavSize, written == wavSize ? "OK" : "เขียนไม่ครบ!");
  } else {
    Serial.println("สร้างไฟล์ไม่ได้");
  }
  free(wav);
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 10000) delay(10);
  delay(500);
  Serial.println("=== Memory Clip: Step 7a (Button -> Clip) ===");

  // INPUT_PULLUP: เปิดตัวต้านทานในชิปดึงขาไว้ที่ HIGH ตอนไม่กด
  // กดปุ่ม = ขาถูกต่อลงกราวด์ -> อ่านได้ LOW
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD.begin FAILED");
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
