"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Send,
  MessageSquare,
  Clock,
  Trash2,
  Loader2,
} from "lucide-react";
import useStore from "@/store/useStore";
import ChatMessage from "@/components/ChatMessage";
import SourcePanel from "@/components/SourcePanel";
import type { Source } from "@/types";

export default function ChatPage() {
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    conversations,
    currentConversation,
    loading,
    fetchConversations,
    setCurrentConversation,
    fetchConversation,
    sendChatMessage,
  } = useStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentConversation?.messages, isTyping]);

  const handleNewChat = () => {
    setCurrentConversation(null);
    setInputValue("");
    setHighlightedSourceId(null);
  };

  const handleSourceClick = (source: Source) => {
    setHighlightedSourceId(highlightedSourceId === source.id ? null : source.id);
  };

  const handleConversationClick = async (conversationId: string) => {
    if (currentConversation?.id !== conversationId) {
      await fetchConversation(conversationId);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading.messages) return;

    const question = inputValue.trim();
    setInputValue("");
    setIsTyping(true);

    const response = await sendChatMessage(
      question,
      currentConversation?.id
    );

    setIsTyping(false);

    if (response && inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "昨天";
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const latestSources =
    currentConversation?.messages?.filter((m) => m.sources).slice(-1)[0]
      ?.sources || [];

  const adaptedSources = latestSources.map((s) => ({
    ...s,
    similarity: s.score,
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-8">
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-72 bg-white border-r border-gray-200 flex flex-col"
      >
        <div className="p-4 border-b border-gray-200">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5" />
            新对话
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <AnimatePresence>
            {conversations.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12 text-gray-500"
              >
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">暂无对话</p>
                <p className="text-xs mt-1">开始新的对话吧</p>
              </motion.div>
            ) : (
              conversations.map((conversation, index) => (
                <motion.div
                  key={conversation.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleConversationClick(conversation.id)}
                  className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    currentConversation?.id === conversation.id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        currentConversation?.id === conversation.id
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium truncate ${
                          currentConversation?.id === conversation.id
                            ? "text-blue-700"
                            : "text-gray-800"
                        }`}
                      >
                        {conversation.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(conversation.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  {currentConversation?.id === conversation.id && (
                    <motion.div
                      layoutId="activeChatIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full"
                    />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col bg-gray-50">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!currentConversation || currentConversation.messages?.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-xl shadow-blue-500/30">
                <MessageSquare className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                欢迎使用 RAG 知识库助手
              </h2>
              <p className="text-gray-500 max-w-md">
                基于检索增强生成技术，为您提供准确、可靠的智能问答服务。
                请在下方输入您的问题开始对话。
              </p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {currentConversation.messages?.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  role={message.role as "user" | "assistant"}
                  content={message.content}
                  sources={message.sources}
                  isTyping={
                    isTyping &&
                    index === currentConversation.messages!.length - 1 &&
                    message.role === "assistant"
                  }
                  onSourceClick={handleSourceClick}
                  highlightedSourceId={highlightedSourceId}
                />
              ))}
              {loading.messages && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-gray-100">
                    <div className="flex gap-1.5">
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.6,
                          delay: 0,
                        }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.6,
                          delay: 0.2,
                        }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.6,
                          delay: 0.4,
                        }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="relative"
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入您的问题，按 Enter 发送..."
                rows={1}
                className="w-full px-5 py-4 pr-14 bg-gray-50 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-800 placeholder-gray-400"
                style={{ minHeight: "56px", maxHeight: "200px" }}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || loading.messages}
                className="absolute right-3 bottom-3 w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-600/20"
              >
                {loading.messages ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </motion.button>
            </motion.div>
            <p className="text-xs text-center text-gray-400 mt-3">
              按 Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </div>
      </div>

      <motion.aside
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="w-80 bg-white border-l border-gray-200 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto p-4">
          <SourcePanel
            sources={latestSources}
            highlightedSourceId={highlightedSourceId}
            onSourceSelect={handleSourceClick}
          />
        </div>
      </motion.aside>
    </div>
  );
}
