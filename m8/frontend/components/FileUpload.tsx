'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadDocument } from '@/lib/api';
import { UploadResponse } from '@/types';

interface FileUploadProps {
  onUploadSuccess?: (response: UploadResponse) => void;
  className?: string;
}

export default function FileUpload({ onUploadSuccess, className }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadResults, setUploadResults] = useState<Map<string, UploadResponse>>(new Map());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedExtensions = ['.pdf', '.md', '.markdown', '.txt'];

  const validateFile = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return allowedExtensions.includes(ext || '');
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files).filter(validateFile);
    setSelectedFiles(prev => [...prev, ...fileArray]);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
      const fileId = `${file.name}-${file.size}`;
      setUploadingFiles(prev => new Set(prev).add(fileId));

      try {
        const response = await uploadDocument(file);
        setUploadResults(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, response);
          return newMap;
        });
        onUploadSuccess?.(response);
      } catch (error) {
        setUploadResults(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, {
            success: false,
            message: error instanceof Error ? error.message : '上传失败',
            file_name: file.name,
            chunks_count: 0,
            index_name: 'default',
          });
          return newMap;
        });
      } finally {
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
      }
    }

    setSelectedFiles([]);
  };

  const isUploading = uploadingFiles.size > 0;

  return (
    <div className={cn('w-full', className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.md,.markdown,.txt"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          拖拽文件到此处，或点击上传
        </p>
        <p className="text-sm text-gray-500">
          支持 PDF、Markdown、TXT 格式
        </p>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {selectedFiles.map((file, index) => {
            const fileId = `${file.name}-${file.size}`;
            const result = uploadResults.get(fileId);
            const isFileUploading = uploadingFiles.has(fileId);

            return (
              <div
                key={fileId}
                className="flex items-center justify-between p-3 bg-white border rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isFileUploading ? (
                    <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
                  ) : result ? (
                    result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedFiles.length > 0 && !isUploading && (
        <button
          onClick={uploadFiles}
          disabled={isUploading}
          className={cn(
            'mt-4 w-full py-2 px-4 rounded-lg font-medium transition-colors',
            isUploading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-primary-500 hover:bg-primary-600 text-white'
          )}
        >
          {isUploading ? '上传中...' : '开始上传'}
        </button>
      )}
    </div>
  );
}
