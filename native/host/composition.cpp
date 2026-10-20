#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <dcomp.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <vector>
#include <psapi.h>
#include <sstream>
#include <WebView2.h>
#include "webview2-uuid-compat.h"
#include <filesystem>
#include <fstream>
#include <functional>
#include <set>
#include <tuple>
#include <atomic>
#include <string>
#include "handlers.h"
#include "json.hpp"
#include "native-audio.hpp"
std::unique_ptr<native_audio::Broker> nativeBroker;
using json = nlohmann::json;
int qaConfirmResponse = 2;
bool settingsLoaded = false;
std::vector<json> settingsRequests;
HWND settingsHwnd = nullptr;
ICoreWebView2Controller *settingsCtl = nullptr;
ICoreWebView2 *settingsWeb = nullptr;
ICoreWebView2Environment *environment = nullptr;
void openSettings();
std::string settingsSource = "defaults", settingsWarning;
json defaults;
json cfg, audioCfg, regionList = json::array();
bool frontendHeld = false, closeAllowed = false, closeRequested = false;
namespace fs = std::filesystem;
bool diagnosticsEnabled = false;
int appExitCode = 0;
std::wstring startupFailure;
fs::path dataRoot, reportDir;
fs::path root, logPath;

HWND hwnd;
bool popup = false, passing = false, held = false, dragging = false,
     dropArmed = false, dropActive = false, suppressed = false,
     lastLeft = false, lastEsc = false;
bool closeQueued = false;

POINT grab{}, lastPoint{};
ULONGLONG born, lastMetrics = 0, lastCpu = 0;

ICoreWebView2Controller *ctl = nullptr;
ICoreWebView2CompositionController *comp = nullptr;
ICoreWebView2 *web = nullptr;
IDCompositionDevice *dc = nullptr;
IDCompositionTarget *target = nullptr;
IDCompositionVisual *visual = nullptr;
void log(std::string s) {
  auto line = std::to_string(GetTickCount64() - born) + " " + s + "\r\n";
  HANDLE f = CreateFileW(logPath.c_str(), FILE_APPEND_DATA,
                         FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                         OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f != INVALID_HANDLE_VALUE) {
    DWORD n;
    WriteFile(f, line.data(), (DWORD)line.size(), &n, nullptr);
    CloseHandle(f);
  }
}
std::string utf8(const std::wstring &s) {
  int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), 0, 0, 0, 0);
  std::string r(n, 0);
  WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), r.data(), n, 0, 0);
  return r;
}
std::string quote(const std::string &s) {
  std::string r = "\"";
  for (unsigned char c : s) {
    if (c == '\\' || c == '"')
      r += '\\';
    if (c >= 32)
      r += c;
  }
  return r + '"';
}
bool in(POINT p, int x, int y, int w, int h) {
  return p.x >= x && p.y >= y && p.x < x + w && p.y < y + h;
}

