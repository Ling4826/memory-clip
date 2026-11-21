// Step 6: อัดเสียงจากไมค์ 5 วินาทีลง SD card เป็นไฟล์ .wav
// กด RESET เพื่ออัดไฟล์ใหม่ (audio_0001.wav, audio_0002.wav, ...)
//
// ไมค์บนบอร์ด Sense เป็นแบบ PDM: ส่งเสียงเป็นสัญญาณดิจิทัลมาเลย
// ใช้แค่ 2 สาย คือ CLK (นาฬิกา) และ DATA (ข้อมูล)

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "ESP_I2S.h"

const int SD_CS_PIN = 21;
const int MIC_CLK_PIN = 42;   // PDM clock
const int MIC_DATA_PIN = 41;  // PDM data

const uint32_t SAMPLE_RATE = 16000;  // วัดเสียง 16,000 ครั้งต่อวินาที (พอสำหรับเสียงพูด)
const size_t RECORD_SECONDS = 5;
const float MAX_GAIN = 32.0;     // ขยายได้มากสุดกี่เท่า (กันไม่ให้ขยายเสียงซ่าตอนเงียบจนดังเกิน)
const size_t SKIP_SAMPLES = SAMPLE_RATE / 5;  // 0.2 วินาทีแรกเป็นเสียงป๊อกตอนไมค์เพิ่งเปิด ทิ้งไป
const float TARGET_RMS = 4000;   // ความดังเฉลี่ยที่ต้องการหลังขยาย (~12% ของเพดาน) เพิ่มถ้าอยากให้ดังขึ้นอีก

I2SClass i2s;

void stopHere() {
  Serial.println("หยุดทำงาน");
  while (true) delay(1000);
}

// หาชื่อไฟล์ที่ยังไม่มีบนการ์ด เพื่อไม่ให้เขียนทับไฟล์เก่า
String nextFileName() {
  char path[32];
  for (int i = 1; i < 10000; i++) {
    snprintf(path, sizeof(path), "/audio_%04d.wav", i);
    if (!SD.exists(path)) return String(path);
  }
  return String("/audio_overflow.wav");
}

// วิเคราะห์ระดับเสียง: ดูว่าไมค์รับเสียงได้จริงไหม
void analyze(uint8_t *wav, size_t wavSize) {
  const size_t HEADER = 44;  // ไฟล์ WAV มีส่วนหัว 44 byte ก่อนข้อมูลเสียง
  int16_t *samples = (int16_t *)(wav + HEADER);
  size_t count = (wavSize - HEADER) / 2;  // 1 sample = 16 bit = 2 byte

  int peak = 0;
  double sumSquares = 0;
  for (size_t i = 0; i < count; i++) {
    int v = abs(samples[i]);
    if (v > peak) peak = v;
    sumSquares += (double)samples[i] * samples[i];
  }
  int rms = (int)sqrt(sumSquares / count);  // RMS = ความดังเฉลี่ย

  // ค่าสูงสุดที่เป็นไปได้ของ 16 bit คือ 32767
  Serial.printf("Samples: %u\n", count);
  Serial.printf("Peak:    %d / 32767 (%.1f%%)\n", peak, peak * 100.0 / 32767);
  Serial.printf("RMS:     %d\n", rms);

  if (peak < 100) {
    Serial.println("=> เงียบเกินไป ไมค์อาจไม่ทำงาน หรือเลขขาผิด");
  } else if (peak > 32000) {
    Serial.println("=> ดังจนเสียงแตก (clipping)");
  } else {
    Serial.println("=> ไมค์รับเสียงได้");
  }
}

