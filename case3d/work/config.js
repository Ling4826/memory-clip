// All physical lengths are mm; masses are g. 1 Three.js unit = 1 mm.
// ค่าฮาร์ดแวร์และน้ำหนักในแบบนี้เป็นค่าเริ่มต้น: ประมาณ ต้องวัดจริงก่อนพิมพ์
const CONFIG = {
  // ค่าฮาร์ดแวร์ที่ยังไม่ยืนยันด้วยเวอร์เนียร์; ที่มาตามตารางงาน pendant r2
  measured: {
    battery: { width: 33.8, height: 52.2, depth: 5.8, capacityMah: 1200 }, // วัดเวอร์เนียร์ 23 ต.ค.; ใช้ในแบบ 34 × 52.5 × 6 มม.
    board: { measuredWidth: 17.1, measuredHeight: 20.8, width: 17.8, height: 21, stackHeight: 13.5 }, // วัดเวอร์เนียร์ 23 ต.ค.; XIAO ใช้ 17.8 × 21 ตามสเปก, stack ใช้ 13.5 มม.
    button: { width: 6, height: 6, heightZ: 7.1 }, camera: { lensDiameter: 8.0 }, // วัดเวอร์เนียร์ 23 ต.ค.; ปุ่มสูง 7.1 มม., เลนส์ Ø8.0 มม.
    foam: { thickness: 2 }, // ค่าอ้างอิงโฟม EVA 2 มม.; รอวัดความหนาจริง
    screw: { diameter: 2, headDiameter: 3.8, angle: 90, length: 16 }, // ค่าประมาณ; สกรูรอวัดหัวและความยาวจริง
    usbBreakout: { width: 16, height: 14 }, // ยังไม่ได้ของ; รอวัดเวอร์เนียร์
    cord: { hookWire: 2.7, hookGate: 4.5, strapWidth: 14.1 }, // วัดลวดและปากตะขอ 23 ต.ค.; สายแบน ICPC กว้าง 14.1 มม.
  },
  case: { wall: 1.5, radius: 5, sideService: 4, endClearance: 2, bayGap: 4, usbBay: 16,
    depthClearance: 2, tiltReserve: 3, screwInset: 4, screwHole: 2.4,
    bossDiameter: 5.0, bossPilot: 1.7, bossOverlap: 0.15 }, // รู M2/เสา: ประมาณ ต้องวัดจริง
  board: { width: 17.8, height: 21, pcb: 1, stackHeight: 13.5, baseZ: -4,
    get senseZ() { return this.baseZ+this.pcb/2+CONFIG.detail.b2b.matedHeight+this.senseThickness/2; }, senseThickness: 1, senseWidth: 17.8, senseHeight: 21,
    chip: [9, 10, 1.7], shield: [11, 8, 2], header: [1.7, 16, 3.5],
    pad: [1.3, 1.8, 0.16], pinPitch: 2.54, pinCount: 7, cornerRadius: 0.8, senseRadius: 0.6, chipY: 3, shieldY: 2, usbRadius: 1, sdContactCount: 5, usb: [8.5, 6, 3.2],
    // วัดเวอร์เนียร์ 23 ต.ค.: กลางรูเสียงจากขอบซ้าย 1.0 มม. และขอบ USB 7.4 มม.
    // ใช้ x− ตามค่าประมาณเดิม เพราะ model ไม่มีขา D11 ให้ตรวจเครื่องหมาย; |x|=17.8/2−1.0=7.9, y=7.4−21/2=−3.1.
    mic: { x: -7.9, y: -3.1, width: 3.2, height: 2.5, depth: 1.3 },
    sd: { width: 13, height: 14, depth: 2.3, x: 2, y: 0, z: 2.6, cardOffsetY: -7,
      card: [11, 15, 0.8], serviceLength: 15, openingDepth: 3.5, accessReach: 13 } },
    // บอร์ดหมุนให้ด้าน 21 mm อยู่แนวตั้ง; ตำแหน่ง Sense/ไมค์/ช่อง SD: ประมาณ ต้องวัดจริง
  // PCB center is (0,0); USB edge is y=-10.5. Lens center is 14.2 mm from that edge, so y=14.2-10.5=3.7; x=0 from 8.5/8.5 mm edge measurements.
  camera: { sensor: [8, 8, 1.4], x: 0, y: 3.7, z: 6.9, lensDiameter: 8.0,
    lensLength: 4.6, bezelDiameter: 9.0, glassDepth: 0.35, apertureDiameter: 12.2,
    tilt: 10, pendantTilt: -12, minTilt: -20, maxTilt: 20, fov: 65, fovLength: 65,
    ribbonWidth: 4.2, ribbonThickness: 0.16,
    ribbon: { sdClearance: 0.5, padLift: 0.1, dropStep: 3, endX: 0, endY: -8.8, edgeMargin: 0.7, descent: 1.2 } }, // OV2640/สายแพ/FOV: ประมาณ ต้องวัดจริง
  batteries: {
    500: { width: 25, height: 35, depth: 5, mass: 10.5 },
    1000: { width: 34, height: 50, depth: 6, mass: 20.0 },
    1200: { width: 34, height: 52.5, depth: 6, mass: 24.0 } // ความจุ/ขนาดตาม measured; มวลประมาณตามสัดส่วน ต้องชั่งจริง
  }, // ขนาดซอง/แท็บ/บอร์ดป้องกันอาจเกินนี้: ประมาณ ต้องวัดจริง
    battery: { rearClearance: 1.6, foilRadius: 1.3, tapeHeight: 3.5, tapeDepth: 0.16,
    wireRadius: 0.36, wireSideOffset: 1.8,
    protection: [17,2.2,0.7], protectionLift: 0.6, tab: [1.5,2.4,0.12], tabX: 4, seal: 0.35 },
  button: { body: [6, 6, 7.1], capDiameter: 10, capDepth: 1.2, capStemDiameter: 3.6,
    capStemLength: 2.3, capFlangeDiameter: 12, capFlangeDepth: 1.2,
    holeClearance: 0.45, y: 0.5, switchZ: 6.0 }, // เผื่อช่องว่างปุ่มกับฝา 0.3 มม.; ทดสอบระยะกดจริงก่อนประกอบ
  led: { diameter: 3, height: 2.2, x: 8, y: 5, holeClearance: 0.25 },
  microphone: { holeDiameter: 1.5, pitch: 2.7, count: 1, ductWidth: 4.4, ductHeight: 4.4, ductBoreDiameter: 1.5, ductLength: 0.6 },
  usb: { openingWidth: 12, openingHeight: 5, z: 0, socket: [8.6, 5, 3.2],
    pcb: [12, 5, 1], wireRadius: 0.35 }, // ขนาดบอร์ด breakout ยังไม่ทราบ; ช่องเผื่อกำหนดแยกใน v2.cradle
  // กล่องรุ่น 2 (21 ต.ค. 2026): แก้ปัญหาที่เจอจากรุ่นกระดาษลัง
  //  - SD หลุดจนอ่านไม่ได้ 3 ชม. (ต้องดันการ์ดถึงหาย) -> ปิดช่องข้าง, ผนังกันการ์ดเลื่อนออก + โฟม, ขารองบอร์ด
  //  - เสียบ USB บนบอร์ดบ่อยเสี่ยงช่องหลุด -> ช่องชาร์จแยก (breakout 5.1kฮฉ) อยู่ในแท่นรับแรง + ไดโอด 1N5817 ไปแผ่น VUSB หลัง
  v2: { pendantBatteryClearance: 1.5, // ช่องว่างแบตแบบ pendant ต่อด้าน; วางโฟม 2 มม.แล้วยุบเหลือ 1.5 มม.
    rearPad: { width: 30, height: 50, depth: 0 }, // 23 ต.ค. เอาร่องออก (depth 0): ร่องอยู่ด้านที่วางบนฐานพิมพ์ ต้องพิมพ์ลอยข้ามช่อง 30 มม. แผ่นยางติดบนผิวเรียบแทน ถ้าจะใช้ร่องคืนให้ตั้ง 0.5
    sdStop: { foam: 2.0, thickness: 1.5, margin: 0.5, below: 1.0 },     // โฟม EVA 2 มม. ตามหน้าสินค้า; รอวัดเวอร์เนียร์
    ledge: { under: 0.8, width: 2.0, length: 2.0, inset: 8.0, lip: 1.2, lipGap: 0.8, lipHeight: 1.5 }, // gap 0.8/ข้าง; lip หนาขั้นต่ำ FDM
    cradle: { cavity: [16,14], side: 1.2, sideGap: 0.8, stop: 1.2, stopGap: 0.2, stopWidth: 8, sideShort: 0.6 }, // cavity 16×14; breakout ยังไม่ทราบขนาด
    diode: { length: 5.2, diameter: 2.7, band: 0.8 },  // 1N5817 (DO-41)
    wireGap: 1.2 }, // ระยะสาย GND ข้างสาย 5V
  // งานบัดกรีที่ทำจริง (19–21 ต.ค. 2026 ดู PROGRESS.md "ฮาร์ดแวร์ที่ต่อแล้ว") ตำแหน่งในแบบเป็นค่าประมาณ
  //  แบต 603450 -> JST -> BAT+ / BAT− กลางบอร์ด ด้านหลัง XIAO
  //  100k จาก BAT+ และ 100k จาก BAT− บิดขารวมกัน -> สายแดง -> D5 (GPIO6) (D0 เสีย รั่วลง GND)
  //  ปุ่ม SMD -> JST -> สายแดง D1 (GPIO2), สายดำ GND
  // จุดบัดกรีบนหลัง XIAO ตามงานจริง (done) / แผนรุ่น 2 (ยังไม่ทำ) ใช้ทำป้ายเลขในมุมงานบัดกรี
  solderLog: [
    { pad: 'BAT+', what: 'แบต สายแดง (ผ่าน JST) + ขา 100k ตัวที่ 1', done: true },
    { pad: 'BAT-', what: 'แบต สายดำ (ผ่าน JST) + ขา 100k ตัวที่ 2', done: true },
    { pad: 'D5', what: 'จุดรวม 100k ×2 → วัดแบต (GPIO6)', done: true },
    { pad: 'D1', what: 'ปุ่ม สายแดง (GPIO2)', done: true },
    { pad: 'GND', what: 'ปุ่ม สายดำ', done: true },
    { pad: 'VUSB', what: 'รุ่น 2: 5V จาก breakout ผ่านไดโอด 1N5817', done: false },
    { pad: 'back:GND', what: 'รุ่น 2: GND จาก breakout', done: false }
  ],
  wiring: { pins: { left: ['D0','D1','D2','D3','D4','D5','D6'], right: ['5V','GND','3V3','D10','D9','D8','D7'] }, // เรียงจากฝั่ง USB
    deadPin: 'D0', joint: 0.55, jointHeight: 0.7, wire: 0.4, wireBack: -6.8, // 28 AWG OD 0.8 / ตะกั่วสูง 0.7
    // กลาง PCB = (0,0); USB = y−; มองหลัง: D0 ฝั่ง x−; หมุนภาพ USB บน 180°; ทุกพิกัด/ขนาดประมาณจากรูป
    backPadsNote: 'ประมาณจากรูป 20 ต.ค. 2026 สเกล PCB 17.8 × 21 มม.; จุดถูกสายบังต้องวัดจริง',
    backPads: [
      {name:'VUSB',x:4.5,y:-9.0,size:[1.1,1.8],note:'ประมาณจากรูป'},
      {name:'MTDO',x:1.2,y:-8.4,size:[1,1.2],note:'ประมาณจากรูป'},
      {name:'MTDI',x:-1.4,y:-8.4,size:[1,1.2],note:'ประมาณจากรูป'},
      {name:'GND',x:1.2,y:-4.8,size:[1,1.2],note:'ประมาณจากรูป; ป้าย/จุดถูกสายบังบางส่วน'},
      {name:'EN',x:-1.4,y:-6.0,size:[1,1.2],note:'ประมาณจากรูป; ถูกสายบัง'},
      {name:'3V3',x:4.5,y:-4.8,size:[1,1.2],note:'ประมาณจากรูป; ถูกสายบัง'},
      {name:'MTMS',x:-1.4,y:-4.8,size:[1,1.2],note:'ประมาณจากรูป'},
      {name:'BAT-',x:-2.9,y:-3.2,size:[1.6,1.6],note:'ประมาณจากรูป; ก้อนตะกั่วบังขอบ'},
      {name:'BAT+',x:-2.9,y:-0.8,size:[1.6,1.6],note:'ประมาณจากรูป; ก้อนตะกั่วบังขอบ'}
    ],
    goldPad: {x:0.8,y:2.2,size:[2.3,2.7]}, // แผ่นทองไม่ระบุ net: ประมาณจากรูป ไม่ต่อสาย
    jst: [6, 8, 4],                                                 // JST PH 2 ขา เสียบคู่กัน ก × ยาว × สูง
    batteryJst: { x: -12.5, y: -3.5, z: -4.8 }, buttonJst: { x: 12.5, y: 3, z: -4.8 }, // เทียบกับกลางบอร์ด
    resistor: { length: 6.3, diameter: 2.3, shrink: 2.9, xs: [-11, -13.5], y0: -1, z: 3, lead: 0.3 } }, // 100k 1/4W + ท่อหดเขียว วางข้างบอร์ดฝั่งหน้า (ฝั่งหลังมี JST แบต)
  antenna: { width: 3, height: 15, depth: 0.8, cableRadius: 0.3,
    ufl: { x: 6.3, y: 8.5, outer: 1, inner: 0.55, height: 0.9 }, trace: 0.18,
    routeY: 7, rearZ: -7.5, bend: 0.8 },
  // รายละเอียดจากภาพ: ขั้วต่อและระยะย่อยยังต้องวัดจริง
  detail: { castellation: { radius: 0.45, plating: 0.3 }, shieldRadius: 0.8,
    lensRings: 5, lensThread: 0.14, sdContacts: 8, sdContact: [3.1,0.75,0.04], sdContactPitch: 1.1,
    tactile: { leg: [1.2,1,0.35], cap: 3.5, capHeight: 0.8, top: 0.3 },
    jstWall: 0.55, jstPin: [0.45,3,0.45], jstPitch: 2, // ประมาณ ไม่ได้วัด
    b2b: { size: [4.8,1.7], matedHeight: 3.5, heightNote: 'ประมาณเดิม ยังยืนยันความสูง B2B จริงไม่ได้ ต้องวัดช่องผิว PCB ถึงผิว PCB', x: 1, y: 7.8, seam: 0.16, pitch: 0.55, pin: [0.22,0.22,2.8], count: 8 },
    usbWall: 0.3, usbTongue: [5.8,0.6,0.55], contact: [0.24,1.1,0.08], contactPitch: 0.48,
    sdMetal: 0.18, sdRoofGap: 0.15, sdNotch: [1.1,1.8], sdWindow: [3,1.1],
    fpc: { size: [6,1.1,0.65], latch: [5.4,0.35,0.28], y: -9.25 },
    passive: [1,0.5,0.45], passivePitch: 1.3, silkLift: 0.03 },
  // ภาพ IMG_8274–8277: ทุกระยะย่อยประมาณ ไม่ได้วัด; ลึก 40 มม. ผู้ใช้ระบุ
  cardboard: { width: 120, height: 120, depth: 40, wall: 1.2, radius: 1,
    cameraDrop: 27, cameraHole: 9.5, lensRecess: 0.3, boardTape: [5,29,0.12],
    batteryX: -29, batteryY: -25, batteryGap: 0.45,
    hook: { radius: 4, wire: 0.75, y: 49, x: 47, gap: 1.5, hole: 4, length: 19, ring: 6, gate: 1.2 },
    lanyard: { width: 10, thickness: 0.65, rise: 95, spread: 62, color: '#326a37' },
    tape: { width: 9, depth: 0.12, inset: 7, color: '#e4ae16', length: 22 },
    flap: { height: 27, notchWidth: 27, notchDepth: 10, lean: 0.16, sideHeight: 13 },
    rough: 0.65, flutePitch: 2.5, fluteDepth: 0.32, seam: 0.18, grainTile: 24,
    usbX: -3, cableRadius: 1.4, cableExit: 33, plug: [8,8,4], boot: [6,5,3.5],
    antenna: { size: [8,45,0.45], x: -39, y: -1, gap: 2.5, tilt: -0.15, slit: [25,2.5], slitX: -33, slitY: 18 },
    button: { y: -40, z: 11, wireHole: 3.5, holeY: -29, holeZ: 9, gap: 1.5 },
    batteryJst: [-5,-46,7], buttonJst: [38,-20,5], resistorX: [5,10], resistorY: 11, resistorZ: 9,
    wireLoopY: -49, wireRadius: 0.45, heatShrink: { length: 10, radius: 0.85 },
    print: { outer: '#d9d697', ink: '#292b22', rectangle: [51,25], rectangleY: -12, labelY: -43 },
    mass: 25 }, // ประมาณ ไม่ได้วัด
  screw: { diameter: 2, headDiameter: 3.8, headDepth: 1.2, countersink: 4, countersinkAngle: 90,
    throughHole: 2.4, pilot: 1.7, length: 16, available: [4,5,6,8,10,12,16,20] },
  clip: { width: 14, length: 36, thickness: 2.2, gap: 5, tip: 2.4,
    hingeOuter: 5, pinDiameter: 1.8, hingeWidth: 16, knuckleLength: 3, hingeY: 22, springRadius: 2,
    springWire: 0.45, springTurns: 4 }, // สปริง/สลักเป็นโลหะซื้อเพิ่ม: ประมาณ ต้องวัดจริง
  magnet: { diameter: 10, depth: 3, separation: 14, y: 1,
    pocketClearance: 0.25, plateWidth: 31, plateHeight: 20, plateDepth: 4.2,
    plateRadius: 4, shirtGap: 0.6, retainer: 0.5 }, // 2 ก้อนในกล่อง + 2 ก้อนแผ่นหลัง: ประมาณ ต้องวัดจริง
  pendant: { outerWidth: 17, outerHeight: 9, holeWidth: 10, holeHeight: 4,
    thickness: 3, overlap: 1.2, cordRadius: 1.2, cordHeight: 150,
    lug: { tabLength: 7, slot: [6, 4.5], slotX: 13, slotRadius: 1,
      barWidth: 3, barDepth: 5, barRecess: 0.8,
      topRadius: 3 }, // แผ่นหัวและแท่งเกี่ยว; ต้องวัดตะขอจริงก่อนพิมพ์
      // FE 23 ต.ค.: ช่อง 7 มม. ที่ x±14 เหลือผนังข้าง 2.5 มม. ร้าวเมื่อตกเฉียงชนมุมหัว จึงย้ายช่องเข้าใน ±13 และแคบลงเป็น 6 (ผนัง 4 มม.)
      // topRadius: มุมบนของแผ่นหัว เดิม R1 คมเกิน ตอนนี้ R3 ได้เต็มวงเพราะร่องแท่งไม่ชนมุมแล้ว
    // รุ่น 2 ที่สั่งพิมพ์ KNN 23 ต.ค.: ห่วงตะขอ 2 ห่วงยื่นเหนือหัวกล่อง (ก่อนเปลี่ยนเป็นแผ่นหัว Rev 3)
    eyes: { x: 18, outerDiameter: 10.2, holeDiameter: 4.0, chamfer: 0.3, topOffset: 1.4 } },
  torso: { chestWidth: 360, shoulderWidth: 440, neckWidth: 92, neckTop: 215,
    shoulderY: 135, clavicleY: 120, lowerY: -300, depth: 125, shirtThickness: 0.8 },
  mass: { front: 6.7, back: 7.1, referenceArea: 36 * 75, board: 2.8, sense: 1.8,
    camera: 1.2, button: 0.65, cap: 0.45, led: 0.10, wires: 0.9, usb: 0.8,
    antenna: 0.35, screws: 0.7, clipPlastic: 2.4, clipHardware: 1.3,
    v2Extras: 0.7, // ผนัง/ขารอง/แท่น + ไดโอด + โฟม (ประมาณ)
    magnetEach: 1.77, magnetPlate: 1.6, pendant: 0.8, cord: 1.5 }, // น้ำหนักทุกชิ้น: ประมาณ ต้องชั่งจริง
  view: { fov: 36, near: 0.1, far: 5000, maxPixelRatio: 2, solderDistance: 62, // มุมงานบัดกรี: ระยะกล้องจากหลังบอร์ด
    minDistance: 45, maxDistance: 1800, floorY: -55, gridSize: 600, gridDivisions: 60,
    explodedDistance: 52, labelOffset: 18, lightPosition: [90,180,160],
    iso: [135,65,200], exploded: [240,90,170], front: [0,0,235], side: [240,0,0],
    conversation: [180,230,1000], conversationTarget: [0,15,0],
    torsoView: [410,170,780], background: '#f3f4ef' },
  colors: { front: '#e2e1d6', back: '#273f4a', pcb: '#23434b', sense: '#254e50',
    battery: '#e8b64e', foil: '#d8d9d2', camera: '#23313a', glass: '#327c96',
    copper: '#d78b44', metal: '#afb8be', button: '#ee835d', led: '#30df9a',
    mount: '#7b759c', magnet: '#8995a3', foam: '#3b3b3b', v2: '#c8743a',
    cardboard: '#ae7b45', cardboardEdge: '#79502c', tape: '#c7a36b',
    jst: '#f1efe6', resistor: '#4f8fd6', shrink: '#3fa45b', solder: '#c9ccd0', silk: '#f4f4ee', dead: '#e0473c', shirt: '#e7e5dc', skin: '#ccbba5' }
};
// ให้ค่าที่รอวัดในกลุ่ม measured เป็นแหล่งเดียวที่ขับแบบ/การ export
Object.assign(CONFIG.board,{width:CONFIG.measured.board.width,height:CONFIG.measured.board.height,stackHeight:CONFIG.measured.board.stackHeight});
Object.assign(CONFIG.batteries[1200],{width:34,height:52.5,depth:6,mass:CONFIG.measured.battery.capacityMah/50});
CONFIG.button.body[2]=CONFIG.measured.button.heightZ;
CONFIG.camera.lensDiameter=CONFIG.measured.camera.lensDiameter;
CONFIG.button.body=[CONFIG.measured.button.width,CONFIG.measured.button.height,CONFIG.measured.button.heightZ];
CONFIG.v2.sdStop.foam=CONFIG.measured.foam.thickness;
Object.assign(CONFIG.screw,{diameter:CONFIG.measured.screw.diameter,headDiameter:CONFIG.measured.screw.headDiameter,countersinkAngle:CONFIG.measured.screw.angle,length:CONFIG.measured.screw.length});
window.CONFIG = CONFIG;
