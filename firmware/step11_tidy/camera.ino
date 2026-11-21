// กล้อง: เปิดกล้อง, ถ่ายภาพลงการ์ด, ภาพ timelapse ทุก 1 นาที

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
  config.frame_size = FRAMESIZE_UXGA;      // 1600x1200
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

// กล้องเพิ่งเปิดใหม่ทุกรอบ ต้องให้เวลาปรับแสง: ถ่ายทิ้ง 3 ภาพแรก
void warmUpCamera() {
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
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

void takeTimelapsePhoto() {
  photoNumber++;
  saveLastNumber(photoNumber);
  // รู้เวลา -> ใช้เวลาเป็นชื่อ, ไม่รู้ -> ใช้เลขลำดับ (เลขไม่ซ้ำเพราะจำไว้ใน counter.txt)
  String s = stamp();
  char path[40];
  if (s.length()) snprintf(path, sizeof(path), "/photo_%s.jpg", s.c_str());
  else snprintf(path, sizeof(path), "/photo_%05d.jpg", photoNumber);
  bool ok = savePhoto(String(path));
  if (!ok) photoFailCount++;

  char msg[96];
  // "bat 3912mV" ท้ายบรรทัด: server อ่าน log นี้ไปทำกราฟแบตในหน้าเว็บ
  snprintf(msg, sizeof(msg), "wake#%d  %s  %s  bat %dmV", wakeCount, path, ok ? "OK" : "FAILED", readBatteryMv());
  writeLog(msg);
}
