#pragma once
// Shared low-level step only. Settings backup/rollback and final rename stay at
// callers.
inline void writeFlushedJsonTemp(const fs::path &temp, const std::string &text,
                                 const char *openError,
                                 const char *writeError) {
  HANDLE f = CreateFileW(temp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                         FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE)
    throw std::runtime_error(openError);
  DWORD n = 0;
  bool ok =
      WriteFile(f, text.data(), static_cast<DWORD>(text.size()), &n, nullptr) &&
      n == text.size() && FlushFileBuffers(f);
  CloseHandle(f);
  if (!ok)
    throw std::runtime_error(writeError);
}
