// Original host-side register observer. No M3disp source is incorporated.
#pragma once
#include <array>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <string>
#include "kssplay.h"
struct Channel {
 int period=0,volume=0,instrument=0; bool active=false,noise=false,envelope=false;
 double frequency=0; uint32_t wave=0;
 bool operator==(const Channel& b) const {return period==b.period&&frequency==b.frequency&&volume==b.volume&&instrument==b.instrument&&active==b.active&&noise==b.noise&&envelope==b.envelope&&wave==b.wave;}
};
class EventObserver {
 std::array<Channel,17> previous{}; bool initialized=false;
 bool compact=false;
 unsigned rate; uint64_t start=0,end=0,lastSnapshot=0; std::string rows; uint64_t writes=0;
 static const char* source(int i){return i<3?"PSG":i<8?"SCC":"OPLL";}
 static int channel(int i){return i<3?i:i<8?i-3:i-8;}
 std::string fields(int i,const Channel& s){
  std::ostringstream o;o<<std::setprecision(12)<<"\"samplePosition\":"<<end<<",\"sampleBegin\":"<<start<<",\"timeSeconds\":"<<double(end)/rate<<",\"sourceType\":\""<<source(i)<<"\",\"channel\":"<<channel(i)<<",\"period\":"<<s.period<<",\"frequency\":"<<s.frequency<<",\"pitch\":";
  if(s.frequency>0&&!s.noise)o<<69+12*std::log2(s.frequency/440.0);else o<<"null";
  o<<",\"volume\":"<<s.volume<<",\"active\":"<<(s.active?"true":"false")<<",\"instrument\":";
  if(i>=8)o<<s.instrument;else o<<"null";
  o<<",\"waveHash\":"<<s.wave<<",\"noise\":"<<(s.noise?"true":"false")<<",\"hardwareEnvelope\":"<<(s.envelope?"true":"false");return o.str();
 }
 void emit(int i,const Channel&s,const char* type,const char* confidence,const char* basis){rows+="{\"kind\":\"event\",\"eventType\":\""+std::string(type)+"\",\"confidence\":\""+confidence+"\",\"basis\":\""+basis+"\","+fields(i,s)+"}\n";}
 public:
 explicit EventObserver(unsigned r):rate(r){}
 void setCompact(bool value){compact=value;}
 static void io(void* context,uint32_t address,uint32_t data){auto* p=(EventObserver*)context;if((address&255)==0xa0||(address&255)==0xa1||(address&255)==0x7c||(address&255)==0x7d)p->write("io",address,data);}
 static void mem(void* context,uint32_t address,uint32_t data){auto* p=(EventObserver*)context;if((address>=0x9800&&address<=0x98ff)||(address>=0xb800&&address<=0xb8ff))p->write("memory",address,data);}
 void write(const char* bus,uint32_t a,uint32_t d){++writes;if(compact)return;rows+="{\"kind\":\"write\",\"bus\":\""+std::string(bus)+"\",\"sampleBegin\":"+std::to_string(start)+",\"samplePosition\":"+std::to_string(end)+",\"address\":"+std::to_string(a)+",\"data\":"+std::to_string(d)+"}\n";}
 void begin(uint64_t a,uint64_t b){start=a;end=b;}
 void observe(KSSPLAY* p){
  uint8_t pg[256]={},sc[256]={},fm[256]={};KSSPLAY_read_device_regs(p,KSS_DEVICE_PSG,pg);KSSPLAY_read_device_regs(p,KSS_DEVICE_SCC,sc);KSSPLAY_read_device_regs(p,KSS_DEVICE_OPLL,fm);
  std::array<Channel,17> now{};
  for(int i=0;i<17;i++){
   auto& s=now[i];if(i<3){s.period=pg[i*2]|((pg[i*2+1]&15)<<8);s.volume=pg[8+i]&15;s.envelope=(pg[8+i]&16)!=0;bool tone=(pg[7]&(1<<i))==0;s.noise=(pg[7]&(8<<i))==0;s.active=(tone||s.noise)&&(s.volume>0||s.envelope);s.frequency=tone?3579545.0/(32*std::max(1,s.period)):0;}
   else if(i<8){int j=i-3;s.period=sc[0xc0+2*j]|((sc[0xc1+2*j]&15)<<8);s.volume=sc[0xd0+j]&15;s.active=(p->vm->scc->ch_enable_next&(1<<j))&&!p->vm->scc_disable&&s.volume>0&&s.period>8;s.frequency=s.period>8?3579545.0/(32*(s.period+1)):0;s.wave=2166136261u;for(int k=0;k<32;k++)s.wave=(s.wave^sc[j*32+k])*16777619u;}
   else {int j=i-8;s.period=fm[0x10+j]|((fm[0x20+j]&1)<<8);s.volume=15-(fm[0x30+j]&15);s.instrument=fm[0x30+j]>>4;s.active=(fm[0x20+j]&16)!=0;s.frequency=(3579545.0/72)*s.period*std::pow(2.0,((fm[0x20+j]>>1)&7)-19);if((fm[0x0e]&32)&&j>=6){s.noise=true;s.active=false;}}
   auto old=previous[i];bool changed=!initialized||!(s==old);
   if(changed||(!compact&&end-lastSnapshot>=rate/50))rows+="{\"kind\":\"state\",\"confidence\":\"measured-registers\","+fields(i,s)+"}\n";
   if(initialized){
    if(s.active!=old.active)emit(i,s,s.active?"NoteOn":"NoteOff",i>=8?"measured-key-bit":"inferred-gate",i>=8?"OPLL-key-bit":"mixer-enable-and-volume");
    if(s.active&&old.active&&s.frequency!=old.frequency)emit(i,s,"PitchChange","measured-registers","frequency-register-change");
    if(s.volume!=old.volume)emit(i,s,"VolumeChange","measured-registers","volume-register");
    if((i>=8&&s.instrument!=old.instrument)||(i>=3&&i<8&&s.wave!=old.wave))emit(i,s,"InstrumentChange","measured-registers",i>=8?"OPLL-patch-number":"SCC-wave-hash-not-instrument-number");
   }
  }
  if(end-lastSnapshot>=rate/50)lastSnapshot=end;previous=now;initialized=true;
 }
 std::string take(){std::string result;result.swap(rows);return result;}
};


