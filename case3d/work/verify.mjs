// รันจาก case3d/; เก็บผลจริงและไม่ถือ browser SKIP เป็น PASS
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const results=[],tests=fs.readdirSync('work').filter(n=>/^test-.*\.mjs$/.test(n)).sort((a,b)=>a==='test-browser.mjs'?1:b==='test-browser.mjs'?-1:a.localeCompare(b));
try{
 for(const file of ['build.mjs',...tests]){
  const output=execFileSync(process.execPath,['work/'+file],{encoding:'utf8',windowsHide:true,timeout:180000});results.push(output.trimEnd());process.stdout.write(output);
  if(file==='test-browser.mjs'&&!output.includes('PASS: Edge headless;'))throw Error('Edge full app check did not PASS');
 }
 const summary='PASS: all '+tests.length+' test files; build succeeded; Edge console errors: 0';results.push(summary);console.log(summary);
}catch(error){results.push('FAIL: '+error.message);if(error.stdout)results.push(String(error.stdout));if(error.stderr)results.push(String(error.stderr));process.exitCode=1;console.error(error.message);}
finally{fs.writeFileSync('outputs/test-results.txt',results.join('\n')+'\n');}
