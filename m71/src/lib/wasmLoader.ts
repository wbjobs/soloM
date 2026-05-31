import { DicomMetadata } from '@/types/dicom';

export async function loadWasmModule(): Promise<any> {
  try {
    const module = await import('@/wasm/dicom_parser.js');
    const factory = module.default || module;
    if (typeof factory === 'function') {
      return await factory();
    }
    return factory;
  } catch {
    return null;
  }
}

export function parseDicomMetadataWasm(data: ArrayBuffer, module: any): DicomMetadata | null {
  try {
    const bytes = new Uint8Array(data);
    const length = bytes.length;

    const ptr = module._malloc(length);
    if (!ptr) return null;

    module.HEAPU8.set(bytes, ptr);

    const resultPtr = module.ccall(
      'parse_dicom_metadata',
      'number',
      ['number', 'number'],
      [ptr, length]
    );

    module._free(ptr);

    if (!resultPtr) return null;

    const resultString = module.UTF8ToString(resultPtr);

    if (!resultString) return null;

    const parsed = JSON.parse(resultString);

    return parsed as DicomMetadata;
  } catch {
    return null;
  }
}
