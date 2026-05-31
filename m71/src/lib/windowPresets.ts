import { WindowPreset } from '@/types/dicom';

export const WINDOW_PRESETS: WindowPreset[] = [
  { name: 'brain', nameCn: '脑窗', center: 40, width: 80 },
  { name: 'lung', nameCn: '肺窗', center: -600, width: 1500 },
  { name: 'bone', nameCn: '骨窗', center: 400, width: 1800 },
  { name: 'softTissue', nameCn: '软组织窗', center: 40, width: 400 },
  { name: 'abdomen', nameCn: '腹部窗', center: 40, width: 350 },
  { name: 'mediastinum', nameCn: '纵隔窗', center: 50, width: 350 },
];
