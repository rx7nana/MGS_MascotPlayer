#pragma once
// Native I/O adapter only. PCM and MGSC/MGSDRV emulation stay in
// audio-core.exe.
#include <cmath>
#include <bcrypt.h>
#include <wincrypt.h>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <memory>
#include <map>
#include <atomic>
std::wstring wide(const std::string &);
std::string utf8(const std::wstring &);
namespace native_audio {
using J = nlohmann::json;
inline std::string base64(const std::vector<unsigned char> &b) {
  DWORD n = 0;
  CryptBinaryToStringA(b.data(), (DWORD)b.size(),
                       CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &n);
  std::string s(n, 0);
  if (n)
    CryptBinaryToStringA(b.data(), (DWORD)b.size(),
                         CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, s.data(),
                         &n);
  s.resize(n);
  if (!s.empty() && s.back() == 0)
    s.pop_back();
  return s;
}
inline std::string sha(const std::vector<unsigned char> &b) {
  BCRYPT_ALG_HANDLE a = nullptr;
  BCRYPT_HASH_HANDLE h = nullptr;
  DWORD n = 0, len = 0;
  BCryptOpenAlgorithmProvider(&a, BCRYPT_SHA256_ALGORITHM, nullptr, 0);
  BCryptGetProperty(a, BCRYPT_OBJECT_LENGTH, (PUCHAR)&len, sizeof(len), &n, 0);
  std::vector<unsigned char> obj(len), digest(32);
  if (BCryptCreateHash(a, &h, obj.data(), len, nullptr, 0, 0) < 0)
    throw std::runtime_error("SHA256 init failed");
  BCryptHashData(h, (PUCHAR)b.data(), (ULONG)b.size(), 0);
  BCryptFinishHash(h, digest.data(), 32, 0);
  BCryptDestroyHash(h);
  BCryptCloseAlgorithmProvider(a, 0);
  const char *hex = "0123456789abcdef";
  std::string out;
  for (auto c : digest) {
    out += hex[c >> 4];
    out += hex[c & 15];
  }
  return out;
}
struct StreamingHash {
  BCRYPT_ALG_HANDLE alg = nullptr;
  BCRYPT_HASH_HANDLE h = nullptr;
  std::vector<unsigned char> object;
  std::string value;
  StreamingHash() {
    DWORD n = 0, size = 0;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) <
            0 ||
        BCryptGetProperty(alg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&size,
                          sizeof(size), &n, 0) < 0)
      throw std::runtime_error("SHA256 provider failed");
    object.resize(size);
    if (BCryptCreateHash(alg, &h, object.data(), size, nullptr, 0, 0) < 0)
      throw std::runtime_error("SHA256 context failed");
  }
  void update(const std::vector<unsigned char> &b) {
    if (BCryptHashData(h, (PUCHAR)b.data(), (ULONG)b.size(), 0) < 0)
      throw std::runtime_error("SHA256 update failed");
  }
  std::string digest() {
    if (!value.empty())
      return value;
    unsigned char b[32];
    if (BCryptFinishHash(h, b, 32, 0) < 0)
      throw std::runtime_error("SHA256 finish failed");
    for (auto c : b) {
      value += "0123456789abcdef"[c >> 4];
      value += "0123456789abcdef"[c & 15];
    }
    return value;
  }
  ~StreamingHash() {
    if (h)
      BCryptDestroyHash(h);
    if (alg)
      BCryptCloseAlgorithmProvider(alg, 0);
  }
};
inline std::vector<unsigned char> bytes(const std::filesystem::path &p,
                                        size_t max) {
  if (p.native().find(L'\0') != std::wstring::npos)
    throw std::runtime_error("File path contains NUL");
  if (!std::filesystem::is_regular_file(p))
    throw std::runtime_error("Not a regular file");
  std::ifstream f(p, std::ios::binary);
  if (!f)
    throw std::runtime_error("Cannot read file: " + utf8(p.wstring()));
  std::vector<unsigned char> b;
  char block[4096];
  while (f) {
    f.read(block, sizeof(block));
    auto n = f.gcount();
    if (b.size() + n > max)
      throw std::runtime_error("File size exceeds limit");
    b.insert(b.end(), block, block + n);
  }
  return b;
}
inline std::wstring arg(const std::wstring &s) {
  std::wstring r = L"\"";
  int sl = 0;
  for (auto c : s) {
    if (c == L'\\') {
      sl++;
      continue;
    }
    if (c == L'"') {
      r.append(sl * 2 + 1, L'\\');
      r += c;
    } else {
      r.append(sl, L'\\');
      r += c;
    }
    sl = 0;
  }
  r.append(sl * 2, L'\\');
  return r + L"\"";
}
struct Child {
  HANDLE p = nullptr, in = nullptr, out = nullptr, err = nullptr;
  DWORD pid = 0, finalCode = STILL_ACTIVE;
  bool forced = false;
  std::filesystem::path errorPath;
  void spawn(const std::filesystem::path &exe,
             const std::vector<std::wstring> &args,
             const std::filesystem::path &errors) {
    SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    HANDLE ri = nullptr, wo = nullptr;
    CreatePipe(&ri, &in, &sa, 0);
    CreatePipe(&out, &wo, &sa, 0);
    SetHandleInformation(in, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(out, HANDLE_FLAG_INHERIT, 0);
    errorPath = errors;
    err = CreateFileW(errors.c_str(), GENERIC_WRITE,
                      FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, CREATE_ALWAYS,
                      FILE_ATTRIBUTE_NORMAL, nullptr);
    if (!ri || !in || !out || !wo || err == INVALID_HANDLE_VALUE)
      throw std::runtime_error("Create child pipe failed");
    SIZE_T size = 0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
    std::vector<unsigned char> attributes(size);
    STARTUPINFOEXW si{};
    si.StartupInfo.cb = sizeof(si);
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = ri;
    si.StartupInfo.hStdOutput = wo;
    si.StartupInfo.hStdError = err;
    si.lpAttributeList = (PPROC_THREAD_ATTRIBUTE_LIST)attributes.data();
    InitializeProcThreadAttributeList(si.lpAttributeList, 1, 0, &size);
    HANDLE handles[] = {ri, wo, err};
    UpdateProcThreadAttribute(si.lpAttributeList, 0,
                              PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles,
                              sizeof(handles), nullptr, nullptr);
    std::wstring cmd = arg(exe.wstring());
    for (auto &s : args)
      cmd += L" " + arg(s);
    PROCESS_INFORMATION pi{};
    BOOL ok =
        CreateProcessW(exe.c_str(), cmd.data(), nullptr, nullptr, TRUE,
                       EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr,
                       exe.parent_path().c_str(), &si.StartupInfo, &pi);
    DWORD error = GetLastError();
    DeleteProcThreadAttributeList(si.lpAttributeList);
    CloseHandle(ri);
    CloseHandle(wo);
    if (!ok)
      throw std::runtime_error("CreateProcess failed: " +
                               std::to_string(error));
    p = pi.hProcess;
    pid = pi.dwProcessId;
    CloseHandle(pi.hThread);
  }
  void write(std::string s) {
    DWORD n = 0;
    if (!in || !WriteFile(in, s.data(), (DWORD)s.size(), &n, nullptr) ||
        n != s.size())
      throw std::runtime_error("Audio pipe write failed");
  }
  std::vector<unsigned char> read(size_t n, std::atomic<bool> &stop) {
    std::vector<unsigned char> b(n);
    size_t at = 0;
    auto deadline = GetTickCount64() + 5000;
    while (at < n) {
      if (stop)
        throw std::runtime_error("Cancelled");
      DWORD available = 0;
      if (!PeekNamedPipe(out, nullptr, 0, nullptr, &available, nullptr))
        throw std::runtime_error("Audio process pipe closed");
      if (!available) {
        if (GetTickCount64() > deadline)
          throw std::runtime_error("PCM generation timed out");
        if (WaitForSingleObject(p, 0) == WAIT_OBJECT_0)
          throw std::runtime_error("Audio process exited");
        Sleep(1);
        continue;
      }
      DWORD got = 0;
      if (!ReadFile(out, b.data() + at,
                    (DWORD)std::min<size_t>(n - at, available), &got,
                    nullptr) ||
          !got)
        throw std::runtime_error("PCM read failed");
      at += got;
    }
    return b;
  }
  DWORD wait(unsigned ms) {
    auto r = WaitForSingleObject(p, ms);
    if (r == WAIT_TIMEOUT)
      return STILL_ACTIVE;
    DWORD code;
    GetExitCodeProcess(p, &code);
    return code;
  }
  void close() {
    if (in) {
      try {
        write("QUIT\n");
      } catch (...) {
      }
      CloseHandle(in);
      in = nullptr;
    }
    if (p) {
      finalCode = wait(700);
      if (finalCode == STILL_ACTIVE) {
        forced = true;
        TerminateProcess(p, 0xdead);
        finalCode = wait(3000);
      }
      CloseHandle(p);
      p = nullptr;
    }
    if (out) {
      CloseHandle(out);
      out = nullptr;
    }
    if (err && err != INVALID_HANDLE_VALUE) {
      CloseHandle(err);
      err = nullptr;
    }
  }
  ~Child() { close(); }
};
struct Session {
  J cfg;
  std::filesystem::path dir, compiled;
  std::unique_ptr<Child> stream;
  uint64_t generated = 0;
  std::unique_ptr<StreamingHash> hash;
  J history = J::array();
  void stop() {
    if (!stream)
      return;
    stream->close();
    history.push_back({{"pid", stream->pid},
                       {"exitCode", stream->finalCode},
                       {"forced", stream->forced},
                       {"closed", stream->finalCode != STILL_ACTIVE},
                       {"kind", "engine"}});
    stream.reset();
  }
};
class Broker {
  std::filesystem::path app, data;
  std::function<void(J)> reply;
  std::thread thread;
  std::mutex mx;
  std::condition_variable cv;
  std::deque<J> q;
  std::atomic<bool> stopping{false};
  std::map<int, std::unique_ptr<Session>> sessions;
  int sequence = 0;
  J execute(const J &r) {
    auto a = r.at("args");
    auto name = a.at(0).get<std::string>();
    if (name == "audit") {
      auto dir = data / (L"audit-" + std::to_wstring(GetTickCount64()));
      std::filesystem::create_directories(dir);
      std::ofstream f(dir / L"generation.json");
      f << a.at(1).dump();
      return true;
    }
    if (name == "read-song") {
      auto p = std::filesystem::path(wide(a.at(1)));
      auto b = bytes(p, 200000);
      if (b.empty())
        throw std::runtime_error("Empty file");
      return {{"bytes64", base64(b)}, {"sha256", sha(b)}, {"size", b.size()}};
    }
    if (name == "new-session") {
      int id = ++sequence;
      auto s = std::make_unique<Session>();
      s->cfg = a.at(1);
      s->dir = data / (L"job-" + std::to_wstring(GetTickCount64()) + L"-" +
                       std::to_wstring(id));
      std::filesystem::create_directories(s->dir);
      sessions[id] = std::move(s);
      return id;
    }
    int id = a.at(1);
    auto it = sessions.find(id);
    if (it == sessions.end())
      throw std::runtime_error("Native session not found");
    auto &s = *it->second;
    if (name == "compile") {
      s.stop();
      auto file = std::filesystem::path(wide(a.at(2)));
      auto enc = a.size() > 3 ? a[3].get<std::string>() : "AUTO";
      auto b = bytes(file, 200000);
      auto out = s.dir / L"output.mgs";
      bool mgs = b.size() >= 3 && b[0] == 'M' && b[1] == 'G' && b[2] == 'S';
      std::string stderr64;
      DWORD code = 0;
      if (mgs) {
        std::ofstream f(out, std::ios::binary);
        f.write((char *)b.data(), b.size());
      } else {
        if (!std::filesystem::is_regular_file(app / L"MGSC.COM") ||
          sha(bytes(app / L"MGSC.COM", 1048576)) !=
            "4ac84e8cf4bbbdc545794e01693bba5a175c4e7127e72f1d7be36c865608d146")
          throw std::runtime_error(
              "MGSC.COM v1.11 missing or unsupported beside executable");
        auto snapshot = s.dir / L"source.mus";
        {
          std::ofstream f(snapshot, std::ios::binary);
          f.write((char *)b.data(), b.size());
        }
        Child c;
        c.spawn(app / L"audio-core.exe",
                {L"compile", (app / L"MGSC.COM").wstring(), snapshot.wstring(),
                 out.wstring(), wide(enc)},
                s.dir / L"compile-error.txt");
        auto deadline = GetTickCount64() + 15000;
        while ((code = c.wait(10)) == STILL_ACTIVE) {
          if (stopping || GetTickCount64() > deadline) {
            c.close();
            throw std::runtime_error("Compile cancelled or timed out");
          }
        }
        if (c.in) {
          CloseHandle(c.in);
          c.in = nullptr;
        }
        c.close();
        s.history.push_back({{"pid", c.pid},
                             {"exitCode", c.finalCode},
                             {"forced", c.forced},
                             {"closed", c.finalCode != STILL_ACTIVE},
                             {"kind", "compiler"}});
        stderr64 = base64(bytes(s.dir / L"compile-error.txt", 1048576));
      }
      if (code)
        return {{"success", false}, {"exitCode", code}, {"stderr64", stderr64}};
      auto generated = bytes(out, 0x5e00);
      s.compiled = out;
      return {{"success", true},
              {"exitCode", 0},
              {"stderr64", stderr64},
              {"bytes64", base64(generated)},
              {"bytes", generated.size()},
              {"sha256", sha(generated)},
              {"sourceSHA256", sha(b)},
              {"sourceKind", mgs ? "mgs" : "mml"},
              {"output", utf8(out.wstring())}};
    }
    if (name == "settings") {
      for (auto v : a.at(2).items())
        s.cfg[v.key()] = v.value();
      return s.cfg;
    }
    if (name == "load") {
      s.stop();
      if (!std::filesystem::is_regular_file(app / L"MGSDRV.COM") ||
          sha(bytes(app / L"MGSDRV.COM", 1048576)) !=
          "fd786ccb29b130063512e9da78f723044f651978853f2b8cd7a03d97ae72f3d4")
        throw std::runtime_error(
            "MGSDRV.COM v3.20 missing or unsupported beside executable");
      s.hash = std::make_unique<StreamingHash>();
      if (s.compiled.empty())
        throw std::runtime_error("Compile first");
      s.stream = std::make_unique<Child>();
      s.stream->spawn(app / L"audio-core.exe",
                      {L"stream", (app / L"MGSDRV.COM").wstring(),
                       s.compiled.wstring(), L"48000", L"on", L"mgsdrv320",
                       L"0", std::to_wstring(s.cfg.value("lpf", 0))},
                      s.dir / L"stream-error.txt");
      s.generated = 0;
      return {{"tempoSupported", true}, {"pid", s.stream->pid}};
    }
    if (name == "fade") {
      if (s.stream)
        s.stream->write("FADE " +
                        std::to_string((int)std::round(a.at(2).get<double>())) +
                        "\n");
      return true;
    }
    if(name=="advance"){
      if(!s.stream)throw std::runtime_error("No native stream");
      int n=a.at(2).get<int>();if(n<1||n>480000)throw std::runtime_error("Invalid advance size");
      s.stream->write("ADVANCE "+std::to_string(n)+" "+std::to_string(a.at(3).get<int>())+" "+std::to_string(a.at(4).get<int>())+" "+std::to_string(a.at(5).get<int>())+"\n");
      auto h=s.stream->read(28,stopping);auto u=[&](int off){return uint32_t(h[off])|uint32_t(h[off+1])<<8|uint32_t(h[off+2])<<16|uint32_t(h[off+3])<<24;};
      if(u(0)!=0||u(24)>16000000)throw std::runtime_error("Invalid advance response");
      auto ev=s.stream->read(u(24),stopping);return {{"rawRows",std::string(ev.begin(),ev.end())},{"stop",u(4)},{"loops",u(8)}};
    }
    if (name == "pcm") {
      if (!s.stream)
        throw std::runtime_error("No native stream");
      int n = a.at(2);
      if (n < 1 || n > 32768)
        throw std::runtime_error("Invalid PCM size");
      s.stream->write("READ " + std::to_string(n) + "\n");
      auto h = s.stream->read(28, stopping);
      auto u = [&](int off) {
        return uint32_t(h[off]) | (uint32_t(h[off + 1]) << 8) |
               (uint32_t(h[off + 2]) << 16) | (uint32_t(h[off + 3]) << 24);
      };
      uint32_t frames = u(0), size = u(24);
      if (frames > 32768 || size > 16000000)
        throw std::runtime_error("Invalid native PCM/event header");
      auto pcm = s.stream->read(frames * 2, stopping),
           ev = s.stream->read(size, stopping);
      s.generated += frames;
      if (s.hash)
        s.hash->update(pcm);
      return {{"pcm64", base64(pcm)},
              {"rawRows", std::string(ev.begin(), ev.end())},
              {"frames", frames},
              {"stop", u(4)},
              {"loops", u(8)},
              {"rate", u(12)},
              {"nativeCpuMillis", u(16)},
              {"nativeRssKB", u(20)},
              {"generated", s.generated}};
    }
    if (name == "stop") {
      s.stop();
      return true;
    }
    if (name == "destroy-session") {
      s.stop();
      J remaining = J::array();
      for (auto &row : s.history)
        if (!row.value("closed", false))
          remaining.push_back(row);
      auto digest = s.hash ? s.hash->digest() : "";
      auto hist = s.history;
      sessions.erase(it);
      return {
          {"history", hist}, {"remaining", remaining}, {"pcmSHA256", digest}};
    }
    throw std::runtime_error("Unknown native audio method: " + name);
  }

public:
  Broker(std::filesystem::path a, std::filesystem::path d,
         std::function<void(J)> f)
      : app(a), data(d), reply(f) {
    std::filesystem::create_directories(data);
    thread = std::thread([this] {
      while (true) {
        J r;
        {
          std::unique_lock<std::mutex> g(mx);
          cv.wait(g, [this] { return stopping || !q.empty(); });
          if (stopping)
            break;
          r = std::move(q.front());
          q.pop_front();
        }
        try {
          reply(
              {{"kind", "reply"}, {"id", r.at("id")}, {"result", execute(r)}});
        } catch (const std::exception &e) {
          reply({{"kind", "reply"}, {"id", r.at("id")}, {"error", e.what()}});
        }
      }
      sessions.clear();
    });
  }
  void enqueue(J r) {
    {
      std::lock_guard<std::mutex> g(mx);
      q.push_back(std::move(r));
    }
    cv.notify_one();
  }
  ~Broker() {
    stopping = true;
    cv.notify_all();
    if (thread.joinable())
      thread.join();
  }
};
} // namespace native_audio
