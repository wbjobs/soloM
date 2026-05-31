import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'dicom_params.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

export interface ImageAdjustmentParams {
  fileId: string;
  brightness: number;
  contrast: number;
  windowCenter: number;
  windowWidth: number;
  zoom: number;
  panX: number;
  panY: number;
  updatedAt: string;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS image_adjustments (
    file_id TEXT PRIMARY KEY,
    brightness REAL NOT NULL DEFAULT 0,
    contrast REAL NOT NULL DEFAULT 1,
    window_center REAL NOT NULL DEFAULT 0,
    window_width REAL NOT NULL DEFAULT 0,
    zoom REAL NOT NULL DEFAULT 1,
    pan_x REAL NOT NULL DEFAULT 0,
    pan_y REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_adjustments_file_id ON image_adjustments(file_id);
  CREATE INDEX IF NOT EXISTS idx_adjustments_updated ON image_adjustments(updated_at);
`);

const getParamsStmt = db.prepare(`
  SELECT 
    file_id as fileId,
    brightness,
    contrast,
    window_center as windowCenter,
    window_width as windowWidth,
    zoom,
    pan_x as panX,
    pan_y as panY,
    updated_at as updatedAt
  FROM image_adjustments 
  WHERE file_id = ?
`);

const insertParamsStmt = db.prepare(`
  INSERT INTO image_adjustments 
    (file_id, brightness, contrast, window_center, window_width, zoom, pan_x, pan_y, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(file_id) DO UPDATE SET
    brightness = excluded.brightness,
    contrast = excluded.contrast,
    window_center = excluded.window_center,
    window_width = excluded.window_width,
    zoom = excluded.zoom,
    pan_x = excluded.pan_x,
    pan_y = excluded.pan_y,
    updated_at = excluded.updated_at
`);

export function getImageParams(fileId: string): ImageAdjustmentParams | null {
  const result = getParamsStmt.get(fileId) as ImageAdjustmentParams | undefined;
  return result || null;
}

export function saveImageParams(params: Omit<ImageAdjustmentParams, 'updatedAt'> & { updatedAt?: string }): ImageAdjustmentParams {
  const updatedAt = params.updatedAt || new Date().toISOString();
  
  insertParamsStmt.run(
    params.fileId,
    params.brightness,
    params.contrast,
    params.windowCenter,
    params.windowWidth,
    params.zoom || 1,
    params.panX || 0,
    params.panY || 0,
    updatedAt
  );

  return {
    fileId: params.fileId,
    brightness: params.brightness,
    contrast: params.contrast,
    windowCenter: params.windowCenter,
    windowWidth: params.windowWidth,
    zoom: params.zoom || 1,
    panX: params.panX || 0,
    panY: params.panY || 0,
    updatedAt,
  };
}

export function getAllParams(): ImageAdjustmentParams[] {
  const stmt = db.prepare(`
    SELECT 
      file_id as fileId,
      brightness,
      contrast,
      window_center as windowCenter,
      window_width as windowWidth,
      zoom,
      pan_x as panX,
      pan_y as panY,
      updated_at as updatedAt
    FROM image_adjustments
    ORDER BY updated_at DESC
  `);
  return stmt.all() as ImageAdjustmentParams[];
}

export function deleteImageParams(fileId: string): boolean {
  const stmt = db.prepare('DELETE FROM image_adjustments WHERE file_id = ?');
  const result = stmt.run(fileId);
  return (result.changes || 0) > 0;
}

export { db };
