#pragma once
#include "kssplay.h"
#include <sstream>
#include <iomanip>
// Read-only layout adapter for the externally supplied, locally validated MGSDRV 3.20.
// This is not a stable/public MGSDRV API; the host must match its driver SHA256 first.
class TempoObserver {
 bool ready=false;unsigned lastTick=0,lastBpm=0;uint64_t total=0;double beat=0;
 public:
 std::string observe(KSSPLAY* p,uint64_t begin,uint64_t sample){
  unsigned mib=KSSPLAY_read_memory(p,0x7ff0)|(KSSPLAY_read_memory(p,0x7ff1)<<8);
  if(mib<0x6000||mib>0x7f00)return {};
  auto word=[&](unsigned off){return unsigned(KSSPLAY_read_memory(p,mib+off)|(KSSPLAY_read_memory(p,mib+off+1)<<8));};
  unsigned bpm=word(21),tick=word(23);bool playing=KSSPLAY_read_memory(p,mib+8)!=0;
  if(bpm<57||bpm>2047||!playing||tick==0&&!ready)return {};
  if(ready&&tick==lastTick&&bpm==lastBpm)return {};
  if(!ready){lastTick=tick;lastBpm=bpm;ready=true;}
  else{unsigned delta=(tick-lastTick)&65535;if(delta>4)return {};beat+=delta*double(lastBpm)/3600.0;total+=delta;lastTick=tick;lastBpm=bpm;}
  std::ostringstream s;s<<std::setprecision(15)<<"{\"kind\":\"beat\",\"samplePosition\":"<<sample<<",\"sampleBegin\":"<<begin<<",\"beat\":"<<beat<<",\"bpm\":"<<bpm<<",\"driverTick\":"<<tick<<",\"totalTicks\":"<<total<<",\"driverHz\":"<<p->vsync_freq<<",\"confidence\":\"observed-MGSDRV320-layout\"}\n";return s.str();
 }
};
