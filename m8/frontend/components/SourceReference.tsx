'use client';

import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Source } from '@/types';
import { cn } from '@/lib/utils';

interface SourceReferenceProps {
  sources: Source[];
  className?: string;
}

export default function SourceReference({ sources, className }: SourceReferenceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className={cn('mt-3', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-2 text-sm text-gray-600 hover:text-primary-600 transition-colors"
      >
        <BookOpen className="h-4 w-4" />
        <span>引用来源 ({sources.length})</span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {sources.map((source, index) => (
            <div
              key={source.id || index}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200 source-highlight"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-6 h-6 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                    {source.id}
                  </span>
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {source.file_name}
                  </span>
                </div>
                {source.page !== null && source.page !== undefined && (
                  <span className="text-xs text-gray-500">
                    页码: {source.page}
                  </span>
                )}
              </div>
              <div className="pl-8">
                <p className="text-sm text-gray-600 leading-relaxed">
                  {source.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
