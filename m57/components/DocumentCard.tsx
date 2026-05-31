"use client";

import { motion } from "framer-motion";
import {
  FileText,
  File,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
} from "lucide-react";

type DocumentStatus = "processing" | "completed" | "failed";

interface DocumentCardProps {
  id: string;
  name: string;
  type: "pdf" | "txt";
  size: number;
  uploadTime: string;
  status: DocumentStatus;
  onDelete: (id: string) => void;
  onReindex: (id: string) => void;
}

const statusConfig: Record<
  DocumentStatus,
  { label: string; className: string }
> = {
  processing: {
    label: "处理中",
    className: "bg-yellow-100 text-yellow-700",
  },
  completed: {
    label: "已完成",
    className: "bg-green-100 text-green-700",
  },
  failed: {
    label: "失败",
    className: "bg-red-100 text-red-700",
  },
};

export default function DocumentCard({
  id,
  name,
  type,
  size,
  uploadTime,
  status,
  onDelete,
  onReindex,
}: DocumentCardProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const TypeIcon = type === "pdf" ? FileText : File;
  const statusInfo = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all duration-300 group"
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
            type === "pdf" ? "bg-red-50" : "bg-blue-50"
          }`}
        >
          <TypeIcon
            className={`w-7 h-7 ${
              type === "pdf" ? "text-red-500" : "text-blue-500"
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                {name}
              </h3>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{formatFileSize(size)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{uploadTime}</span>
                </div>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusInfo.className}`}
            >
              {statusInfo.label}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onReindex(id)}
              disabled={status === "processing"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  status === "processing" ? "animate-spin" : ""
                }`}
              />
              重新索引
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onDelete(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
