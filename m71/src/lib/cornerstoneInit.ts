import * as cornerstone from 'cornerstone-core';

export function initCornerstone(): void {
  try {
    cornerstone.registerImageLoader('dicom', loadDicomImage);
  } catch {
  }
}

function loadDicomImage(imageId: string): Promise<any> {
  return Promise.resolve({});
}
