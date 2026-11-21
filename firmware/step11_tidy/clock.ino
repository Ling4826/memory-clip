// นาฬิกา: บอร์ดไม่มีนาฬิกาที่รู้เวลาจริง ได้เวลาจาก server ตอนต่อคอมได้ (syncTime อยู่ใน upload.ino)

// นาฬิกาของชิป (ไมโครวินาที): ยังเดินต่อตอนหลับลึก (ต่างจาก millis() ที่เริ่มนับ 0 ใหม่ทุกครั้งที่ตื่น)
int64_t nowUs() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (int64_t)tv.tv_sec * 1000000LL + tv.tv_usec;
}

// ส่วนเวลาในชื่อไฟล์ เช่น "20261020_143500" (เวลาไทย) ถ้ายังไม่รู้เวลาจริงคืนค่าว่าง
String stamp() {
  if (!timeValid) return "";
  time_t t = time(NULL);
  struct tm lt;
  localtime_r(&t, &lt);
  char buf[20];
  strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &lt);
  return String(buf);
}
