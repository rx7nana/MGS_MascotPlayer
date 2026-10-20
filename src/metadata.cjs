'use strict';
const DEFAULTS={duration:300,loop:2,fade:5,name:'',gain:1,cpu:0,lpf:0};
const bounds={duration:[.1,600],fade:[0,60],loop:[1,100],gain:[0,4],cpu:[0,8],lpf:[0,1]};
function numeric(k,v,metadata=false){let n;if(['duration','fade'].includes(k)){const m=String(v).match(/^(\d+(?:\.\d+)?)(ms|s)?$/i);if(!m)return null;n=Number(m[1])/(m[2]?.toLowerCase()==='ms'||(metadata&&!m[2])?1000:1);}else n=Number(v);if(!Number.isFinite(n))return null;const [lo,hi]=bounds[k];if(n<lo||n>hi||(['loop','cpu','lpf'].includes(k)&&!Number.isInteger(n)))return null;return n;}
function resolveMetadata(text,player={}){const warnings=[],specified={},raw={};const first=String(text).replace(/^\uFEFF/,'').split(/\r?\n/)[0];const m=first.match(/^;\[([^\]]*)\]/);if(m)for(const tok of m[1].trim().split(/\s+/)){if(!tok)continue;const pair=tok.match(/^([^=]+)=(.*)$/);if(pair)raw[pair[1]]=pair[2];else warnings.push('Invalid metadata token: '+tok);}
const values={...DEFAULTS},origin={};for(const k of Object.keys(DEFAULTS)){if(k==='name'){values[k]=raw[k]?.slice(0,128)||'';origin[k]=raw[k]?'MML':'default';continue;}const p=player[k]!==undefined?numeric(k,player[k]):null;values[k]=p??DEFAULTS[k];origin[k]=p===null?'default':'player';if(raw[k]!==undefined){const n=numeric(k,raw[k],true);if(n===null){warnings.push(k+'='+raw[k]+' は無効／上限外。プレイヤー設定で補完');}else{values[k]=n;origin[k]='MML';specified[k]=n;}}}
if(values.fade>values.duration){warnings.push('fade exceeds duration; limited to duration');values.fade=values.duration;}
return {values,origin,raw,specified,warnings,limits:bounds,headerAtFirstLine:!!m};}
module.exports={resolveMetadata,DEFAULTS,numeric};
