"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { User, Bot, FileText, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import type { Source } from "@/types";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isTyping?: boolean;
  onSourceClick?: (source: Source) => void;
  highlightedSourceId?: string | null;
}

interface CitationMatch {
  fullMatch: string;
  sourceId: number;
  index: number;
}

export default function ChatMessage({
  role,
  content,
  sources = [],
  isTyping = false,
  onSourceClick,
  highlightedSourceId,
}: ChatMessageProps) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [showSources, setShowSources] = useState(true);
  const isUser = role === "user";

  useEffect(() => {
    if (isTyping && !isUser) {
      let index = 0;
      setDisplayedContent("");

      const timer = setInterval(() => {
        if (index < content.length) {
          setDisplayedContent(content.slice(0, index + 1));
          index++;
        } else {
          clearInterval(timer);
        }
      }, 20);

      return () => clearInterval(timer);
    } else {
      setDisplayedContent(content);
    }
  }, [content, isTyping, isUser]);

  const parseCitations = useCallback((text: string): CitationMatch[] => {
    const matches: CitationMatch[] = [];
    const regex = /\[(\d+)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        sourceId: parseInt(match[1]),
        index: match.index,
      });
    }

    return matches;
  }, []);

  const handleCitationClick = (sourceId: number) => {
    const source = sources.find((s) => s.source_id === sourceId);
    if (source && onSourceClick) {
      onSourceClick(source);
    }
  };

  const renderContentWithCitations = (text: string) => {
    const citations = parseCitations(text);
    if (citations.length === 0) {
      return text;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    citations.forEach((citation, idx) => {
      if (citation.index > lastIndex) {
        parts.push(text.slice(lastIndex, citation.index));
      }

      const source = sources.find((s) => s.source_id === citation.sourceId);
      const isHighlighted = source && highlightedSourceId === source.id;

      parts.push(
        <motion.button
          key={`citation-${idx}`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleCitationClick(citation.sourceId)}
          className={`inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full mx-0.5 align-baseline transition-all cursor-pointer ${
            isHighlighted
              ? "bg-blue-500 text-white ring-2 ring-blue-300"
              : "bg-blue-100 text-blue-600 hover:bg-blue-200"
          }`}
          title={source ? `来源: ${source.documentName}${source.pageNumber ? ` 第${source.pageNumber}页` : ""}` : "未知来源"}
        >
          {citation.sourceId}
        </motion.button>
      );

      lastIndex = citation.index + citation.fullMatch.length;
    });

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  const renderMarkdownWithCitations = () => {
    return (
      <ReactMarkdown
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;

            return !isInline && match ? (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                className="rounded-lg my-3 text-sm"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return (
              <p className="mb-2 last:mb-0">
                {typeof children === "string"
                  ? renderContentWithCitations(children)
                  : children}
              </p>
            );
          },
          li({ children }) {
            return (
              <li className="mb-1">
                {typeof children === "string"
                  ? renderContentWithCitations(children)
                  : children}
              </li>
            );
          },
        }}
      >
        {displayedContent}
      </ReactMarkdown>
    );
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return "text-gray-400";
    if (confidence >= 0.7) return "text-green-600";
    if (confidence >= 0.5) return "text-yellow-600";
    return "text-orange-600";
  };

  const getRelevanceBadge = (relevance?: string) => {
    const styles: Record<string, string> = {
      high: "bg-green-100 text-green-700",
      medium: "bg-yellow-100 text-yellow-700",
      low: "bg-orange-100 text-orange-700",
    };
    return styles[relevance || ""] || "bg-gray-100 text-gray-700";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md"
            : "bg-gradient-to-br from-gray-200 to-gray-300 text-gray-600"
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5" />
        ) : (
          <Bot className="w-5 h-5" />
        )}
      </div>

      <div className={`flex-1 max-w-3xl ${isUser ? "items-end" : "items-start"}`}>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className={`rounded-2xl px-5 py-4 ${
            isUser
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm shadow-md"
              : "bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{displayedContent}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-700 prose-strong:text-gray-800 prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-ul:my-2 prose-ol:my-2">
              {renderMarkdownWithCitations()}
              {isTyping && displayedContent.length < content.length && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="inline-block w-2 h-4 bg-gray-400 ml-1 align-middle rounded"
                />
              )}
            </div>
          )}
        </motion.div>

        {!isUser && sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ delay: 0.3 }}
            className="mt-3"
          >
            <motion.button
              whileHover={{ backgroundColor: "rgb(249, 250, 251)" }}
              onClick={() => setShowSources(!showSources)}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                参考来源 ({sources.length})
              </span>
              <motion.div
                animate={{ rotate: showSources ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </motion.div>
            </motion.button>

            <AnimatePresence>
              {showSources && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-2">
                    {sources.map((source, index) => {
                      const isHighlighted = highlightedSourceId === source.id;
                      return (
                        <motion.div
                          key={source.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + index * 0.05 }}
                          onClick={() => onSourceClick?.(source)}
                          className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                            isHighlighted
                              ? "border-blue-400 bg-blue-50 shadow-md"
                              : "border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full ${
                                  source.is_table
                                    ? "bg-purple-100 text-purple-600"
                                    : "bg-blue-100 text-blue-600"
                                }`}
                              >
                                {source.source_id || index + 1}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-gray-700 truncate text-sm">
                                  {source.documentName}
                                </p>
                                {source.relevance && (
                                  <span
                                    className={`px-1.5 py-0.5 text-xs font-medium rounded ${getRelevanceBadge(
                                      source.relevance
                                    )}`}
                                  >
                                    {source.relevance === "high"
                                      ? "高相关"
                                      : source.relevance === "medium"
                                      ? "中相关"
                                      : "低相关"}
                                  </span>
                                )}
                                {source.is_table && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-600">
                                    表格
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                {source.pageNumber && (
                                  <span>第 {source.pageNumber} 页</span>
                                )}
                                {source.confidence !== undefined && (
                                  <span className={getConfidenceColor(source.confidence)}>
                                    置信度: {(source.confidence * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>

                              {source.matched_keywords && source.matched_keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {source.matched_keywords.slice(0, 5).map((kw, i) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <AnimatePresence>
                            {isHighlighted && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 pt-3 border-t border-gray-200"
                              >
                                <div className="bg-white rounded-lg p-3 text-sm text-gray-600 leading-relaxed max-h-40 overflow-y-auto">
                                  {source.content}
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
          </motion.div>
        )}

        {!isUser && sources.length === 0 && content.includes("未在文档") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-yellow-50 rounded-lg text-sm text-yellow-700"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>未找到相关文档内容，回答可能不完全准确</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
