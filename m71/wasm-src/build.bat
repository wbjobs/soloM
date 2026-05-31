@echo off
echo Building DICOM WASM module with Emscripten...
echo.
echo Make sure emcc is in your PATH. Install from: https://emscripten.org/
echo.

emcc dicom_parser.c emscripten_glue.c ^
  -s EXPORTED_FUNCTIONS="['_parse_dicom_metadata','_free_parsed_result']" ^
  -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString']" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s MODULARIZE=1 ^
  -s EXPORT_ES6=1 ^
  -s ENVIRONMENT="web" ^
  -O2 ^
  -o ..\src\wasm\dicom_parser.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Build successful! Output: src\wasm\dicom_parser.js and dicom_parser.wasm
) else (
    echo.
    echo Build failed! Make sure Emscripten is installed and emcc is in PATH.
)
pause
