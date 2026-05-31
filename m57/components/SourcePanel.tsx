"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  BookOpen,
  Percent,
  Table,
  File,
  Highlighter,
} from "lucide-react";
import type { Source } from "@/types";

interface SourcePanelProps {
  sources: Source[];
  defaultOpen?: boolean;
  highlightedSourceId?: string | null;
  onSourceSelect?: (source: Source) => void;
}

export default function SourcePanel({
  sources,
  defaultOpen = true,
  highlightedSourceId,
  onSourceSelect,
}: SourcePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const toggleSource = (id: string) => {
    setExpandedSource(expandedSource === id ? null : id);
  };

  const getRelevanceColor = (relevance?: string) => {
    const colors: Record<string, { bg: string; text: string; bar: string }> = {
      high: { bg: "bg-green-50", text: "text-green-700", bar: "bg-green-500" },
      medium: { bg: "bg-yellow-50", text: "text-yellow-700", bar: "bg-yellow-500" },
      low: { bg: "bg-orange-50", text: "text-orange-700", bar: "bg-orange-500" },
    };
    return colors[relevance || ""] || colors.medium;
  };

  const highlightContent = (content: string, highlightSpans?: Array<{ start: number; end: number; text: string }>) => {
    if (!highlightSpans || highlightSpans.length === 0) {
      return content;
    }

    const sortedSpans = [...highlightSpans].sort((a, b) => a.start - b.start);

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedSpans.forEach((span, idx) => {
      if (span.start > lastIndex) {
        parts.push(content.slice(lastIndex, span.start));
      }

      parts.push(
        <mark
          key={idx}
          className="bg-yellow-200 text-yellow-900 px-0.5 rounded font-medium"
        >
          {content.slice(span.start, span.end)}
        </mark>
      );

      lastIndex = span.end;
    });

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts;
  };

  const stats = useMemo(() => {
    const tableSources = sources.filter((s) => s.is_table);
    const textSources = sources.filter((s) => !s.is_table);
    const avgConfidence = sources.length
      ? sources.reduce((sum, s) => sum + (s.confidence || 0), 0) / sources.length
      : 0;

    return { tableSources, textSources, avgConfidence };
  }, [sources]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <motion.button
        whileHover={{ backgroundColor: "rgb(249, 250, 251)" }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-800">参考来源</h3>
            <p className="text-sm text-gray-500">
              共 {sources.length} 个片段
              {stats.tableSources.length > 0 && (
                <span className="ml-2 text-purple-600">
                  (含 {stats.tableSources.length} 个表格)
                </span>
              )}
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 0 : -180 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronUp className="w-5 h-5 text-gray-400" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && sources.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {sources.length > 0 && (
              <div className="px-4 pt-2 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <File className="w-3 h-3" />
                    文本: {stats.textSources.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <Table className="w-3 h-3" />
                    表格: {stats.tableSources.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    平均置信度: {(stats.avgConfidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            <div className="p-4 pt-2 space-y-3 max-h-96 overflow-y-auto">
              {sources.map((source, index) => {
                const isExpanded = expandedSource === source.id;
                const isHighlighted = highlightedSourceId === source.id;
                const colors = getRelevanceColor(source.relevance);

                return (
                  <motion.div
                    key={source.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => {
                      toggleSource(source.id);
                      onSourceSelect?.(source);
                    }}
                    className={`rounded-lg overflow-hidden transition-all cursor-pointer ${
                      isHighlighted
                        ? "ring-2 ring-blue-500 shadow-md border-blue-200"
                        : "border border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div
                      className={`px-4 py-3 flex items-center gap-3 transition-colors ${
                        isHighlighted ? colors.bg : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {source.is_table ? (
                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Table className="w-4 h-4 text-purple-600" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileText className="w-4 h-4 text-blue-600" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full ${
                              source.is_table
                                ? "bg-purple-500 text-white"
                                : "bg-blue-500 text-white"
                            }`}
                          >
                            {source.source_id || index + 1}
                          </span>
                          <p className="font-medium text-gray-700 truncate text-sm flex-1">
                            {source.documentName}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 mt-1">
                          {source.pageNumber && (
                            <span className="text-xs text-gray-500">
                              第 {source.pageNumber} 页
                            </span>
                          )}
                          {source.confidence !== undefined && (
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${colors.bar}`}
                                  style={{ width: `${source.confidence * 100}%` }}
                                />
                              </div>
                              <span className={`text-xs ${colors.text}`}>
                                {(source.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>

                        {source.matched_keywords && source.matched_keywords.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Highlighter className="w-3 h-3 text-yellow-600" />
                            <div className="flex flex-wrap gap-1">
                              {source.matched_keywords.slice(0, 3).map((kw, i) => (
                                <span
                                  key={i}
                                  className="px-1 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded"
                                >
                                  {kw}
                                </span>
                              ))}
                              {source.matched_keywords.length > 3 && (
                                <span className="text-xs text-gray-400">
                                  +{source.matched_keywords.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-shrink-0"
                      >
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </motion.div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4">
                            <motion.div
                              initial={{ y: -10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: 0.1 }}
                              className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 leading-relaxed max-h-48 overflow-y-auto"
                            >
                              <div className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <span>原文片段</span>
                                {source.is_table && (
                                  <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 rounded">
                                    表格
                                  </span>
                                )}
                              </div>
                              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                                {highlightContent(source.content, source.highlight_spans)}
                              </div>
                            </motion.div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sources.length === 0 && isOpen && (
        <div className="px-5 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">暂无参考来源</p>
        </div>
      )}
    </div>
  );
}
