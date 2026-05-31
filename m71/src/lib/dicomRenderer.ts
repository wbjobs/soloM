import { DicomImage } from '@/types/dicom';

export function renderDicomImage(
  canvas: HTMLCanvasElement,
  image: DicomImage,
  windowCenter: number,
  windowWidth: number,
  brightness: number = 0,
  contrast: number = 1
): void {
  canvas.width = image.columns;
  canvas.height = image.rows;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.createImageData(image.columns, image.rows);
  const data = imageData.data;

  const lower = windowCenter - windowWidth / 2;
  const upper = windowCenter + windowWidth / 2;
  const slope = image.rescaleSlope;
  const intercept = image.rescaleIntercept;

  const pixelCount = image.rows * image.columns;

  for (let i = 0; i < pixelCount; i++) {
    const rawValue = image.pixelData[i];
    const rescaledValue = rawValue * slope + intercept;

    let mapped: number;
    if (rescaledValue <= lower) {
      mapped = 0;
    } else if (rescaledValue >= upper) {
      mapped = 255;
    } else {
      mapped = ((rescaledValue - lower) / windowWidth) * 255;
    }

    let gray = mapped / 255;
    gray = (gray - 0.5) * contrast + 0.5 + brightness;
    gray = Math.max(0, Math.min(1, gray)) * 255;

    const grayInt = gray | 0;
    const idx = i * 4;
    data[idx] = grayInt;
    data[idx + 1] = grayInt;
    data[idx + 2] = grayInt;
    data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}
