#pragma once
// Read-only recognition of the verified user-supplied renderer; never execute it.
namespace v052 {
inline nlohmann::json rendererStatus(const std::filesystem::path &app) {
  nlohmann::json result={{"name","VGM2WAV.EXE"},{"present",false},{"valid",false},{"message","VGM2WAVを実行ファイルと同じフォルダへ配置してください。"}};
  try {
    const auto file=app/L"vgm2wav.exe";
    if(!std::filesystem::is_regular_file(file))return result;
    result["present"]=true;
    // Bound the read; a file with the expected name alone is not recognition.
    const auto size=std::filesystem::file_size(file);
    if(!size || size>16*1024*1024){result["message"]="未確認（使用対象のEXEではありません）";return result;}
    const auto hash=native_audio::sha(native_audio::bytes(file,16*1024*1024));
    const bool valid=hash=="5ebaed68bb74fbd0da4a371b107ab7f7f54fe953bbae3ef58013eef7d9bd61b8";
    result["valid"]=valid;
    result["message"]=valid?"認識済み":"未確認（使用対象のEXEではありません）";
  } catch (...) {result["valid"]=false;result["message"]="確認できません";}
  return result;
}
}
