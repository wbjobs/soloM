import { create } from 'zustand';
import { DicomFileInfo, DicomMetadata, DicomImage } from '@/types/dicom';

interface AppState {
  files: DicomFileInfo[];
  selectedFileId: string | null;
  selectedFile: DicomFileInfo | null;
  metadata: DicomMetadata | null;
  image: DicomImage | null;
  windowCenter: number;
  windowWidth: number;
  brightness: number;
  contrast: number;
  gpuAcceleration: boolean;
  loading: boolean;
  error: string | null;
  wasmAvailable: boolean;
  useWasm: boolean;
  setFiles: (files: DicomFileInfo[]) => void;
  setSelectedFile: (file: DicomFileInfo | null) => void;
  setMetadata: (metadata: DicomMetadata | null) => void;
  setImage: (image: DicomImage | null) => void;
  setWindow: (center: number, width: number) => void;
  setBrightness: (brightness: number) => void;
  setContrast: (contrast: number) => void;
  setAdjustments: (brightness: number, contrast: number, center: number, width: number) => void;
  setGpuAcceleration: (enabled: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWasmAvailable: (available: boolean) => void;
  setUseWasm: (use: boolean) => void;
  addFile: (file: DicomFileInfo) => void;
  removeFile: (id: string) => void;
  resetViewer: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  files: [],
  selectedFileId: null,
  selectedFile: null,
  metadata: null,
  image: null,
  windowCenter: 0,
  windowWidth: 0,
  brightness: 0,
  contrast: 1,
  gpuAcceleration: true,
  loading: false,
  error: null,
  wasmAvailable: false,
  useWasm: true,
  setFiles: (files) => set({ files }),
  setSelectedFile: (file) => set({ selectedFile: file, selectedFileId: file?.id || null }),
  setMetadata: (metadata) => set({ metadata }),
  setImage: (image) =>
    set({
      image,
      windowCenter: image?.windowCenter || 0,
      windowWidth: image?.windowWidth || 0,
    }),
  setWindow: (center, width) => set({ windowCenter: center, windowWidth: width }),
  setBrightness: (brightness) => set({ brightness }),
  setContrast: (contrast) => set({ contrast }),
  setAdjustments: (brightness, contrast, center, width) =>
    set({
      brightness,
      contrast,
      windowCenter: center,
      windowWidth: width,
    }),
  setGpuAcceleration: (enabled) => set({ gpuAcceleration: enabled }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setWasmAvailable: (available) => set({ wasmAvailable: available }),
  setUseWasm: (use) => set({ useWasm: use }),
  addFile: (file) => set((state) => ({ files: [file, ...state.files] })),
  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      selectedFile: state.selectedFile?.id === id ? null : state.selectedFile,
      selectedFileId: state.selectedFileId === id ? null : state.selectedFileId,
    })),
  resetViewer: () =>
    set({
      metadata: null,
      image: null,
      windowCenter: 0,
      windowWidth: 0,
      brightness: 0,
      contrast: 1,
      error: null,
    }),
}));
