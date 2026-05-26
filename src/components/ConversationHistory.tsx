'use client';

import React, { useRef, useEffect } from 'react';
import { CircleUser, Sparkles, MessagesSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserContext } from '@/contexts/UserContext';
import { clsx } from 'clsx';

interface Message {
    role: 'user' | 'model';
    content: string;
}

interface ConversationHistoryProps {
    messages: Message[];
    onMessageClick?: (index: number) => void;
    selectedIndex?: number | null;
}

export default function ConversationHistory({ messages, onMessageClick, selectedIndex }: ConversationHistoryProps) {
    const historyEndRef = useRef<HTMLDivElement>(null);
    const { user } = useUserContext();

    // Auto-scroll to bottom when new messages are added
    useEffect(() => {
        historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const formatMessagePreview = (content: string, maxLength: number = 60): string => {
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength).trim() + '...';
    };

    return (
        <div className="conversation-history-container flex flex-col h-full bg-gray-50 dark:bg-gray-900">
            {/* History Header */}
            <div className="conversation-history-header p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <div className="conversation-history-header-content flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/25">
                        <MessagesSquare className="conversation-history-header-icon h-4 w-4 text-white" strokeWidth={1.5} />
                    </div>
                    <h2 className="conversation-history-header-title text-lg font-semibold text-gray-900 dark:text-white">Conversation History</h2>
                </div>
                <p className="conversation-history-header-count text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                </p>
            </div>

            {/* Vertical Scrollable History List */}
            <div className="conversation-history-list modern-scrollbar flex-1 overflow-y-auto scroll-smooth">
                <div className="conversation-history-list-content p-2 space-y-1">
                    {messages.map((message, index) => {
                        const isUser = message.role === 'user';
                        const isSelected = selectedIndex === index;
                        
                        return (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: index * 0.02 }}
                                onClick={() => onMessageClick?.(index)}
                                className={clsx(
                                    'conversation-history-item group relative p-3 rounded-lg cursor-pointer transition-all duration-200',
                                    'hover:bg-gray-100 dark:hover:bg-gray-800',
                                    isSelected 
                                        ? 'conversation-history-item-selected bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500 dark:border-blue-500 shadow-sm' 
                                        : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                )}
                            >
                                {/* Message Type Indicator */}
                                <div className="conversation-history-item-content flex items-start gap-2.5">
                                    {/* Avatar/Icon */}
                                    <div className={clsx(
                                        'conversation-history-item-avatar flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm overflow-hidden mt-0.5',
                                        isUser
                                            ? 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                                            : 'bg-gradient-to-tr from-blue-500 to-cyan-500 text-white border-transparent'
                                    )}>
                                        {isUser ? (
                                            user?.picture ? (
                                                <img
                                                    src={user.picture}
                                                    alt={user.name || 'User'}
                                                    className="h-full w-full object-cover object-center"
                                                    style={{ objectPosition: 'center center' }}
                                                />
                                            ) : (
                                                <CircleUser size={14} className="flex-shrink-0" strokeWidth={1.5} />
                                            )
                                        ) : (
                                            <Sparkles size={14} className="flex-shrink-0" strokeWidth={1.5} />
                                        )}
                                    </div>

                                    {/* Message Content */}
                                    <div className="conversation-history-item-message-content flex-1 min-w-0">
                                        {/* Role Label */}
                                        <div className="conversation-history-item-role-label flex items-center gap-1.5 mb-1">
                                            <span className={clsx(
                                                'conversation-history-item-role-text text-xs font-semibold',
                                                isUser 
                                                    ? 'text-gray-700 dark:text-gray-300' 
                                                    : 'text-blue-600 dark:text-blue-400'
                                            )}>
                                                {isUser ? 'You' : 'Assistant'}
                                            </span>
                                            {isUser && (
                                                <div className="conversation-history-item-online-indicator h-1.5 w-1.5 rounded-full bg-green-500" />
                                            )}
                                        </div>
                                        
                                        {/* Message Preview */}
                                        <p className={clsx(
                                            'conversation-history-item-preview text-xs leading-relaxed break-words',
                                            isSelected
                                                ? 'text-gray-900 dark:text-gray-100'
                                                : 'text-gray-600 dark:text-gray-400'
                                        )}>
                                            {formatMessagePreview(message.content)}
                                        </p>
                                    </div>
                                </div>

                                {/* Selection Indicator */}
                                {isSelected && (
                                    <div className="conversation-history-item-selection-indicator absolute left-0 top-0 bottom-0 w-1 bg-blue-500 dark:bg-blue-400 rounded-r-full" />
                                )}
                            </motion.div>
                        );
                    })}
                    <div ref={historyEndRef} className="conversation-history-list-end" />
                </div>
            </div>
        </div>
    );
}

