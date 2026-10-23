import{playbackSnapshot}from'./performance-set.js';
import{PlaylistPlayback,appendSongs}from'./playlist-state.js';
import{createView}from'./view.js';import{AudioTransport}from'./transport-integrated.js';import{LivePerformanceEvents}from'./live-performance-events.js';import{DisplayTransport,displayPitch}from'./display-pitch.js';
let preparing035=false,pendingSeek035=0,pendingSeekSerial035=0,playIntent035=false,playingSnapshot035=null;
let auditPhase='interactive',settingsActive=false;const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));let info=await host.get(),{cfg}=info,audit=!!info.auditSpec;const audio=new AudioTransport((...a)=>host.audio(...a));await audio.init();let titles=info.trackTitles;const titleFor=p=>titles[p]||p?.split(/[\\/]/).at(-1)||'—';let view,ready=false,playing=false,time=0,last=performance.now(),fadeTimer,holding=false,pinned=false,popup=null,frameN=0,statsAt=last,motionInfo=null,loadedMotionPath=cfg.vmdPath,loadedMotionHash=cfg.motionHash;
function motionProfile(bpm=playingSnapshot035?.motion?.bpm||120){bpm=Number.isFinite(bpm)&&bpm>0?bpm:120;const seconds=Math.max(1/30,motionInfo?.duration||1/30);return{...audio.sync.profile,baseBpm:bpm,loopBeats:seconds*bpm/60,motionLoopStartSeconds:0}}
let lastShape=0;const mask=document.createElement('canvas'),maskCtx=mask.getContext('2d',{willReadFrequently:true});let lists=structuredClone(cfg.playlists),activeListId=cfg.playlists[cfg.active].id,active=cfg.active,current=cfg.playlists[cfg.active].songs.length?Math.max(0,cfg.playlists[cfg.active].songs.indexOf(cfg.currentFile)):-1,history=cfg.playlists[cfg.active].songs.slice(Math.max(0,current-2),Math.max(0,current)),future=[],queue=[],dirty=false,pendingList=null,pendingFuture=null,nowTitle=lists[active].songs[current]||lists[active].songs[0],duration=cfg.duration;
const playback=new PlaylistPlayback(lists,activeListId,cfg);
const changes=[];function record(type,data={}){changes.push({type,...data});host.action('record',{type,...data})}
function shuffled(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function syncPlaylistView(){active=lists.findIndex(l=>l.id===playback.active);if(active<0)active=cfg.active;activeListId=lists[active].id;current=lists[active].songIds.indexOf(playback.current?.id);nowTitle=playback.current?.path||lists[active].songs[0]||'';history=playback.history.map(e=>e.path);future=playback.upcoming().map(e=>lists[active].songIds.indexOf(e.id)).filter(i=>i>=0);pendingList=null;pendingFuture=null}
function rebuild(){playback.configure(lists,lists[cfg.active]?.id||activeListId,cfg);syncPlaylistView()}
rebuild();function visibleSongs(){return[history.at(-2),history.at(-1),nowTitle,...playback.upcoming().slice(0,2).map(e=>e.path)].map(x=>x||'—')}
function drawTracks(){const a=visibleSongs(),box=$('#tracks');box.replaceChildren();a.forEach((name,i)=>{const el=document.createElement('div');el.className='song '+(i===2?'current':Math.abs(i-2)===2?'far':'');el.title=titleFor(name);const span=document.createElement('span');span.textContent=titleFor(name);el.append(span);el.onclick=()=>{if(settingsActive)return;if(i===3)operate(()=>next());else if(i===1)operate(previous);else if(i===4)operate(async()=>{await next();await next()})};box.append(el);if(i===2)requestAnimationFrame(()=>{const excess=span.offsetWidth-el.clientWidth;if(excess>1){el.classList.add('over');el.style.setProperty('--overflow',-(excess+12)+'px')}})})}
function adoptNextList(){rebuild()}
async function next(natural=false){const selected=playback.next(natural);syncPlaylistView();if(!selected){loadRequest++;await audio.stop(true);if(!playback.present(playback.current)){playback.current=null;syncPlaylistView()}playing=false;time=duration;drawTracks();refresh();return}if(selected.repeatCurrent){await loadCurrent(true,selected.path);refresh();return}time=0;drawTracks();refresh();record('next',{title:nowTitle,entryId:selected.id});await loadCurrent(true,selected.path)}
async function previous(){const selected=playback.previous();syncPlaylistView();if(!selected){if(audio.song&&playback.present(playback.current)){await audio.seek(0);refresh()}return}time=0;drawTracks();refresh();await loadCurrent(true,selected.path)}
function apply(c){const prior=cfg;cfg=c;if(audio){audio.setVolume(c.volume);if(audio.selection.sourceType!==c.sourceType||audio.selection.channel!==c.channel)audio.select(c.sourceType,c.channel);}applyUiTheme(c.uiTheme);for(const k of['prev','next','stop','shuffle','instrument','size','angle','gear','move'])$('#'+k).innerHTML=skinIcon(k);$('#volume-trigger').innerHTML=skinIcon('volume');document.body.classList.remove('design-A');document.body.dataset.textMode=c.textMode;document.body.classList.add('design-B');$('#volume').value=c.volume;$('#shuffle').classList.toggle('active',c.shuffle);document.body.dataset.layout=c.panelLayout;$('#repeat').classList.toggle('active',c.repeatMode!=='OFF');$('#repeat').innerHTML=skinIcon('repeat')+'<small>'+c.repeatMode+'</small>';$('#repeat').title='リピート '+c.repeatMode;$('#repeat').setAttribute('aria-label','リピート '+c.repeatMode);$('#instrument').classList.toggle('active',c.instrument);$('#instrument').title='ショルダーキーボード表示 '+(c.instrument?'ON':'OFF');$('#size').title='表示サイズ '+c.scale+'%';$('#angle').title='モデルの向き '+c.angle+'°';if(popup){$('#popup-value').textContent=Math.round(c[popup]*(popup==='volume'?100:1))+(popup==='angle'?'°':'%');$('#popup-range').value=c[popup]}duration=c.duration;$('#seek').max=duration;$('#mascot').style.transform=`scale(${c.scale/100})`;view?.config({scale:.94,offsetX:0,offsetY:0,angle:c.angle,instrumentVisible:c.instrument,performanceEnabled:c.instrument&&c.performance,glowEnabled:c.glow,whiteMode:'C',rightHandMode:'B'});refresh();regions()}
function refresh(){if($('#play').dataset.playing!==String(playing)){$('#play').innerHTML=skinIcon(playing?'pause':'play');$('#play').dataset.playing=String(playing)}$('#elapsed').textContent=fmt(time);$('#total').textContent=fmt(duration);if(!holding)$('#seek').value=time}
function fmt(s){return`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`}

function show(){document.body.classList.add('controls-visible');$('#controls').inert=false;clearTimeout(fadeTimer);fadeTimer=null;regions()}
function hidePanel(){if(holding||popup||pinned||settingsActive)return;document.body.classList.remove('controls-visible');$('#controls').inert=true;regions()}
function hideLater(){if(fadeTimer)return;fadeTimer=setTimeout(()=>{fadeTimer=null;hidePanel()},2000)}
host.on('hover',p=>{if(audit)return;document.body.classList.toggle('move-visible',p.inside&&p.x<65&&p.y<75);const b=$('#controls').getBoundingClientRect();if(p.inside&&p.x>=b.x-8&&p.x<=b.right+8&&p.y>=b.y-12)show();else hideLater();regions()});
function rect(el,guard=3){const b=el.getBoundingClientRect();return{x:b.x-guard,y:b.y-guard,width:b.width+guard*2,height:b.height+guard*2}}
function regions(){if(settingsActive){host.regions([]);return}const r=[...$('#tracks').querySelectorAll('.song span')].filter(el=>el.textContent!=='—').map(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect(),x=Math.max(a.left,b.left),right=Math.min(a.right,b.right);return{x:x-2,y:Math.max(a.top,b.top)-2,width:Math.max(0,right-x)+4,height:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)+4}}).filter(r=>r.width>4);if(document.body.classList.contains('controls-visible')){r.push(rect($('#controls')));r.push(rect($('#quit')))}if(document.body.classList.contains('move-visible'))r.push(rect($('#move')));if(popup)r.push(rect($('#popup')));host.regions(r)}
function closePopup(){if(popup)record('popup-close',{kind:popup});popup=null;$('#popup').hidden=true;regions();hideLater()}
let movingWindow=false;function dragPoint(type,e){host.drag({type,x:e.screenX,y:e.screenY})}function release(e){if(movingWindow){if(e&&e.type!=='pointercancel'&&Number.isFinite(e.screenX))dragPoint('end',e);else host.drag({type:'end'});movingWindow=false}holding=false;host.hold(false);hideLater();regions()}
window.addEventListener('pointermove',e=>{if(movingWindow)dragPoint('move',e)});window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);$('#move').onpointerdown=e=>{holding=true;host.hold(true);e.currentTarget.setPointerCapture(e.pointerId);movingWindow=true;dragPoint('begin',e)};
$('#controls').onmouseenter=show;$('#controls').onmouseleave=hideLater;$('#controls').onfocusin=show;$('#controls').onfocusout=hideLater;$('#controls').onpointerdown=e=>{holding=true;host.hold(true);if(e.target.matches('input'))e.target.setPointerCapture(e.pointerId)};
document.addEventListener('pointerdown',e=>{if(popup&&!(e.target instanceof Element&&e.target.closest('#popup,#size,#angle,#volume-trigger')))closePopup()});
host.on('settings-state',open=>{settingsActive=open;if(open){release();closePopup();show();$('#mini').inert=true;$('#controls').inert=true}else{$('#mini').inert=false;$('#controls').inert=!document.body.classList.contains('controls-visible');hideLater()}regions()});
host.on('window-blur',()=>{if(!settingsActive){release();closePopup()}});
$('#play').onclick=()=>operate(async()=>{if(preparing035){playIntent035=!playIntent035;return}if(['playing','paused'].includes(audio.mode))return audio.pause();if(!playback.present(playback.current)){const e=playback.next(false);if(!e)playback.current=null;syncPlaylistView()}return loadCurrent(true,playback.current?.path||'')});$('#stop').onclick=()=>operate(async()=>{loadRequest++;preparing035=false;playingSnapshot035=null;motionInfo=null;view?.clearMotion();await audio.stop(true)});$('#next').onclick=()=>operate(()=>next(false));$('#prev').onclick=()=>operate(previous);$('#shuffle').onclick=async()=>{cfg=await host.set({shuffle:!cfg.shuffle});rebuild();drawTracks()};$('#repeat').onclick=()=>host.set({repeatMode:['OFF','ALL','ONE'][(['OFF','ALL','ONE'].indexOf(cfg.repeatMode)+1)%3]});$('#volume').oninput=e=>host.set({volume:+e.target.value});$('#seek').oninput=e=>operate(async()=>{await seekCurrent035(+e.target.value);record('seek',{position:audio.position})});$('#gear').onclick=()=>host.action('settings');$('#quit').onclick=()=>host.action('quit');$('#instrument').onclick=()=>host.set({instrument:!cfg.instrument});
function pop(kind){popup=kind;$('#popup').hidden=false;const r=$('#popup-range');r.min=kind==='volume'?0:kind==='scale'?70:-180;r.max=kind==='volume'?1:kind==='scale'?125:180;r.step=kind==='volume'?.01:1;r.value=cfg[kind];$('#popup-label').textContent=kind==='volume'?'音量':kind==='scale'?'表示サイズ':'モデルの向き';$('#popup-value').textContent=Math.round(cfg[kind]*(kind==='volume'?100:1))+(kind==='angle'?'°':'%');r.oninput=()=>{$('#popup-value').textContent=Math.round(+r.value*(kind==='volume'?100:1))+(kind==='angle'?'°':'%');host.set({[kind]:+r.value})};const button=$('#'+(kind==='volume'?'volume-trigger':kind==='scale'?'size':'angle')).getBoundingClientRect(),panel=$('#controls').getBoundingClientRect();$('#popup').style.left=Math.max(0,Math.min(panel.width-350,button.left-panel.left-110))+'px';show();regions()}
$('#volume-trigger').onclick=()=>pop('volume');$('#size').onclick=()=>pop('scale');$('#angle').onclick=()=>pop('angle');$('#popup-close').onclick=closePopup;
function registrationNotice(text){$('#loading').textContent=text;$('#loading').hidden=false;setTimeout(()=>{if($('#loading').textContent===text)$('#loading').hidden=true},6000)}
async function addFiles(names){if(settingsActive){record('drop-blocked-settings');return[]}
 const id=lists[active]?.id;
 try{const r=await host.action('validate-tracks',names);const committed=structuredClone((await host.get()).cfg.playlists),list=committed.find(l=>l.id===id);if(!list)throw Error('追加先のプレイリストが変更されました');
 if(!r.accepted.length&&r.rejected.length)throw Error(r.rejected.map(x=>x.reason).join('\n'));
 titles={...titles,...Object.fromEntries(r.tracks.map(t=>[t.path,t.title]))};appendSongs(list,r.accepted);await host.set({playlists:committed});dirty=false;
 record('drop-add',{accepted:r.accepted,rejected:r.rejected,autoplay:false,provisional:r.tracks.filter(t=>t.verified===false).map(t=>t.path)});
 if(r.tracks.some(t=>t.verified===false))registrationNotice('登録しました。COM未配置のためコンパイル未確認です。再生時に必要なCOMを確認します。');
 else if(r.rejected.length)registrationNotice('一部のファイルは登録できませんでした：'+r.rejected.map(x=>x.reason).join('／'));
 return r.accepted;
 }catch(e){record('drop-error',{message:e.message});fail(e);return[];}
}
window.addEventListener('dragend',()=>{$('#mini').classList.remove('dragging');regions()});window.addEventListener('blur',()=>$('#mini').classList.remove('dragging'));$('#mini').ondragover=e=>{e.preventDefault();$('#mini').classList.add('dragging');regions()};$('#mini').ondragleave=e=>{if(!e.currentTarget.contains(e.relatedTarget)){$('#mini').classList.remove('dragging');regions()}};$('#mini').ondrop=e=>{e.preventDefault();$('#mini').classList.remove('dragging');addFiles([...e.dataTransfer.files].map(f=>host.fileName(f)||f.name));regions()};
host.on('config',async c=>{const changed=JSON.stringify(c.playlists)!==JSON.stringify(lists),oldActive=activeListId;if(c.setEpoch!==cfg.setEpoch&&playback.current){playback.current={...playback.current,listId:'detached-set-'+cfg.setEpoch};playback.history=[];playback.bag=[];}lists=structuredClone(c.playlists);playback.configure(lists,c.playlists[c.active].id,c);const detachedLive=['playing','paused','buffering-output','generating'].includes(audio.mode)&&audio.currentFile===playback.current?.path;if(!detachedLive&&(!playback.present(playback.current)||playback.current?.listId!==playback.active)){const first=playback.entries()[0];if(first)playback.select(first.id);else playback.current=null}syncPlaylistView();apply(c);dirty=false;if(changed||oldActive!==activeListId){titles=(await host.get()).trackTitles;drawTracks()}});
host.on('playlist-clean',()=>dirty=false);host.on('confirm-close',async()=>{try{if((await host.get()).cfg.setDirty){const choice=await host.action('confirm');if(choice===2){host.closeCancel();return}if(choice===0&&!await host.action('set-save',{as:false})){host.closeCancel();return}}loadRequest++;await audio.release();host.closeReady()}catch(e){record('close-save-error',{message:e.message});registrationNotice('保存できません。終了を中止しました。');host.closeCancel()}});
const palettes={aurora:['#90bfff','#80e8d5','#ba9dfa'],ice:['#80ccf2','#d3f8ff','#81b7ff'],pastel:['#e2b4e7','#a1dfd4','#f4d6a4'],neon:['#f681ed','#00e4e8','#9cff8f'],mono:['#dbe6ed','#fff','#acb8c5']};
function ring(t){const canvas=$('#visualizer'),d=devicePixelRatio;canvas.width=innerWidth*d;canvas.height=innerHeight*d;const c=canvas.getContext('2d');c.scale(d,d);if(!cfg.visualizer)return;const cx=innerWidth/2,cy=innerHeight*.48,r=innerWidth*.335,colors=palettes[cfg.palette]||palettes.aurora;c.globalAlpha={subtle:.36,standard:.62,vivid:.85}[cfg.brightness]||.62;c.lineCap='round';for(let i=0;i<112;i++){const a=i/112*Math.PI*2,v=playing?(spectrum[Math.min(255,Math.floor(2*Math.pow(120,i/111)))]||0)/255:0,len=4+v*v*Math.max(0,Math.min(innerWidth/2-18,innerHeight*.48-18)-r),x=Math.cos(a),y=Math.sin(a);c.strokeStyle=colors[Math.floor(i/112*colors.length)%colors.length];c.lineWidth=cfg.design==='A'?4:3;c.beginPath();c.moveTo(cx+x*r,cy+y*r);c.lineTo(cx+x*(r+len),cy+y*(r+len));c.stroke()}}
apply(cfg);drawTracks();try{view=await createView($('#mascot'));view.performanceControl.events=new LivePerformanceEvents(new DisplayTransport(audio),[...view.instrument.lights.keys()]);apply(cfg);view.clearMotion();ready=true;$('#loading').hidden=true;record('model-ready',{metrics:view.metrics,simulated:false});await audio.setProfile(motionProfile());if(info.settingsWarning)registrationNotice(info.settingsWarning)}catch(e){$('#loading').textContent='モデル読込エラー：'+e.message;record('model-error',{message:e.message})}
let syncRows=[],lastFlush=0,lastStatus=0,lastDiscontinuity=-1;const spectrum=new Uint8Array(256),bars=new Float32Array(112);let analyser=null,analyserContext=null;
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;const sync=audio.sample();time=audio.position;playing=audio.mode==='playing';duration=audio.song?.seconds||cfg.duration;$('#seek').max=duration;if(audio.ctx&&audio.gain&&analyserContext!==audio.ctx){analyserContext=audio.ctx;analyser=audio.ctx.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.72;audio.gain?.connect(analyser)}if(analyser)analyser.getByteFrequencyData(spectrum);ring(time);if(ready){const t=sync&&motionInfo?(playingSnapshot035?.motion?.loop?sync.motionSeconds:Math.max(0,Math.min(motionInfo.duration,sync.absoluteMotionBeat*60/(playingSnapshot035?.motion?.bpm||120)))):audio.sync.profile.motionLoopStartSeconds;const before=view.currentFrame();view.render({time:t,audioTime:audio.position,playing,motion:!!motionInfo},dt);view.camera.alpha=-Math.PI/2-cfg.angle*Math.PI/180;const beats=audio.sync.profile.loopBeats,gap=(before/30-t)*(playingSnapshot035?.motion?.bpm||120)/60;syncRows.push({samplePosition:Math.floor(time*48000),timeSeconds:time,bpm:sync?.bpm,songBeat:sync?.songBeat,computedVmdSeconds:t,renderedVmdSeconds:view.currentFrame()/30,errorBeats:(view.currentFrame()/30-t)*(playingSnapshot035?.motion?.bpm||120)/60,previousDrawGapBeats:lastDiscontinuity===audio.discontinuity?Math.abs(((gap+beats/2)%beats+beats)%beats-beats/2):null,discontinuity:audio.discontinuity,mode:audio.mode,generated:audio.generated,background:audio.generationActive});lastDiscontinuity=audio.discontinuity;if(now-lastFlush>1000){if(info.auditSpec||info.inputSpec)host.trace(syncRows);syncRows=[];lastFlush=now}}refresh();frameN++;if(now-statsAt>2000){const a=audio.snapshot();host.stats({input:{audit,classes:document.body.className,holding,popup},fps:frameN*1000/(now-statsAt),audio:a,right:view?.performanceControl.metrics,white:view?.white?.probe?.(),uiTheme:cfg.uiTheme,phase:auditPhase,pcmEnergy:spectrum.reduce((a,b)=>a+b,0)});host.status({title:titleFor(nowTitle),mode:audio.mode,bpm:sync?.bpm,error:errorText});frameN=0;statsAt=now}requestAnimationFrame(frame)}requestAnimationFrame(frame);
async function recordVideo(name,fn,seconds=5,settings=false){const c=document.createElement('canvas');c.width=settings?920:640;c.height=settings?720:760;const ctx=c.getContext('2d'),stream=c.captureStream(8);if(audio.captureSink&&!settings)for(const t of audio.captureSink.stream.getAudioTracks())stream.addTrack(t.clone());const chunks=[],mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')?'video/webm;codecs=vp9,opus':'video/webm',rec=new MediaRecorder(stream,{mimeType:mime});rec.ondataavailable=e=>chunks.push(e.data);const done=new Promise(r=>rec.onstop=r);rec.start();const end=performance.now()+seconds*1000;let count=0;await fn?.();while(performance.now()<end){const b=await host.action('capture',{settings});const im=await createImageBitmap(new Blob([b],{type:'image/png'}));ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);im.close();if(info.inputSpec){const status=await host.action('input-status');ctx.font='12px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.fillStyle='#fff';const label='受信側ウィンドウ内容 / x:'+status.bounds.x+' y:'+status.bounds.y+' / '+(status.ignored?'透過':'UI受付');ctx.strokeText(label,70,40);ctx.fillText(label,70,40);const px=status.cursor.x-status.bounds.x,py=status.cursor.y-status.bounds.y;if(px>=0&&py>=0&&px<640&&py<760){ctx.strokeStyle='#00eaff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.stroke()}}if(info.auditSpec?.mode==='phase4-endurance'&&enduranceOrigin!==null){ctx.font='14px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.fillStyle='#fff';const stamp='耐久経過 '+((performance.now()-enduranceOrigin)/1000).toFixed(2)+' 秒';ctx.strokeText(stamp,70,40);ctx.fillText(stamp,70,40)}count++;await sleep(125)}rec.stop();await done;stream.getTracks().forEach(t=>t.stop());await host.action('video',{name,bytes:Array.from(new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer()))});record('video',{name,frames:count,targetFps:8,settings,audio:!settings&&!!audio.captureSink})}



