// คลิป: อัดเสียง 10 วินาที (core 0) พร้อมถ่ายภาพทุกวินาที (core 1) ลงโฟลเดอร์ /clip_.../
// ได้ img_00.jpg ... img_09.jpg + audio.wav

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

  // เริ่มอัดเสียงบน core 0 แล้วถ่ายภาพบน core นี้ไปพร้อมกัน
  audioDone = false;
  audioWav = NULL;
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 5, NULL, 0);
  int photos = takeClipPhotos(folder);

  while (!audioDone) delay(10);  // รอ task เสียงอัดให้ครบ
  bool audioOk = saveAudio(folder);
  i2s.end();

  char msg[128];
  snprintf(msg, sizeof(msg), "wake#%d  %s  ภาพ %d รูป  เสียง %s",
           wakeCount, folder.c_str(), photos, audioOk ? "OK" : "FAILED");
  writeLog(msg);
}

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

// task อัดเสียง: ทำงานบน core 0 ขณะที่ core 1 ถ่ายภาพ (เหมือนขั้น 7c)
void audioTask(void *param) {
  audioWav = i2s.recordWAV(CLIP_SECONDS, &audioWavSize);  // 10 วินาที = ~320KB อยู่ใน PSRAM
  audioDone = true;
  vTaskDelete(NULL);
}

// ถ่ายภาพทุก PHOTO_INTERVAL_MS ตลอดคลิป -> จำนวนภาพที่บันทึกได้
int takeClipPhotos(const String &folder) {
  uint32_t start = millis();
  int photos = 0;
  for (int i = 0; i < CLIP_SECONDS * 1000 / PHOTO_INTERVAL_MS; i++) {
    while (millis() - start < i * PHOTO_INTERVAL_MS) delay(1);  // รอให้ตรงวินาที ภาพที่ i = วินาทีที่ i
    char path[48];
    snprintf(path, sizeof(path), "%s/img_%02d.jpg", folder.c_str(), i);
    if (savePhoto(String(path))) photos++;
  }
  return photos;
}

// ขยายเสียงแล้วบันทึก audio.wav (คืน PSRAM ทุกครั้ง)
bool saveAudio(const String &folder) {
  if (audioWav == NULL) return false;
  bool ok = false;
  applyGain(audioWav, audioWavSize);
  File f = SD.open(folder + "/audio.wav", FILE_WRITE);
  if (f) {
    ok = f.write(audioWav, audioWavSize) == audioWavSize;
    f.close();
  }
  free(audioWav);
  audioWav = NULL;
  return ok;
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
