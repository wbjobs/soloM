import subprocess
import shutil
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WASM_DIR = os.path.join(ROOT, 'slide-wasm')
FRONTEND_PUBLIC_WASM = os.path.join(ROOT, 'slide-frontend', 'public', 'wasm')

def build_wasm():
    print('[1/2] Compiling Rust to WebAssembly...')
    result = subprocess.run(
        ['wasm-pack', 'build', '--target', 'web', '--out-dir', 'pkg'],
        cwd=WASM_DIR,
        capture_output=True,
        text=True,
        shell=True,
    )
    if result.returncode != 0:
        print('ERROR: wasm-pack build failed')
        print(result.stderr)
        sys.exit(1)
    print('  WebAssembly compiled successfully.')

def copy_wasm_files():
    print('[2/2] Copying Wasm files to frontend public directory...')
    os.makedirs(FRONTEND_PUBLIC_WASM, exist_ok=True)
    pkg_dir = os.path.join(WASM_DIR, 'pkg')
    for filename in ['slide_wasm.js', 'slide_wasm_bg.wasm']:
        src = os.path.join(pkg_dir, filename)
        dst = os.path.join(FRONTEND_PUBLIC_WASM, filename)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f'  Copied: {filename}')
        else:
            print(f'  WARNING: {filename} not found in pkg directory')
    print('Done!')

if __name__ == '__main__':
    build_wasm()
    copy_wasm_files()
