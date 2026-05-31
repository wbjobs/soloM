let wasmReady = false;
let parseSlidesFn = null;
let getVersionFn = null;
let parseScssFn = null;
let mergeThemeFn = null;
let getDefaultScssFn = null;

export async function initWasm() {
  if (wasmReady) return;
  try {
    const wasmResponse = await fetch('/wasm/slide_wasm_bg.wasm');
    const wasmBytes = await wasmResponse.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);

    const jsModule = await import('../../slide-wasm/pkg/slide_wasm.js');
    jsModule.initSync(wasmModule);

    parseSlidesFn = jsModule.parse_slides;
    getVersionFn = jsModule.get_version;
    parseScssFn = jsModule.parse_scss_variables;
    mergeThemeFn = jsModule.merge_slides_with_theme;
    getDefaultScssFn = jsModule.get_default_scss;
    wasmReady = true;
  } catch (err) {
    console.error('Failed to load Wasm module:', err);
    throw err;
  }
}

export function parseSlides(markdown) {
  if (!wasmReady || !parseSlidesFn) {
    throw new Error('Wasm module not initialized');
  }
  const result = parseSlidesFn(markdown);
  return JSON.parse(result);
}

export function parseScssVariables(scssText) {
  if (!wasmReady || !parseScssFn) {
    throw new Error('Wasm module not initialized');
  }
  const result = parseScssFn(scssText);
  return JSON.parse(result);
}

export function mergeSlidesWithTheme(slidesJson, themeJson) {
  if (!wasmReady || !mergeThemeFn) {
    throw new Error('Wasm module not initialized');
  }
  const result = mergeThemeFn(
    typeof slidesJson === 'string' ? slidesJson : JSON.stringify(slidesJson),
    typeof themeJson === 'string' ? themeJson : JSON.stringify(themeJson)
  );
  return JSON.parse(result);
}

export function getDefaultScss() {
  if (!wasmReady || !getDefaultScssFn) {
    throw new Error('Wasm module not initialized');
  }
  return getDefaultScssFn();
}

export function getWasmVersion() {
  if (!wasmReady || !getVersionFn) {
    return 'N/A';
  }
  return getVersionFn();
}

export function isWasmReady() {
  return wasmReady;
}
