/**
 * screen_capture.cc
 * Native Windows GDI screen capture via BitBlt.
 * Target latency: < 10ms for primary display capture.
 *
 * Exposes: captureScreen(outputPath: string) -> { widthPx, heightPx, sizeBytes, durationMs }
 */

#ifdef _WIN32

#include <windows.h>
#include <gdiplus.h>
#include <fstream>
#include <string>
#include <vector>
#include <chrono>
#include <napi.h>

#pragma comment(lib, "gdiplus.lib")

// Initialize GDI+ once
static ULONG_PTR s_gdiplusToken = 0;

void InitGdiPlus() {
  if (s_gdiplusToken == 0) {
    Gdiplus::GdiplusStartupInput si;
    Gdiplus::GdiplusStartup(&s_gdiplusToken, &si, nullptr);
  }
}

// Get CLSID for PNG encoder
int GetEncoderClsid(const WCHAR* format, CLSID* pClsid) {
  UINT numEncoders = 0, size = 0;
  Gdiplus::GetImageEncodersSize(&numEncoders, &size);
  if (!size) return -1;

  std::vector<BYTE> buf(size);
  auto* info = reinterpret_cast<Gdiplus::ImageCodecInfo*>(buf.data());
  Gdiplus::GetImageEncoders(numEncoders, size, info);
  for (UINT i = 0; i < numEncoders; ++i) {
    if (wcscmp(info[i].MimeType, format) == 0) {
      *pClsid = info[i].Clsid;
      return static_cast<int>(i);
    }
  }
  return -1;
}

// Exported: captureScreen(outputPath: string)
Napi::Object CaptureScreen(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);

  auto t0 = std::chrono::high_resolution_clock::now();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected string outputPath").ThrowAsJavaScriptException();
    return result;
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();
  std::wstring wpath(path.begin(), path.end());

  InitGdiPlus();

  // Get primary screen dimensions
  int screenW = GetSystemMetrics(SM_CXSCREEN);
  int screenH = GetSystemMetrics(SM_CYSCREEN);

  HDC screenDC = GetDC(nullptr);
  HDC memDC    = CreateCompatibleDC(screenDC);
  HBITMAP hBmp = CreateCompatibleBitmap(screenDC, screenW, screenH);
  SelectObject(memDC, hBmp);

  // BitBlt — the fastest path for full-screen capture
  BOOL ok = BitBlt(memDC, 0, 0, screenW, screenH, screenDC, 0, 0, SRCCOPY | CAPTUREBLT);

  if (!ok) {
    DeleteObject(hBmp);
    DeleteDC(memDC);
    ReleaseDC(nullptr, screenDC);
    Napi::Error::New(env, "BitBlt failed").ThrowAsJavaScriptException();
    return result;
  }

  // Wrap in GDI+ bitmap and save as PNG
  Gdiplus::Bitmap bitmap(hBmp, nullptr);
  CLSID pngClsid;
  GetEncoderClsid(L"image/png", &pngClsid);
  Gdiplus::Status status = bitmap.Save(wpath.c_str(), &pngClsid, nullptr);

  DeleteObject(hBmp);
  DeleteDC(memDC);
  ReleaseDC(nullptr, screenDC);

  auto t1 = std::chrono::high_resolution_clock::now();
  int durationMs = static_cast<int>(
    std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count()
  );

  if (status != Gdiplus::Ok) {
    Napi::Error::New(env, "GDI+ Save failed: status " + std::to_string(status))
      .ThrowAsJavaScriptException();
    return result;
  }

  // Get file size
  std::ifstream f(path, std::ios::binary | std::ios::ate);
  long long fileSize = f.is_open() ? static_cast<long long>(f.tellg()) : -1;

  result.Set("widthPx",    Napi::Number::New(env, screenW));
  result.Set("heightPx",   Napi::Number::New(env, screenH));
  result.Set("sizeBytes",  Napi::Number::New(env, static_cast<double>(fileSize)));
  result.Set("durationMs", Napi::Number::New(env, durationMs));
  return result;
}

#else  // Non-Windows stub

#include <napi.h>

Napi::Object CaptureScreen(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Error::New(env, "Native screen capture only available on Windows in this build")
    .ThrowAsJavaScriptException();
  return Napi::Object::New(env);
}

#endif  // _WIN32
