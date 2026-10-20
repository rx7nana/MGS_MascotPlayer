// Original bounded MGS command inspection, not a compiler or a playback scheduler.
function inspectMgs(buf){
 const result={version:buf.subarray(3,6).toString(),scope:'Static score commands only. No synthetic playback events. Loops and tempo tables recorded, not executed.',tracks:[],warnings:[]};
 const marker=buf.indexOf(0x1a,8),head=marker+1;
 if(buf.subarray(0,3).toString()!=='MGS'||marker<0||head+40>buf.length){result.warnings.push('Invalid or truncated MGS header');return result;}
 if(result.version[0]==='A'||buf[head+1]&128){result.warnings.push('Compressed MGS not inspected; hardware playback remains independent');return result;}
 if(Number(result.version)<304){result.warnings.push('Legacy command timing not supported by static inspection');return result;}
 result.tempo=buf.readUInt16LE(head+2);result.opllMode=buf[head+1]&1;
 for(let t=1;t<=17;t++){
  const rel=buf.readUInt16LE(head+4+2*t);if(!rel)continue;let at=head+rel,octave=4,length=48;
  const track={track:t,sourceType:t<=3?'PSG':t<=8?'SCC':'OPLL',channel:t<=3?t-1:t<=8?t-4:t-9,commands:[],complete:false};result.tracks.push(track);
  for(let count=0;count<20000&&at<buf.length;count++){
   const offset=at,op=buf[at++];let n=0,kind='command';
   if(op===255){track.complete=true;break;}
   if(op>=0x20&&op<=0x2c){n=1;kind=op===0x2c?'Rest':'Note';}
   else if(op>=0x30&&op<=0x3c)kind=op===0x3c?'Rest':'Note';
   else if(op>=0xc0&&op<=0xcf)kind='Volume';
   else if(op>=0xd0&&op<=0xdf){kind='Octave';octave=(op&15)+1;}
   else if(op>=0x80&&op<=0x9f)kind='Instrument';
   else if(op===0x41){kind='Tempo';n=50;}
   else if(op===0x57||op===0x59){kind='Loop';n=3;}
   else if(op===0x58){kind='LoopExit';n=2;}
   else if(op===0x54)n=4;
   else if([0x4c,0x51,0x55,0x5c].includes(op))n=2;
   else if([0x42,0x44,0x46,0x48,0x49,0x4b,0x4d,0x50,0x52,0x53,0x5a,0x5b,0x5f,0x60,0x61].includes(op))n=1;
   else if(![0x40,0x4a,0x4e,0x4f,0x5d,0x63,0x64].includes(op)){result.warnings.push(`Track ${t}: unsupported opcode 0x${op.toString(16)} at ${offset}; remainder not guessed`);break;}
   if(at+n>buf.length){result.warnings.push(`Track ${t}: truncated command`);break;}
   const command={offset,opcode:op,kind,parameters:[...buf.subarray(at,at+n)]};
   if(op===0x42)length=buf[at]||256;
   if(op===0x4e)octave++;if(op===0x4f)octave--;
   if(kind==='Note'||kind==='Rest'){command.scoreOctave=octave;command.semitone=kind==='Note'?op&15:null;command.lengthSteps=n?(buf[at]||256):length;}
   if(kind==='Tempo')command.tempo=buf.readUInt16LE(at);
   track.commands.push(command);at+=n;
  }
 }
 if(result.opllMode)result.warnings.push('OPLL rhythm mapping not implemented in channel event observer; melodic channels 6–8 suppressed in rhythm mode');
 return result;
}


// MGSC output ASCII header (DSA mgsc/mgs-format.md). MML grammar stays in MGSC.
function readMgsHeader(buf){
 if(buf.length<32||buf.length>0x5e00)throw Error('MGSのサイズが対応範囲外です');
 if(buf.subarray(0,3).toString('ascii')!=='MGS'||! /^(?:[0-9]{3}|A[0-9]{2})$/.test(buf.subarray(3,6).toString('ascii'))||buf[6]!==13||buf[7]!==10)throw Error('MGSヘッダーが不正です');
 const end=buf.indexOf(0x1a,8),head=end+1;
 if(end<8||head+4>buf.length||buf[head]!==0)throw Error('MGSテキストヘッダーが欠損しています');
 const raw=buf.subarray(8,end);if(raw.length&&(raw.length<2||raw.at(-2)!==13||raw.at(-1)!==10)||raw.includes(0))throw Error('MGSタイトル終端が不正です');
 const compressed=!!(buf[head+1]&128);
 if(compressed){const n=buf.readUInt16LE(head+2);if(!n||head+4+n>buf.length)throw Error('圧縮MGSが途中で切れています');}
 else{if(head+40>buf.length)throw Error('MGSバイナリヘッダーが欠損しています');for(let i=0;i<18;i++){const off=buf.readUInt16LE(head+4+i*2);if(off&&(off<40||head+off>=buf.length))throw Error('MGSトラックオフセットが不正です');}}
 let titleRaw;try{titleRaw=new TextDecoder('shift-jis',{fatal:true}).decode(raw)}catch{throw Error('MGSタイトルのShift-JIS文字列が不正です')}
 // Preserve all compiler-defined title lines; fold only line separators for the single-line UI.
 const title=titleRaw.replace(/\r\n$/,'').replace(/\r\n/g,' ').replace(/\t/g,' ');
 return{version:buf.subarray(3,6).toString('ascii'),headerOffset:head,compressed,titleRaw,title:title.trim()?title:null,titleDefined:!!title.trim()};
}
export {inspectMgs,readMgsHeader};
