# รอบ 2 — ตรวจการประกอบ Memory Clip

ขอบเขตตามคำสั่งผู้ใช้ 22 ต.ค. 2026; ทำในที่เดิม ไม่มี git; ไม่เขียนทับ backup

1. เพิ่ม `sectionPlane`, `applySection`, `computeMeasurements`, `partsList` ใน model.js; ทดสอบระนาบทั้งสองแกนและค่าระยะจาก Box3 ก่อนต่อ UI
2. app.js ใช้ local clipping เฉพาะอุปกรณ์, DoubleSide, slider แกน/ตำแหน่ง; dimension overlay แยกจาก STL; ตัวเลขอ้างอิงตอนประกอบและบอกชัดเมื่อแยกชิ้น
3. CONFIG.cardboard รวมค่าประมาณจากภาพ 8274–8277: 120×120×40, ฝาเปิด, รูหน้า, ตะขอ/สายคล้อง, บอร์ดหัน USB ขึ้น, แบตซ้ายล่าง, เสาด้านหน้า, ปุ่มด้านข้าง, JST/ท่อหด/สายจริง
4. เพิ่มเกลียวเลนส์, marking shield, SD contacts, tactile 4 ขา, JST มีโพรง/ขา; รักษา geometry budget เดิม
5. รายการชิ้นส่วนไทยจาก CONFIG; note รวมค่าประมาณ; ปิด STL รุ่นกระดาษเช่นเดิม
6. เพิ่ม test-inspection/test-cardboard; ปรับ test-details/test-wiring/test-ui เฉพาะสมมติฐานรุ่นกระดาษที่ภาพหักล้าง; test-browser exercise controls/rebuild/mobile/export
7. รันทุก test + build, ดูภาพ Edge, ตรวจ solids และ collisions; เขียน PASS จริงลง outputs/test-results.txt และ append PROGRESS.md

จุดตรวจ: section ไม่ตัด torso/เส้นขนาด, slider/แกนข้าม rebuild, export ไม่ติด section; ขนาดตรง endpoint ไม่เป็นค่าคงที่; สายลอดรูจริง; อุปกรณ์ไม่ชนกระดาษ; top เปิด; ทรัพยากรไม่สะสม; ขนาดภาพเป็นประมาณ ไม่ได้วัด (ความลึก 40 มม. ผู้ใช้ระบุ)
