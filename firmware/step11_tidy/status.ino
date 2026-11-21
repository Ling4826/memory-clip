// สถานะ (เริ่มในขั้น 10): ส่ง JSON เล็กๆ ให้ server ทุกรอบที่ต่อคอมได้ หน้าเว็บโชว์เป็นป้ายมุมขวาบน
// ทำไม: 20 ต.ค. SD card หลวมไปชั่วโมงกว่า บอร์ดไม่ถ่าย ไม่ส่ง และไม่มีร่องรอยเลย เพราะ log.txt ก็อยู่บน SD
// จึงนับความผิดพลาดไว้ใน RTC memory (state.h) แล้วส่งตรงให้ server แทน

// ส่ง JSON (~250 byte) ไปที่ server ต้องต่อ Wi-Fi อยู่แล้ว
// sdOk = false: SD เปิดไม่ได้ ข้อมูลที่ต้องอ่านจาก SD (ไฟล์ค้าง) ส่งเป็น -1
// ไม่ส่งพื้นที่ SD ที่ใช้ไป: SD.usedBytes() ต้องไล่อ่านตาราง FAT ทั้งการ์ด (การ์ด 32GB อ่านนานมาก)
// รุ่นแรกเรียกตัวนั้นแล้วบอร์ดค้างหลังส่งไฟล์ (20 ต.ค. 11:48) จึงตัดออก
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

// นับภาพ/คลิปที่ยังไม่ได้ส่ง (คลิป 1 โฟลเดอร์นับเป็น 1)
int countPending() {
  int n = 0;
  File root = SD.open("/");
  for (File f = root.openNextFile(); f; f = root.openNextFile()) {
    String p = String("/") + f.name();
    if (p.startsWith("/photo_") || p.startsWith("/clip_")) n++;
    f.close();
  }
  root.close();
  return n;
}

// สาเหตุที่เปิดเครื่องใหม่ -> คำสั้นๆ ที่ server เข้าใจ
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

// SD เสีย: ไม่มีไฟล์ให้ส่ง แต่ยังต่อคอมเพื่อแจ้งสถานะได้
void statusOnlyRound() {
  if (connectWiFi()) {
    syncTime();
    sendStatus(WiFi.RSSI(), false);
    sdAlertSent = true;  // แจ้งแล้ว ครั้งต่อไปรอตามรอบ 30 นาที
  }
  wifiOffUntil(UPLOAD_EVERY_SEC);
}
