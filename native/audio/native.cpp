// Host adapter only. MGSC.COM and MGSDRV.COM are read from user-selected files.
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <vector>
#include <fcntl.h>
#include <io.h>
#define NOMINMAX
#include <windows.h>
#include <psapi.h>
#define DWORD MGSC_DWORD
#include "mgsc.h"
#undef DWORD
#include "kssplay.h"
#include "events.h"
#include "tempo-observer.h"
#include <map>
#include "priority-advance-v021.hpp"
namespace fs=std::filesystem;
std::vector<uint8_t> bytes(const fs::path& p){std::ifstream s(p,std::ios::binary);if(!s)throw std::runtime_error("File not found");return {std::istreambuf_iterator<char>(s),{}};}
std::string mmlText(const std::vector<uint8_t>& data,std::wstring encoding){
 size_t skip=0;std::wstring wide;
 if(data.size()>=2&&data[0]==0xff&&data[1]==0xfe){if((data.size()-2)%2)throw std::runtime_error("Invalid UTF16");for(size_t i=2;i+1<data.size();i+=2)wide.push_back((wchar_t)(data[i]|data[i+1]<<8));}
 else if(data.size()>=2&&data[0]==0xfe&&data[1]==0xff){if((data.size()-2)%2)throw std::runtime_error("Invalid UTF16");for(size_t i=2;i+1<data.size();i+=2)wide.push_back((wchar_t)(data[i]<<8|data[i+1]));}
 else{
  if(data.size()>=3&&data[0]==0xef&&data[1]==0xbb&&data[2]==0xbf)skip=3;
  UINT cp=encoding==L"SJIS"?932:CP_UTF8;
  int n=MultiByteToWideChar(cp,MB_ERR_INVALID_CHARS,(const char*)data.data()+skip,(int)(data.size()-skip),nullptr,0);
  if(!n&&encoding==L"AUTO"){cp=932;n=MultiByteToWideChar(cp,MB_ERR_INVALID_CHARS,(const char*)data.data(),(int)data.size(),nullptr,0);skip=0;}
  if(!n)throw std::runtime_error("Invalid selected text encoding");
  wide.resize(n);MultiByteToWideChar(cp,MB_ERR_INVALID_CHARS,(const char*)data.data()+skip,(int)(data.size()-skip),wide.data(),n);
 }
 std::wstring normalized;for(auto c:wide){if(c==L'\r')continue;if(c==L'\n')normalized+=L'\r';normalized+=c;}
 if(normalized.empty()||normalized.back()!=L'\n')normalized+=L"\r\n";
 BOOL replaced=FALSE;int n=WideCharToMultiByte(932,WC_NO_BEST_FIT_CHARS,normalized.data(),(int)normalized.size(),nullptr,0,nullptr,&replaced);
 std::string result(n,'\0');WideCharToMultiByte(932,WC_NO_BEST_FIT_CHARS,normalized.data(),(int)normalized.size(),result.data(),n,nullptr,&replaced);
 if(replaced)throw std::runtime_error("Text contains characters not representable in Shift-JIS");return result;
}
int wmain(int argc,wchar_t** argv){
 try{
  if(argc<5)throw std::runtime_error("compile compiler source output | stream driver mgs rate");
  std::wstring mode=argv[1];
  if(mode==L"compile"){
   MGSC c;std::ifstream compiler(fs::path(argv[2]),std::ios::binary);
   if(!compiler||!c.LoadCompiler(&compiler))throw std::runtime_error("Cannot load external MGSC.COM");
   auto data=bytes(argv[3]);if(data.size()>200000)throw std::runtime_error("MML too large");
   std::stringstream input(mmlText(data,argc>5?argv[5]:L"AUTO"));std::stringstream output;std::ostringstream log;std::istringstream noInput;
   c.SetConsole(&noInput,&log);bool ok=c.Compile(&input,&output,MGSC::OPT_TRACK_STATUS);
   std::cerr<<log.str();auto result=output.str();
   if(!ok||result.size()<32||result.substr(0,3)!="MGS"){std::cerr<<c.GetErrorMessage()<<"\nCompile failed\n";return 2;}
   if(result.size()>0x5e00)throw std::runtime_error("MGS exceeds libkss MGS memory mapping limit");
   std::ofstream out(fs::path(argv[4]),std::ios::binary);out.write(result.data(),result.size());if(!out)throw std::runtime_error("Cannot save MGS");return 0;
  }
  if(mode!=L"stream")throw std::runtime_error("Unknown mode");
  // Native paths remain Unicode. No library fopen is used for user filenames.
  auto driver=bytes(argv[2]);if(driver.size()<14||driver.size()>0x3000)throw std::runtime_error("Invalid driver size");
  if(KSS_set_mgsdrv(driver.data(),(uint32_t)driver.size()))throw std::runtime_error("External MGSDRV.COM rejected");
  auto data=bytes(argv[3]);if(data.size()<32||data.size()>0x5e00||data[0]!='M'||data[1]!='G'||data[2]!='S')throw std::runtime_error("Invalid MGS data");
  unsigned rate=std::stoul(argv[4]);if(rate<22050||rate>96000)throw std::runtime_error("Invalid rate");
  KSS* kss=KSS_bin2kss(data.data(),(uint32_t)data.size(),"input.mgs");if(!kss)throw std::runtime_error("MGS conversion failed");
  KSSPLAY* player=KSSPLAY_new(rate,1,16);KSSPLAY_set_data(player,kss);KSSPLAY_reset(player,0,argc>7?std::stoul(argv[7]):0);if(argc>8&&std::wstring(argv[8])==L"1")KSSPLAY_set_rcf(player,3870,15);
  bool monitoring=argc<=5||std::wstring(argv[5])!=L"off";
  EventObserver observer(rate);uint64_t sample=0;
  TempoObserver tempo;bool tempoEnabled=argc>6&&std::wstring(argv[6])==L"mgsdrv320";
  if(monitoring){observer.begin(0,0);observer.observe(player);observer.take();KSSPLAY_set_iowrite_handler(player,&observer,EventObserver::io);KSSPLAY_set_memwrite_handler(player,&observer,EventObserver::mem);}
  _setmode(_fileno(stdout),_O_BINARY);setvbuf(stdout,nullptr,_IONBF,0);
  std::string command;unsigned frames;uint32_t observedLoops=0;unsigned priorLoop=0;
  while(std::cin>>command){
   if(command=="QUIT")break; if(command=="FADE"){unsigned ms;if(!(std::cin>>ms))throw std::runtime_error("Invalid fade");KSSPLAY_fade_start(player,ms);continue;}
   if(command=="ADVANCE"){unsigned n,loopLimit,fades;uint64_t limit;if(!(std::cin>>n>>limit>>loopLimit>>fades)||n<1||n>480000||limit>28800000||loopLimit<1)throw std::runtime_error("Invalid priority replay");priorityAdvance(player,rate,monitoring,tempoEnabled,observer,tempo,sample,observedLoops,priorLoop,n,limit,loopLimit,fades);continue;}
   if(command!="READ"||!(std::cin>>frames)||frames<1||frames>32768)throw std::runtime_error("Invalid PCM request");
   std::vector<int16_t> pcm(frames);
   std::string beats;
   if(monitoring){for(unsigned offset=0;offset<frames;){unsigned n=std::min(frames-offset,std::max(1u,rate/1000));observer.begin(sample,sample+n);KSSPLAY_calc(player,pcm.data()+offset,n);sample+=n;offset+=n;observer.observe(player);if(tempoEnabled)beats+=tempo.observe(player,sample-n,sample);}}
   else {KSSPLAY_calc(player,pcm.data(),frames);sample+=frames;}
   auto events=observer.take()+beats;
   if(tempoEnabled){unsigned mib=KSSPLAY_read_memory(player,0x7ff0)|(KSSPLAY_read_memory(player,0x7ff1)<<8);if(mib>=0x6000&&mib<=0x7f00){unsigned count=KSSPLAY_read_memory(player,mib+5);unsigned delta=(count-priorLoop)&255;if(delta<128)observedLoops+=delta;priorLoop=count;}}
   FILETIME created,ended,kernel,user;GetProcessTimes(GetCurrentProcess(),&created,&ended,&kernel,&user);
   ULARGE_INTEGER kt,ut;kt.LowPart=kernel.dwLowDateTime;kt.HighPart=kernel.dwHighDateTime;ut.LowPart=user.dwLowDateTime;ut.HighPart=user.dwHighDateTime;
   PROCESS_MEMORY_COUNTERS mem{};GetProcessMemoryInfo(GetCurrentProcess(),&mem,sizeof(mem));
   uint32_t header[7]={frames,(uint32_t)(KSSPLAY_get_stop_flag(player)||KSSPLAY_get_fade_flag(player)==2),(uint32_t)(tempoEnabled?observedLoops:KSSPLAY_get_loop_count(player)),rate,(uint32_t)((kt.QuadPart+ut.QuadPart)/10000),(uint32_t)(mem.WorkingSetSize/1024),(uint32_t)events.size()};
   if(fwrite(header,4,7,stdout)!=7||fwrite(pcm.data(),2,frames,stdout)!=frames||fwrite(events.data(),1,events.size(),stdout)!=events.size())break;
  }
  KSSPLAY_delete(player);KSS_delete(kss);return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 3;}
}
