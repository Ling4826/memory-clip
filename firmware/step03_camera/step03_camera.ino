// Step 3: ทดสอบกล้อง
// - เปิดกล้อง
// - ถ่ายภาพทุก 3 วินาที แล้วพิมพ์ขนาดไฟล์และตรวจว่าเป็น JPEG จริง
// (ยังไม่บันทึกไฟล์ ขั้นที่ 4 ค่อยเอาลง SD card)

#include "esp_camera.h"

const int LED_PIN = 21;  // active low: LOW = ติด

// ขาที่กล้องต่อกับชิป (เอามาจาก camera_pins.h ของตัวอย่าง CameraWebServer)
#define PWDN_GPIO_NUM  -1   // -1 = บอร์ดนี้ไม่ได้ต่อขานี้
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  10   // สัญญาณนาฬิกาที่ชิปส่งให้กล้อง
#define SIOD_GPIO_NUM  40   // SCCB data: ช่องสำหรับตั้งค่ากล้อง
#define SIOC_GPIO_NUM  39   // SCCB clock
#define Y9_GPIO_NUM    48   // Y2-Y9 = สายข้อมูลภาพ 8 เส้น ส่งทีละ 8 bit
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38   // บอกว่าเริ่มเฟรมใหม่
#define HREF_GPIO_NUM  47   // บอกว่าเริ่มแถวใหม่
#define PCLK_GPIO_NUM  13   // จังหวะของแต่ละพิกเซล

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

  config.xclk_freq_hz = 20000000;         // 20 MHz
  config.pixel_format = PIXFORMAT_JPEG;   // กล้องบีบอัดเป็น JPEG ให้เอง ไฟล์จึงเล็ก
  config.frame_size = FRAMESIZE_SVGA;     // 800x600 (ลองเปลี่ยนเป็น FRAMESIZE_UXGA = 1600x1200)
  config.jpeg_quality = 12;               // 0-63 ยิ่งน้อยยิ่งชัด แต่ไฟล์ใหญ่ขึ้น
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_PSRAM;  // เก็บภาพไว้ใน PSRAM
  config.grab_mode = CAMERA_GRAB_LATEST;    // เอาภาพล่าสุดเสมอ ไม่เอาภาพเก่าที่ค้างอยู่

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init FAILED: 0x%x\n", err);
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  // PID = รหัสรุ่นของเซนเซอร์กล้อง: 0x26 = OV2640, 0x3660 = OV3660
  Serial.printf("Camera OK, sensor PID = 0x%x\n", s->id.PID);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  Serial.println("=== Memory Clip: Step 3 (Camera) ===");

  if (!psramFound()) {
    Serial.println("PSRAM: NOT FOUND -> หยุด (ตั้ง Tools > PSRAM > OPI PSRAM)");
    while (true) delay(1000);  // หยุดตรงนี้ ไม่ทำต่อ
  }

  if (!initCamera()) {
    while (true) delay(1000);
  }

  // ภาพแรกๆ มักมืดหรือสีเพี้ยน เพราะกล้องยังปรับแสงไม่เสร็จ จึงทิ้งไป 3 ภาพ
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    delay(100);
  }
}

int photoCount = 0;

void loop() {
  digitalWrite(LED_PIN, LOW);  // ไฟติดระหว่างถ่าย
  unsigned long t0 = millis();
  camera_fb_t *fb = esp_camera_fb_get();   // fb = frame buffer = ที่เก็บภาพหนึ่งภาพ
  unsigned long took = millis() - t0;
  digitalWrite(LED_PIN, HIGH);

  if (!fb) {
    Serial.println("Capture FAILED");
  } else {
    photoCount++;
    // ไฟล์ JPEG ทุกไฟล์ขึ้นต้นด้วย FF D8 และลงท้ายด้วย FF D9
    bool isJpeg = fb->len > 4 &&
                  fb->buf[0] == 0xFF && fb->buf[1] == 0xD8 &&
                  fb->buf[fb->len - 2] == 0xFF && fb->buf[fb->len - 1] == 0xD9;

    Serial.printf("#%d  %dx%d  %u bytes (%.1f KB)  %lu ms  JPEG:%s\n",
                  photoCount, fb->width, fb->height, fb->len, fb->len / 1024.0,
                  took, isJpeg ? "OK" : "BAD");

    esp_camera_fb_return(fb);  // คืนที่เก็บภาพให้กล้อง ถ้าลืม จะถ่ายภาพต่อไปไม่ได้
  }

  delay(3000);
}
