'use client';

import React from 'react';
import { User, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message } from '@/types';
import SourceReference from './SourceReference';

interface ChatMessageProps {
  message: Message;
  className?: string;
}

export default function ChatMessage({ message, className }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full mb-4',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'flex max-w-3xl',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <div
          className={cn(
            'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
            isUser ? 'bg-primary-500 ml-3' : 'bg-gray-200 mr-3'
          )}
        >
          {isUser ? (
            <User className="h-5 w-5 text-white" />
          ) : (
            <Bot className="h-5 w-5 text-gray-600" />
          )}
        </div>

        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isUser
              ? 'bg-primary-500 text-white rounded-tr-none'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
          )}
        >
          <div className="flex items-center space-x-2 mb-1">
            <span
              className={cn(
                'text-sm font-medium',
                isUser ? 'text-primary-100' : 'text-gray-500'
              )}
            >
              {isUser ? '你' : 'AI 助手'}
            </span>
            {message.isStreaming && (
              <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
            )}
          </div>
          
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-5 bg-gray-400 ml-1 animate-pulse" />
            )}
          </div>

          {!isUser && message.sources && message.sources.length > 0 && (
            <SourceReference sources={message.sources} />
          )}
        </div>
      </div>
    </div>
  );
}
