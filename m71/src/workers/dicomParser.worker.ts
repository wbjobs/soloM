/// <reference lib="webworker" />

import { DicomMetadata } from '@/types/dicom';

let wasmModule: any = null;
let wasmLoadPromise: Promise<any> | null = null;

type WorkerMessage = 
  | { type: 'loadWasm' }
  | { type: 'parseMetadataWasm'; data: ArrayBuffer; transfer?: boolean }
  | { type: 'parseMetadataJs'; data: ArrayBuffer }
  | { type: 'parseImage'; data: ArrayBuffer };

type WorkerResponse =
  | { type: 'wasmLoaded'; success: boolean }
  | { type: 'metadataParsed'; metadata: DicomMetadata; mode: 'wasm' | 'js' }
  | { type: 'imageParsed'; image: any }
  | { type: 'error'; error: string; operation: string };

function tag(group: number, element: number): number {
  return (group << 16) | element;
}

const EXPLICIT_VR_TAGS = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT']);

const TAG_PATIENT_NAME = tag(0x0010, 0x0010);
const TAG_PATIENT_ID = tag(0x0010, 0x0020);
const TAG_STUDY_DATE = tag(0x0008, 0x0020);
const TAG_STUDY_DESCRIPTION = tag(0x0008, 0x1030);
const TAG_SERIES_DESCRIPTION = tag(0x0008, 0x103E);
const TAG_MODALITY = tag(0x0008, 0x0060);
const TAG_SLICE_THICKNESS = tag(0x0018, 0x0050);
const TAG_PIXEL_SPACING = tag(0x0028, 0x0030);
const TAG_ROWS = tag(0x0028, 0x0010);
const TAG_COLUMNS = tag(0x0028, 0x0011);
const TAG_BITS_ALLOCATED = tag(0x0028, 0x0100);
const TAG_BITS_STORED = tag(0x0028, 0x0101);
const TAG_HIGH_BIT = tag(0x0028, 0x0102);
const TAG_PIXEL_REPRESENTATION = tag(0x0028, 0x0103);
const TAG_WINDOW_CENTER = tag(0x0028, 0x1050);
const TAG_WINDOW_WIDTH = tag(0x0028, 0x1051);
const TAG_RESCALE_INTERCEPT = tag(0x0028, 0x1052);
const TAG_RESCALE_SLOPE = tag(0x0028, 0x1053);
const TAG_PHOTOMETRIC = tag(0x0028, 0x0004);
const TAG_PIXEL_DATA = tag(0x7FE0, 0x0010);

function readString(dataView: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset + offset, length);
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x00 || bytes[end - 1] === 0x20)) {
    end--;
  }
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes.subarray(0, end));
}

function parseNumberString(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const num = parseFloat(trimmed);
  return isNaN(num) ? 0 : num;
}

interface ParsedElements {
  [tag: number]: { value: string; offset: number; length: number };
}

function parseElements(arrayBuffer: ArrayBuffer): ParsedElements {
  const dataView = new DataView(arrayBuffer);
  const byteLength = arrayBuffer.byteLength;

  if (byteLength < 132) {
    throw new Error('File too small to be a valid DICOM file');
  }

  const magic = String.fromCharCode(
    dataView.getUint8(128),
    dataView.getUint8(129),
    dataView.getUint8(130),
    dataView.getUint8(131)
  );

  if (magic !== 'DICM') {
    throw new Error('Invalid DICOM file: DICM magic not found at offset 128');
  }

  const elements: ParsedElements = {};
  let offset = 132;
  let transferSyntax = '';

  while (offset < byteLength - 4) {
    const group = dataView.getUint16(offset, true);
    const element = dataView.getUint16(offset + 2, true);
    const currentTag = tag(group, element);

    offset += 4;

    if (offset >= byteLength) break;

    let vr = '';
    let length: number;
    let isExplicit = group > 0x0002;

    if (transferSyntax && group > 0x0002) {
      isExplicit = transferSyntax !== '1.2.840.10008.1.2';
    }

    if (isExplicit) {
      if (offset + 2 > byteLength) break;
      vr = String.fromCharCode(
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1)
      );
      offset += 2;

      if (EXPLICIT_VR_TAGS.has(vr)) {
        if (offset + 6 > byteLength) break;
        offset += 2;
        length = dataView.getUint32(offset, true);
        offset += 4;
      } else {
        if (offset + 2 > byteLength) break;
        length = dataView.getUint16(offset, true);
        offset += 2;
      }
    } else {
      if (offset + 4 > byteLength) break;
      length = dataView.getUint32(offset, true);
      offset += 4;
    }

    if (length === 0xFFFFFFFF) {
      if (vr === 'SQ' || (!isExplicit && currentTag === tag(0xFFFE, 0xE000))) {
        while (offset < byteLength - 8) {
          const itemGroup = dataView.getUint16(offset, true);
          const itemElement = dataView.getUint16(offset + 2, true);
          if (itemGroup === 0xFFFE && itemElement === 0xE0DD) {
            offset += 8;
            break;
          }
          if (itemGroup === 0xFFFE && itemElement === 0xE000) {
            const itemLength = dataView.getUint32(offset + 4, true);
            offset += 8;
            if (itemLength === 0xFFFFFFFF) {
              continue;
            }
            offset += itemLength;
          } else {
            break;
          }
        }
      }
      continue;
    }

    if (length < 0 || offset + length > byteLength) {
      break;
    }

    if (vr === 'SQ') {
      offset += length;
      continue;
    }

    const valueOffset = offset;
    const stringValue = readString(dataView, offset, length);
    elements[currentTag] = { value: stringValue, offset: valueOffset, length };

    if (currentTag === tag(0x0002, 0x0010)) {
      transferSyntax = stringValue;
    }

    offset += length;
  }

  return elements;
}

