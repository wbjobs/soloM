import { DicomMetadata, DicomImage } from '@/types/dicom';

const EXPLICIT_VR_TAGS = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT']);

const TAG_PATIENT_NAME = 0x00100010;
const TAG_PATIENT_ID = 0x00100020;
const TAG_STUDY_DATE = 0x00080020;
const TAG_STUDY_DESCRIPTION = 0x00081030;
const TAG_SERIES_DESCRIPTION = 0x0008103E;
const TAG_MODALITY = 0x00080060;
const TAG_SLICE_THICKNESS = 0x00180050;
const TAG_PIXEL_SPACING = 0x00280030;
const TAG_ROWS = 0x00280010;
const TAG_COLUMNS = 0x00280011;
const TAG_BITS_ALLOCATED = 0x00280100;
const TAG_BITS_STORED = 0x00280101;
const TAG_HIGH_BIT = 0x00280102;
const TAG_PIXEL_REPRESENTATION = 0x00280103;
const TAG_WINDOW_CENTER = 0x00281050;
const TAG_WINDOW_WIDTH = 0x00281051;
const TAG_RESCALE_INTERCEPT = 0x00281052;
const TAG_RESCALE_SLOPE = 0x00281053;
const TAG_PHOTOMETRIC = 0x00280004;
const TAG_PIXEL_DATA = 0x7FE00010;

function makeTag(group: number, element: number): number {
  return (group << 16) | element;
}

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

  while (offset < byteLength - 4) {
    const group = dataView.getUint16(offset, true);
    const element = dataView.getUint16(offset + 2, true);
    const tag = makeTag(group, element);

    offset += 4;

    if (offset >= byteLength) break;

    let vr = '';
    let length: number;
    let isExplicit = group > 0x0002;

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
      if (vr === 'SQ' || (!isExplicit && tag === makeTag(0xFFFE, 0xE000))) {
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
    elements[tag] = { value: stringValue, offset: valueOffset, length };

    offset += length;
  }

  return elements;
}

export function parseDicomMetadata(arrayBuffer: ArrayBuffer): DicomMetadata {
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

export function parseDicomImage(arrayBuffer: ArrayBuffer): DicomImage {
  const elements = parseElements(arrayBuffer);
  const dataView = new DataView(arrayBuffer);

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

  if (!pixelDataTag || pixelDataTag.length === 0) {
    pixelData = new Uint8Array(0);
  } else {
    const pixelOffset = pixelDataTag.offset;
    const pixelLength = pixelDataTag.length;

    if (bitsAllocated === 8) {
      pixelData = new Uint8Array(arrayBuffer, pixelOffset, pixelLength);
    } else if (bitsAllocated === 16) {
      if (pixelRepresentation === 1) {
        pixelData = new Int16Array(arrayBuffer, pixelOffset, pixelLength / 2);
      } else {
        pixelData = new Uint16Array(arrayBuffer, pixelOffset, pixelLength / 2);
      }
    } else if (bitsAllocated === 32) {
      pixelData = new Uint16Array(arrayBuffer, pixelOffset, pixelLength / 2);
    } else {
      pixelData = new Uint8Array(arrayBuffer, pixelOffset, pixelLength);
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

  return {
    pixelData,
    rows,
    columns,
    windowCenter,
    windowWidth,
    rescaleIntercept,
    rescaleSlope,
    bitsAllocated,
    bitsStored,
    pixelRepresentation,
    photometricInterpretation,
    minPixelValue,
    maxPixelValue,
  };
}
