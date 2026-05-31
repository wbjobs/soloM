import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import FileUpload from '@/components/FileUpload';
import FileList from '@/components/FileList';
import { DicomFileInfo } from '@/types/dicom';
import { fetchFiles } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { loadWasmModule } from '@/lib/wasmLoader';

export default function Home() {
  const navigate = useNavigate();
  const setFiles = useAppStore((s) => s.setFiles);
  const setWasmAvailable = useAppStore((s) => s.setWasmAvailable);
  const resetViewer = useAppStore((s) => s.resetViewer);

  useEffect(() => {
    const loadData = async () => {
      try {
        const files = await fetchFiles();
        setFiles(files);
      } catch (err) {
        console.error('Failed to load files:', err);
      }
    };
    loadData();
    resetViewer();
  }, [setFiles, resetViewer]);

  useEffect(() => {
    const initWasm = async () => {
      const module = await loadWasmModule();
      setWasmAvailable(!!module);
    };
    initWasm();
  }, [setWasmAvailable]);

  const handleFileSelect = useCallback((file: DicomFileInfo) => {
    navigate(`/viewer/${file.id}`);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0a1628]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Upload DICOM Files</h1>
              <p className="text-slate-400 text-sm">
                Upload medical image files in DICOM format (.dcm) for viewing and analysis.
              </p>
            </div>
            <FileUpload />
          </div>
          <div>
            <FileList onFileSelect={handleFileSelect} />
          </div>
        </div>
      </main>
    </div>
  );
}
