/**
 * addon_main.cc
 * N-API module registration — wires C++ functions to the JS module exports.
 */

#include <napi.h>

// Forward declarations
Napi::Object CaptureScreen(const Napi::CallbackInfo& info);
Napi::Array  ListProcesses(const Napi::CallbackInfo& info);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(
    Napi::String::New(env, "captureScreen"),
    Napi::Function::New(env, CaptureScreen)
  );
  exports.Set(
    Napi::String::New(env, "listProcesses"),
    Napi::Function::New(env, ListProcesses)
  );
  return exports;
}

NODE_API_MODULE(ai_pc_native, Init)