let errorText=null;function fail(e){errorText=(e.message||String(e)).replace(/^Error invoking remote method '[^']+': Error: /,'');$('#loading').hidden=false;$('#loading').textContent=errorText;record('integration-error',{message:errorText,stack:e.stack})}async function operate(fn){try{errorText=null;$('#loading').hidden=true;return await fn()}catch(e){fail(e)}}
let loadRequest=0;
// A playback request owns an immutable motion snapshot until that performance ends.

async function seekCurrent035(seconds){
 if(preparing035){pendingSeek035=Math.max(0,Number(seconds)||0);pendingSeekSerial035++;return;}
 return audio.seek(seconds);
}
async function loadCurrent(play,file=nowTitle){
 const request=++loadRequest;
 preparing035=true;playIntent035=play;pendingSeek035=0;pendingSeekSerial035++;
 view?.clearMotion();motionInfo=null;playingSnapshot035=null;
 try{
  await audio.stop(true);
  if(request!==loadRequest)return{cancelled:true};
  if(!file){
   const picked=await host.action('choose-mml');if(request!==loadRequest||!picked?.length){preparing035=false;return;}
   const accepted=await addFiles(picked);if(!accepted.length){preparing035=false;return;}
   const entry=playback.entries().find(e=>e.path===accepted[0]);playback.select(entry.id);syncPlaylistView();drawTracks();file=entry.path;
  }
  const checked=await host.action('validate-tracks',[file]);if(request!==loadRequest)return{cancelled:true};
  if(!checked.accepted.length)throw Error(checked.rejected[0]?.reason||'選択した曲を読み込めません');
  const entry=playback.entries().find(e=>e.path===file);
  if(playback.current?.path!==file&&entry)playback.select(entry.id);
  syncPlaylistView();titles[file]=checked.tracks[0].title;drawTracks();
  const snapshot=playbackSnapshot(cfg,playback.current);playingSnapshot035=snapshot;
  await host.action('externals-required',{kind:checked.tracks[0].kind});if(request!==loadRequest)return{cancelled:true};
  const begin=performance.now();$('#loading').hidden=false;$('#loading').textContent='音楽とモーションを準備しています…';
  const prepareMotion=async()=>{
   const m=snapshot.motion;if(!m)return null;
   let source;
   const cancelled=async()=>{await host.action('motion-status',{id:m.id,state:'未確認',request:source?.request||''});return null;};
   try{
    source=await host.action('motion-prepare',m);if(request!==loadRequest)return cancelled();
    if(!source.ok)throw Error(source.message);
    const loaded=await view.loadMotion(source.url,'曲別VMD');if(request!==loadRequest||!loaded)return cancelled();
    await host.action('motion-status',{id:m.id,state:'読み込み済み',request:source.request});return loaded;
   }catch(e){
    if(request!==loadRequest)return cancelled();
    view.clearMotion();await host.action('motion-status',{id:m.id,state:'読み込み不可',request:source?.request||''});
    record('motion-unavailable',{motionId:m.id,message:e.message||String(e)});return null;
   }
  };
  const motionTask=prepareMotion();
  // Observe both failures immediately. Never leave an old preparation's rejection unhandled.
  const [result,nextMotion]=await Promise.all([audio.compile(file),motionTask]);
  if(request!==loadRequest||result.cancelled)return{cancelled:true};
  motionInfo=nextMotion;
  await audio.setProfile(motionProfile(snapshot.motion?.bpm||120));
  let seekSerial;
  do{seekSerial=pendingSeekSerial035;if(pendingSeek035>0)await audio.seek(pendingSeek035);}while(request===loadRequest&&seekSerial!==pendingSeekSerial035);
  if(request!==loadRequest)return{cancelled:true};
  nowTitle=file;await host.set({currentFile:file,currentEntryId:playback.current?.id||''});
  if(request!==loadRequest)return{cancelled:true};
  preparing035=false;$('#loading').hidden=true;
  if(playIntent035)await audio.play();
  if(snapshot.motion&&!nextMotion)registrationNotice('VMDを読み込めません。音楽のみ再生します。割り当てを保持し、次回再試行します。');
  record('performance-ready',{request,millis:performance.now()-begin,file,motionId:snapshot.motion?.id||null,motionReady:!!motionInfo,position:audio.position});
  return result;
 }catch(e){
  if(request!==loadRequest)return{cancelled:true};
  loadRequest++;preparing035=false;view?.clearMotion();motionInfo=null;await audio.stop(true);throw e;
 }
}

audio.onEnded=()=>operate(()=>next(true));host.on('player-command',c=>operate(async()=>{if(c.type==='compile'||c.type==='play-file'){const l=lists.find(l=>l.id===c.listId)||lists[active],id=c.entryId||l.songIds[l.songs.indexOf(c.file)];if(!playback.select(id,l.id))throw Error('保存済みプレイリストに曲がありません');syncPlaylistView();drawTracks();await loadCurrent(c.type==='play-file',c.file)}}));

async function integrationAudit(){const results=[];const gate=(step,name,ok,data={})=>{record('step-check',{step,name,ok,...data});results.push({step,name,ok,...data});if(!ok)throw Error(step+' '+name+' failed')};try{pinned=true;show();await sleep(500);
gate('B','display-octaves',[[36,48],[47,59],[48,48],[60,60],[71,71],[72,60],[84,60]].every(([p,d])=>displayPitch(p)===d));gate('B','legacy-cover-IK',view.performanceControl.constructor.name==='ArmCoverController');gate('C','white-C-limited',view.white.probe().mode==='C'&&!view.white.probe().characterUsesFill&&view.white.probe().unmodifiedMaterialsUnchanged,{probe:view.white.probe()});
for(const id of['ice','lavender','mint','rose','mono']){const at=performance.now();await host.set({uiTheme:id});await new Promise(requestAnimationFrame);gate('D','theme-'+id,cfg.uiTheme===id,{millis:performance.now()-at});await host.action('capture',{name:'theme-'+id})}await host.set({uiTheme:'ice'});
const files=['seek_long','playlist_a','playlist_b','playlist_c'].map(n=>info.auditSpec.tests+'/'+n+'.mus');await host.set({playlists:[{name:'統合確認',songs:files}],active:0});await sleep(200);current=0;nowTitle=files[0];history=[];pendingList=null;rebuild();drawTracks();const start=performance.now();await loadCurrent(true);await sleep(700);gate('E','actual-output-clock',audio.position>0&&audio.mode==='playing',{snapshot:audio.snapshot(),startMillis:performance.now()-start});gate('B','IK-live-state',view.performanceControl.metrics.rightHandMode==='B'&&view.performanceControl.metrics.additionalProtectedUnchanged,{right:view.performanceControl.metrics});gate('E','PCM-visualizer',spectrum.some(x=>x>0));
await recordVideo('front-audio-dance',null,5);await host.set({angle:45});await recordVideo('45degree-audio-dance',null,5);await host.set({angle:0});const p0=audio.position;await audio.pause();const frozen=audio.position;await sleep(350);gate('E','pause-freezes-clock',Math.abs(audio.position-frozen)<.003);await audio.seek(2.5);gate('E','paused-seek',Math.abs(audio.position-2.5)<.003&&audio.mode==='paused');await audio.pause();await sleep(200);gate('E','resume',audio.position>2.5);await audio.seek(10);gate('E','seek-state',audio.channel()!=null&&audio.motion!=null,{metrics:audio.seekMetrics.at(-1)});
await host.set({instrument:false});await sleep(300);gate('B','instrument-off-VMD',!view.performanceControl.metrics.enabled);await host.set({instrument:true});await sleep(300);
const oldFile=audio.song.file;await host.set({playlists:[...lists,{name:'次リスト',songs:[files[2],files[1]]}],active:1});await sleep(180);gate('E','playlist-switch-keeps-current',audio.song.file===oldFile&&pendingList===1&&visibleSongs()[3]===files[2]);await host.set({active:0});await sleep(100);pendingList=null;pendingFuture=null;await host.action('settings');await sleep(400);await recordVideo('UI-settings-real-player',async()=>{['playback','motion','effects','system','playlist'].forEach((t,i)=>setTimeout(()=>host.action('settings-tab',t),i*900))},5,true);await host.action('close-settings');
await audio.stop(true);await host.set({playlists:[{name:'連続再生確認',songs:files.slice(1)}],active:0,repeatMode:'OFF'});await sleep(200);active=0;activeListId=lists[0].id;pendingList=null;current=0;nowTitle=files[1];history=[];rebuild();drawTracks();await loadCurrent(true);await recordVideo('playlist-continuous-audio',null,17);gate('E','final-stop',['stopped','ended'].includes(audio.mode),{snapshot:audio.snapshot(),history,nowTitle});
current=0;nowTitle=files[0];await host.set({playlists:[{name:'シーク確認',songs:[files[0]]}],active:0});await sleep(200);await loadCurrent(true);await audio.seek(17.99);await sleep(200);await audio.stop(true);
await loadCurrent(true);auditPhase='performance';await sleep(2000);await host.action('gpu');auditPhase='audit';gate('E','no-output-underrun',audio.underruns===0&&audio.missingSamples===0,{snapshot:audio.snapshot()});await audio.stop(true);await host.set({uiTheme:'ice',angle:0,scale:100});record('integration-results',{results});await host.action('integration-done',{results});dirty=false;await host.action('playlist-clean');await host.action('quit')
}catch(e){record('integration-audit-stopped',{error:e.stack,results});await host.action('integration-done',{error:e.stack,results});dirty=false;await host.action('playlist-clean');await host.action('quit')}}if(false&&info.auditSpec){if(info.auditSpec.mode==='title-format')titleFormatCheck();else if(info.auditSpec.mode==='click-diagnosis')clickDiagnosis();else if(info.auditSpec.mode==='phase4-endurance')phase4Endurance();else if(info.auditSpec.mode==='rc-short')rcShort();else if(info.auditSpec.mode==='controls-settings')controlsAudit();else if(info.auditSpec.mode==='long')longAudit();else if(info.auditSpec.mode==='error-ui')errorUiAudit();else if(info.auditSpec.mode==='final-regression')finalRegression();else integrationAudit()}

async function controlsAudit(){const results=[],test=(name,ok,data={})=>{record('extra-check',{name,ok,...data});results.push({name,ok,...data});if(!ok)throw Error(name)};try{pinned=true;show();await sleep(400);const files=['playlist_a','playlist_b','playlist_c'].map(n=>info.auditSpec.tests+'/'+n+'.mus');await host.set({playlists:[{name:'編集テスト',songs:files}],active:0});await sleep(150);current=0;nowTitle=files[0];active=0;activeListId=lists[0].id;pendingList=null;pendingFuture=null;rebuild();await loadCurrent(false);$('#play').click();await sleep(350);test('UI-play',audio.mode==='playing');$('#play').click();await sleep(200);test('UI-pause',audio.mode==='paused');$('#seek').value=1.2;$('#seek').dispatchEvent(new Event('input'));await sleep(200);test('UI-seek-paused',Math.abs(audio.position-1.2)<.01);$('#shuffle').click();await sleep(150);test('UI-shuffle',cfg.shuffle);$('#repeat').click();await sleep(150);test('UI-repeat',cfg.repeatMode==='ALL');await host.set({shuffle:false,repeatMode:'OFF'});
for(const[k,v]of[['volume',.4],['scale',105],['angle',20]]){pop(k);$('#popup-range').value=v;$('#popup-range').dispatchEvent(new Event('input'));await sleep(120);test('UI-popup-'+k,cfg[k]===v&&(k!=='volume'||audio.volume===v));closePopup()}await host.set({volume:.65,scale:100,angle:0});
let settingsResult;host.on('settings-audit-result',r=>settingsResult=r);await host.action('settings');await sleep(350);await host.action('settings-selftest');const limit=performance.now()+10000;while(!settingsResult&&performance.now()<limit)await sleep(50);test('playlist-settings-flow',settingsResult?.length>0&&settingsResult.every(x=>x.ok),{settingsResult});await host.action('close-settings');await audio.stop(true);const production=await host.action('production-com-status');test('production-COM-same-folder',production.every(x=>x.present&&x.valid),{production});record('extra-results',{results});await host.action('integration-done',{results});dirty=false;await host.action('playlist-clean');await host.action('quit')}catch(e){record('extra-stopped',{error:e.stack,results});await host.action('integration-done',{error:e.stack,results});dirty=false;await host.action('playlist-clean');await host.action('quit')}}

async function longAudit(){const results=[],test=(name,ok,data={})=>{record('long-check',{name,ok,...data});results.push({name,ok,...data});if(!ok)throw Error(name)};try{pinned=true;show();const file=info.auditSpec.tests+'/performance-300.mus';await host.action('externals-required');await audio.compile(file);const before=audio.generated;await audio.seek(60);test('uncached-before-output',audio.seekMetrics.at(-1).uncached&&Math.abs(audio.position-60)<.01,{beforeGenerated:before,metric:audio.seekMetrics.at(-1)});await audio.play();await sleep(250);test('start-from-seek',audio.position>60&&audio.mode==='playing');await audio.stop(true);await audio.compile(file);await audio.play();await audio.seek(90);test('uncached-playing',audio.seekMetrics.at(-1).uncached&&audio.mode==='playing',{metric:audio.seekMetrics.at(-1)});await sleep(200);test('no-underrun',audio.underruns===0&&audio.missingSamples===0,{snapshot:audio.snapshot()});await audio.stop(true);record('long-results',{results});await host.action('integration-done',{results});dirty=false;await host.action('playlist-clean');await host.action('quit')}catch(e){record('long-stopped',{error:e.stack,results});await host.action('integration-done',{error:e.stack,results});dirty=false;await host.action('playlist-clean');await host.action('quit')}}

async function errorUiAudit(){pinned=true;show();await sleep(300);await operate(()=>loadCurrent(true));await sleep(200);record('normal-mode-COM-guidance',{hasRequiredNames:errorText?.includes('MGSC.COM')&&errorText?.includes('MGSDRV.COM'),noIpcPrefix:!errorText?.includes('invoking remote'),text:errorText});await host.action('capture',{name:'normal-COM-guidance'});await host.action('settings');await sleep(300);await host.action('settings-tab','system');await sleep(250);await host.action('capture',{name:'system-COM-missing',settings:true});await host.action('close-settings');await host.action('integration-done',{mode:'error-ui'});dirty=false;await host.action('playlist-clean');await host.action('quit')}

async function finalRegression(){const results=[],test=(name,ok,data={})=>{record('regression-check',{name,ok,...data});results.push({name,ok,...data});if(!ok)throw Error(name)};try{pinned=true;show();await sleep(300);await loadCurrent(true,info.auditSpec.tests+'/seek_long.mus');await sleep(200);for(const sourceType of['PSG','SCC','OPLL']){await host.set({sourceType,channel:0});await sleep(120);const raw=audio.channel(),mapped=view.performanceControl.events.transport.channel();test('channel-'+sourceType,raw?.sourceType===sourceType&&mapped?.sourceType===sourceType&&(mapped.pitch==null||(mapped.pitch>=48&&mapped.pitch<72)),{rawPitch:raw?.pitch,displayPitch:mapped?.pitch})}await host.set({sourceType:'PSG',channel:0,repeatMode:'ONE'});await audio.seek(audio.song.seconds-.05);await sleep(450);test('repeat-ONE-restarts',audio.mode==='playing'&&audio.position<1,{position:audio.position});await audio.stop(true);
await host.set({vmdBpm:173,duration:90,loop:3,fade:2,lpf:false});const hash=await host.action('save-bpm'),before=JSON.stringify(cfg.playlists);await host.action('reset');await sleep(200);const ac=await host.audio('config');test('reset-engine-defaults',ac.playerDefaults.duration===300&&ac.playerDefaults.loop===2&&ac.playerDefaults.fade===5&&ac.playerDefaults.lpf===1);test('reset-clears-VMD-keeps-playlists',JSON.stringify(cfg.playlists)===before&&cfg.vmdPath===''&&cfg.vmdBpm===null&&Object.keys(cfg.profiles).length===0,{previousHash:hash});await host.set({uiTheme:'ice',sourceType:'PSG',channel:0});record('regression-results',{results});await host.action('integration-done',{results});dirty=false;await host.action('playlist-clean');await host.action('quit')}catch(e){record('regression-stopped',{error:e.stack,results});await host.action('integration-done',{error:e.stack,results});dirty=false;await host.action('playlist-clean');await host.action('quit')}}

// Native pointer trace is limited to this application, without global input capture.
for(const n of ['pointerdown','pointerup','pointercancel','click','mousedown','mouseup'])document.addEventListener(n,e=>record('input-pointer',{event:n,target:e.target.id||e.target.closest?.('[id]')?.id,x:e.clientX,y:e.clientY,screenX:e.screenX,screenY:e.screenY}),true);

// Native input routing handles immediate hit tests; hover geometry is sampled at 20 Hz.

host.on('outside-input',()=>{if(popup)closePopup()});

host.on('native-drop',d=>{if(d.type==='drop-state'){document.querySelector('#mini').classList.toggle('dragging',d.active)}else{document.querySelector('#mini').classList.remove('dragging');addFiles(d.files)}regions()});

if(info.inputSpec?.recordSeconds)recordVideo('native-input-session',null,info.inputSpec.recordSeconds).then(()=>record('input-session-video-saved')).catch(e=>record('input-session-video-error',{message:e.message}));

async function rcShort(){
 const results=[],check=(name,ok,data={})=>{record('rc-check',{name,ok,...data});results.push({name,ok,...data});if(!ok)throw Error(name)};
 try{
  pinned=true;show();await sleep(500);
  const checkpoint=await host.action('rc-state');
  if(!checkpoint){
   check('A-startup-no-autoplay',audio.mode==='stopped'||audio.mode==='idle',{mode:audio.mode});
   await host.set({volume:.43,top:false,uiTheme:'mint',visualizer:false,scale:108,angle:23,instrument:false,vmdPath:info.auditSpec.vmd,motionHash:info.auditSpec.hash,vmdBpm:160,profiles:{[info.auditSpec.hash]:160}});
   await sleep(1200);
   await host.action('rc-checkpoint',{phase:'saved-for-restart',at:new Date().toISOString(),results});
   record('rc-restart-required',{data:info.data});dirty=false;await host.action('playlist-clean');await host.action('quit');return;
  }
  check('A-restored-general-settings',cfg.volume===.43&&!cfg.top&&cfg.uiTheme==='mint'&&!cfg.visualizer&&cfg.scale===108&&cfg.angle===23&&!cfg.instrument,{cfg});
  check('A-restored-VMD-SHA',cfg.vmdPath===info.auditSpec.vmd&&cfg.profiles[info.auditSpec.hash]===160);
  check('A-restored-no-autoplay',audio.mode==='stopped'||audio.mode==='idle',{mode:audio.mode});
  check('B-full-VMD-length',Math.abs(motionInfo.duration-6620/30)<1e-8&&Math.abs(audio.sync.profile.loopBeats-motionInfo.duration*160/60)<1e-8&&audio.sync.profile.motionLoopStartSeconds===0,{motionInfo,profile:audio.sync.profile});
  await host.set({volume:.65,top:true,uiTheme:'ice',visualizer:true,scale:100,angle:0,instrument:true,repeatMode:'OFF'});
  check('D-COM-same-executable-folder',info.external.every(x=>x.valid&&x.file.includes('validation')),{external:info.external});
  const files=['playlist_a','playlist_b','playlist_c'].map(n=>info.auditSpec.tests+'/'+n+'.mus');
  await host.set({playlists:[{name:'Phase4 連続再生',songs:files}],active:0});await sleep(200);active=0;activeListId=lists[0].id;pendingList=null;current=0;nowTitle=files[0];history=[];rebuild();drawTracks();
  await loadCurrent(true);await recordVideo('rc-playlist-continuous',null,17);check('C-final-track-stops',['stopped','ended'].includes(audio.mode),{mode:audio.mode,history,nowTitle});
  await host.set({playlists:[{name:'Phase4 全編ループ',songs:[info.auditSpec.tests+'/performance-300.mus']}],active:0});await sleep(200);active=0;activeListId=lists[0].id;pendingList=null;current=0;nowTitle=lists[0].songs[0];history=[];rebuild();drawTracks();await loadCurrent(true);await sleep(700);
  check('E-output-clock-running',audio.mode==='playing'&&audio.position>0,{snapshot:audio.snapshot()});
  await recordVideo('rc-front-full-VMD',null,5);await host.set({angle:45});await recordVideo('rc-45degree-full-VMD',null,5);await host.set({angle:0});
  await audio.pause();const pos=audio.position;await sleep(300);check('E-pause-freezes',Math.abs(audio.position-pos)<.003);await audio.seek(2.5);check('E-paused-seek',Math.abs(audio.position-2.5)<.003&&audio.mode==='paused');await audio.pause();await sleep(300);check('E-resume',audio.position>2.5);
  for(const sourceType of ['PSG','SCC','OPLL']){await host.set({sourceType,channel:0});await sleep(150);const raw=audio.channel(),mapped=view.performanceControl.events.transport.channel();check('F-channel-'+sourceType,raw?.sourceType===sourceType&&mapped?.sourceType===sourceType&&(mapped.pitch==null||mapped.pitch>=48&&mapped.pitch<72),{raw,mapped})}
  await host.set({sourceType:'PSG',channel:0});await audio.seek(217.7);await recordVideo('rc-full-VMD-loop-boundary',null,9);
  check('B-loop-from-end-to-start',audio.mode==='playing'&&audio.motion.motionSeconds<15,{motion:audio.motion,snapshot:audio.snapshot()});
  check('E-no-underrun',audio.underruns===0&&audio.missingSamples===0,{snapshot:audio.snapshot()});
  await host.action('gpu');await audio.stop(true);record('rc-short-results',{results});await host.action('rc-complete',{results});dirty=false;await host.action('playlist-clean');await host.action('quit');
 }catch(e){record('rc-short-stopped',{error:e.stack,results});await host.action('rc-checkpoint',{phase:'failed',error:e.stack,results});dirty=false;await host.action('playlist-clean');await host.action('quit')}
}

async function askStartupBpm(value){return new Promise(resolve=>{const d=document.createElement('dialog');d.style.cssText='background:#17283b;color:#e5edf6;border:1px solid #6dcfce;border-radius:12px;padding:24px';const label=document.createElement('label');label.textContent='このVMDの基準BPM ';const i=document.createElement('input');i.type='number';i.min=20;i.max=400;i.value=value;label.append(i);d.append(label);const ok=document.createElement('button');ok.textContent='設定';const cancel=document.createElement('button');cancel.textContent='キャンセル';d.append(ok,cancel);ok.onclick=()=>{if(!i.reportValidity())return;resolve(+i.value);d.close();d.remove()};cancel.onclick=()=>{resolve(null);d.close();d.remove()};d.oncancel=e=>{e.preventDefault();cancel.click()};document.body.append(d);d.showModal();i.focus()})}

let enduranceOrigin=null;
async function phase4Endurance(){
 let began=null;
 const status=async extra=>host.action('endurance-progress',{at:new Date().toISOString(),elapsedSeconds:began===null?0:(performance.now()-began)/1000,phase:auditPhase,audio:audio.snapshot(),...extra});
 try{
  auditPhase='endurance-preparation';pinned=false;hideLater();
  await host.set({volume:.65,sourceType:'PSG',channel:0,top:true,uiTheme:'ice',visualizer:true,scale:100,angle:0,instrument:true,performance:true,glow:true,vmdBpm:160,vmdLoop:true,vmdPath:info.auditSpec.vmd,motionHash:info.auditSpec.hash,repeatMode:'ONE',shuffle:false});
  const readyLimit=performance.now()+15000;while(loadedMotionPath!==info.auditSpec.vmd&&performance.now()<readyLimit)await sleep(50);await sleep(500);
  if(!ready||!motionInfo||Math.abs(audio.sync.profile.baseBpm-160)>.001||audio.sync.profile.motionLoopStartSeconds!==0)throw Error('VMD/BPMの開始条件を満たしません');
  const file=info.auditSpec.tests+'/performance-300.mus';await host.set({playlists:[{name:'Phase4 3時間耐久',songs:[file]}],active:0});await sleep(200);active=0;activeListId=lists[0].id;pendingList=null;pendingFuture=null;current=0;nowTitle=file;history=[];rebuild();drawTracks();await loadCurrent(true);
  began=performance.now();enduranceOrigin=began;auditPhase='endurance-running';record('endurance-start',{wall:new Date().toISOString(),sourceFile:file,vmd:info.auditSpec.vmd,bpm:160,repeat:'ONE; metadata fade and duration preserved',profile:audio.sync.profile});await status({start:true});
  const recordings=[{at:0,name:'endurance-start',seconds:6},{at:3597,name:'endurance-1hour',seconds:8},{at:7197,name:'endurance-2hour',seconds:8},{at:10796,name:'endurance-cross-3hours',seconds:12},{at:10815,name:'endurance-before-exit',seconds:8}];
  for(const clip of recordings){
   while((performance.now()-began)/1000<clip.at){if(!['playing','seeking','buffering-output'].includes(audio.mode)||audio.underruns||audio.missingSamples)throw Error('音声異常または予期しない停止を検出しました');await status({nextRecording:clip.name});await sleep(Math.min(10000,Math.max(50,(clip.at-(performance.now()-began)/1000)*1000)))}
   record('endurance-recording-start',{name:clip.name,elapsedSeconds:(performance.now()-began)/1000});await recordVideo(clip.name,null,clip.seconds);await status({recordingSaved:clip.name});
  }
  const elapsedSeconds=(performance.now()-began)/1000,pass=elapsedSeconds>=10800&&audio.mode==='playing'&&audio.underruns===0&&audio.missingSamples===0;
  const summary={at:new Date().toISOString(),elapsedSeconds,pass,softwareAudioClockOnly:true,recording:'application content with software audio, not whole desktop or physical speakers',audio:audio.snapshot(),profile:audio.sync.profile,motion:motionInfo};
  await host.action('endurance-summary',summary);await status({complete:true,pass});record('endurance-complete',summary);await audio.stop(true);await host.action('rc-complete',summary);dirty=false;await host.action('playlist-clean');await host.action('quit');
 }catch(e){const summary={at:new Date().toISOString(),pass:false,error:e.stack,elapsedSeconds:began===null?0:(performance.now()-began)/1000,audio:audio.snapshot()};await host.action('endurance-summary',summary);await status({failed:true,error:e.message});record('endurance-failed',summary);await audio.stop(true);dirty=false;await host.action('playlist-clean');await host.action('quit')}
}

async function clickDiagnosis(){const results=[];const check=(name,ok)=>{results.push({name,ok,snapshot:audio.snapshot()});record('click-diagnosis-check',results.at(-1));if(!ok)throw Error(name)};const bounded=p=>Promise.race([p,sleep(5000).then(()=>{throw Error('operation timeout')})]);try{pinned=true;show();const files=['playlist_a','playlist_b','playlist_c'].map(n=>info.auditSpec.tests+'/'+n+'.mus');await host.set({playlists:[{name:'クリック再現確認',songs:files}],active:0,repeatMode:'ALL'});await sleep(100);active=0;activeListId=lists[0].id;pendingList=null;current=0;nowTitle=files[0];history=[];rebuild();drawTracks();await loadCurrent(true);for(let i=0;i<3;i++){await sleep(200);await bounded(audio.pause());check('pause-'+i,audio.mode==='paused');await bounded(audio.pause());await sleep(200);check('resume-'+i,audio.mode==='playing'&&audio.position>0);await bounded(audio.stop(true));await bounded(audio.play());await sleep(150);check('restart-'+i,audio.mode==='playing'&&audio.position>0)}for(let i=0;i<3;i++){const changes=[next(),next()];await bounded(Promise.all(changes));await sleep(250);check('rapid-next-'+i,audio.mode==='playing'&&audio.position>0);await bounded(audio.stop(true));await bounded(audio.play());await sleep(200);check('rapid-next-restart-'+i,audio.mode==='playing'&&audio.position>0)}await loadCurrent(true,info.auditSpec.tests+'/seek_long.mus');await sleep(500);check('long-output',audio.mode==='playing'&&audio.position>0);await audio.stop(true);record('click-diagnosis-results',{results});}catch(e){record('click-diagnosis-failed',{message:e.message,stack:e.stack,results,snapshot:audio.snapshot()});}finally{dirty=false;await host.action('playlist-clean');pinned=false;record('click-diagnosis-ready-for-native',{snapshot:audio.snapshot()});}}

async function titleFormatCheck(){
 const checks=[];const test=(name,ok,data={})=>{const r={name,ok,...data};checks.push(r);record('title-format-check',r);if(!ok)throw Error(name)};
 const waitFor=async(fn,limit=10000)=>{const end=performance.now()+limit;while(!fn()){if(performance.now()>end)throw Error('待機タイムアウト');await sleep(30)}};
 try{
  pinned=true;show();auditPhase='title-format';const root=info.auditSpec.tests,files=['日本語 空白.mus','same-title-a.mus','same-title-b.mus','long.mus','MGS 内部タイトル.dat'].map(n=>root+'/fixtures/'+n);
  const configuration=await host.set({playlists:[{name:'内部タイトル表示の検証',songs:files}],active:0,currentFile:files[0],duration:3,loop:99,fade:.2,shuffle:false,repeatMode:'OFF',vmdPath:info.auditSpec.motion,motionHash:info.auditSpec.motionHash,profiles:{[info.auditSpec.motionHash]:160},vmdBpm:160});
  cfg=configuration;lists=structuredClone(cfg.playlists);active=0;activeListId=lists[0].id;current=0;nowTitle=files[0];pendingList=null;pendingFuture=null;history=[];titles=(await host.get()).trackTitles;rebuild();drawTracks();await sleep(500);
  test('mini actual internal title',document.querySelector('.song.current span').textContent==='青空の プレリュード',{display:document.querySelector('.song.current span').textContent});
  test('same title distinct paths',files[1]!==files[2]&&titles[files[1]]===titles[files[2]]);
  test('MGS internal title',titles[files[4]]==='青空の プレリュード');
  test('metadata name is not MGSC title',titles[files[0]]!=='WRONG_COMMENT_NAME');
  await waitFor(()=>!!motionInfo?.duration);test('VMD loaded',!!motionInfo.duration,{seconds:motionInfo.duration});
  await loadCurrent(true);await sleep(450);test('real audio output position advances',audio.position>.1&&audio.mode==='playing',{snapshot:audio.snapshot()});
  test('PSG SCC OPLL events exist',['PSG','SCC','OPLL'].every(s=>audio.index?.channels?.has(s+':0')),{channels:[...audio.index.channels.keys()]});
  await audio.pause();const held=audio.position;await sleep(200);test('pause holds audio clock',Math.abs(audio.position-held)<.002);await audio.seek(1.2);test('seek paused',Math.abs(audio.position-1.2)<.01);await audio.pause();await sleep(160);test('resume',audio.mode==='playing'&&audio.position>1.2);
  test('BPM and IK live',audio.sample()?.bpm>0&&!!view.performanceControl,{snapshot:audio.snapshot(),right:view.performanceControl.metrics});test('no audio starvation',audio.underruns===0&&audio.missingSamples===0,{underruns:audio.underruns});
  await host.action('capture',{name:'mini-playlist-internal-title'});await audio.stop(true);
  await next(false);test('next selects first same-title path',nowTitle===files[1]&&audio.currentFile===files[1]);
  await next(false);test('next selects second same-title path',nowTitle===files[2]&&audio.currentFile===files[2]);
  await previous();test('previous preserves path identity',nowTitle===files[1]&&audio.currentFile===files[1]);
  await next(false);await next(false);await sleep(100);await audio.stop(true);
  const row=document.querySelector('.song.current'),span=row.querySelector('span');test('long current title retained',span.textContent===titles[files[3]]&&row.classList.contains('over'));
  const firstTransform=getComputedStyle(span).transform;await sleep(3500);const afterTransform=getComputedStyle(span).transform;test('long title actually scrolls',firstTransform!==afterTransform,{firstTransform,afterTransform});await host.action('capture',{name:'long-current-title-scroll'});
  current=0;nowTitle=files[0];history=[];rebuild();drawTracks();

  await host.set({shuffle:true});await sleep(120);const visible=visibleSongs().map(titleFor),rendered=[...document.querySelectorAll('#tracks .song span')].map(e=>e.textContent);test('shuffle queue matches rendered titles',JSON.stringify(visible)===JSON.stringify(rendered),{visible,rendered});
  await host.set({shuffle:false,repeatMode:'ONE'});await loadCurrent(true,files[0]);await audio.seek(audio.song.seconds-.04);await sleep(400);test('repeat ONE',audio.mode==='playing'&&audio.position<1.1);await audio.stop(true);await host.set({repeatMode:'OFF'});
  for(const theme of['ice','lavender','mint','rose','mono']){await host.set({uiTheme:theme});await sleep(70);test('theme-'+theme,cfg.uiTheme===theme)}await host.set({uiTheme:'ice'});
  await host.action('settings');await sleep(650);await host.action('capture',{settings:true,name:'settings-playlist-internal-title'});await host.action('close-settings');
  await loadCurrent(true,files[4]);await sleep(300);test('binary MGS audio playback',audio.mode==='playing'&&audio.position>.1&&audio.compileResult.sourceKind==='mgs',{snapshot:audio.snapshot()});await audio.seek(2.1);test('MGS seek',audio.position>=2.1&&audio.mode==='playing');await audio.stop(true);
  const latest=await host.get();test('paths retained in saved settings',JSON.stringify(latest.cfg.playlists[0].songs)===JSON.stringify(files));
  const summary={pass:true,checks,softwareAudioClockOnly:true,sourceCOMNotBundled:true,at:new Date().toISOString()};await host.action('title-test-result',summary);await host.action('rc-complete',summary);record('title-format-complete',summary);
 }catch(e){const summary={pass:false,error:e.stack,checks};await host.action('title-test-result',summary);record('title-format-failed',summary)}
 finally{await audio.stop(true);dirty=false;await host.action('playlist-clean');await host.action('quit')}
}

import {installV020Presentation} from './ui-v020-presentation.js';
import {installPriorityTransport} from './priority-transport-v021.js';
installPriorityTransport(audio);
const presentationV020=installV020Presentation(audio,()=>cfg);
host.on('config',()=>presentationV020.config());
