import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { uploadFile, fetchFiles } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onUploadComplete?: () => void;
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFile = useAppStore((s) => s.addFile);
  const setFiles = useAppStore((s) => s.setFiles);

  const validateFile = (file: File): boolean => {
    const validExtensions = ['.dcm', '.dicom'];
    const fileName = file.name.toLowerCase();
    return validExtensions.some((ext) => fileName.endsWith(ext));
  };

  const handleUpload = useCallback(async (file: File) => {
    if (!validateFile(file)) {
      setError('Invalid file type. Please upload a .dcm file.');
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const uploadedFile = await uploadFile(file, (p) => setProgress(p));
      addFile(uploadedFile);
      const files = await fetchFiles();
      setFiles(files);
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [addFile, setFiles, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleUpload]);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer',
          'bg-slate-800/50 backdrop-blur',
          isDragging
            ? 'border-blue-500 shadow-lg shadow-blue-500/30 bg-blue-900/20'
            : 'border-slate-600 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-900/20'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dcm,.dicom"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <div className={cn(
            'p-4 rounded-full transition-all duration-200',
            isDragging ? 'bg-blue-500/20' : 'bg-slate-700/50'
          )}>
            {uploading ? (
              <FileUp className="w-12 h-12 text-blue-400 animate-bounce" />
            ) : (
              <Upload className="w-12 h-12 text-slate-400" />
            )}
          </div>

          <div>
            <p className="text-lg font-medium text-white mb-1">
              {uploading ? 'Uploading...' : 'Drag & drop DICOM files here'}
            </p>
            <p className="text-sm text-slate-400">
              or click to browse files
            </p>
          </div>

          <button
            onClick={handleBrowseClick}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md transition-all duration-200 font-medium"
          >
            Browse Files
          </button>

          {uploading && (
            <div className="w-full max-w-xs mt-2">
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {progress.toFixed(0)}%
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 px-4 py-2 rounded-md">
              {error}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-3 text-center">
        Supported format: .dcm (DICOM medical image files)
      </p>
    </div>
  );
}
