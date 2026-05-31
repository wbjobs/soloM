import shutil
import os

src = r'E:\soloM\m93\slide-wasm\pkg'
dst = r'E:\soloM\m93\slide-frontend\public\wasm'

os.makedirs(dst, exist_ok=True)
shutil.copy2(os.path.join(src, 'slide_wasm.js'), dst)
shutil.copy2(os.path.join(src, 'slide_wasm_bg.wasm'), dst)
print('Wasm files copied to public/wasm/')
