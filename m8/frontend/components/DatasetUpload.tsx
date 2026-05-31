'use client';

import React, { useState } from 'react';
import { Upload, FileJson, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadDataset } from '@/lib/api';
import { DatasetUploadResponse } from '@/types';

interface DatasetUploadProps {
  onUploadSuccess?: (response: DatasetUploadResponse) => void;
  className?: string;
}

export default function DatasetUpload({ onUploadSuccess, className }: DatasetUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [result, setResult] = useState<DatasetUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowedExtensions = ['.jsonl', '.csv'];

  const validateFile = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return allowedExtensions.includes(ext || '');
  };

  const getFileIcon = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (ext === '.jsonl') {
      return <FileJson className="h-8 w-8 text-blue-500" />;
    }
    return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
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
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && validateFile(files[0])) {
      setSelectedFile(files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && validateFile(files[0])) {
      setSelectedFile(files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    setError(null);
    
    try {
      const response = await uploadDataset(selectedFile, datasetName || undefined);
      setResult(response);
      onUploadSuccess?.(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setDatasetName('');
    setResult(null);
    setError(null);
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && document.getElementById('dataset-file-input')?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50',
          uploading && 'cursor-not-allowed opacity-60'
        )}
      >
        <input
          id="dataset-file-input"
          type="file"
          accept=".jsonl,.csv"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        
        {!selectedFile ? (
          <>
            <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              拖拽 QA 数据集到此处，或点击上传
            </p>
            <p className="text-sm text-gray-500">
              支持 JSONL、CSV 格式（包含 question/answer 字段）
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            {getFileIcon(selectedFile)}
            <div>
              <p className="text-sm font-medium text-gray-700">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedFile && !uploading && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              数据集名称（可选）
            </label>
            <input
              type="text"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="默认使用文件名"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={handleUpload}
              className="flex-1 py-2 px-4 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <Upload className="h-4 w-4" />
              <span>开始上传</span>
            </button>
            <button
              onClick={clearSelection}
              className="py-2 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {uploading && (
        <div className="mt-4 flex items-center justify-center space-x-2 text-primary-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">正在上传和解析数据集...</span>
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">
                {result.message}
              </p>
              <p className="text-xs text-green-600 mt-1">
                数据集 ID: {result.dataset_id} | 样本数: {result.total_samples}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
