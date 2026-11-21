// Step 4: ทดสอบ SD card
// ส่วน A: เปิด SD card แล้วพิมพ์ข้อมูลการ์ด
// ส่วน B: เขียนไฟล์ข้อความ แล้วอ่านกลับมาเทียบ
// ส่วน C: ถ่ายภาพ 3 รูปลง SD card (เอาการ์ดไปเปิดดูในคอมได้)
//
// สำคัญ: บน XIAO ESP32S3 Sense ขา CS ของ SD card คือ GPIO 21
// ซึ่งเป็นขาเดียวกับไฟ LED สีส้ม ขั้นนี้จึงห้ามใช้ LED

#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "esp_camera.h"

const int SD_CS_PIN = 21;  // Chip Select ของ SD card (ขาเดียวกับ LED!)

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

void stopHere() {
  Serial.println("หยุดทำงาน");
  while (true) delay(1000);
}

// ---------- ส่วน A ----------
bool initSD() {
  Serial.println("\n--- A: SD card ---");
  // SPI ใช้ขา SCK=7, MISO=8, MOSI=9 ตามค่าเริ่มต้นของบอร์ด
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD.begin FAILED (ไม่ได้ใส่การ์ด / ใส่ไม่สุด / ไม่ใช่ FAT32)");
    return false;
  }

  uint8_t type = SD.cardType();
  const char *typeName = type == CARD_MMC  ? "MMC"
                       : type == CARD_SD   ? "SDSC"
                       : type == CARD_SDHC ? "SDHC"
                                           : "UNKNOWN";
  Serial.printf("Card type: %s\n", typeName);
  Serial.printf("Card size: %llu MB\n", SD.cardSize() / (1024 * 1024));
  Serial.printf("Used:      %llu MB / %llu MB\n",
                SD.usedBytes() / (1024 * 1024), SD.totalBytes() / (1024 * 1024));
  return true;
}

// ---------- ส่วน B ----------
bool testWriteRead() {
  Serial.println("\n--- B: Write / Read test ---");
  const char *path = "/test.txt";
  const char *message = "Hello from Memory Clip!";

  File f = SD.open(path, FILE_WRITE);  // FILE_WRITE = เขียนทับไฟล์เดิม
  if (!f) {
    Serial.println("เปิดไฟล์เพื่อเขียนไม่ได้");
    return false;
  }
  f.print(message);
  f.close();  // ต้อง close เสมอ ไม่งั้นข้อมูลอาจยังไม่ถูกเขียนลงการ์ดจริง

  f = SD.open(path, FILE_READ);
  if (!f) {
    Serial.println("เปิดไฟล์เพื่ออ่านไม่ได้");
    return false;
  }
  String readBack = f.readString();
  f.close();

  Serial.printf("เขียน: \"%s\"\n", message);
  Serial.printf("อ่าน:  \"%s\"\n", readBack.c_str());
  bool ok = (readBack == message);
  Serial.println(ok ? "ตรงกัน -> OK" : "ไม่ตรงกัน -> BAD");
  return ok;
}

// ---------- ส่วน C ----------
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

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("Camera init FAILED");
    return false;
  }
  return true;
}

void savePhoto(int number) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Capture FAILED");
    return;
  }

  char path[32];
  snprintf(path, sizeof(path), "/photo_%04d.jpg", number);  // %04d = เติม 0 ข้างหน้าให้ครบ 4 หลัก

  unsigned long t0 = millis();
  File f = SD.open(path, FILE_WRITE);
  if (f) {
    size_t written = f.write(fb->buf, fb->len);
    f.close();
    Serial.printf("%s  %u bytes  เขียนใช้เวลา %lu ms  %s\n",
                  path, fb->len, millis() - t0,
                  written == fb->len ? "OK" : "เขียนไม่ครบ!");
  } else {
    Serial.printf("สร้างไฟล์ %s ไม่ได้\n", path);
  }

  esp_camera_fb_return(fb);
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("=== Memory Clip: Step 4 (SD card) ===");

  if (!psramFound()) {
    Serial.println("PSRAM: NOT FOUND (ตั้ง Tools > PSRAM > OPI PSRAM)");
    stopHere();
  }

  if (!initSD()) stopHere();
  if (!testWriteRead()) stopHere();

  Serial.println("\n--- C: Save photos ---");
  if (!initCamera()) stopHere();

  // ทิ้งภาพแรกๆ ระหว่างที่กล้องปรับแสง
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    delay(100);
  }

  for (int i = 1; i <= 3; i++) {
    savePhoto(i);
    delay(1000);
  }

  Serial.println("\nเสร็จแล้ว! ถอด USB -> ถอด SD card -> เสียบเข้าคอมเพื่อดูไฟล์");
}

void loop() {
  // ไม่ทำอะไร งานทั้งหมดอยู่ใน setup()
}
