#pragma once
// Performance-set payload validation, independent of playback and audio generation.
inline std::string setString(const json &v, size_t limit, bool empty = false) {
  if (!v.is_string()) throw std::runtime_error("演奏セットの文字列形式が不正です");
  auto s=v.get<std::string>();
  if ((!empty&&s.empty())||s.size()>limit||s.find('\0')!=std::string::npos)
    throw std::runtime_error("演奏セットの文字列が不正です");
  return s;
}
inline std::string motionPathKey(const std::string &path) {
  auto w=fs::path(wide(path)).lexically_normal().wstring();
  for(auto &c:w)c=static_cast<wchar_t>(towlower(c));
  return utf8(w);
}
inline json normalizeSet(const json &v, bool strict=true) {
  if(!v.is_object()||v.value("format",std::string())!="MGS_MascotPlayer.PerformanceSet"||!v.contains("version")||!v["version"].is_number_integer()||(v["version"]!=1&&v["version"]!=2&&v["version"]!=3))
    throw std::runtime_error("対応していない演奏セット形式・バージョンです");
  json o={{"format","MGS_MascotPlayer.PerformanceSet"},{"version",3},{"name",setString(v.at("name"),300)},{"playlists",json::array()},{"active",0},{"motions",json::array()},{"assignments",json::object()}};
  const auto &lists=v.at("playlists");const auto &motions=v.at("motions");const auto &assign=v.at("assignments");
  if(!lists.is_array()||lists.empty()||lists.size()>999||!motions.is_array()||motions.size()>1000||!assign.is_object())throw std::runtime_error("演奏セットの一覧形式が不正です");
  std::set<std::string> listIds,motionIds,paths;
  for(const auto &l:lists){
    auto id=setString(l.at("id"),200);if(!listIds.insert(id).second)throw std::runtime_error("プレイリストIDが重複しています");
    auto songs=l.at("songs"),ids=l.at("songIds");
    if(!songs.is_array()||songs.size()>10000||!ids.is_array()||ids.size()!=songs.size())throw std::runtime_error("曲ID配列が不正です");
    std::set<std::string> used;for(size_t i=0;i<songs.size();++i){setString(songs[i],131072);auto sid=setString(ids[i],200);if(!used.insert(sid).second)throw std::runtime_error("曲IDが重複しています");}
    o["playlists"].push_back({{"id",id},{"name",setString(l.at("name"),300)},{"songs",songs},{"songIds",ids}});
  }
  for(const auto &m:motions){
    auto id=setString(m.at("id"),200),p=setString(m.at("path"),131072);
    if(!motionIds.insert(id).second||!paths.insert(motionPathKey(p)).second)throw std::runtime_error("VMDのIDまたはファイルパスが重複しています");
    if(!m.at("bpm").is_number()||!std::isfinite(m["bpm"].get<double>())||m["bpm"]<20||m["bpm"]>400||!m.at("loop").is_boolean())throw std::runtime_error("VMDの基準BPM・ループ値が不正です");
    if(m.contains("creditEnabled")&&!m["creditEnabled"].is_boolean())throw std::runtime_error("テキスト表示設定が不正です");
    auto credit=m.contains("creditText")?setString(m["creditText"],262144,true):std::string();
    std::string position,mode;
    if(v["version"]==3){
      position=setString(m.at("textPosition"),30);mode=setString(m.at("textMode"),30);
      if(position!="none"&&position!="top-left"&&position!="bottom-left"&&position!="bottom-right")throw std::runtime_error("テキスト表示位置が不正です");
      if(mode!="always"&&mode!="brief")throw std::runtime_error("テキスト表示タイミングが不正です");
    }else{position=m.value("creditEnabled",false)?"bottom-right":"none";mode="always";}
    o["motions"].push_back({{"id",id},{"path",p},{"bpm",m["bpm"]},{"loop",m["loop"]},{"textPosition",position},{"textMode",mode},{"creditText",credit}});
  }
  for(auto it=assign.begin();it!=assign.end();++it){
    auto l=std::find_if(o["playlists"].begin(),o["playlists"].end(),[&](const json&x){return x["id"]==it.key();});
    if(l==o["playlists"].end()||!it.value().is_object()){if(strict)throw std::runtime_error("割り当て先プレイリストが不正です");else continue;}
    for(auto a=it.value().begin();a!=it.value().end();++a){
      bool ok=std::find((*l)["songIds"].begin(),(*l)["songIds"].end(),a.key())!=(*l)["songIds"].end()&&a.value().is_string()&&motionIds.count(a.value().get<std::string>());
      if(!ok){if(strict)throw std::runtime_error("曲とVMDの割り当てが不正です");else continue;}
      o["assignments"][it.key()][a.key()]=a.value();
    }
  }
  if(v.contains("active")&&v["active"].is_number_integer()){int a=v["active"].get<int>();if(a>=0&&a<(int)lists.size())o["active"]=a;else if(strict)throw std::runtime_error("選択プレイリストが不正です");}
  if(o.dump(2).size()>16*1024*1024)throw std::runtime_error("演奏セットが16MiBの上限を超えています");
  return o;
}
inline json currentSet(const json &c){return {{"format","MGS_MascotPlayer.PerformanceSet"},{"version",3},{"name",c.at("setName")},{"playlists",c.at("playlists")},{"active",c.at("active")},{"motions",c.at("motions")},{"assignments",c.at("assignments")}};}
inline void putSet(json &c,const json&s){c["setName"]=s.at("name");for(auto k:{"playlists","active","motions","assignments"})c[k]=s.at(k);}
inline json emptySet(){return {{"format","MGS_MascotPlayer.PerformanceSet"},{"version",3},{"name","新規演奏セット"},{"playlists",json::array({{{"id","empty-list"},{"name","マイプレイリスト"},{"songs",json::array()},{"songIds",json::array()}}})},{"active",0},{"motions",json::array()},{"assignments",json::object()}};}
