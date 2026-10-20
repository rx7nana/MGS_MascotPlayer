#pragma once
// Scheduling adapter only: discard output from the unchanged KSSPLAY_calc path.
// Use the original 1024-frame / 48-frame boundaries and original fade policy.
inline void priorityAdvance(KSSPLAY* player,unsigned rate,bool monitoring,bool tempoEnabled,
 EventObserver&observer,TempoObserver&tempo,uint64_t&sample,uint32_t&observedLoops,unsigned&priorLoop,
 unsigned requested,uint64_t limit,unsigned loopLimit,unsigned fades) {
 uint64_t fadeAt=UINT64_MAX;std::string reason="duration",events;bool ended=false;
 const uint64_t durationFade=limit>fades?limit-fades:0;
 // This command is only used on a newly loaded priority replay session. The
 // caller advances it incrementally; the state row carries the fade position.
 static std::map<KSSPLAY*,std::pair<uint64_t,std::string>> policies;
 if(sample==0)policies.erase(player);
 if(auto it=policies.find(player);it!=policies.end()){fadeAt=it->second.first;reason=it->second.second;}
 const uint64_t target=std::min(limit,sample+requested);observer.setCompact(true);
 while(sample<target){
  if(fadeAt==UINT64_MAX&&sample>=durationFade){fadeAt=sample;reason="duration";if(fades)KSSPLAY_fade_start(player,(unsigned)(uint64_t(fades)*1000/rate));else{ended=true;break;}}
  unsigned frames=(unsigned)std::min<uint64_t>(1024,limit-sample);
  if(fadeAt==UINT64_MAX&&sample<durationFade)frames=(unsigned)std::min<uint64_t>(frames,durationFade-sample);
  // An RPC budget must never split an original READ block. In particular,
  // duration-fade truncation re-anchors subsequent 1024-frame blocks.
  if(!frames||sample+frames>target)break;std::vector<int16_t> discarded(frames);std::string beats;
  if(monitoring){for(unsigned off=0;off<frames;){unsigned n=std::min(frames-off,std::max(1u,rate/1000));observer.begin(sample,sample+n);KSSPLAY_calc(player,discarded.data()+off,n);sample+=n;off+=n;observer.observe(player);if(tempoEnabled)beats+=tempo.observe(player,sample-n,sample);}}
  else{KSSPLAY_calc(player,discarded.data(),frames);sample+=frames;}
  events+=observer.take()+beats;
  if(tempoEnabled){unsigned mib=KSSPLAY_read_memory(player,0x7ff0)|(KSSPLAY_read_memory(player,0x7ff1)<<8);if(mib>=0x6000&&mib<=0x7f00){unsigned count=KSSPLAY_read_memory(player,mib+5);unsigned delta=(count-priorLoop)&255;if(delta<128)observedLoops+=delta;priorLoop=count;}}
  if(KSSPLAY_get_stop_flag(player)||KSSPLAY_get_fade_flag(player)==2){ended=true;if(fadeAt==UINT64_MAX)reason="natural-stop";break;}
  const unsigned loops=tempoEnabled?observedLoops:KSSPLAY_get_loop_count(player);
  if(fadeAt==UINT64_MAX&&loops>=loopLimit){fadeAt=sample;reason="loop";if(fades)KSSPLAY_fade_start(player,(unsigned)(uint64_t(fades)*1000/rate));else{ended=true;break;}}
  if(fadeAt!=UINT64_MAX&&sample>=fadeAt+fades){ended=true;break;}
 }
 observer.setCompact(false);policies[player]={fadeAt,reason};
 if(sample>=limit)ended=true;
 events+="{\"kind\":\"advance-state\",\"sample\":"+std::to_string(sample)+",\"fadeAt\":"+(fadeAt==UINT64_MAX?"null":std::to_string(fadeAt))+",\"reason\":\""+reason+"\",\"ended\":"+(ended?"true":"false")+"}\n";
 uint32_t header[7]={0,(uint32_t)ended,(uint32_t)(tempoEnabled?observedLoops:KSSPLAY_get_loop_count(player)),rate,0,0,(uint32_t)events.size()};
 fwrite(header,4,7,stdout);fwrite(events.data(),1,events.size(),stdout);
}
