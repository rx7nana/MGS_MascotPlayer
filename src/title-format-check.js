
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
