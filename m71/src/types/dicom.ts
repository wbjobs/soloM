export interface DicomMetadata {
  patientName: string;
  patientId: string;
  studyDate: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  sliceThickness: string;
  pixelSpacing: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  windowCenter: number;
  windowWidth: number;
  rescaleIntercept: number;
  rescaleSlope: number;
  photometricInterpretation: string;
  pixelDataOffset: number;
  pixelDataLength: number;
}

export interface DicomFileInfo {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

export interface DicomImage {
  pixelData: Int16Array | Uint16Array | Uint8Array;
  rows: number;
  columns: number;
  windowCenter: number;
  windowWidth: number;
  rescaleIntercept: number;
  rescaleSlope: number;
  bitsAllocated: number;
  bitsStored: number;
  pixelRepresentation: number;
  photometricInterpretation: string;
  minPixelValue: number;
  maxPixelValue: number;
}

export interface WindowPreset {
  name: string;
  nameCn: string;
  center: number;
  width: number;
}

export interface ImageAdjustmentParams {
  fileId: string;
  brightness: number;
  contrast: number;
  windowCenter: number;
  windowWidth: number;
  zoom: number;
  panX: number;
  panY: number;
  updatedAt?: string;
}
