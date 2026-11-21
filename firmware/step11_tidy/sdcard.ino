// การ์ด: เลขภาพล่าสุด (counter.txt) และบันทึก (log.txt)

// เปิดเครื่องครั้งแรก (ไม่ใช่ตื่นจากหลับ): อ่านเลขภาพล่าสุดจากการ์ด
// เพื่อไม่ให้เขียนทับภาพเก่าเมื่อเปลี่ยนแบตหรือกด RESET
int loadLastNumber() {
  File f = SD.open("/counter.txt", FILE_READ);
  if (!f) return 0;
  int n = f.parseInt();
  f.close();
  return n;
}

void saveLastNumber(int n) {
  File f = SD.open("/counter.txt", FILE_WRITE);
  if (f) {
    f.print(n);
    f.close();
  }
}

// จดบันทึกลงการ์ด เพราะตอนใช้แบตไม่มี Serial Monitor ให้ดู (มีเวลานำหน้าถ้ารู้เวลาแล้ว)
// log.txt ถูกส่งให้ server ทุกรอบ server อ่านค่าแบตจากในนี้ไปทำกราฟ
void writeLog(const char *msg) {
  String line = stamp();
  line += (line.length() ? "  " : "");
  line += msg;
  File f = SD.open("/log.txt", FILE_APPEND);  // APPEND = ต่อท้ายไฟล์เดิม ไม่เขียนทับ
  if (f) {
    f.println(line);
    f.close();
  }
  Serial.println(line);
}
