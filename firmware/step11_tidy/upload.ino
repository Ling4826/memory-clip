// อัปโหลด: หา hotspot ของคอม -> ตั้งเวลา -> ส่งไฟล์ทีละไฟล์ (ส่งแล้วย้ายไป /sent) -> ส่งสถานะ
// จำกัดเวลาต่อรอบ (Wi-Fi เปิดนาน = ชิปร้อน + เปลืองแบต) ที่เหลือส่งรอบหน้า

void tryUpload() {
  esp_camera_deinit();  // ไม่ใช้กล้องแล้ว ปิดก่อน ประหยัดไฟและคืน PSRAM ให้ใช้ส่งไฟล์
  unsigned long t0 = millis();
  if (!connectWiFi()) {
    Serial.println("ไม่เจอ hotspot คอม (อยู่นอกบ้าน?) -> หลับต่อ");
    wifiOffUntil(UPLOAD_EVERY_SEC);
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
    wifiOffUntil(UPLOAD_EVERY_SEC);
    return;
  }

  if (!SD.exists(SENT_DIR)) SD.mkdir(SENT_DIR);
  uploadAll();
  char msg[192];  // ภาษาไทย 1 ตัว = 3 byte buffer ต้องใหญ่พอ
  snprintf(msg, sizeof(msg), "upload: ส่ง %d ไฟล์ ไม่สำเร็จ %d ไฟล์ %s %d dBm ใช้เวลา %lu วินาที  bat %dmV",
           sentFiles, failedFiles, uploadCut ? "(ยังเหลือ)" : "", rssi, (millis() - t0) / 1000, readBatteryMv());
  writeLog(msg);
  sendStatus(rssi, true);

  // ยังเหลือไฟล์ -> พัก 5 นาทีแล้วส่งต่อ, ส่งหมดแล้วหรือสัญญาณแย่ -> อีก 30 นาทีค่อยลองใหม่
  bool resume = uploadCut && failStreak < MAX_FAIL_STREAK;
  wifiOffUntil(resume ? RESUME_SEC : UPLOAD_EVERY_SEC);
}

// ---------- Wi-Fi ----------

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

// ปิด Wi-Fi แล้วนัดลองหาคอมครั้งถัดไปในอีก sec วินาที
void wifiOffUntil(uint64_t sec) {
  if (WiFi.status() == WL_CONNECTED) WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  nextUploadUs = nowUs() + sec * 1000000LL;
}

// ถามเวลาจาก server แล้วตั้งนาฬิกาในชิป
// ระวัง: นาฬิกากระโดด แต่เวลานัด (nextPhotoUs, nextUploadUs) ยังนับแบบเก่า ต้องเลื่อนตามไปเท่ากัน
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

// ---------- ส่งไฟล์ ----------

void uploadAll() {
  uploadStart = millis();
  // ไล่รายชื่อก่อน แล้วค่อยส่ง/ย้าย (ย้ายไฟล์ระหว่างไล่รายชื่อ ลำดับจะเพี้ยนจนข้ามบางไฟล์)
  // static = ไม่จองบน stack ที่มีแค่ 8KB
  static String names[400];
  static bool isDir[400];
  int n = 0;
  File root = SD.open("/");
  for (File f = root.openNextFile(); f && n < 400; f = root.openNextFile()) {
    String p = String("/") + f.name();
    if (p.startsWith("/photo_") || p.startsWith("/clip_")) {
      names[n] = p;
      isDir[n] = f.isDirectory();
      n++;
    }
    f.close();
  }
  root.close();
  if (n == 400) uploadCut = true;  // การ์ดมีมากกว่าที่ไล่ได้ในรอบเดียว รอบหน้าค่อยต่อ

  for (int i = 0; i < n && !timeUp(); i++) {
    if (isDir[i]) uploadClipFolder(names[i]);
    else if (uploadFile(names[i])) markSent(names[i]);
  }
  uploadFile("/log.txt");  // log ส่งไปให้ดูด้วย แต่ไม่ย้าย เพราะบอร์ดยังต้องเขียนต่อ
}

void uploadClipFolder(const String &dir) {
  String names[32];  // คลิปหนึ่งมี 11 ไฟล์ (ภาพ 10 + เสียง 1)
  int n = 0;
  File d = SD.open(dir);
  for (File f = d.openNextFile(); f && n < 32; f = d.openNextFile()) {
    if (!f.isDirectory()) names[n++] = dir + "/" + f.name();
    f.close();
  }
  d.close();

  // ไฟล์ไหนส่งผ่านย้ายไฟล์นั้นเลย ไฟล์ที่ไม่ผ่านค้างไว้ส่งรอบหน้า (ไม่ต้องส่งทั้งโฟลเดอร์ใหม่)
  for (int i = 0; i < n && !timeUp(); i++) {
    if (uploadFile(names[i])) markSent(names[i]);
  }
  SD.rmdir(dir);  // ลบโฟลเดอร์คลิปเดิมถ้าว่างแล้ว (ถ้ายังมีไฟล์ค้าง rmdir จะไม่ยอมลบเอง)
}

// อ่านทั้งไฟล์เข้า PSRAM แล้วส่ง ส่งไม่สำเร็จลองใหม่อีก 1 ครั้ง
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
