"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Upload,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Database,
  MessageSquare,
  RefreshCw,
  Clock,
  HardDrive,
} from "lucide-react";
import useStore from "@/store/useStore";
import type { Document, DocumentStatus } from "@/types";

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  documentId?: string;
}

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { documents, loading, addDocument, fetchDocuments } = useStore();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const processingFiles = files.filter(
      (f) => f.status === "uploading" || f.status === "pending"
    );

    if (processingFiles.length > 0) {
      refreshIntervalRef.current = setInterval(() => {
        fetchDocuments();
      }, 2000);
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [files, fetchDocuments]);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusConfig = (status: DocumentStatus) => {
    const config: Record<
      DocumentStatus,
      { label: string; className: string; icon: React.ReactNode }
    > = {
      uploading: {
        label: "上传中",
        className: "bg-blue-100 text-blue-700",
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
      },
      processing: {
        label: "处理中",
        className: "bg-yellow-100 text-yellow-700",
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
      },
      completed: {
        label: "已完成",
        className: "bg-green-100 text-green-700",
        icon: <CheckCircle className="w-3.5 h-3.5" />,
      },
      failed: {
        label: "失败",
        className: "bg-red-100 text-red-700",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
      },
    };
    return config[status];
  };

  const uploadFile = useCallback(
    async (fileId: string, file: File) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: "uploading", progress: 0 } : f
        )
      );

      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === fileId && f.status === "uploading") {
              const newProgress = Math.min(f.progress + Math.random() * 20, 90);
              return { ...f, progress: newProgress };
            }
            return f;
          })
        );
      }, 200);

      const document = await addDocument(file);

      clearInterval(progressInterval);

      if (document) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: "success", progress: 100, documentId: document.id }
              : f
          )
        );
        fetchDocuments();
      } else {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: "error", progress: 0, error: "上传失败" }
              : f
          )
        );
      }
    },
    [addDocument, fetchDocuments]
  );

  const addFiles = useCallback(
    (newFiles: FileList) => {
      const fileArray = Array.from(newFiles);
      const validFiles: UploadFile[] = [];

      fileArray.forEach((file) => {
        if (validateFile(file)) {
          const uploadFileItem: UploadFile = {
            id: `${Date.now()}-${file.name}`,
            file,
            progress: 0,
            status: "pending",
          };
          validFiles.push(uploadFileItem);
        }
      });

      setFiles((prev) => [...prev, ...validFiles]);
      validFiles.forEach((f) => uploadFile(f.id, f.file));
    },
    [uploadFile]
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

  const clearCompleted = () => {
    setFiles((prev) =>
      prev.filter((f) => f.status !== "success" && f.status !== "error")
    );
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">文档上传</h1>
          <p className="text-gray-500 mt-1">
            上传文档到知识库，支持 PDF 和 TXT 格式
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/knowledge"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Database className="w-5 h-5" />
            知识库
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            <MessageSquare className="w-5 h-5" />
            开始问答
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? "bg-blue-50 border-blue-500 scale-[1.01]"
              : "bg-white hover:bg-gray-50 border-gray-300 hover:border-blue-400"
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
            animate={isDragging ? { y: -8, scale: 1.05 } : { y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="flex flex-col items-center gap-6"
          >
            <div
              className={`w-24 h-24 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging ? "bg-blue-100" : "bg-gray-100"
              }`}
            >
              <Upload
                className={`w-12 h-12 transition-colors ${
                  isDragging ? "text-blue-600" : "text-gray-400"
                }`}
              />
            </div>
            <div>
              <p className="text-xl font-semibold text-gray-700">
                拖拽文件到此处，或点击选择文件
              </p>
              <p className="text-gray-500 mt-2">
                支持 PDF、TXT 格式，单个文件最大 100MB
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                PDF
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                TXT
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                上传队列 ({files.length})
              </h2>
              <button
                onClick={clearCompleted}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                清除已完成
              </button>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {files.map((file, index) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
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
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-blue-600 font-medium">
                              上传中...
                            </span>
                            <span className="text-blue-600 font-medium">
                              {Math.round(file.progress)}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${file.progress}%` }}
                              className="h-full bg-blue-500 rounded-full"
                              transition={{ duration: 0.2 }}
                            />
                          </div>
                        </div>
                      )}

                      {file.status === "pending" && (
                        <div className="mt-2">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full w-full bg-gray-300 rounded-full animate-pulse" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {file.status === "success" && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="text-green-500 flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-5 h-5" />
                          <span className="text-sm font-medium text-green-600">
                            上传成功
                          </span>
                        </motion.div>
                      )}
                      {file.status === "error" && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="text-red-500 flex items-center gap-1.5"
                        >
                          <AlertCircle className="w-5 h-5" />
                          <span className="text-sm font-medium text-red-600">
                            {file.error || "上传失败"}
                          </span>
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
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">已上传文档</h2>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => fetchDocuments()}
            disabled={loading.documents}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading.documents ? "animate-spin" : ""}`}
            />
            刷新
          </motion.button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Database className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-lg font-medium text-gray-600">暂无文档</p>
            <p className="text-sm mt-1">上传文档后将显示在这里</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    文档名称
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    大小
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    上传时间
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    切片数
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {documents.map((doc, index) => {
                    const statusConfig = getStatusConfig(doc.status);
                    return (
                      <motion.tr
                        key={doc.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                doc.type.includes("pdf")
                                  ? "bg-red-50"
                                  : "bg-blue-50"
                              }`}
                            >
                              <FileText
                                className={`w-5 h-5 ${
                                  doc.type.includes("pdf")
                                    ? "text-red-500"
                                    : "text-blue-500"
                                }`}
                              />
                            </div>
                            <span className="font-medium text-gray-800 truncate max-w-xs">
                              {doc.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <HardDrive className="w-4 h-4 text-gray-400" />
                            <span>{formatFileSize(doc.size)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span>{formatDate(doc.uploadTime)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-gray-600 font-medium">
                            {doc.chunkCount}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.className}`}
                          >
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
