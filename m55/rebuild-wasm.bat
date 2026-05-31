@echo off
echo 正在重新编译 WASM 模块...
cd wasm
wasm-pack build --target web --release
echo.
echo 重新安装前端 WASM 依赖...
cd ..\frontend
npm install lsb-stegano-wasm@file:../wasm/pkg
echo.
echo ========================================
echo  WASM 模块更新完成！
echo  请重启前端开发服务器以生效
echo ========================================
pause