std::wstring wide(const std::string &s) {
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(),
                              (int)s.size(), 0, 0);
  std::wstring r(n, 0);
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), (int)s.size(),
                      r.data(), n);
  return r;
}
void startupError(const std::wstring &text) {
  startupFailure = text;
  PostMessageW(hwnd, WM_APP + 99, 0, 0);
}
void postJson(const json &v) {
  auto text = wide(v.dump());
  if (web)
    web->PostWebMessageAsJson(text.c_str());
  if (settingsWeb)
    settingsWeb->PostWebMessageAsJson(text.c_str());
}
void event(const std::string &name, const json &data = nullptr) {
  postJson({{"kind", "event"}, {"name", name}, {"data", data}});
}
#include "dpi-input-v020.hpp"
bool ui(POINT p) {
  if (dropActive) return true;
  if (held || dragging || frontendHeld)
    return true;
  for (const auto &r : regionList) {
    if (cssContains(p, r.value("x", 0.0), r.value("y", 0.0), r.value("width", 0.0),
           r.value("height", 0.0)))
      return true;
  }
  return cssContains(p, 12, 12, 50, 54) ||
         ((dropArmed || dropActive) && dropContains(p));
}
json sanitize(const json &);
void atomicFile(const fs::path &, const json &);
#include "atomic-json.hpp"
void saveConfig() {
  auto dir = dataRoot;
  fs::create_directories(dir);
  auto file = dir / L"settings.json", temp = dir / L"settings.json.tmp";
  auto text = cfg.dump(2);
  writeFlushedJsonTemp(temp, text, "Settings temporary file failed",
                       "Settings flush failed");
  if (fs::exists(file)) {
    json prior;
    try {
      std::ifstream input(file);
      json raw;
      input >> raw;
      prior = sanitize(raw);
    } catch (const std::exception &e) {
      log("settings-backup-skip " + std::string(e.what()));
    }
    if (prior.is_object())
      atomicFile(dir / L"settings.json.bak", prior);
  }
  if (!MoveFileExW(temp.c_str(), file.c_str(),
                   MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
    throw std::runtime_error("Atomic settings save failed");
}
#include "host-files.hpp"
json sanitize(const json &input) {
  if (!input.is_object())
    throw std::runtime_error("設定形式が不正です");
  auto c = defaults;
  for (auto it = input.begin(); it != input.end(); ++it)
    if (c.contains(it.key()) &&
        ((c[it.key()].is_number() && it.value().is_number()) ||
         c[it.key()].type() == it.value().type()))
      c[it.key()] = it.value();
  for (auto range :
       std::vector<std::tuple<std::string, double, double, double>>{
           {"volume", 0, 1, .65},
           {"gain", 0, 4, 1},
           {"scale", 70, 125, 100},
           {"angle", -180, 180, 0},
           {"duration", 1, 600, 300},
           {"loop", 1, 99, 2},
           {"fade", 0, 60, 5},
           {"vmdBpm", 20, 400, 160}}) {
    auto [k, lo, hi, fallback] = range;
    double v = c[k].is_number() ? c[k].get<double>() : fallback;
    c[k] = std::isfinite(v) ? std::clamp(v, lo, hi) : fallback;
  }
  auto choose = [&](const char *k, std::vector<std::string> v, const char *f) {
    if (!c[k].is_string() ||
        std::find(v.begin(), v.end(), c[k].get<std::string>()) == v.end())
      c[k] = f;
  };
  choose("uiTheme", {"ice", "lavender", "mint", "rose", "mono"}, "ice");
  choose("repeatMode", {"OFF", "ONE", "ALL"}, "OFF");
  choose("sourceType", {"PSG", "SCC", "OPLL"}, "PSG");
  choose("palette", {"ice", "aurora", "pastel", "neon", "mono"}, "aurora");
  choose("brightness", {"subtle", "standard", "vivid"}, "standard");
  c["design"] = "B";
  c["textMode"] = "C";
  c["panelLayout"] = "A";
  bool valid = c["playlists"].is_array() && !c["playlists"].empty() &&
               c["playlists"].size() < 1000;
  for (auto &l : c["playlists"])
    valid = valid && validList(l);
  if (!valid)
    throw std::runtime_error("プレイリストの保存形式が不正です");
  size_t i = 0;
  std::set<std::string> ids;
  for (auto &l : c["playlists"]) {
    auto id = l.value("id", std::string());
    if (id.empty() || ids.count(id))
      id = "list-" + std::to_string(GetTickCount64()) + "-" + std::to_string(i);
    l["id"] = id;
    ids.insert(id);
    i++;
  }
  int active = c["active"].is_number_integer() ? c["active"].get<int>() : 0;
  c["active"] = active >= 0 && active < (int)c["playlists"].size() ? active : 0;
  int n = c["sourceType"] == "PSG" ? 3 : c["sourceType"] == "SCC" ? 5 : 9;
  c["channel"] = c["channel"].is_number_integer()
                     ? std::clamp(c["channel"].get<int>(), 0, n - 1)
                     : 0;
  json profiles = json::object();
  if (c["profiles"].is_object())
    for (auto it = c["profiles"].begin(); it != c["profiles"].end(); ++it)
      if (it.key().size() == 64 &&
          it.key().find_first_not_of("0123456789abcdef") == std::string::npos &&
          it.value().is_number() && it.value() >= 20 && it.value() <= 400)
        profiles[it.key()] = it.value();
  c["profiles"] = profiles;
  return c;
}
void applyConfig(const json &patch) {
  if(patch.contains("gain") && (!patch["gain"].is_number() || !std::isfinite(patch["gain"].get<double>()) || patch["gain"]<0 || patch["gain"]>4))
    throw std::runtime_error("gain must be a finite number from 0 to 4");
  auto before = cfg, merged = cfg;
  for (auto it = patch.begin(); it != patch.end(); ++it)
    merged[it.key()] = it.value();
  cfg = sanitize(merged);
  try {
    saveConfig();
  } catch (...) {
    cfg = before;
    throw;
  }
  audioCfg["playerDefaults"] = {{"duration", cfg["duration"]},
                                {"loop", cfg["loop"]},
                                {"fade", cfg["fade"]},
                                {"lpf", cfg["lpf"].get<bool>() ? 1 : 0}, {"gain",cfg["gain"]}};
  audioCfg["volume"] = cfg["volume"].get<double>() * 100;
  SetWindowPos(hwnd,
               cfg["top"].get<bool>() && !settingsHwnd ? HWND_TOPMOST
                                                       : HWND_NOTOPMOST,
               0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  event("config", cfg);
}
json pendingMotion;

json commitMotion(double bpm) {
  if (!std::isfinite(bpm) || bpm < 20 || bpm > 400 || pendingMotion.is_null())
    throw std::runtime_error("VMDの基準BPMが不正です");
  auto path = pendingMotion["path"].get<std::string>();
  auto m = inspectMotion(wide(path));
  if (m["hash"] != pendingMotion["hash"])
    throw std::runtime_error("VMDが選択後に変更されました");
  cfg["vmdPath"] = path;
  cfg["motionHash"] = m["hash"];
  cfg["vmdBpm"] = bpm;
  cfg["profiles"][m["hash"].get<std::string>()] = bpm;
  saveConfig();
  event("config", cfg);
  pendingMotion = nullptr;
  return m;
}
void motionResource() {
  web->AddWebResourceRequestedFilter(L"https://motion.mgs.invalid/motion.vmd*",
                                     COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
  auto handler = new Handler<ICoreWebView2WebResourceRequestedEventHandler,
                             ICoreWebView2 *,
                             ICoreWebView2WebResourceRequestedEventArgs *>(
      [](ICoreWebView2 *, ICoreWebView2WebResourceRequestedEventArgs *a) {
        IStream *stream = nullptr;
        int status = 200;
        try {
          log("motion-resource-request");
          auto b = native_audio::bytes(
              wide(cfg.value("vmdPath", std::string())), 128 * 1024 * 1024);
          auto memory = GlobalAlloc(GMEM_MOVEABLE, b.size());
          if (!memory)
            throw std::bad_alloc();
          void *p = GlobalLock(memory);
          memcpy(p, b.data(), b.size());
          GlobalUnlock(memory);
          auto hr = CreateStreamOnHGlobal(memory, TRUE, &stream);
          if (FAILED(hr)) {
            GlobalFree(memory);
            throw std::runtime_error("VMD stream failed");
          }
        } catch (const std::exception &e) {
          status = 404;
          log("motion-resource-error " + std::string(e.what()));
        }
        ICoreWebView2WebResourceResponse *r = nullptr;
        environment->CreateWebResourceResponse(
            stream, status, status == 200 ? L"OK" : L"Not Found",
            L"Content-Type: application/octet-stream\r\nCache-Control: "
            L"no-store\r\nAccess-Control-Allow-Origin: https://mgs.local",
            &r);
        if (r) {
          a->put_Response(r);
          r->Release();
        }
        if (stream)
          stream->Release();
        return S_OK;
      });
  EventRegistrationToken t;
  web->add_WebResourceRequested(handler, &t);
  handler->Release();
}

json auditSpec() {
  auto p = dataRoot / L"integration-audit.json";
  if (!fs::is_regular_file(p))
    return nullptr;
  auto b = native_audio::bytes(p, 1048576);
  return json::parse(b);
}
json info() {
  return {{"cfg", cfg},
          {"settingsRecovery", settingsSource},
          {"settingsWarning", settingsWarning},
          {"run", utf8(reportDir.wstring())},
          {"data", utf8(dataRoot.wstring())},
          {"trackTitles", json::object()},
          {"auditSpec", auditSpec()},
          {"inputTest", false},
          {"auditMode", false},
          {"motionExists",
           fs::is_regular_file(wide(cfg.value("vmdPath", std::string())))},
          {"external", externals()}};
}
void message(const std::string &text) {
  json m;
  try {
    m = json::parse(text);
    auto method = m.value("method", std::string());
    if (m.value("kind", std::string()) == "notify") {
      auto d = m.value("data", json());
      if (method == "regions") {
        if(d.is_array()) regionList=d;
        else if(d.is_object() && d.contains("rects")) {
          regionList=d["rects"];
          double scale=d.value("cssScale",1.0);
          if(std::isfinite(scale) && scale>0 && scale<16) cssPixelScale=scale;
          if(d.contains("dropArea") && d["dropArea"].is_object())dropArea=d["dropArea"];
        }
      }
      else if (method == "popup-state")
        popup = d.is_boolean() && d.get<bool>();
      else if (method == "hold")
        frontendHeld = d.is_boolean() && d.get<bool>();
      else if (method == "close-ready") {
        closeAllowed = true;
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
      } else if (method == "close-cancel") {
        closeRequested = false;
        closeQueued = false;
      } else if (method == "sync-trace" && diagnosticsEnabled) {
        std::ofstream f(reportDir / L"sync.jsonl", std::ios::app);
        if (d.is_array())
          for (auto &r : d)
            f << r.dump() << "\n";
      } else if (method == "generation-audit") {
        nativeBroker->enqueue(
            {{"id", "audit"}, {"args", json::array({"audit", d})}});
      } else if (method == "script-error" || method == "script-rejection" ||
                 (diagnosticsEnabled &&
                  (method == "integration-status" || method == "stats")))
        log(method + " " + d.dump());
      return;
    }
    if (method == "action" && m.at("args").at(0) == "settings") {
      if (settingsLoaded) {
        openSettings();
        postJson({{"kind", "reply"}, {"id", m.at("id")}, {"result", true}});
      } else {
        settingsRequests.push_back(m.at("id"));
        openSettings();
      }
      return;
    }
    if (method == "action" && m.at("args").at(0) == "capture") {
      bool settings =
          m.at("args").size() > 1 && m["args"][1].value("settings", false);
      auto target = settings ? settingsWeb : web;
      if (!target)
        throw std::runtime_error("Capture target unavailable");
      IStream *stream = nullptr;
      if (FAILED(CreateStreamOnHGlobal(nullptr, TRUE, &stream)))
        throw std::runtime_error("Capture stream unavailable");
      auto id = m.at("id");
      std::string captureName =
          m["args"].size() > 1 ? m["args"][1].value("name", std::string()) : "";
      auto cb =
          new Handler<ICoreWebView2CapturePreviewCompletedHandler, HRESULT>(
              [stream, id, captureName](HRESULT hr) {
                json response = {{"kind", "reply"}, {"id", id}};
                if (SUCCEEDED(hr)) {
                  STATSTG stat{};
                  stream->Stat(&stat, STATFLAG_NONAME);
                  LARGE_INTEGER zero{};
                  stream->Seek(zero, STREAM_SEEK_SET, nullptr);
                  if (stat.cbSize.QuadPart > 16 * 1024 * 1024)
                    response["error"] = "Capture too large";
                  else {
                    std::vector<unsigned char> b(stat.cbSize.LowPart);
                    ULONG got = 0;
                    stream->Read(b.data(), b.size(), &got);
                    b.resize(got);
                    if (!captureName.empty()) {
                      auto name = captureName;
                      for (char &c : name)
                        if (!isalnum((unsigned char)c) && c != '-' && c != '_')
                          c = '_';
                      fs::create_directories(reportDir / L"images");
                      std::ofstream f(reportDir / L"images" /
                                          wide(name + ".png"),
                                      std::ios::binary);
                      f.write((char *)b.data(), b.size());
                    }
                    response["result"] = {{"bytes64", native_audio::base64(b)}};
                  }
                } else
                  response["error"] =
                      "Capture failed " + std::to_string((unsigned)hr);
                postJson(response);
                stream->Release();
                return S_OK;
              });
      auto hr = target->CapturePreview(
          COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, stream, cb);
      cb->Release();
      if (FAILED(hr)) {
        stream->Release();
        postJson({{"kind", "reply"}, {"id", id}, {"error", "Capture failed"}});
      }
      return;
    }
    if (method == "native") {
      if (!nativeBroker)
        throw std::runtime_error("Native audio unavailable");
      nativeBroker->enqueue(m);
      return;
    }
    auto args = m.value("args", json::array());
    json result;
    try {
      if (method == "get")
        result = info();
      else if (method == "audio") {
        auto name = args.at(0).get<std::string>();
        if (name == "config")
          result = audioCfg;
        else if (name == "profile") {
          audioCfg["motionProfile"] = args.at(1);
          result = true;
        } else if (name == "settings") {
          for (auto it = args.at(1).begin(); it != args.at(1).end(); ++it)
            audioCfg[it.key()] = it.value();
          result = audioCfg;
        } else
          throw std::runtime_error(
              "Native audio connection not yet implemented: " + name);
      } else if (method == "prepared" && args.at(0) == "cancel")
        result = true;
      else if (method == "set") {
        applyConfig(args.at(0));
        result = cfg;
      } else if (method == "action") {
        auto name = args.at(0).get<std::string>();
        auto spec = auditSpec();
        bool controls = spec.is_object() && spec.value("mode", std::string()) ==
                                                "controls-settings";
        if (controls && name == "qa-confirm-response") {
          qaConfirmResponse = args.at(1).get<int>();
          result = true;
        } else if (controls && name == "settings-selftest") {
          event("settings-selftest");
          result = true;
        } else if (controls && name == "settings-audit-result") {
          event("settings-audit-result", args.at(1));
          result = true;
        } else if (controls && name == "confirm")
          result = qaConfirmResponse;
        else if (controls && name == "save-list") {
          if (!validList(args.at(1)))
            throw std::runtime_error("Invalid playlist fixture");
          atomicFile(reportDir / L"playlist-fixture.json", args.at(1));
          result = true;
        } else if (controls && name == "load-list") {
          auto b = native_audio::bytes(reportDir / L"playlist-fixture.json",
                                       1048576);
          result = json::parse(b);
          if (!validList(result))
            throw std::runtime_error("Invalid playlist fixture");
        } else if (controls && name == "choose-mml") {
          result = json::array(
              {spec.at("tests").get<std::string>() + "/playlist_c.mus"});
        } else if (name == "title-test-result") {
          atomicFile(reportDir / L"title-format-result.json", args.at(1));
          result = true;
        } else if (name == "settings-tab") {
          event("tab", args.at(1));
          result = true;
        } else if (name == "gpu") {
          result = {{"available", false},
                    {"reason",
                     "GPU performance is recorded by independent "
                     "performance-monitor; this RPC is not a GPU measurement"}};
        } else if (name == "quit") {
          closeAllowed = true;
          PostMessageW(hwnd, WM_CLOSE, 0, 0);
          result = true;
        } else if (name == "integration-done" || name == "endurance-progress" ||
                   name == "endurance-summary" || name == "rc-complete") {
          atomicFile(reportDir / wide(name + ".json"), args.at(1));
          result = true;
        } else if (name == "video") {
          auto d = args.at(1);
          auto name = d.at("name").get<std::string>();
          for (char &c : name)
            if (!isalnum((unsigned char)c) && c != '-' && c != '_')
              c = '_';
          auto bytes = d.at("bytes").get<std::vector<unsigned char>>();
          if (bytes.size() > 128 * 1024 * 1024)
            throw std::runtime_error("Video exceeds limit");
          fs::create_directories(reportDir / L"videos");
          std::ofstream f(reportDir / L"videos" / wide(name + ".webm"),
                          std::ios::binary);
          f.write((char *)bytes.data(), bytes.size());
          if (!f)
            throw std::runtime_error("Video save failed");
          result = true;
        } else if (name == "reset") {
          if (MessageBoxW(
                  settingsHwnd ? settingsHwnd : hwnd,
                  L"一般設定を初期値へ戻しますか？ "
                  L"プレイリスト・VMD基準BPM・ユーザーファイルは保持します。",
                  L"MGS_MascotPlayer",
                  MB_OKCANCEL | MB_DEFBUTTON2 | MB_ICONQUESTION) == IDOK) {
            auto reset = defaults;
            for (auto k : {"playlists", "active", "profiles", "vmdPath",
                           "vmdBpm", "motionHash"})
              reset[k] = cfg[k];
            applyConfig(reset);
            result = true;
          } else
            result = false;
        } else if (name == "com-status" || name == "production-com-status")
          result = externals();
        else if (name == "externals-required") {
          auto kind = args.size() > 1 && args[1].is_object()
                          ? args[1].value("kind", std::string())
                          : std::string();
          for (auto &x : externals())
            if (!x["valid"].get<bool>() &&
                (kind != "mgs" || x["key"] == "driver"))
              throw std::runtime_error(x["message"]);
          result = true;
        } else if (name == "choose-mml") {
          result = json::array();
          for (auto &p : chooseFiles(true))
            result.push_back(utf8(p));
        } else if (name == "confirm") {
          int r = MessageBoxW(
              settingsHwnd ? settingsHwnd : hwnd,
              L"プレイリストに未保存の変更があります。保存して続行しますか？",
              L"MGS_MascotPlayer", MB_YESNOCANCEL | MB_ICONQUESTION);
          result = r == IDYES ? 0 : r == IDNO ? 1 : 2;
        } else if (name == "save-list") {
          auto d = args.at(1);
          if (!validList(d))
            throw std::runtime_error("プレイリスト形式が不正です");
          auto paths = chooseFiles(false, true, L"Playlist JSON", L"*.json");
          if (paths.empty())
            result = false;
          else {
            atomicFile(paths[0], d);
            result = true;
          }
        } else if (name == "load-list") {
          auto paths = chooseFiles(false, false, L"Playlist JSON", L"*.json");
          if (paths.empty())
            result = nullptr;
          else {
            auto b = native_audio::bytes(paths[0], 1024 * 1024);
            result = json::parse(b);
            if (!validList(result))
              throw std::runtime_error("プレイリスト形式が不正です");
          }
        } else if (name == "choose-vmd") {
          auto paths = chooseFiles(false, false, L"VMD", L"*.vmd");
          if (paths.empty())
            result = nullptr;
          else {
            pendingMotion = inspectMotion(paths[0]);
            if (pendingMotion["needsBpm"])
              result = pendingMotion;
            else
              result = commitMotion(pendingMotion["knownBpm"].get<double>());
          }
        } else if (name == "vmd-cancel") {
          pendingMotion = nullptr;
          result = nullptr;
        } else if (name == "settings") {
          openSettings();
          result = true;
        } else if (name == "close-settings") {
          if (settingsHwnd)
            DestroyWindow(settingsHwnd);
          result = true;
        } else if (name == "player-command") {
          event("player-command", args.at(1));
          result = true;
        } else if (name == "vmd-commit")
          result = commitMotion(args.at(1).get<double>());
        else if (name == "save-bpm") {
          auto m = inspectMotion(wide(cfg.value("vmdPath", std::string())));
          cfg["profiles"][m["hash"].get<std::string>()] = cfg["vmdBpm"];
          saveConfig();
          result = m["hash"];
        } else if (name == "startup-vmd") {
          if (cfg.value("vmdPath", std::string()).empty())
            result = nullptr;
          else {
            auto m = inspectMotion(wide(cfg["vmdPath"]));
            if (m["needsBpm"]) {
              pendingMotion = m;
              result = m;
            } else {
              pendingMotion = m;
              result = commitMotion(m["knownBpm"].get<double>());
            }
          }
        } else if (name == "record") {
          if (args.size() > 1)
            log("record " + args[1].dump());
          result = true;
        } else if (name == "playlist-clean") {
          event("playlist-clean");
          result = true;
        } else
          throw std::runtime_error("Integration not yet implemented: " + name);
      } else
        throw std::runtime_error("Unknown host method: " + method);
      postJson({{"kind", "reply"}, {"id", m.at("id")}, {"result", result}});
    } catch (const std::exception &e) {
      postJson({{"kind", "reply"}, {"id", m.at("id")}, {"error", e.what()}});
      log("rpc-error " + std::string(e.what()));
    }
  } catch (const std::exception &e) {
    log("message-error " + std::string(e.what()));
    if (m.is_object() && m.contains("id"))
      postJson({{"kind", "reply"}, {"id", m.at("id")}, {"error", e.what()}});
  }
}
void mode(bool pass) {
  if (passing == pass)
    return;
  passing = pass;
  auto st = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  SetLastError(0);
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE,
                    pass ? (st | WS_EX_TRANSPARENT | WS_EX_LAYERED)
                         : (st & ~(WS_EX_TRANSPARENT | WS_EX_LAYERED)));
  if (pass)
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
  log(std::string("input-pass ") + (pass ? "true" : "false") +
      " error=" + std::to_string(GetLastError()));
}
void endInput(const char *why) {
  bool was = held || dragging;
  bool webHeld = held;
  held = dragging = false;
  if (webHeld && comp)
    comp->SendMouseInput(COREWEBVIEW2_MOUSE_EVENT_KIND_LEFT_BUTTON_UP,
                         COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS_NONE, 0,
                         lastPoint);
  if (GetCapture() == hwnd)
    ReleaseCapture();
  if (was)
    log(std::string("capture-end reason=") + why +
        " capture=" + std::to_string((uintptr_t)GetCapture()));
}
void endDrop(const char *why) {
  bool was = dropArmed || dropActive;
  dropArmed = dropActive = false;
  suppressed =
      (GetAsyncKeyState(VK_ESCAPE) & 0x8000) != 0 || std::string(why) == "drop";
  event("native-drop", {{"type", "drop-state"}, {"active", false}});
  if (was)
    log(std::string("drop-end reason=") + why +
        " capture=" + std::to_string((uintptr_t)GetCapture()));
}
void metric() {
  if (!diagnosticsEnabled)
    return;
  auto now = GetTickCount64();
  if (now - lastMetrics < 1000)
    return;
  FILETIME a, b, k, u;
  GetProcessTimes(GetCurrentProcess(), &a, &b, &k, &u);
  ULONGLONG cpu = ((ULONGLONG)k.dwHighDateTime << 32) + k.dwLowDateTime +
                  ((ULONGLONG)u.dwHighDateTime << 32) + u.dwLowDateTime;
  PROCESS_MEMORY_COUNTERS_EX mem{};
  GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS *)&mem,
                       sizeof(mem));
  if (lastMetrics)
    log("host-metric cpu-machine-percent=" +
        std::to_string(100.0 * (cpu - lastCpu) / 10000.0 / (now - lastMetrics) /
                       GetActiveProcessorCount(ALL_PROCESSOR_GROUPS)) +
        " working-set=" + std::to_string(mem.WorkingSetSize) +
        " private=" + std::to_string(mem.PrivateUsage));
  lastMetrics = now;
  lastCpu = cpu;
}

void requestAltClose(const char *from) {
  if (closeQueued)
    return;
  closeQueued = true;
  log(std::string("alt-close-request source=") + from +
      " held=" + std::to_string(held) +
      " capture=" + std::to_string((uintptr_t)GetCapture()));
  PostMessageW(hwnd, WM_APP + 14, 0, 0);
}
using AK = Handler<ICoreWebView2AcceleratorKeyPressedEventHandler,
                   ICoreWebView2Controller *,
                   ICoreWebView2AcceleratorKeyPressedEventArgs *>;
void registerKeys() {
  auto ak = new AK([](ICoreWebView2Controller *,
                      ICoreWebView2AcceleratorKeyPressedEventArgs *a) {
    UINT key = 0;
    INT flags = 0;
    COREWEBVIEW2_KEY_EVENT_KIND kind;
    a->get_VirtualKey(&key);
    a->get_KeyEventLParam(&flags);
    a->get_KeyEventKind(&kind);
    bool alt = (flags & (1u << 29)) || (GetKeyState(VK_MENU) & 0x8000);
    log("key-webview vk=" + std::to_string(key) +
        " kind=" + std::to_string(kind) + " alt=" + std::to_string(alt) +
        " repeat=" + std::to_string((flags >> 30) & 1) +
        " held=" + std::to_string(held) +
        " capture=" + std::to_string((uintptr_t)GetCapture()));
#ifdef ENABLE_ALT_CLOSE
    if (key == VK_F4 && alt &&
        (kind == COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN ||
         kind == COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN)) {
      a->put_Handled(TRUE);
      if (!(flags & (1u << 30)))
        requestAltClose("webview-accelerator");
    }
#endif
    return S_OK;
  });
  EventRegistrationToken t;
  auto hr = ctl->add_AcceleratorKeyPressed(ak, &t);
  log("key-register=" + std::to_string((unsigned)hr));
  ak->Release();
}
class DropTarget final : public IDropTarget {
  LONG refs = 1;
  bool files = false;
  bool highlighted = false;

public:
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void **p) override {
    if (id == IID_IUnknown || id == IID_IDropTarget) {
      *p = this;
      AddRef();
      return S_OK;
    }
    *p = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override {
    return InterlockedIncrement(&refs);
  }
  ULONG STDMETHODCALLTYPE Release() override {
    auto n = InterlockedDecrement(&refs);
    if (!n)
      delete this;
    return n;
  }
  HRESULT STDMETHODCALLTYPE DragEnter(IDataObject *d, DWORD keys, POINTL point,
                                      DWORD *e) override {
    FORMATETC f{CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
    files = SUCCEEDED(d->QueryGetData(&f));
    POINT q{point.x,point.y};ScreenToClient(hwnd,&q);
    highlighted=files && dropContains(q);
    *e = highlighted ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    dropActive = files;
    dropArmed = files;
    log("DragEnter hdrop=" + std::to_string(files) +
        " keys=" + std::to_string(keys));
    if (files)
      event("native-drop", {{"type", "drop-state"}, {"active", highlighted}});
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE DragOver(DWORD, POINTL p, DWORD *e) override {
    POINT q{p.x, p.y};
    ScreenToClient(hwnd, &q);
    bool hit = dropContains(q);
    *e = files && hit ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    if(highlighted!=hit){highlighted=hit;event("native-drop",{{"type","drop-state"},{"active",files && hit}});}
    dropActive=files;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE DragLeave() override {
    log("DragLeave");
    files=false;highlighted=false;
    endDrop("leave-or-cancel");
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Drop(IDataObject *d, DWORD, POINTL point,
                                 DWORD *e) override {
    POINT q{point.x,point.y};ScreenToClient(hwnd,&q);
    if(!files || !dropContains(q)) {
      *e=DROPEFFECT_NONE;files=false;highlighted=false;
      log("Drop rejected outside-playlist");endDrop("drop");return S_OK;
    }
    FORMATETC f{CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
    STGMEDIUM m{};
    std::vector<std::wstring> paths;
    auto hr = d->GetData(&f, &m);
    if (SUCCEEDED(hr)) {
      auto hd = (HDROP)m.hGlobal;
      UINT n = DragQueryFileW(hd, 0xffffffff, nullptr, 0);
      for (UINT i = 0; i < n; i++) {
        UINT len = DragQueryFileW(hd, i, nullptr, 0);
        std::wstring p(len + 1, 0);
        DragQueryFileW(hd, i, p.data(), len + 1);
        p.resize(len);
        paths.push_back(p);
      }
      ReleaseStgMedium(&m);
    }
    std::string entry =
        "Drop count=" + std::to_string(paths.size()) + " paths=[";
    for (size_t i = 0; i < paths.size(); i++) {
      if (i)
        entry += ",";
      entry += quote(utf8(paths[i]));
    }
    log(entry + "]");
    json files = json::array();
    for (auto &p : paths)
      files.push_back(utf8(p));
    event("native-drop", {{"type", "native-file-drop"}, {"files", files}});
    std::wstring text = L"受信：" + std::to_wstring(paths.size()) + L"ファイル";
    *e = SUCCEEDED(hr) && !paths.empty() ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    this->files=false;highlighted=false;
    endDrop("drop");
    return S_OK;
  }
};
LRESULT CALLBACK proc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if(m==WM_DPICHANGED) {
    fitDpiWindow(h); updateDpiController(h,h==settingsHwnd?settingsCtl:ctl);
    if(ctl)ctl->NotifyParentWindowPositionChanged();
    return 0;
  }
  if(m==WM_SIZE && h==hwnd && ctl) updateDpiController(h,ctl);
  if (h == settingsHwnd) {
    if (m == WM_CLOSE) {
      if (settingsWeb)
        settingsWeb->PostWebMessageAsJson(
            L"{\"kind\":\"event\",\"name\":\"settings-close\",\"data\":null}");
      else
        DestroyWindow(h);
      return 0;
    }
    if (m == WM_SIZE && settingsCtl) {
      RECT r;
      GetClientRect(h, &r);
      updateDpiController(h,settingsCtl);
      return 0;
    }
    if (m == WM_DESTROY) {
      settingsLoaded = false;
      for (auto &id : settingsRequests)
        postJson({{"kind", "reply"},
                  {"id", id},
                  {"error", "Settings closed before ready"}});
      settingsRequests.clear();
      event("settings-state", false);
      if (hwnd && IsWindow(hwnd))
        SetWindowPos(hwnd,
                     cfg["top"].get<bool>() ? HWND_TOPMOST : HWND_NOTOPMOST, 0,
                     0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      if (settingsCtl) {
        settingsCtl->Close();
        settingsCtl->Release();
        settingsCtl = nullptr;
      }
      if (settingsWeb) {
        settingsWeb->Release();
        settingsWeb = nullptr;
      }
      settingsHwnd = nullptr;
      return 0;
    }
    return DefWindowProcW(h, m, w, l);
  }

  if (m == WM_KEYDOWN || m == WM_SYSKEYDOWN || m == WM_KEYUP ||
      m == WM_SYSKEYUP)
    log("key-native msg=" + std::to_string(m) + " vk=" + std::to_string(w) +
        " flags=" + std::to_string((unsigned long)l) +
        " held=" + std::to_string(held));
#ifdef ENABLE_ALT_CLOSE
  if (m == WM_SYSKEYDOWN && w == VK_F4 && (l & (1LL << 29))) {
    if (!(l & (1LL << 30)))
      requestAltClose("host-syskey");
    return 0;
  }
  if (m == WM_APP + 99) {
    appExitCode = 2;
    MessageBoxW(h, startupFailure.c_str(), L"MGS_MascotPlayer 起動できません",
                MB_OK | MB_ICONERROR);
    closeAllowed = true;
    DestroyWindow(h);
    return 0;
  }
  if (m == WM_APP + 42) {
    std::unique_ptr<json> r(reinterpret_cast<json *>(l));
    postJson(*r);
    return 0;
  }
  if (m == WM_APP + 14) {
    log("alt-close-dispatch held=" + std::to_string(held));
    endInput("alt-f4");
    PostMessageW(h, WM_CLOSE, 0, 0);
    return 0;
  }
#endif
  if (m == WM_TIMER) {
    POINT p;
    GetCursorPos(&p);
    ScreenToClient(h, &p);
    bool left = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
    bool esc = (GetAsyncKeyState(VK_ESCAPE) & 0x8000) != 0;
    if (!left && !dropActive)
      suppressed = false;
    if (esc && !lastEsc) {
      endInput("escape-poll");
      endDrop("escape-poll");
    }
    lastEsc = esc;
    if (!held && !dragging && !dropActive) {
      bool armed = left && !suppressed && dropContains(p);
      if (armed != dropArmed) {
        dropArmed = armed;
        log(std::string("drop-armed ") + (armed ? "true" : "false"));
      }
    }
    if (left && !lastLeft && !ui(p) && popup) {
      event("outside-input");
      log("popup-close outside");
    }
    lastLeft = left;
    mode(!ui(p));
    RECT client{};GetClientRect(h,&client);
    event("hover", {{"x", p.x/cssPixelScale}, {"y", p.y/cssPixelScale}, {"inside", in(p, 0, 0, client.right, client.bottom)}});
    metric();
  }
  if (m == WM_MOVE && ctl)
    ctl->NotifyParentWindowPositionChanged();
  if (m == WM_NCHITTEST) {
    POINT p{GET_X_LPARAM(l), GET_Y_LPARAM(l)};
    ScreenToClient(h, &p);
    return ui(p) ? HTCLIENT : HTTRANSPARENT;
  }
  if (m == WM_LBUTTONDOWN) {
    lastPoint = {GET_X_LPARAM(l), GET_Y_LPARAM(l)};
    if (cssContains(lastPoint, 12, 12, 50, 45)) {
      dragging = true;
      GetCursorPos(&grab);
      SetCapture(h);
      log("drag-start");
      return 0;
    }
    held = true;
    SetCapture(h);
    log("mouse-down x=" + std::to_string(lastPoint.x) +
        " y=" + std::to_string(lastPoint.y));
    if (ctl)
      ctl->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
  }
  if (m == WM_MOUSEMOVE && dragging) {
    POINT p;
    GetCursorPos(&p);
    RECT r;
    GetWindowRect(h, &r);
    SetWindowPos(h, nullptr, r.left + p.x - grab.x, r.top + p.y - grab.y, 0, 0,
                 SWP_NOZORDER | SWP_NOSIZE | SWP_NOACTIVATE);
    grab = p;
    return 0;
  }
  if (comp && (m == WM_MOUSEMOVE || m == WM_LBUTTONDOWN || m == WM_LBUTTONUP)) {
    lastPoint = {GET_X_LPARAM(l), GET_Y_LPARAM(l)};
    auto keys =
        (COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS)((w & 0x7f) |
                                                (held && m != WM_LBUTTONUP
                                                     ? MK_LBUTTON
                                                     : 0));
    auto hr = comp->SendMouseInput((COREWEBVIEW2_MOUSE_EVENT_KIND)m, keys, 0,
                                   lastPoint);
    if (m != WM_MOUSEMOVE || FAILED(hr))
      log("send-mouse msg=" + std::to_string(m) +
          " hr=" + std::to_string((unsigned)hr));
  }
  if (m == WM_LBUTTONUP) {
    bool wasDrag = dragging;
    held = dragging = false;
    if (GetCapture() == h)
      ReleaseCapture();
    log(wasDrag ? "drag-end" : "mouse-up capture-released");
    if (wasDrag) {
      RECT r;
      GetWindowRect(h, &r);
      atomicFile(dataRoot / L"window-position.json",
                 {{"x", r.left}, {"y", r.top}});
    }
  }
  if (m == WM_CAPTURECHANGED && ((HWND)l) != h)
    endInput("capture-changed");
  if (m == WM_CANCELMODE)
    endInput("cancel-mode");
  if (m == WM_KILLFOCUS && !IsChild(h, (HWND)w))
    endInput("focus-lost");
  if (m == WM_ACTIVATE) {
    log("front-activate " + std::to_string(LOWORD(w)));
    if (LOWORD(w) == WA_INACTIVE)
      endInput("deactivate");
  }
  if (m == WM_KEYDOWN && w == VK_ESCAPE) {
    endInput("escape");
    endDrop("escape");
  }

  if (m == WM_CLOSE && !closeAllowed) {
    endInput("close-request");
    if (!closeRequested) {
      closeRequested = true;
      event("confirm-close");
    }
    return 0;
  }
  if (m == WM_CLOSE) {
    log("wm-close held=" + std::to_string(held) + " dragging=" +
        std::to_string(dragging) + " dropActive=" + std::to_string(dropActive));
    endInput("close");
    endDrop("close");
  }
  if (m == WM_DESTROY) {
    if (settingsHwnd)
      DestroyWindow(settingsHwnd);
    nativeBroker.reset();
    MSG pendingReply;
    while (PeekMessageW(&pendingReply, h, WM_APP + 42, WM_APP + 42, PM_REMOVE))
      delete reinterpret_cast<json *>(pendingReply.lParam);
    KillTimer(h, 1);

    endInput("destroy");
    endDrop("destroy");
    RevokeDragDrop(h);

    if (ctl)
      ctl->Close();
    PostQuitMessage(0);
    return 0;
  }
  return DefWindowProcW(h, m, w, l);
}
using ED = Handler<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,
                   HRESULT, ICoreWebView2Environment *>;
using CD = Handler<
    ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler,
    HRESULT, ICoreWebView2CompositionController *>;
using MH = Handler<ICoreWebView2WebMessageReceivedEventHandler, ICoreWebView2 *,
                   ICoreWebView2WebMessageReceivedEventArgs *>;
// Windows shell/class icons only. Shared resource handles remain owned by Windows.
static HICON appIcon(bool small) {
  return static_cast<HICON>(LoadImageW(
      GetModuleHandleW(nullptr), MAKEINTRESOURCEW(101), IMAGE_ICON,
      GetSystemMetrics(small ? SM_CXSMICON : SM_CXICON),
      GetSystemMetrics(small ? SM_CYSMICON : SM_CYICON), LR_SHARED));
}
static void setAppIcons(HWND target) {
  SendMessageW(target, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(appIcon(false)));
  SendMessageW(target, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(appIcon(true)));
}

void openSettings() {
  if (settingsHwnd) {
    ShowWindow(settingsHwnd, SW_RESTORE);
    SetForegroundWindow(settingsHwnd);
    return;
  }
  if (!environment)
    throw std::runtime_error("WebView2 environment unavailable");
  event("settings-state", true);
  SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0,
               SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  settingsHwnd =
      CreateWindowExW(0, L"MGSIntegrated014Front", L"MGS_MascotPlayer 設定",
                      WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 920,
                      740, hwnd, nullptr, GetModuleHandleW(nullptr), nullptr);
  if (!settingsHwnd)
    throw std::runtime_error("Settings window creation failed");
  setAppIcons(settingsHwnd);
  fitDpiWindow(settingsHwnd);
  auto cb =
      new Handler<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,
                  HRESULT, ICoreWebView2Controller *>(
          [](HRESULT hr, ICoreWebView2Controller *c) {
            log("settings-controller=" + std::to_string((unsigned)hr));
            if (FAILED(hr) || !settingsHwnd) {
              if (settingsHwnd)
                DestroyWindow(settingsHwnd);
              return hr;
            }
            settingsCtl = c;
            c->AddRef();
            ICoreWebView2Controller2 *background = nullptr;
            if (SUCCEEDED(c->QueryInterface(__uuidof(ICoreWebView2Controller2),
                                            (void **)&background))) {
              background->put_DefaultBackgroundColor({255, 14, 27, 43});
              background->Release();
            }
            c->get_CoreWebView2(&settingsWeb);
            RECT r;
            GetClientRect(settingsHwnd, &r);
            c->put_Bounds(r);
            installDpiPolicy(settingsHwnd,c);
            preventFileNavigation(settingsWeb);
            c->put_IsVisible(TRUE);
            auto mh = new MH([](ICoreWebView2 *,
                                ICoreWebView2WebMessageReceivedEventArgs *a) {
              LPWSTR p = nullptr;
              a->TryGetWebMessageAsString(&p);
              if (p) {
                message(utf8(p));
                CoTaskMemFree(p);
              }
              return S_OK;
            });
            EventRegistrationToken t;
            settingsWeb->add_WebMessageReceived(mh, &t);
            mh->Release();
            ICoreWebView2_3 *w3 = nullptr;
            settingsWeb->QueryInterface(__uuidof(ICoreWebView2_3),
                                        (void **)&w3);
            if (w3) {
              w3->SetVirtualHostNameToFolderMapping(
                  L"mgs.local", (root / L"web").c_str(),
                  COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
              w3->Release();
            }
            auto ready =
                new Handler<ICoreWebView2NavigationCompletedEventHandler,
                            ICoreWebView2 *,
                            ICoreWebView2NavigationCompletedEventArgs *>(
                    [](ICoreWebView2 *,
                       ICoreWebView2NavigationCompletedEventArgs *a) {
                      BOOL ok = FALSE;
                      a->get_IsSuccess(&ok);
                      log("settings-navigation-complete=" + std::to_string(ok));
                      settingsLoaded = ok;
                      if (ok && settingsHwnd) {
                        ShowWindow(settingsHwnd, SW_SHOW);
                        SetForegroundWindow(settingsHwnd);
                      }
                      for (auto &id : settingsRequests) {
                        json r = {{"kind", "reply"}, {"id", id}};
                        if (ok)
                          r["result"] = true;
                        else
                          r["error"] = "Settings navigation failed";
                        postJson(r);
                      }
                      settingsRequests.clear();
                      return S_OK;
                    });
            EventRegistrationToken nav;
            settingsWeb->add_NavigationCompleted(ready, &nav);
            ready->Release();
            log("settings-navigate=" +
                std::to_string((unsigned)settingsWeb->Navigate(
                    L"https://mgs.local/settings.html")));
            return S_OK;
          });
  auto hr = environment->CreateCoreWebView2Controller(settingsHwnd, cb);
  log("settings-create=" + std::to_string((unsigned)hr));
  if (FAILED(hr))
    DestroyWindow(settingsHwnd);
  cb->Release();
}
void selectDataRoot() {
  auto marker = root / L"validation-data-root.json";
  if (fs::exists(marker)) {
    auto bytes = native_audio::bytes(marker, 4096);
    auto v = json::parse(bytes);
    auto base = fs::weakly_canonical(root.parent_path());
    dataRoot = fs::weakly_canonical(base / wide(v.at("relativeDirectory")));
    auto relative = dataRoot.lexically_relative(base);
    if (relative.empty() || *relative.begin() == L"..")
      throw std::runtime_error(
          "Validation data must stay inside the validation directory");
  } else {
    PWSTR roaming = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_RoamingAppData, KF_FLAG_CREATE,
                                    nullptr, &roaming)))
      throw std::runtime_error("AppData folder unavailable");
    dataRoot = fs::path(roaming) /
               L"MGS_MascotPlayer/validation/code-audit-refactor-v016";
    CoTaskMemFree(roaming);
  }
  fs::create_directories(dataRoot);
}
void loadConfig() {
  std::ifstream f(root / L"defaults.json");
  f >> defaults;
  cfg = defaults;
  auto settings = dataRoot / L"settings.json";
  if (fs::exists(settings)) {
    try {
      std::ifstream in(settings);
      json saved;
      in >> saved;
      cfg = sanitize(saved);
      settingsSource = "settings";
    } catch (const std::exception &e) {
      settingsWarning = e.what();
      try {
        fs::copy_file(settings,
                      reportDir / L"settings-primary-unreadable.original.json");
      } catch (...) {
      }
      auto backup = settings;
      backup += L".bak";
      if (!fs::exists(backup)) {
        backup = settings;
        backup += L".previous.bak";
      }
      try {
        std::ifstream in(backup);
        json saved;
        in >> saved;
        cfg = sanitize(saved);
        settingsSource = "backup";
      } catch (...) {
        cfg = defaults;
        settingsSource = "defaults-after-corruption";
      }
    }
  }
  audioCfg = {{"sourceType", cfg["sourceType"]},
              {"channel", cfg["channel"]},
              {"volume", cfg["volume"].get<double>() * 100},
              {"playerDefaults",
               {{"duration", cfg["duration"]},
                {"loop", cfg["loop"]},
                {"fade", cfg["fade"]},
                {"lpf", cfg["lpf"].get<bool>() ? 1 : 0}, {"gain",cfg["gain"]}}}};
}
int WINAPI wWinMain(HINSTANCE hi, HINSTANCE, PWSTR, int) {
  born = GetTickCount64();
  wchar_t path[32768];
  GetModuleFileNameW(nullptr, path, 32768);
  root = fs::path(path).parent_path();
  try {
    selectDataRoot();
  } catch (const std::exception &e) {
    MessageBoxW(nullptr, wide(e.what()).c_str(),
                L"MGS_MascotPlayer 設定保存先エラー", MB_OK | MB_ICONERROR);
    return 2;
  }
  reportDir = dataRoot / L"reports" /
              (L"run-" + std::to_wstring(GetTickCount64()) + L"-" +
               std::to_wstring(GetCurrentProcessId()));
  fs::create_directories(reportDir);
  // Detailed traces are QA-only; input recovery and errors remain logged.
  diagnosticsEnabled =
      fs::is_regular_file(root / L"validation-data-root.json") ||
      fs::is_regular_file(dataRoot / L"integration-audit.json");
  try {
    loadConfig();
    if (settingsSource == "defaults")
      saveConfig();
  } catch (const std::exception &e) {
    MessageBoxW(nullptr, wide(e.what()).c_str(),
                L"MGS_MascotPlayer 設定読込／保存エラー", MB_OK | MB_ICONERROR);
    return 2;
  }

  logPath = reportDir / (std::string("front-") +
                         std::to_string(GetCurrentProcessId()) + ".log");
  log("start pid=" + std::to_string(GetCurrentProcessId()));
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  OleInitialize(nullptr);

  WNDCLASSW wc{};
  wc.hInstance = hi;
  wc.lpfnWndProc = proc;
  wc.lpszClassName = L"MGSIntegrated014Front";
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
  wc.hIcon = appIcon(false);
  wc.hbrBackground = nullptr;
  RegisterClassW(&wc);
  hwnd = CreateWindowExW(
      (WS_EX_APPWINDOW | WS_EX_TOPMOST | WS_EX_NOREDIRECTIONBITMAP),
      wc.lpszClassName, L"MGS_MascotPlayer WebView2 統合検証",
      WS_POPUP | WS_VISIBLE, 80, 40, 640, 760, nullptr, nullptr, hi, nullptr);

  setAppIcons(hwnd);

  auto d = new DropTarget();
  auto hr = RegisterDragDrop(hwnd, d);
  log("drop-register=" + std::to_string((unsigned)hr));
  d->Release();

  SetTimer(hwnd, 1, 50, nullptr);
  {
    auto p = dataRoot / L"window-position.json";
    try {
      std::ifstream f(p);
      json v;
      f >> v;
      RECT r{v.at("x").get<int>(), v.at("y").get<int>(), 0, 0};
      r.right = r.left + 640;
      r.bottom = r.top + 760;
      MONITORINFO mi{};
      mi.cbSize = sizeof(mi);
      GetMonitorInfoW(MonitorFromRect(&r, MONITOR_DEFAULTTONEAREST), &mi);
      int x = std::clamp(r.left, mi.rcWork.left, mi.rcWork.right - 64),
          y = std::clamp(r.top, mi.rcWork.top, mi.rcWork.bottom - 64);
      SetWindowPos(hwnd, nullptr, x, y, 0, 0,
                   SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    } catch (...) {
    }
    SetWindowPos(hwnd, cfg["top"].get<bool>() ? HWND_TOPMOST : HWND_NOTOPMOST,
                 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }
  nativeBroker = std::make_unique<native_audio::Broker>(
      root, dataRoot / L"jobs", [](json r) {
        auto p = new json(std::move(r));
        if (!PostMessageW(hwnd, WM_APP + 42, 0, reinterpret_cast<LPARAM>(p)))
          delete p;
      });
  HMODULE loader = nullptr;

  HRESULT r = DCompositionCreateDevice(nullptr, __uuidof(IDCompositionDevice),
                                       (void **)&dc);
  log("dcomp=" + std::to_string((unsigned)r));
  if (SUCCEEDED(r)) {
    dc->CreateTargetForHwnd(hwnd, TRUE, &target);
    dc->CreateVisual(&visual);
    target->SetRoot(visual);
    dc->Commit();
  }
  loader = LoadLibraryW((root / L"WebView2Loader.dll").c_str());
  using CF = HRESULT(STDAPICALLTYPE *)(
      PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions *,
      ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler *);
  auto create = loader ? (CF)GetProcAddress(
                             loader, "CreateCoreWebView2EnvironmentWithOptions")
                       : nullptr;
  if (!create) {
    log("loader-failed");
    startupError(L"WebView2Loader."
                 L"dllを読み込めません。ZIPをすべて展開し、同じフォルダにある"
                 L"ことを確認してください。");
  } else {
    auto e = new ED([](HRESULT hr, ICoreWebView2Environment *env) {
      log("environment=" + std::to_string((unsigned)hr));
      if (FAILED(hr)) {
        startupError(L"Microsoft Edge WebView2 "
                     L"Runtimeを起動できません。Microsoft公式のEvergreen "
                     L"Runtimeをインストール／更新してください。\nhttps://"
                     L"developer.microsoft.com/microsoft-edge/webview2/");
        return hr;
      }
      environment = env;
      environment->AddRef();
      ICoreWebView2Environment3 *e3 = nullptr;
      hr = env->QueryInterface(__uuidof(ICoreWebView2Environment3),
                               (void **)&e3);
      if (FAILED(hr)) {
        startupError(
            L"WebView2 "
            L"Runtimeを更新してください。必要な描画APIを利用できません。");
        return hr;
      }
      auto c = new CD([](HRESULT hr, ICoreWebView2CompositionController *cc) {
        log("composition=" + std::to_string((unsigned)hr));
        if (FAILED(hr)) {
          startupError(L"WebView2の透明描画を初期化できません。診断ログを確認"
                       L"してください。");
          return hr;
        }
        comp = cc;
        comp->AddRef();
        comp->QueryInterface(__uuidof(ICoreWebView2Controller), (void **)&ctl);
        ctl->get_CoreWebView2(&web);
        motionResource();
        registerKeys();
        installDpiPolicy(hwnd,ctl);
        preventFileNavigation(web);
        updateDpiController(hwnd,ctl);
        ctl->put_IsVisible(TRUE);
        ICoreWebView2Controller2 *c2 = nullptr;
        ctl->QueryInterface(__uuidof(ICoreWebView2Controller2), (void **)&c2);
        if (c2) {
          c2->put_DefaultBackgroundColor({0, 0, 0, 0});
          c2->Release();
        }
        comp->put_RootVisualTarget(visual);
        dc->Commit();
        auto mh = new MH(
            [](ICoreWebView2 *, ICoreWebView2WebMessageReceivedEventArgs *a) {
              LPWSTR s = nullptr;
              a->TryGetWebMessageAsString(&s);
              if (s) {
                std::wstring ws(s);
                message(utf8(ws));
                CoTaskMemFree(s);
              }
              return S_OK;
            });
        EventRegistrationToken token;
        web->add_WebMessageReceived(mh, &token);
        mh->Release();
        ICoreWebView2_3 *w3 = nullptr;
        web->QueryInterface(__uuidof(ICoreWebView2_3), (void **)&w3);
        if (w3) {
          w3->SetVirtualHostNameToFolderMapping(
              L"mgs.local", (root / L"web").c_str(),
              COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
          w3->Release();
        }
        web->Navigate(L"https://mgs.local/index.html");
        return S_OK;
      });
      auto x = e3->CreateCoreWebView2CompositionController(hwnd, c);
      c->Release();
      e3->Release();
      return x;
    });
    auto badRuntime = root / L"missing-runtime-fixture";
    bool runtimeFixture = fs::exists(root / L"validation-data-root.json") &&
                          fs::exists(root / L"runtime-failure-test.flag");
    auto x = create(runtimeFixture ? badRuntime.c_str() : nullptr,
                    (dataRoot / L"WebView2Profile").c_str(), nullptr, e);
    log("create=" + std::to_string((unsigned)x));
    if (FAILED(x))
      startupError(L"Microsoft Edge WebView2 "
                   L"Runtimeを起動できません。Microsoft公式のEvergreen "
                   L"Runtimeをインストール／更新してください。\nhttps://"
                   L"developer.microsoft.com/microsoft-edge/webview2/");
    e->Release();
  }

  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
    if ((msg.message == WM_KEYDOWN || msg.message == WM_SYSKEYDOWN ||
         msg.message == WM_KEYUP || msg.message == WM_SYSKEYUP))
      log("key-queue msg=" + std::to_string(msg.message) +
          " vk=" + std::to_string(msg.wParam) +
          " hwnd=" + std::to_string((uintptr_t)msg.hwnd) +
          " held=" + std::to_string(held));
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }

  if (comp) {
    comp->put_RootVisualTarget(nullptr);
    comp->Release();
  }
  if (web)
    web->Release();
  if (ctl)
    ctl->Release();
  if (visual)
    visual->Release();
  if (target)
    target->Release();
  if (dc)
    dc->Release();
  if (environment)
    environment->Release();
  if (loader)
    FreeLibrary(loader);

  OleUninitialize();
  log("exit code=" + std::to_string(appExitCode));
  return appExitCode;
}
