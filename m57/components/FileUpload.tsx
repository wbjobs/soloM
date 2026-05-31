"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileText, CheckCircle, AlertCircle } from "lucide-react";

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    const validTypes = [
      "application/pdf",
      "text/plain",
      "application/x-pdf",
    ];
    return validTypes.includes(file.type);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const simulateUpload = useCallback((fileId: string) => {
    const interval = setInterval(() => {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id === fileId) {
            const newProgress = Math.min(f.progress + Math.random() * 15, 100);
            const newStatus =
              newProgress >= 100 ? "success" : ("uploading" as const);
            return { ...f, progress: newProgress, status: newStatus };
          }
          return f;
        })
      );
    }, 200);

    setTimeout(() => clearInterval(interval), 2000);
  }, []);

  const addFiles = useCallback(
    (newFiles: FileList) => {
      const fileArray = Array.from(newFiles);
      const validFiles: UploadFile[] = [];

      fileArray.forEach((file) => {
        if (validateFile(file)) {
          const uploadFile: UploadFile = {
            id: `${Date.now()}-${file.name}`,
            file,
            progress: 0,
            status: "pending",
          };
          validFiles.push(uploadFile);
        }
      });

      setFiles((prev) => [...prev, ...validFiles]);
      validFiles.forEach((f) => simulateUpload(f.id));
    },
    [simulateUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        whileHover={{ scale: 1.01 }}
        animate={isDragging ? "dragging" : "idle"}
        variants={{
          idle: { borderColor: "rgb(209, 213, 219)" },
          dragging: { borderColor: "rgb(59, 130, 246)" },
        }}
        className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? "bg-blue-50 border-blue-500"
            : "bg-white hover:bg-gray-50 border-gray-300"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={handleFileSelect}
          className="hidden"
        />

        <motion.div
          animate={isDragging ? { y: -5, scale: 1.1 } : { y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
          className="flex flex-col items-center gap-4"
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ${
              isDragging ? "bg-blue-100" : "bg-gray-100"
            }`}
          >
            <Upload
              className={`w-8 h-8 ${
                isDragging ? "text-blue-600" : "text-gray-400"
              }`}
            />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-700">
              拖拽文件到此处，或点击上传
            </p>
            <p className="text-sm text-gray-500 mt-1">支持 PDF、TXT 格式</p>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 space-y-3"
          >
            {files.map((file, index) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 100 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-gray-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {file.file.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(file.file.size)}
                  </p>

                  {file.status === "uploading" && (
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${file.progress}%` }}
                        className="h-full bg-blue-500 rounded-full"
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {file.status === "uploading" && (
                    <span className="text-sm text-blue-600 font-medium">
                      {Math.round(file.progress)}%
                    </span>
                  )}
                  {file.status === "success" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-green-500"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </motion.div>
                  )}
                  {file.status === "error" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-red-500"
                    >
                      <AlertCircle className="w-5 h-5" />
                    </motion.div>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => removeFile(file.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
