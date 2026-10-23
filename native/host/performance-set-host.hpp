#pragma once
// Current working set exists in memory. Settings never serialize unsaved edits.
json motionStatuses=json::object();
json motionStatusRequests=json::object();
std::map<std::string,fs::path> motionRequests;
unsigned long long motionRequestSerial=0;
std::string newMotionId(){GUID id{};if(FAILED(CoCreateGuid(&id)))throw std::runtime_error("モーションIDを生成できません");wchar_t text[40];StringFromGUID2(id,text,40);return utf8(text);}
json settingsDocument(){
  auto saved=cfg;putSet(saved,emptySet());saved["setPath"]="";saved["setDirty"]=false;saved["setEpoch"]=0;
  saved["currentFile"]="";saved["currentEntryId"]="";
  saved["vmdPath"]="";saved["motionHash"]="";saved["vmdBpm"]=nullptr;
  return saved;
}
json readSetFile(const fs::path&p){return normalizeSet(json::parse(native_audio::bytes(p,16*1024*1024)),true);}
void replaceWorkingSet(const json&s,const std::string&path){
  auto before=cfg;putSet(cfg,s);cfg["setPath"]=path;cfg["lastSetPath"]=path;cfg["setDirty"]=false;cfg["setEpoch"]=cfg.value("setEpoch",0)+1;
  try{saveConfig();}catch(...){cfg=before;throw;}
  motionStatuses=json::object();motionStatusRequests=json::object();event("config",cfg);event("motion-status",motionStatuses);
}
bool saveWorkingSet(bool as,const std::string &testPath=""){
  std::string path=as?"":cfg.value("setPath",std::string());
  if(!testPath.empty())path=testPath;
  if(path.empty()){auto p=chooseFiles(false,true,L"MGS 演奏セット",L"*.mgsset.json");if(p.empty())return false;path=utf8(p.front());}
  auto payload=normalizeSet(currentSet(cfg));atomicFile(wide(path),payload);
  auto before=cfg;cfg["setPath"]=path;cfg["lastSetPath"]=path;cfg["setDirty"]=false;
  try{saveConfig();}catch(...){cfg=before;throw;}
  event("config",cfg);return true;
}
void initializePerformanceSets(){
  auto journal=dataRoot/L"performance-set-migration.json";
  if(!cfg.value("setsMigrated",false)&&fs::is_regular_file(journal)){
    // A settings backup may predate the first migration; never migrate it twice.
    auto record=json::parse(native_audio::bytes(journal,1048576));
    putSet(cfg,emptySet());cfg["setsMigrated"]=true;cfg["setDirty"]=false;
    cfg["setPath"]="";cfg["lastSetPath"]=record.at("path");
    cfg["vmdPath"]="";cfg["vmdBpm"]=nullptr;cfg["motionHash"]="";
    settingsWarning="移行済み記録を復元しました。移行セットは保護されています。必要なら演奏セットの読み込みから開いてください。";
    saveConfig();return;
  }
  if(!cfg.value("setsMigrated",false)){
    bool legacy=settingsSource=="settings"||settingsSource=="backup";
    if(legacy){
      auto source=dataRoot/L"settings.json";if(settingsSource=="backup"){source+=L".bak";if(!fs::exists(source))source=dataRoot/L"settings.json.previous.bak";}
      auto preserve=dataRoot/(L"v103-settings-original-"+std::to_wstring(GetTickCount64())+L".json");
      fs::copy_file(source,preserve);
      auto migrated=currentSet(cfg);migrated["name"]="新規演奏セット";
      auto old=cfg.value("vmdPath",std::string());
      if(!old.empty()){
        double bpm=cfg["vmdBpm"].is_number()?cfg["vmdBpm"].get<double>():120;
        migrated["motions"]=json::array({{{"id","migrated-vmd"},{"path",old},{"bpm",bpm},{"loop",cfg.value("vmdLoop",true)}}});
        for(auto&l:migrated["playlists"])for(auto&id:l["songIds"])migrated["assignments"][l["id"].get<std::string>()][id.get<std::string>()]="migrated-vmd";
      }
      auto path=dataRoot/(L"Ver1.0.3移行セット-"+std::to_wstring(GetTickCount64())+L".mgsset.json");atomicFile(path,normalizeSet(migrated));
      atomicFile(journal,{{"version",1},{"path",utf8(path.wstring())},{"original",utf8(preserve.wstring())}});
      putSet(cfg,migrated);cfg["setPath"]=utf8(path.wstring());cfg["lastSetPath"]=cfg["setPath"];
      settingsWarning="旧設定を演奏セットへ移行しました。初回のみ表示します。自動読み込みOFFの場合、次回は空のセットで起動します。移行ファイルは保持されます。";
    }else putSet(cfg,emptySet());
    cfg["setsMigrated"]=true;cfg["setDirty"]=false;cfg["vmdPath"]="";cfg["vmdBpm"]=nullptr;cfg["motionHash"]="";
    saveConfig();
  }else{
    auto path=cfg.value("lastSetPath",std::string());putSet(cfg,emptySet());cfg["setPath"]="";cfg["setDirty"]=false;
    if(cfg.value("autoLoadSet",false)&&!path.empty())try{putSet(cfg,readSetFile(wide(path)));cfg["setPath"]=path;}catch(const std::exception&e){settingsWarning="前回の演奏セットを読み込めません。保存済みファイルは保持されています。";}
  }
}
json addMotionFiles(const std::vector<std::wstring>&paths){
  json added=json::array();std::set<std::string> keys;for(auto&m:cfg["motions"])keys.insert(motionPathKey(m["path"].get<std::string>()));
  for(const auto&p:paths){auto path=utf8(p);if(!keys.insert(motionPathKey(path)).second)continue;double bpm=120;try{auto m=inspectMotion(p);if(!m["needsBpm"].get<bool>())bpm=m["knownBpm"].get<double>();}catch(...){}
    added.push_back({{"id",newMotionId()},{"path",path},{"bpm",bpm},{"loop",true}});
  }return added;
}
json prepareMotionRequest(const json&m){
  auto id=setString(m.at("id"),200),path=setString(m.at("path"),131072);
  auto token=std::to_string(GetTickCount64())+"-"+std::to_string(++motionRequestSerial);motionStatusRequests[id]=token;
  try{inspectMotion(wide(path));}catch(const std::exception&e){motionStatuses[id]="読み込み不可";event("motion-status",motionStatuses);return {{"ok",false},{"request",token},{"message","VMDを読み込めません。音楽のみ再生します。次回再試行します。"}};}
  motionRequests[token]=wide(path);
  while(motionRequests.size()>32)motionRequests.erase(motionRequests.begin());
  motionStatuses[id]="読み込み中";event("motion-status",motionStatuses);
  return {{"ok",true},{"request",token},{"url","https://motion.mgs.invalid/motion.vmd?request="+token}};
}
