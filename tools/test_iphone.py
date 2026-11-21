# ทดสอบหน้าเว็บบนจอ iPhone 14 Pro (393x852) ด้วย Playwright
# ดักคำสั่งลบไม่ให้ถึง server จริง แล้ววัดขนาดปุ่มที่กดได้ทุกปุ่ม (ต้องไม่ต่ำกว่า 44px)
import sys
sys.stdout.reconfigure(encoding="utf-8")  # คอนโซล Windows ภาษาไทยพิมพ์ตัว · ไม่ได้
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
BASE = "http://127.0.0.1:8000/"
DAY = "2026-10-20"

# ปุ่มที่กดได้บนจอ: สูง/กว้างกี่ px (ไม่นับที่ซ่อนอยู่)
MEASURE = """() => [...document.querySelectorAll('a, button, summary, input, .clip .strip img')]
  .filter(e => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
  .map(e => { const r = e.getBoundingClientRect();
    return { what: (e.className || e.tagName) + ' ' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20),
             w: Math.round(r.width), h: Math.round(r.height) }; })"""

def small(items):
    return [i for i in items if i["h"] < 44 or i["w"] < 44]

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    iphone = p.devices["iPhone 14 Pro"]
    ctx = b.new_context(**{k: v for k, v in iphone.items() if k != "default_browser_type"}, color_scheme="dark")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/api/delete", lambda r: r.fulfill(json={"deleted": []}))
    page.route("**/api/restore", lambda r: r.fulfill(json={}))
    ok = lambda name, cond: print(("PASS " if cond else "FAIL ") + name)

    page.goto(BASE); page.wait_for_selector(".day-card")
    page.wait_for_timeout(1500)
    ok("home shows upload line", page.is_visible("#uploadLine"))
    print("  upload line:", page.text_content("#uploadLine"))
    page.screenshot(path=f"{OUT}/ip_home.png")
    ok("no horizontal scroll (home)", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    print("  small targets on home:", small(page.evaluate(MEASURE)))

    # แผงสถานะ: แตะป้าย -> เห็นแผง + เวลาส่งรอบหน้า -> แตะที่อื่น -> ปิด
    page.tap("#devPill"); page.wait_for_timeout(300)
    ok("status panel opens", page.is_visible("#devPanel"))
    ok("next upload shown", page.is_visible(".dev-next"))
    print("  next:", page.text_content(".dev-next") if page.is_visible(".dev-next") else None)
    page.screenshot(path=f"{OUT}/ip_panel.png")
    # แตะใต้แผง (แผงสูงไม่เท่ากันตามจำนวนรายการ ต้องเหลือที่ให้แตะปิดบนจอ iPhone)
    pb = page.locator("#devPanel").bounding_box()
    ok(f"panel leaves room below ({round(pb['y'] + pb['height'])}px of {page.viewport_size['height']})", pb["y"] + pb["height"] < page.viewport_size["height"] - 30)
    page.touchscreen.tap(300, page.viewport_size["height"] - 15); page.wait_for_timeout(300)
    ok("tap outside closes panel", not page.is_visible("#devPanel"))

    # หน้าวัน
    page.tap(".day-card >> nth=1"); page.wait_for_selector("#grid")
    page.wait_for_timeout(1500)
    ok("no horizontal scroll (day)", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    page.screenshot(path=f"{OUT}/ip_day_top.png")
    print("  small targets on day:", small(page.evaluate(MEASURE)))
    page.screenshot(path=f"{OUT}/ip_day_full.png", full_page=True)

    # คลิป: แถวเล็ก พับไว้ทั้งหมด -> แตะคลิปที่ 2 กางออก + เล่น -> แตะคลิปที่ 3 คลิปที่ 2 พับ
    clips = page.locator(".clip")
    ok(f"{clips.count()} clips, all closed", clips.count() > 1 and page.locator(".clip.open").count() == 0)
    rows_h = page.evaluate("(() => { const c = [...document.querySelectorAll('.clip')]; return c[c.length-1].getBoundingClientRect().bottom - c[0].getBoundingClientRect().top; })()")
    ok(f"clip list is short ({round(rows_h)}px for {clips.count()} clips)", rows_h < clips.count() * 80)
    clips.nth(1).locator(".clip-row").tap(); page.wait_for_timeout(800)
    ok("tap clip opens it", "open" in clips.nth(1).get_attribute("class"))
    ok("opened clip plays", page.evaluate("!document.querySelectorAll('.clip')[1].querySelector('audio')?.paused"))
    page.screenshot(path=f"{OUT}/ip_clip_open.png")
    clips.nth(2).locator(".clip-row").tap(); page.wait_for_timeout(500)
    ok("other clip closes + stops", "open" not in clips.nth(1).get_attribute("class")
       and page.evaluate("document.querySelectorAll('.clip')[1].querySelector('audio')?.paused ?? true"))
    clips.nth(2).locator(".clip-row").tap(); page.wait_for_timeout(300)

    # ภาพแบ่งเป็นชั่วโมง พับไว้ทั้งหมด -> แตะหัวชั่วโมงแรกเพื่อเปิด
    n_hours = page.locator(".hour").count()
    ok(f"photos grouped into {n_hours} hours, all closed", n_hours > 1 and page.locator(".hour.open").count() == 0)
    page.locator(".hour-toggle").first.scroll_into_view_if_needed()
    page.locator(".hour-toggle").first.tap(); page.wait_for_timeout(300)
    ok("tap hour opens it", page.locator(".hour").first.get_attribute("class") == "hour open")
    page.screenshot(path=f"{OUT}/ip_hours.png")

    # ภาพเต็มจอ: แตะภาพ -> ปุ่ม Share/Delete อยู่ล่างจอ
    page.locator("#grid .ph").first.tap(); page.wait_for_timeout(500)
    ok("lightbox opens", page.is_visible("#lightbox"))
    box = page.locator(".lb-share").bounding_box()
    ok("share button in bottom half", box["y"] > page.viewport_size["height"] / 2)
    page.screenshot(path=f"{OUT}/ip_lightbox.png")
    page.tap(".lb-close"); page.wait_for_timeout(300)
    ok("lightbox closes", not page.is_visible("#lightbox"))

    # เลือกภาพ -> แถบลบเต็มความกว้าง
    page.locator("#pickToggle").tap()
    page.locator("#grid .ph").nth(0).tap(); page.locator("#grid .ph").nth(1).tap()
    page.wait_for_timeout(300)
    ok("pick bar shows 2", page.text_content("#pickBar .n") == "2")
    w = page.locator("#pickBar .del").bounding_box()["width"]
    ok(f"delete button wide ({round(w)}px)", w > 200)
    page.screenshot(path=f"{OUT}/ip_pick.png")

    # "Select hour" ที่หัวชั่วโมงที่ 2 -> เลือกเพิ่มทั้งชั่วโมง
    second = page.locator(".hour").nth(1)
    in_hour = second.locator(".ph").count()
    second.locator(".hour-pick").tap(); page.wait_for_timeout(200)
    ok(f"select hour adds {in_hour}", page.text_content("#pickBar .n") == str(2 + in_hour))
    ok("button turns into Clear hour", second.locator(".hour-pick").text_content() == "Clear hour")

    # เลื่อนลงไปไกลๆ แล้วกด Cancel ที่แถบล่าง -> ออกจากโหมดเลือก
    page.mouse.wheel(0, 3000); page.wait_for_timeout(300)
    page.locator("#pickBar .cancel").tap(); page.wait_for_timeout(200)
    ok("cancel in bottom bar exits", not page.is_visible("#pickBar") and page.locator(".ph.picked").count() == 0)

    ok("no JS errors", not errors)
    for e in errors: print("  ", e)
    b.close()
