'use client';

import React from 'react';
import { FileUp, Database, Settings, Menu, X, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import FileUpload from './FileUpload';
import FinetuneManager from './FinetuneManager';
import { UploadResponse } from '@/types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'upload' | 'finetune' | 'indexes' | 'settings';
  onTabChange: (tab: 'upload' | 'finetune' | 'indexes' | 'settings') => void;
}

export default function Sidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
}: SidebarProps) {
  const tabs = [
    { id: 'upload' as const, label: '上传文档', icon: FileUp },
    { id: 'finetune' as const, label: '模型微调', icon: Cpu },
    { id: 'indexes' as const, label: '索引管理', icon: Database },
    { id: 'settings' as const, label: '设置', icon: Settings },
  ];

  const handleUploadSuccess = (response: UploadResponse) => {
    console.log('上传成功:', response);
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-80 bg-white border-r border-gray-200 flex flex-col transition-transform lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800">RAG 系统</h1>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex-1 flex flex-col items-center py-3 px-2 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <tab.icon className="h-5 w-5 mb-1" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {activeTab === 'upload' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">上传文档</h2>
              <FileUpload onUploadSuccess={handleUploadSuccess} />
            </div>
          )}

          {activeTab === 'finetune' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">LoRA 模型微调</h2>
              <FinetuneManager />
            </div>
          )}

          {activeTab === 'indexes' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">索引管理</h2>
              <p className="text-sm text-gray-500">索引管理功能开发中...</p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">系统设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API 地址
                  </label>
                  <input
                    type="text"
                    defaultValue="http://localhost:8000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    检索文档数量
                  </label>
                  <input
                    type="number"
                    defaultValue="4"
                    min="1"
                    max="10"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
