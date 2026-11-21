// ตัวแปรที่ใช้ร่วมกันหลายไฟล์
#pragma once

// ---------- จำไว้ข้ามการหลับ ----------
// RTC_DATA_ATTR = เก็บไว้ใน RTC memory ค่าไม่หายตอนหลับลึก (แต่หายถ้าถอดไฟหรือกด RESET)
RTC_DATA_ATTR int photoNumber = 0;
RTC_DATA_ATTR int wakeCount = 0;
RTC_DATA_ATTR int64_t nextPhotoUs = 0;   // เวลานัดถ่าย timelapse ภาพถัดไป
RTC_DATA_ATTR int64_t nextUploadUs = 0;  // เวลานัดลองหา hotspot ครั้งถัดไป
RTC_DATA_ATTR bool timeValid = false;    // นาฬิกาในชิปตรงกับเวลาจริงหรือยัง (ได้จาก server แล้ว)

// ตัวนับความผิดพลาดตั้งแต่ส่งสถานะครั้งก่อน เก็บใน RTC memory เพราะตอน SD เสียเขียน log ไม่ได้
// server ได้รับแล้วค่อยรีเซ็ตเป็น 0
RTC_DATA_ATTR int sdFailCount = 0;       // ตื่นมาแล้วเปิด SD ไม่ได้กี่ครั้ง
RTC_DATA_ATTR int camFailCount = 0;      // เปิดกล้องไม่ได้กี่ครั้ง
RTC_DATA_ATTR int photoFailCount = 0;    // ถ่าย/บันทึกภาพไม่สำเร็จกี่ภาพ
RTC_DATA_ATTR bool sdAlertSent = false;  // SD เสียรอบนี้แจ้ง server ไปแล้วหรือยัง (กันต่อ Wi-Fi ทุกนาทีจนแบตหมด)
RTC_DATA_ATTR int resetReason = 0;       // สาเหตุที่เปิดเครื่องครั้งล่าสุด (esp_reset_reason) เช่น ไฟเข้า, แบตตก, โค้ดค้าง

// ---------- เฉพาะรอบที่ตื่นอยู่ ----------
I2SClass i2s;  // ไมค์

// task อัดเสียง (core 0) กับ recordClip() (core 1) ใช้ร่วมกัน
volatile bool audioDone = false;
uint8_t *audioWav = NULL;
size_t audioWavSize = 0;

// ผลของรอบอัปโหลดนี้ (ส่งไปกับสถานะด้วย)
int sentFiles = 0;
int failedFiles = 0;
unsigned long uploadStart = 0;
bool uploadCut = false;  // ส่งนานจนครบเวลาจำกัด เหลือไฟล์ค้าง
int failStreak = 0;      // ส่งไม่ผ่านติดกันกี่ไฟล์แล้ว