function parseDicomMetadataJs(arrayBuffer: ArrayBuffer): DicomMetadata {
  const elements = parseElements(arrayBuffer);
  const pixelDataTag = elements[TAG_PIXEL_DATA];

  return {
    patientName: elements[TAG_PATIENT_NAME]?.value ?? '',
    patientId: elements[TAG_PATIENT_ID]?.value ?? '',
    studyDate: elements[TAG_STUDY_DATE]?.value ?? '',
    studyDescription: elements[TAG_STUDY_DESCRIPTION]?.value ?? '',
    seriesDescription: elements[TAG_SERIES_DESCRIPTION]?.value ?? '',
    modality: elements[TAG_MODALITY]?.value ?? '',
    sliceThickness: elements[TAG_SLICE_THICKNESS]?.value ?? '',
    pixelSpacing: elements[TAG_PIXEL_SPACING]?.value ?? '',
    rows: parseNumberString(elements[TAG_ROWS]?.value ?? '0'),
    columns: parseNumberString(elements[TAG_COLUMNS]?.value ?? '0'),
    bitsAllocated: parseNumberString(elements[TAG_BITS_ALLOCATED]?.value ?? '16'),
    bitsStored: parseNumberString(elements[TAG_BITS_STORED]?.value ?? '12'),
    highBit: parseNumberString(elements[TAG_HIGH_BIT]?.value ?? '11'),
    pixelRepresentation: parseNumberString(elements[TAG_PIXEL_REPRESENTATION]?.value ?? '0'),
    windowCenter: parseNumberString(elements[TAG_WINDOW_CENTER]?.value ?? '0'),
    windowWidth: parseNumberString(elements[TAG_WINDOW_WIDTH]?.value ?? '0'),
    rescaleIntercept: parseNumberString(elements[TAG_RESCALE_INTERCEPT]?.value ?? '0'),
    rescaleSlope: parseNumberString(elements[TAG_RESCALE_SLOPE]?.value ?? '1'),
    photometricInterpretation: elements[TAG_PHOTOMETRIC]?.value ?? 'MONOCHROME2',
    pixelDataOffset: pixelDataTag?.offset ?? 0,
    pixelDataLength: pixelDataTag?.length ?? 0,
  };
}

function parseDicomMetadataWasm(data: ArrayBuffer, module: any): DicomMetadata | null {
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

    return JSON.parse(resultString) as DicomMetadata;
  } catch {
    return null;
  }
}

async function loadWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (wasmLoadPromise) {
    return !!(await wasmLoadPromise);
  }
  
  try {
    wasmLoadPromise = import('@/wasm/dicom_parser.js');
    const module = await wasmLoadPromise;
    const factory = module.default || module;
    if (typeof factory === 'function') {
      wasmModule = await factory();
    } else {
      wasmModule = factory;
    }
    return !!wasmModule;
  } catch {
    wasmModule = null;
    return false;
  }
}

const ctx: Worker = self as any;

