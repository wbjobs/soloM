import React, { useState } from 'react';
import { FolderOpen, Trash2, FileText } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { DicomFileInfo } from '@/types/dicom';
import { deleteFile } from '@/lib/api';
import { formatFileSize, formatDate, cn } from '@/lib/utils';

interface FileListProps {
  onFileSelect: (file: DicomFileInfo) => void;
}

export default function FileList({ onFileSelect }: FileListProps) {
  const files = useAppStore((s) => s.files);
  const selectedFileId = useAppStore((s) => s.selectedFileId);
  const removeFile = useAppStore((s) => s.removeFile);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleFileClick = (file: DicomFileInfo) => {
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleteConfirm === id) {
      try {
        await deleteFile(id);
        removeFile(id);
        setDeleteConfirm(null);
      } catch (err) {
        console.error('Delete failed:', err);
      }
    } else {
      setDeleteConfirm(id);
    }
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(null);
  };

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
        <div className="p-6 rounded-full bg-slate-800/50 mb-4">
          <FolderOpen className="w-16 h-16 text-slate-500" />
        </div>
        <h3 className="text-xl font-medium text-slate-300 mb-2">No files uploaded</h3>
        <p className="text-slate-500">Upload DICOM files to view medical images</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white mb-4">Uploaded Files</h2>
      <div className="grid gap-3">
        {files.map((file) => (
          <div
            key={file.id}
            onClick={() => handleFileClick(file)}
            className={cn(
              'group relative bg-slate-800/80 backdrop-blur border rounded-lg p-4 cursor-pointer',
              'transition-all duration-200 hover:shadow-lg hover:shadow-blue-900/30 hover:-translate-y-0.5',
              selectedFileId === file.id
                ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                : 'border-slate-700 hover:border-blue-500/50'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'p-2 rounded-md flex-shrink-0',
                selectedFileId === file.id ? 'bg-blue-500/20' : 'bg-slate-700/50'
              )}>
                <FileText className={cn(
                  'w-8 h-8',
                  selectedFileId === file.id ? 'text-blue-400' : 'text-slate-400'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white truncate">{file.filename}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm">
                  <span className="text-slate-400 font-mono">{formatFileSize(file.size)}</span>
                  <span className="text-slate-500">{formatDate(file.uploadedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {deleteConfirm === file.id ? (
                  <>
                    <button
                      onClick={(e) => handleDelete(e, file.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded-md transition-all"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={handleDeleteCancel}
                      className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-md transition-all"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => handleDelete(e, file.id)}
                    className="p-2 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
