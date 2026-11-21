from pathlib import Path
p=Path('work/test-ui.mjs');s=p.read_text(encoding='utf-8');s=s.replace('buildDevice,estimateMass,partsList','buildDevice,estimateMass,partsList,wiringGapText').replace("'estimateMass','partsList',extract","'estimateMass','partsList','wiringGapText',extract").replace('estimateMass,partsList);','estimateMass,partsList,wiringGapText);');p.write_text(s,encoding='utf-8')
for f in ['test-inspection.mjs','test-browser.mjs']:
 p=Path('work/'+f);s=p.read_text(encoding='utf-8').replace("version==='v2'?6:3","version==='v2'?7:4")
 if f=='test-browser.mjs':s=s.replace("if(version==='v2')await shot('check-solder');","if(version==='v2'){await shot('check-solder');await shot('check-backpads');}\n  assert.equal(await run('__viewer.device.root.getObjectByName(\"silk\").userData.padLabels.length'),9,'all back labels rendered');\n  assert.equal(await run('document.getElementById(\"gapNote\").textContent.includes(\"1.84\")'),true,'clearance numbers visible');")
 p.write_text(s,encoding='utf-8')
# ล้างหมายเหตุเก่าที่อธิบายแถว BAT และปลายทางชาร์จผิด
p=Path('work/config.js');s=p.read_text(encoding='utf-8').replace('ไปขา 5V','ไปแผ่น VUSB หลัง').replace('BAT+ (ข้าง D3) / BAT− (ข้าง D2)','BAT+ / BAT− กลางบอร์ด');p.write_text(s,encoding='utf-8')