ctx.addEventListener('message', async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  
  try {
    switch (msg.type) {
      case 'loadWasm': {
        const success = await loadWasm();
        ctx.postMessage({ type: 'wasmLoaded', success } as WorkerResponse);
        break;
      }
      
      case 'parseMetadataWasm': {
        if (!wasmModule) {
          const success = await loadWasm();
          if (!success) {
            ctx.postMessage({ 
              type: 'error', 
              error: 'WASM module not available', 
              operation: 'parseMetadataWasm' 
            } as WorkerResponse);
            return;
          }
        }
        
        const metadata = parseDicomMetadataWasm(msg.data, wasmModule);
        if (metadata) {
          ctx.postMessage({ 
            type: 'metadataParsed', 
            metadata, 
            mode: 'wasm' 
          } as WorkerResponse, msg.transfer ? [msg.data] : []);
        } else {
          ctx.postMessage({ 
            type: 'error', 
            error: 'WASM parsing failed', 
            operation: 'parseMetadataWasm' 
          } as WorkerResponse);
        }
        break;
      }
      
      case 'parseMetadataJs': {
        const metadata = parseDicomMetadataJs(msg.data);
        ctx.postMessage({ 
          type: 'metadataParsed', 
          metadata, 
          mode: 'js' 
        } as WorkerResponse, [msg.data]);
        break;
      }
      
      case 'parseImage': {
        const elements = parseElements(msg.data);
        const dataView = new DataView(msg.data);

        const rows = parseNumberString(elements[TAG_ROWS]?.value ?? '0');
        const columns = parseNumberString(elements[TAG_COLUMNS]?.value ?? '0');
        const bitsAllocated = parseNumberString(elements[TAG_BITS_ALLOCATED]?.value ?? '16');
        const bitsStored = parseNumberString(elements[TAG_BITS_STORED]?.value ?? '12');
        const highBit = parseNumberString(elements[TAG_HIGH_BIT]?.value ?? '11');
        const pixelRepresentation = parseNumberString(elements[TAG_PIXEL_REPRESENTATION]?.value ?? '0');
        const windowCenter = parseNumberString(elements[TAG_WINDOW_CENTER]?.value ?? '0');
        const windowWidth = parseNumberString(elements[TAG_WINDOW_WIDTH]?.value ?? '0');
        const rescaleIntercept = parseNumberString(elements[TAG_RESCALE_INTERCEPT]?.value ?? '0');
        const rescaleSlope = parseNumberString(elements[TAG_RESCALE_SLOPE]?.value ?? '1');
        const photometricInterpretation = elements[TAG_PHOTOMETRIC]?.value ?? 'MONOCHROME2';

        const pixelDataTag = elements[TAG_PIXEL_DATA];
        let pixelData: Int16Array | Uint16Array | Uint8Array;
        let pixelBuffer: ArrayBuffer;

        if (!pixelDataTag || pixelDataTag.length === 0) {
          pixelData = new Uint8Array(0);
          pixelBuffer = new ArrayBuffer(0);
        } else {
          const pixelOffset = pixelDataTag.offset;
          const pixelLength = pixelDataTag.length;

          pixelBuffer = msg.data.slice(pixelOffset, pixelOffset + pixelLength);
          
          if (bitsAllocated === 8) {
            pixelData = new Uint8Array(pixelBuffer);
          } else if (bitsAllocated === 16) {
            if (pixelRepresentation === 1) {
              pixelData = new Int16Array(pixelBuffer);
            } else {
              pixelData = new Uint16Array(pixelBuffer);
            }
          } else if (bitsAllocated === 32) {
            pixelData = new Uint16Array(pixelBuffer);
          } else {
            pixelData = new Uint8Array(pixelBuffer);
          }
        }

        let minPixelValue = 0;
        let maxPixelValue = 0;

        if (pixelData.length > 0) {
          minPixelValue = pixelData[0];
          maxPixelValue = pixelData[0];
          for (let i = 1; i < pixelData.length; i++) {
            const val = pixelData[i];
            if (val < minPixelValue) minPixelValue = val;
            if (val > maxPixelValue) maxPixelValue = val;
          }
        }

        ctx.postMessage({
          type: 'imageParsed',
          image: {
            pixelData,
            rows,
            columns,
            windowCenter,
            windowWidth,
            rescaleIntercept,
            rescaleSlope,
            bitsAllocated,
            bitsStored,
            highBit,
            pixelRepresentation,
            photometricInterpretation,
            minPixelValue,
            maxPixelValue,
          }
        } as WorkerResponse, [pixelBuffer]);
        break;
      }
    }
  } catch (err) {
    ctx.postMessage({ 
      type: 'error', 
      error: err instanceof Error ? err.message : 'Unknown error', 
      operation: msg.type 
    } as WorkerResponse);
  }
});

export {};
