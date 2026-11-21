from pathlib import Path
p=Path('work/config.js');s=p.read_text(encoding='utf-8-sig').replace('seam: 0.08, ','')
s=s.replace('separation: 12','separation: 14').replace('plateWidth: 29','plateWidth: 31')
s=s.replace('antenna: { width: 4','antenna: { width: 3')
s=s.replace('pinCount: 7, usb:', 'pinCount: 7, cornerRadius: 0.8, senseRadius: 0.6, chipY: 3, shieldY: -4, usbRadius: 1, sdContactCount: 5, usb:')
s=s.replace('hingeWidth: 16, hingeY:', 'hingeWidth: 16, knuckleLength: 3, hingeY:')
p.write_text(s,encoding='utf-8')
p=Path('work/model.js');s=p.read_text(encoding='utf-8-sig')
s=s.replace('-(p.d/2-c.wall)/2','-(p.d/2-c.wall+c.bossOverlap)/2').replace('(p.d/2-c.wall)/2]', '(p.d/2-c.wall+c.bossOverlap)/2]')
s=s.replace('C.board.pcb,0.8,','C.board.pcb,C.board.cornerRadius,').replace('C.board.senseThickness,0.6,','C.board.senseThickness,C.board.senseRadius,')
s=s.replace('p.boardY+3,','p.boardY+C.board.chipY,').replace('p.boardY-4,','p.boardY+C.board.shieldY,').replace('C.board.usb[1],1.0,','C.board.usb[1],C.board.usbRadius,')
s=s.replace('for(let i=0;i<5;i++)','for(let i=0;i<C.board.sdContactCount;i++)').replace('(i-2)*C.board.pinPitch','(i-(C.board.sdContactCount-1)/2)*C.board.pinPitch')
s=s.replace('[-p.w/2+c.wall+C.antenna.width/2,p.boardY,','[-p.w/2+c.wall+C.antenna.width/2,p.batteryY,')
s=s.replace('[-p.w/2+c.wall+C.antenna.width/2,p.boardY-C.antenna.height/2,','[-p.w/2+c.wall+C.antenna.width/2,p.batteryY-C.antenna.height/2,')
s=s.replace('const knuckle=annulus(q.hingeOuter/2,q.pinDiameter/2,q.width,materials.mount,mount,[0,hingeY,hingeZ]);knuckle.rotation.y=Math.PI/2;', 'for(const sign of [-1,1]) {const knuckle=annulus(q.hingeOuter/2,q.pinDiameter/2,q.knuckleLength,materials.mount,mount,[sign*(q.width-q.knuckleLength)/2,hingeY,hingeZ]);knuckle.rotation.y=Math.PI/2;}')
# Clear spring's center: bridge supports only the end knuckles.
s=s.replace('box([q.width,q.hingeOuter,q.gap+q.thickness-q.hingeOuter/2],materials.mount,mount,[0,hingeY,-p.d/2-(q.gap+q.thickness+q.hingeOuter/2)/2]);', 'for(const sign of [-1,1]) box([q.knuckleLength,q.hingeOuter,q.gap+q.thickness-q.hingeOuter/2],materials.mount,mount,[sign*(q.width-q.knuckleLength)/2,hingeY,-p.d/2-(q.gap+q.thickness+q.hingeOuter/2)/2]);')
p.write_text(s,encoding='utf-8')
p=Path('work/ui-shell.html');s=p.read_text(encoding='utf-8-sig');s=s.replace('</style>', '''
    @media(min-width:681px){.app{height:100dvh;min-height:660px}.workspace{flex:1 1 0;height:auto;min-height:0}.sidebar{min-height:0}.stage{min-height:0}.workflow{flex:none}}
    .toast:not(.visible){display:none}.toast.visible{transform:translateX(-50%)}
  </style>''');p.write_text(s,encoding='utf-8')
p=Path('work/build.mjs');s=p.read_text(encoding='utf-8-sig').replace('.toast.visible{opacity:1;transform:translateY(0)}','.toast.visible{opacity:1;transform:translateX(-50%)}');p.write_text(s,encoding='utf-8')
