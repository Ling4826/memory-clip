// Step 8a: ส่งไฟล์ทั้งหมดบน SD card เข้าคอม (ที่รัน server/server.py) ผ่าน hotspot ของคอม
// เปิดเครื่อง/กด RESET -> ต่อ hotspot คอม -> ส่งทีละไฟล์ -> ส่งสำเร็จแล้วย้ายไปไว้ใน /sent
// (ดูรูปจากที่อื่นผ่าน Tailscale ได้ แต่บอร์ดไม่ต้องใช้ Tailscale ส่งตรงเข้าคอมเลย)
//
// ทำไมต้องย้ายไป /sent: ครั้งหน้าจะได้ไม่ส่งซ้ำ แต่ยังไม่ลบทิ้ง
// เผื่อ server มีปัญหา ไฟล์ยังอยู่บนการ์ด (ลบทีหลังได้เมื่อมั่นใจ)

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "wifi_secrets.h"

const int SD_CS_PIN = 21;                  // ขาเดียวกับ LED ห้ามใช้ LED
const unsigned long CONNECT_TIMEOUT_MS = 15000;
const char *SENT_DIR = "/sent";

int sentFiles = 0;
int failedFiles = 0;
size_t sentBytes = 0;

void stopHere() {
  Serial.println("หยุดทำงาน");
  while (true) delay(1000);
}

bool connectWiFi() {
  Serial.printf("ต่อ Wi-Fi \"%s\" ", WIFI_SSID);
  WiFi.mode(WIFI_STA);  // STA = เป็นลูกข่ายที่ไปต่อเราเตอร์
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > CONNECT_TIMEOUT_MS) {
      Serial.printf("\nFAILED, status = %d\n", WiFi.status());
      return false;
    }
    Serial.print(".");
    delay(250);
  }
  Serial.printf("\nOK  IP: %s  RSSI: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  // ปกติ ESP32 ปิด-เปิดวิทยุ Wi-Fi สลับไปมาเพื่อประหยัดไฟ (modem sleep) ทำให้ส่งไฟล์ช้าและสะดุด
  // ตอนอัปโหลดให้เปิดค้างไว้ ส่งเสร็จก็ปิด Wi-Fi ทั้งหมดอยู่แล้ว
  WiFi.setSleep(false);
  return true;
}

// ส่งไฟล์ 1 ไฟล์: อ่านทั้งไฟล์จาก SD เข้า PSRAM ก่อน แล้วค่อยส่งทีเดียว
// (เดิมอ่าน SD สลับกับส่ง Wi-Fi ทีละก้อน ทดสอบแล้วบางไฟล์ค้าง 20 วินาทีแล้วส่งไม่ครบ
//  ไฟล์ใหญ่สุดคือเสียงคลิป ~320KB ส่วน PSRAM มี 8MB จึงโหลดทั้งไฟล์ได้สบาย)
// ส่งไม่สำเร็จจะลองใหม่สูงสุด 3 ครั้ง เพราะสัญญาณ Wi-Fi อ่อนๆ หลุดได้เป็นพักๆ
bool uploadFile(const String &path) {
  File f = SD.open(path, FILE_READ);
  if (!f) return false;
  size_t size = f.size();
  uint8_t *buf = (uint8_t *)ps_malloc(size > 0 ? size : 1);  // ps_malloc = จองใน PSRAM
  if (!buf) {
    f.close();
    return false;
  }
  size_t got = f.read(buf, size);
  f.close();

  bool ok = false;
  int code = 0;
  unsigned long t0 = millis();
  for (int attempt = 1; attempt <= 3 && !ok && got == size; attempt++) {
    HTTPClient http;
    http.begin(String(SERVER_URL) + "/upload?path=" + path);
    http.addHeader("Content-Type", "application/octet-stream");
    http.addHeader("X-Clip-Token", CLIP_TOKEN);  // รหัสลับ: server ไม่รับไฟล์จากเครื่องที่ไม่รู้รหัส
    http.setTimeout(15000);
    code = http.POST(buf, size);
    String reply = http.getString();
    http.end();
    // server ตอบกลับมาเป็นจำนวน byte ที่ได้รับ ต้องตรงกับขนาดไฟล์ถึงจะนับว่าสำเร็จ
    ok = (code == 200 && reply.toInt() == (long)size);
    if (!ok) {
      Serial.printf("    ลองใหม่ (ครั้งที่ %d ได้ HTTP %d)\n", attempt, code);
      delay(500);
    }
  }
  free(buf);

  Serial.printf("  %-28s %7u bytes  %4lu ms  %s\n", path.c_str(), size, millis() - t0,
                ok ? "OK" : ("FAILED (HTTP " + String(code) + ")").c_str());
  if (ok) {
    sentFiles++;
    sentBytes += size;
  } else {
    failedFiles++;
  }
  return ok;
}

