// วัดแบต: อ่านแรงดัน (mV) เฉลี่ย 16 ครั้ง ลดสัญญาณรบกวน
// ตอนเสียบ USB ค่าจะเป็นแรงดันตอนชาร์จ (สูงกว่าจริง)
int readBatteryMv() {
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(BAT_PIN);
  return (int)(sum / 16 * BAT_DIVIDER);
}
