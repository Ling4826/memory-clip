// แชร์ไฟล์ (ภาพ/วิดีโอ) ผ่านหน้าต่างแชร์ของมือถือ -> เลือก IG / Facebook / LINE ได้เลย
// ต้องแชร์เป็น "ไฟล์" ไม่ใช่ลิงก์ เพราะลิงก์ของเราเปิดได้แค่เครื่องใน Tailscale เพื่อนเปิดไม่ได้
// ใช้ได้เฉพาะหน้าเว็บ https (ผ่าน Tailscale ใช้ได้) ถ้าเครื่องไม่รองรับ จะดาวน์โหลดไฟล์แทน

export async function shareFile(src, name) {
  const blob = await (await fetch(src)).blob();
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Memory Clip' }); } catch { /* กดยกเลิก */ }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
