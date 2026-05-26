'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { CircleUser, Sparkles, PenLine } from 'lucide-react';
import { useUserContext } from '@/contexts/UserContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface Message {
    role: 'user' | 'model';
    content: string;
}

interface MessageBubbleProps {
    message: Message;
    messageIndex: number;
    onEdit?: (index: number, content: string) => void;
}

export default function MessageBubble({ message, messageIndex, onEdit }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const { user } = useUserContext();

    return (
        <div className={cn("message-bubble group flex w-full items-start gap-4 px-2 sm:px-4 md:px-6 lg:px-8 py-6 relative", !isUser && "bg-transparent", isUser ? "message-bubble-user" : "message-bubble-gemini")}>
            <div className={cn(
                "message-avatar flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border shadow-sm overflow-hidden",
                isUser
                    ? "message-avatar-user bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                    : "message-avatar-gemini bg-gradient-to-tr from-blue-500 to-cyan-400 text-white border-transparent ring-2 ring-cyan-400/30 shadow-lg shadow-blue-500/20"
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
                        <CircleUser size={18} className="flex-shrink-0" strokeWidth={1.5} />
                    )
                ) : (
                    <Sparkles size={18} className="flex-shrink-0" strokeWidth={1.5} />
                )}
            </div>
            <div className="message-content flex-1 space-y-2 overflow-hidden relative">
                {isUser && onEdit && (
                    <div className="message-edit-button-container absolute top-0 right-0 z-10">
                        <motion.button
                            initial={{ opacity: 0.5, scale: 0.9 }}
                            animate={{ opacity: 0.7 }}
                            whileHover={{ scale: 1.1, opacity: 1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (onEdit) {
                                    onEdit(messageIndex, message.content);
                                }
                            }}
                            className="message-edit-button p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition-all cursor-pointer shadow-sm hover:shadow-md"
                            title="Edit message"
                            aria-label="Edit message"
                        >
                            <PenLine size={16} strokeWidth={1.5} />
                        </motion.button>
                    </div>
                )}
                <div className="message-text prose prose-slate dark:prose-invert max-w-none break-words leading-7">
                    <ReactMarkdown
                        components={{
                            pre: ({ node, ...props }) => (
                                <div className="message-code-block-container relative my-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                                    <div className="message-code-block-header flex items-center justify-between bg-gray-100 px-4 py-2 dark:bg-gray-800/50">
                                        <span className="message-code-block-label text-xs font-medium text-gray-500 dark:text-gray-400">Code</span>
                                    </div>
                                    <div className="message-code-block-content overflow-x-auto p-4">
                                        <pre {...props} className="message-code-block-pre bg-transparent p-0 m-0" />
                                    </div>
                                </div>
                            ),
                            code: ({ node, ...props }) => {
                                const isBlock = node?.position?.start.line !== node?.position?.end.line;
                                return (
                                    <code
                                        className={cn(
                                            "message-code-inline rounded px-1.5 py-0.5 font-mono text-sm",
                                            isBlock
                                                ? "bg-transparent"
                                                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                        )}
                                        {...props}
                                    />
                                )
                            }
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