// ส่งทุกไฟล์ในโฟลเดอร์คลิป ถ้าครบทุกไฟล์ค่อยย้ายทั้งโฟลเดอร์ไป /sent
void uploadClipFolder(const String &dir) {
  File d = SD.open(dir);
  bool allOk = true;
  // เก็บชื่อไฟล์ก่อน แล้วค่อยส่ง (ไม่เปิดไฟล์อื่นระหว่างที่กำลังไล่รายชื่อในโฟลเดอร์)
  String names[64];
  int n = 0;
  for (File f = d.openNextFile(); f && n < 64; f = d.openNextFile()) {
    if (!f.isDirectory()) names[n++] = dir + "/" + f.name();
    f.close();
  }
  d.close();

  for (int i = 0; i < n; i++) {
    if (!uploadFile(names[i])) allOk = false;
  }
  if (allOk) SD.rename(dir, String(SENT_DIR) + dir);
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 10000) delay(10);
  delay(500);
  Serial.println("=== Memory Clip: Step 8a (Upload to server) ===");

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD.begin FAILED");
    stopHere();
  }
  if (!SD.exists(SENT_DIR)) SD.mkdir(SENT_DIR);

  if (!connectWiFi()) stopHere();

  // เช็กก่อนว่า server เปิดอยู่ จะได้ไม่เสียเวลาส่งทีละไฟล์แล้ว fail ทั้งหมด
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/");
  int code = http.GET();
  http.end();
  if (code != 200) {
    Serial.printf("ต่อ server %s ไม่ได้ (code %d) เปิด server.py หรือยัง? IP ถูกไหม?\n", SERVER_URL, code);
    stopHere();
  }
  Serial.printf("server %s OK\n\n", SERVER_URL);

  // ไล่รายชื่อทุกอย่างที่อยู่ชั้นบนสุดของการ์ดก่อน แล้วค่อยส่ง
  // (ถ้าย้ายไฟล์ไป /sent ระหว่างที่ยังไล่รายชื่ออยู่ ลำดับไฟล์อาจเพี้ยนจนข้ามบางไฟล์)
  // static = ไม่จองบน stack (stack ของ setup มีแค่ 8KB, String 512 ตัวกินเกินนั้นจนบอร์ดรีเซ็ต)
  static String names[512];
  static bool isDir[512];
  int n = 0;
  File root = SD.open("/");
  for (File f = root.openNextFile(); f && n < 512; f = root.openNextFile()) {
    names[n] = String("/") + f.name();
    isDir[n] = f.isDirectory();
    n++;
    f.close();
  }
  root.close();

  unsigned long t0 = millis();
  for (int i = 0; i < n; i++) {
    const String &p = names[i];
    if (isDir[i] && p.startsWith("/clip_")) {
      uploadClipFolder(p);
    } else if (!isDir[i] && p.startsWith("/photo_")) {
      if (uploadFile(p)) SD.rename(p, String(SENT_DIR) + p);
    } else if (p == "/log.txt") {
      uploadFile(p);  // log ส่งไปให้ดูด้วย แต่ไม่ย้าย เพราะบอร์ดยังต้องเขียนต่อ
    }
    // อย่างอื่น (counter.txt, /sent, audio_xxxx.wav จากขั้น 6) ข้ามไป
  }

  float sec = (millis() - t0) / 1000.0;
  Serial.printf("\nเสร็จ: ส่งสำเร็จ %d ไฟล์ (%.1f KB) ไม่สำเร็จ %d ไฟล์  ใช้เวลา %.1f วินาที (%.0f KB/s)\n",
                sentFiles, sentBytes / 1024.0, failedFiles, sec, sec > 0 ? sentBytes / 1024.0 / sec : 0);
  WiFi.disconnect(true);
}

void loop() {
}
