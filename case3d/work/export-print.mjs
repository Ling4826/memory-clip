// รันจาก case3d/ หลังแก้ CONFIG; ไม่ใช้เครือข่าย
import fs from 'node:fs';import {CONFIG,STLExporter,makePrintParts,validatePart,inspectSTL} from './print-model.mjs';
fs.mkdirSync('print/v2/img',{recursive:true});
const parts=makePrintParts(),manifest={version:'v2',variant:'pendant',battery:1200,units:'mm',union:'overlapping closed source shells in one STL; merge in slicer',densityGcm3:1.24,massAssumption:'100% solid sum; overlaps counted twice; excludes support/brim',config:CONFIG,parts:[]};
for(const part of parts){
 const view=new STLExporter().parse(part.object,{binary:true}),data=Buffer.from(view.buffer,view.byteOffset,view.byteLength);Buffer.from('Memory Clip v2 | millimetres | merge overlapping shells').copy(data,0);
 fs.writeFileSync('print/v2/'+part.file,data);const disk=fs.readFileSync('print/v2/'+part.file),metrics=validatePart(disk,part),{solids}=inspectSTL(disk,part);
 const {object,...entry}=part;
 // อัตราเนื้อพลาสติกเฉลี่ยรวมการเคลื่อนที่ 2–5 mm³/s + เวลาเตรียม/ชั้นเล็ก
 const overhead=part.kind==='coupon'?[3,5]:[5,15],factor=part.supports.startsWith('ใช่')?1.3:1;
 const minutes=[Math.ceil(metrics.volumeMm3/5/60*factor+overhead[0]),Math.ceil(metrics.volumeMm3/2/60*factor+overhead[1])];
 manifest.parts.push({...entry,bytes:data.length,metrics,solids,timeMinutes:minutes});console.log('EXPORTED: '+part.file+' ('+data.length+' bytes)');
}
fs.writeFileSync('print/v2/manifest.json',JSON.stringify(manifest,null,2)+'\n');
