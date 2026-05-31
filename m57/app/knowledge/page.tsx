"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Search,
  Database,
  FileText,
  Upload,
  MessageSquare,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  Filter,
  Clock,
  HardDrive,
  Layers,
} from "lucide-react";
import useStore from "@/store/useStore";
import DocumentCard from "@/components/DocumentCard";
import type { Document, DocumentStatus } from "@/types";

export default function KnowledgePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("date");

  const {
    documents,
    loading,
    fetchDocuments,
    removeDocument,
    reindexDocument,
  } = useStore();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const filteredDocuments = documents
    .filter((doc) => {
      const matchesSearch = doc.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return b.size - a.size;
        case "date":
        default:
          return (
            new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime()
          );
      }
    });

  const totalDocuments = documents.length;
  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunkCount, 0);
  const completedDocs = documents.filter((d) => d.status === "completed").length;
  const processingDocs = documents.filter(
    (d) => d.status === "processing" || d.status === "uploading"
  ).length;

  const toggleSelectAll = () => {
    if (selectedDocs.size === filteredDocuments.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(filteredDocuments.map((d) => d.id)));
    }
  };

  const toggleSelectDoc = (id: string) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDocs(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedDocs.size === 0) return;
    if (
      !confirm(`确定要删除选中的 ${selectedDocs.size} 个文档吗？此操作不可恢复。`)
    )
      return;

    for (const id of Array.from(selectedDocs)) {
      await removeDocument(id);
    }
    setSelectedDocs(new Set());
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个文档吗？此操作不可恢复。")) return;
    await removeDocument(id);
    setSelectedDocs((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const handleReindex = async (id: string) => {
    await reindexDocument(id);
  };

  const getDocType = (type: string): "pdf" | "txt" => {
    return type.includes("pdf") ? "pdf" : "txt";
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">知识库管理</h1>
          <p className="text-gray-500 mt-1">管理和索引您的文档知识库</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/upload"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Upload className="w-5 h-5" />
            上传文档
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
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div
          whileHover={{ y: -4 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
              <Database className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">总文档数</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalDocuments}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -4 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center">
              <Layers className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">总切片数</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalChunks.toLocaleString()}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -4 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckSquare className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已完成</p>
              <p className="text-2xl font-bold text-gray-900">{completedDocs}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -4 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-yellow-50 flex items-center justify-center">
              <RefreshCw className="w-7 h-7 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">处理中</p>
              <p className="text-2xl font-bold text-gray-900">{processingDocs}</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索文档名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as DocumentStatus | "all")
                }
                className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                <option value="all">全部状态</option>
                <option value="uploading">上传中</option>
                <option value="processing">处理中</option>
                <option value="completed">已完成</option>
                <option value="failed">失败</option>
              </select>
            </div>

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "name" | "date" | "size")
              }
              className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
            >
              <option value="date">按日期排序</option>
              <option value="name">按名称排序</option>
              <option value="size">按大小排序</option>
            </select>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => fetchDocuments()}
              disabled={loading.documents}
              className="p-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-5 h-5 text-gray-600 ${
                  loading.documents ? "animate-spin" : ""
                }`}
              />
            </motion.button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              {selectedDocs.size === filteredDocuments.length &&
              filteredDocuments.length > 0 ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5 text-gray-400" />
              )}
            </button>
            <span className="text-sm text-gray-500">
              {selectedDocs.size > 0
                ? `已选择 ${selectedDocs.size} 个文档`
                : `共 ${filteredDocuments.length} 个文档`}
            </span>
          </div>

          <AnimatePresence>
            {selectedDocs.size > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                批量删除
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {loading.documents && filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 mx-auto mb-4 text-gray-300 animate-spin" />
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-lg font-medium text-gray-600">
              {searchQuery || statusFilter !== "all"
                ? "没有找到匹配的文档"
                : "暂无文档"}
            </p>
            <p className="text-sm mt-1">
              {searchQuery || statusFilter !== "all"
                ? "请尝试调整搜索条件"
                : "上传文档后将显示在这里"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredDocuments.map((doc, index) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative group"
                >
                  <div className="absolute top-4 left-4 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectDoc(doc.id);
                      }}
                      className="p-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm hover:bg-white transition-colors"
                    >
                      {selectedDocs.has(doc.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  </div>
                  <DocumentCard
                    id={doc.id}
                    name={doc.name}
                    type={getDocType(doc.type)}
                    size={doc.size}
                    uploadTime={new Date(
                      doc.uploadTime
                    ).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    status={doc.status as "processing" | "completed" | "failed"}
                    onDelete={handleDelete}
                    onReindex={handleReindex}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}