// ขยายเสียงในโค้ด (digital gain) แบบปรับเองตามความดังของแต่ละไฟล์ (normalize)
// 1) ลบ DC offset: ค่าเฉลี่ยของเสียงควรเป็น 0 แต่ไมค์มักเพี้ยนไปจากศูนย์นิดหน่อย
//    ถ้าไม่ลบก่อน พอคูณ gain ส่วนที่เพี้ยนจะโตตามไปด้วยจนเสียงแตกเร็วขึ้น
// 2) วัดความดังเฉลี่ย (RMS) แล้วคำนวณ gain ให้ได้ TARGET_RMS
//    พูดเบา/อยู่ไกลก็ขยายมาก พูดดังก็ขยายน้อย
//    (ไม่ใช้จุดดังสุด เพราะเสียงดังแวบเดียวจะกด gain ทั้งไฟล์ให้ต่ำ)
// 3) คูณทุก sample ด้วย gain แล้วทำ soft clip ให้ยอดเสียงที่เกินโค้งลงแทนที่จะแตก
void applyGain(uint8_t *wav, size_t wavSize) {
  const size_t HEADER = 44;
  int16_t *samples = (int16_t *)(wav + HEADER);
  size_t count = (wavSize - HEADER) / 2;

  // ช่วงป๊อกตอนต้นไม่เอามาคิด ไม่งั้นมันจะเป็นจุดที่ดังสุด แล้วกด gain ให้ต่ำ
  long long sum = 0;
  for (size_t i = SKIP_SAMPLES; i < count; i++) sum += samples[i];
  int offset = sum / (long long)(count - SKIP_SAMPLES);
  Serial.printf("DC offset: %d\n", offset);

  double sumSquares = 0;
  for (size_t i = SKIP_SAMPLES; i < count; i++) {
    double v = samples[i] - offset;
    sumSquares += v * v;
  }
  double rms = sqrt(sumSquares / (count - SKIP_SAMPLES));
  if (rms < 1) rms = 1;  // กันหารด้วยศูนย์ถ้าไฟล์เงียบสนิท
  float gain = TARGET_RMS / rms;
  if (gain > MAX_GAIN) gain = MAX_GAIN;
  Serial.printf("Gain: x%.2f\n", gain);

  for (size_t i = 0; i < SKIP_SAMPLES; i++) samples[i] = 0;  // ช่วงป๊อกเปลี่ยนเป็นความเงียบ (ไฟล์ยาวเท่าเดิม)

  for (size_t i = SKIP_SAMPLES; i < count; i++) {
    float x = (samples[i] - offset) * gain;
    // soft clip: เสียงเบาแทบไม่เปลี่ยน เสียงดังถูกบีบลงเรื่อยๆ แต่ไม่มีวันเกิน 32767
    // (ถ้าตัดตรงๆ ที่ 32767 ยอดคลื่นจะแบนเป็นเหลี่ยม ฟังเป็นเสียงแตก)
    float y = x / (1 + fabsf(x) / 32767);
    samples[i] = (int16_t)y;
  }
}

void setup() {
  Serial.begin(115200);
  // รอจนกว่าคอมจะเปิด Serial Monitor (สูงสุด 10 วินาที) จะได้ไม่พลาดข้อความ
  // ถ้าไม่มีคอมต่ออยู่ เช่นใช้แบต ก็จะทำงานต่อหลังครบ 10 วินาที ไม่ค้างตลอดไป
  while (!Serial && millis() < 10000) delay(10);
  delay(500);
  Serial.println("=== Memory Clip: Step 6 (Microphone) ===");

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD.begin FAILED");
    stopHere();
  }

  i2s.setPinsPdmRx(MIC_CLK_PIN, MIC_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("Mic (I2S) init FAILED");
    stopHere();
  }

  for (int i = 3; i > 0; i--) {
    Serial.printf("เริ่มอัดใน %d...\n", i);
    delay(1000);
  }
  Serial.printf("กำลังอัด %u วินาที พูดได้เลย!\n", RECORD_SECONDS);

  size_t wavSize = 0;
  // recordWAV จองหน่วยความจำ อัดเสียง แล้วใส่ส่วนหัว WAV ให้เสร็จในคำสั่งเดียว
  uint8_t *wav = i2s.recordWAV(RECORD_SECONDS, &wavSize);
  if (wav == NULL) {
    Serial.println("Record FAILED");
    stopHere();
  }
  Serial.printf("อัดเสร็จ: %u bytes\n", wavSize);

  Serial.println("-- ก่อนขยาย --");
  analyze(wav, wavSize);
  applyGain(wav, wavSize);
  Serial.println("-- หลังขยาย --");
  analyze(wav, wavSize);

  String path = nextFileName();
  File f = SD.open(path, FILE_WRITE);
  if (f) {
    size_t written = f.write(wav, wavSize);
    f.close();
    Serial.printf("บันทึก %s  %s\n", path.c_str(), written == wavSize ? "OK" : "เขียนไม่ครบ!");
  } else {
    Serial.println("สร้างไฟล์ไม่ได้");
  }

  free(wav);  // คืนหน่วยความจำที่ recordWAV จองไว้ (ยืมแล้วต้องคืน เหมือน frame buffer)
  Serial.println("\nเสร็จแล้ว กด RESET เพื่ออัดไฟล์ใหม่");
}

void loop() {
}
