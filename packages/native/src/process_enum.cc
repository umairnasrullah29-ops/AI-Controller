/**
 * process_enum.cc
 * Native Windows PSAPI + TlHelp32 process enumeration.
 * Target latency: < 10ms for full process list.
 *
 * Exposes: listProcesses(filter?: string) -> Array<{ pid, name, sessionId, memKb, threads }>
 */

#ifdef _WIN32

#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <string>
#include <vector>
#include <algorithm>
#include <chrono>
#include <napi.h>

#pragma comment(lib, "psapi.lib")

struct ProcessInfo {
  DWORD  pid;
  std::string name;
  DWORD  sessionId;
  SIZE_T memKb;       // working-set KB
  DWORD  threads;
};

// Snapshot-based enumeration via TlHelp32 (fast, no elevated rights required)
static std::vector<ProcessInfo> EnumerateProcesses() {
  std::vector<ProcessInfo> list;

  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return list;

  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);

  if (!Process32FirstW(snap, &entry)) {
    CloseHandle(snap);
    return list;
  }

  do {
    ProcessInfo pi{};
    pi.pid     = entry.th32ProcessID;
    pi.threads = entry.cntThreads;

    // Convert wide name
    std::wstring wname = entry.szExeFile;
    std::string  name(wname.begin(), wname.end());
    pi.name = name;

    // Working set memory
    HANDLE hProc = OpenProcess(
      PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
      FALSE,
      pi.pid
    );
    if (hProc) {
      PROCESS_MEMORY_COUNTERS pmc{};
      pmc.cb = sizeof(pmc);
      if (GetProcessMemoryInfo(hProc, &pmc, sizeof(pmc))) {
        pi.memKb = pmc.WorkingSetSize / 1024;
      }
      // Session ID
      ProcessIdToSessionId(pi.pid, &pi.sessionId);
      CloseHandle(hProc);
    }

    list.push_back(pi);
  } while (Process32NextW(snap, &entry));

  CloseHandle(snap);
  return list;
}

// Exported: listProcesses(filter?: string)
Napi::Array ListProcesses(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  auto t0 = std::chrono::high_resolution_clock::now();

  std::string filter;
  if (info.Length() >= 1 && info[0].IsString()) {
    filter = info[0].As<Napi::String>().Utf8Value();
    // lowercase filter for case-insensitive match
    std::transform(filter.begin(), filter.end(), filter.begin(), ::tolower);
  }

  auto processes = EnumerateProcesses();

  Napi::Array arr = Napi::Array::New(env);
  uint32_t idx = 0;

  for (const auto& p : processes) {
    if (!filter.empty()) {
      std::string lname = p.name;
      std::transform(lname.begin(), lname.end(), lname.begin(), ::tolower);
      if (lname.find(filter) == std::string::npos) continue;
    }

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("pid",       Napi::Number::New(env, p.pid));
    obj.Set("name",      Napi::String::New(env, p.name));
    obj.Set("sessionId", Napi::Number::New(env, p.sessionId));
    obj.Set("memKb",     Napi::Number::New(env, static_cast<double>(p.memKb)));
    obj.Set("threads",   Napi::Number::New(env, p.threads));
    arr.Set(idx++, obj);
  }

  auto t1 = std::chrono::high_resolution_clock::now();
  int durationMs = static_cast<int>(
    std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count()
  );

  // Attach metadata as non-enumerable metadata on the array
  Napi::Object meta = Napi::Object::New(env);
  meta.Set("total",      Napi::Number::New(env, idx));
  meta.Set("durationMs", Napi::Number::New(env, durationMs));
  arr.Set("_meta", meta);

  return arr;
}

#else  // Non-Windows stub

#include <napi.h>

Napi::Array ListProcesses(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Error::New(env, "Native process enumeration only available on Windows in this build")
    .ThrowAsJavaScriptException();
  return Napi::Array::New(env);
}

#endif  // _WIN32
