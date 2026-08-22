import { clampLauncherPosition } from '../src/core/launcher-position.js'
let pass=0,fail=0
const check=(name,actual,expected)=>{const ok=JSON.stringify(actual)===JSON.stringify(expected);if(ok){pass++;console.log('PASS: '+name)}else{fail++;console.error('FAIL: '+name+' — got '+JSON.stringify(actual)+', want '+JSON.stringify(expected))}}
const viewport={width:1200,height:800,top:34}
check('free position preserved',clampLauncherPosition({x:500,y:300},viewport),{x:500,y:300})
check('left edge clamped',clampLauncherPosition({x:-50,y:300},viewport),{x:4,y:300})
check('right edge clamped',clampLauncherPosition({x:9999,y:300},viewport),{x:1152,y:300})
check('titlebar protected',clampLauncherPosition({x:500,y:0},viewport),{x:500,y:34})
check('bottom edge clamped',clampLauncherPosition({x:500,y:9999},viewport),{x:500,y:752})
check('invalid defaults top-right',clampLauncherPosition({x:NaN,y:NaN},viewport),{x:1152,y:34})
console.log(`\n${pass} passed, ${fail} failed`);if(fail)process.exit(1)
