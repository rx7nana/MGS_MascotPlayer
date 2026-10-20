#pragma once
std::vector<std::wstring>
chooseFiles(bool multi, bool save = false,
            const wchar_t *filter = L"すべてのファイル",
            const wchar_t *pattern = L"*.*") {
  IFileDialog *d = nullptr;
  auto hr = CoCreateInstance(save ? CLSID_FileSaveDialog : CLSID_FileOpenDialog,
                             nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&d));
  if (FAILED(hr))
    throw std::runtime_error("Windows file dialog unavailable");
  DWORD flags = 0;
  d->GetOptions(&flags);
  d->SetOptions(flags | FOS_FORCEFILESYSTEM |
                (multi ? FOS_ALLOWMULTISELECT : 0));
  COMDLG_FILTERSPEC filters[] = {{filter, pattern},
                                 {L"すべてのファイル", L"*.*"}};
  d->SetFileTypes(2, filters);
  std::vector<std::wstring> paths;
  hr = d->Show(settingsHwnd ? settingsHwnd : hwnd);
  if (SUCCEEDED(hr)) {
    if (multi && !save) {
      IFileOpenDialog *o = nullptr;
      d->QueryInterface(IID_PPV_ARGS(&o));
      IShellItemArray *a = nullptr;
      if (o && SUCCEEDED(o->GetResults(&a))) {
        DWORD n;
        a->GetCount(&n);
        for (DWORD i = 0; i < n; i++) {
          IShellItem *item = nullptr;
          a->GetItemAt(i, &item);
          PWSTR p = nullptr;
          if (item && SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &p))) {
            paths.emplace_back(p);
            CoTaskMemFree(p);
          }
          if (item)
            item->Release();
        }
        a->Release();
      }
      if (o)
        o->Release();
    } else {
      IShellItem *item = nullptr;
      d->GetResult(&item);
      PWSTR p = nullptr;
      if (item && SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &p))) {
        paths.emplace_back(p);
        CoTaskMemFree(p);
      }
      if (item)
        item->Release();
    }
  }
  d->Release();
  return paths;
}
json externals() {
  json out = json::array();
  for (
      auto item : std::vector<std::vector<std::string>>{
          {"compiler", "MGSC.COM", "1.11",
           "4ac84e8cf4bbbdc545794e01693bba5a175c4e7127e72f1d7be36c865608d146"},
          {"driver", "MGSDRV.COM", "3.20",
           "fd786ccb29b130063512e9da78f723044f651978853f2b8cd7a03d97ae72f3d4"}}) {
    bool present = fs::is_regular_file(root / wide(item[1])), valid = false;
    std::string hash;
    try {
      if (present) {
        hash = native_audio::sha(
            native_audio::bytes(root / wide(item[1]), 1048576));
        valid = hash == item[3];
      }
    } catch (...) {
    }
    out.push_back(
        {{"key", item[0]},
         {"name", item[1]},
         {"version", item[2]},
         {"present", present},
         {"valid", valid},
         {"sha256", hash},
         {"message", item[1] + " v" + item[2] +
                         " を実行ファイルと同じフォルダへ配置してください：" +
                         utf8(root.wstring())}});
  }
  return out;
}
void atomicFile(const fs::path &p, const json &v) {
  auto temp = p;
  temp += L".tmp";
  auto text = v.dump(2);
  writeFlushedJsonTemp(temp, text, "Cannot create save file",
                       "Atomic save failed");
  if (!MoveFileExW(temp.c_str(), p.c_str(),
                   MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
    throw std::runtime_error("Atomic save failed");
}
bool validList(const json &l) {
  if (!l.is_object() || !l.contains("name") || !l["name"].is_string() ||
      wide(l["name"].get<std::string>()).size() > 500 || !l.contains("songs") ||
      !l["songs"].is_array() || l["songs"].size() > 10000)
    return false;
  for (auto &p : l["songs"])
    if (!p.is_string() || wide(p.get<std::string>()).size() >= 32768)
      return false;
  return true;
}
json inspectMotion(const fs::path &p) {
  auto b = native_audio::bytes(p, 128 * 1024 * 1024);
  if (b.size() < 54)
    throw std::runtime_error("VMDサイズが不正です");
  std::string header((char *)b.data(), 30);
  header = header.substr(0, header.find('\0'));
  if (header != "Vocaloid Motion Data 0002" &&
      header != "Vocaloid Motion Data file")
    throw std::runtime_error("VMDヘッダーが不正です");
  size_t at = header == "Vocaloid Motion Data 0002" ? 50 : 40;
  uint32_t max = 0;
  json sections = json::object();
  auto u = [&](size_t off) {
    if (off + 4 > b.size())
      throw std::runtime_error("VMDが途中で切れています");
    return uint32_t(b[off]) | (uint32_t(b[off + 1]) << 8) |
           (uint32_t(b[off + 2]) << 16) | (uint32_t(b[off + 3]) << 24);
  };
  auto count = [&]() {
    auto n = u(at);
    at += 4;
    return n;
  };
  auto fixed = [&](const char *name, size_t size, size_t offset,
                   bool required) {
    if (at == b.size() && !required)
      return;
    auto n = count();
    if (n > (b.size() - at) / size)
      throw std::runtime_error("VMDセクションが不足しています");
    sections[name] = n;
    for (uint32_t i = 0; i < n; i++) {
      max = std::max(max, u(at + offset));
      at += size;
    }
  };
  fixed("bone", 111, 15, true);
  fixed("morph", 23, 15, true);
  fixed("camera", 61, 0, false);
  fixed("light", 28, 0, false);
  fixed("shadow", 9, 0, false);
  if (at < b.size()) {
    auto n = count();
    if (n > (b.size() - at) / 9)
      throw std::runtime_error("VMD IK不足");
    sections["ik"] = n;
    for (uint32_t i = 0; i < n; i++) {
      max = std::max(max, count());
      if (at >= b.size())
        throw std::runtime_error("VMD IK表示不足");
      at++;
      auto c = count();
      if (c > (b.size() - at) / 21)
        throw std::runtime_error("VMD IKボーン不足");
      at += c * 21;
    }
  }
  if (at != b.size() || max > 30 * 60 * 60 * 24)
    throw std::runtime_error("VMD末尾/フレーム範囲が不正です");
  auto hash = native_audio::sha(b);
  json known = nullptr;
  if (cfg["profiles"].contains(hash))
    known = cfg["profiles"][hash];
  return {{"path", utf8(p.wstring())},
          {"hash", hash},
          {"meta",
           {{"header", header},
            {"endFrame", max},
            {"duration", max / 30.0},
            {"sections", sections},
            {"bytes", b.size()}}},
          {"needsBpm", known.is_null()},
          {"knownBpm", known},
          {"suggested", p.filename() == L"nac_kawagome.vmd" ? 160 : 120}};
}
