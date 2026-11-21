// Step 1: ทดสอบว่าบอร์ดทำงาน
// - ไฟ LED บนบอร์ดกะพริบ
// - พิมพ์ข้อความออก Serial Monitor
// - เช็กว่าเปิด PSRAM สำเร็จไหม

const int LED_PIN = 21;  // ไฟสีส้มบน XIAO ESP32S3 (ติดเมื่อสั่ง LOW)

// setup() ทำงานครั้งเดียวตอนเปิดเครื่อง
void setup() {
  Serial.begin(115200);  // เปิดช่องคุยกับคอมผ่าน USB ความเร็ว 115200
  delay(2000);           // รอให้คอมเปิด Serial Monitor ทัน

  pinMode(LED_PIN, OUTPUT);

  Serial.println("=== Memory Clip: Step 1 ===");
  Serial.printf("Chip: %s, %d cores\n", ESP.getChipModel(), ESP.getChipCores());
  Serial.printf("Flash: %u MB\n", ESP.getFlashChipSize() / (1024 * 1024));

  if (psramFound()) {
    Serial.printf("PSRAM: OK, %u KB\n", ESP.getPsramSize() / 1024);
  } else {
    Serial.println("PSRAM: NOT FOUND (ลืมใส่ PSRAM=opi ตอนคอมไพล์?)");
  }
}

// loop() ทำงานวนซ้ำไปเรื่อยๆ ไม่มีวันจบ
void loop() {
  digitalWrite(LED_PIN, LOW);   // ไฟติด
  delay(500);
  digitalWrite(LED_PIN, HIGH);  // ไฟดับ
  delay(500);

  Serial.printf("alive %lu s\n", millis() / 1000);  // millis() = เวลาตั้งแต่เปิดเครื่อง (มิลลิวินาที)
}
