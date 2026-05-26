'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    initialValue?: string;
    editing?: boolean;
    onCancelEdit?: () => void;
}

export default function ChatInput({
    onSend,
    disabled,
    initialValue = '',
    editing = false,
    onCancelEdit
}: ChatInputProps) {
    const [input, setInput] = useState(initialValue);
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing && initialValue && input !== initialValue) {
            setInput(initialValue);

            const timeoutId = setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    const length = initialValue.length;
                    textareaRef.current.setSelectionRange(length, length);
                }
            }, 200);

            return () => clearTimeout(timeoutId);
        } else if (!editing && !initialValue && input) {
            setInput('');
        }
    }, [editing, initialValue]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (input.trim() && !disabled) {
            onSend(input);
            setInput('');
            onCancelEdit?.();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Auto-grow vertically with responsive max height
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const maxHeight = window.innerWidth >= 768 ? 200 : 150; // Larger max height on desktop
            const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
            textareaRef.current.style.height = `${Math.max(newHeight, 40)}px`; // Min 40px
        }
    }, [input]);

    const hasInput = input.trim().length > 0;
    const isButtonEnabled = hasInput && !disabled;

    return (
        <form onSubmit={handleSubmit} className="chat-input-form relative w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mx-auto px-2 sm:px-3 md:px-4 py-2">

            <motion.div
                initial={false}
                animate={{
                    scale: isFocused ? 1.02 : 1,
                    boxShadow: isFocused
                        ? '0 20px 60px -15px rgba(59,130,246,0.4)'
                        : '0 8px 30px -10px rgba(59,130,246,0.2)'
                }}
                transition={{ duration: 0.3 }}
                className="chat-input-motion-wrapper relative group w-full"
            >
                <div
                    className={`
                        chat-input-wrapper relative flex items-end gap-1.5 sm:gap-2 rounded-xl border-2 w-full
                        bg-gradient-to-br from-blue-50/80 via-white to-blue-50/50
                        dark:from-blue-950/20 dark:via-gray-900 dark:to-blue-950/10
                        p-2 sm:p-2.5 md:p-3 shadow-xl transition-all duration-300 overflow-hidden
                        ${isFocused
                            ? 'border-blue-500 dark:border-blue-500 shadow-blue-500/30 scale-[1.02]'
                            : 'border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-blue-500/15'
                        }
                    `}
                >
                    {/* Hover background shimmer */}
                    <div className="chat-input-shimmer-effect absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    
                    {/* Focus glow */}
                    {isFocused && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="chat-input-focus-glow absolute inset-0 bg-blue-500/5 rounded-xl"
                        />
                    )}
                    
                    {/* TEXTAREA: fixed horizontal expansion */}
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="Message Gemini..."
                        rows={1}
                        disabled={disabled}
                        className="chat-input-textarea
                            flex-1 min-w-0 z-10 resize-none border-0 bg-transparent
                            px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5
                            text-xs sm:text-sm md:text-base outline-none focus:ring-0
                            disabled:opacity-50 overflow-hidden
                            text-gray-900 dark:text-gray-100
                            placeholder:text-blue-400/70 dark:placeholder:text-blue-400/60
                            font-medium
                        "
                        style={{ minHeight: '40px', height: '40px' }}
                    />
                    
                    {/* CANCEL EDIT BUTTON */}
                    <AnimatePresence>
                        {editing && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                onClick={() => {
                                    setInput('');
                                    onCancelEdit?.();
                                }}
                                className="chat-input-cancel-edit-button
                                    relative mb-0.5 h-8 w-8 sm:h-9 sm:w-9 shrink-0 flex items-center justify-center
                                    rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400
                                    hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-300
                                "
                            >
                                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* SEND BUTTON */}
                    <motion.button
                        type="submit"
                        disabled={!isButtonEnabled}
                        whileHover={isButtonEnabled ? { scale: 1.08 } : {}}
                        whileTap={isButtonEnabled ? { scale: 0.92 } : {}}
                        className={`
                            chat-input-send-button relative mb-0.5 flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center 
                            rounded-lg transition-all duration-300 overflow-hidden
                            ${isButtonEnabled
                                ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 cursor-pointer'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                            }
                        `}
                    >
                        {isButtonEnabled && (
                            <>
                                <div className="chat-input-send-button-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                <div className="chat-input-send-button-highlight absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                            </>
                        )}

                        <motion.div
                            animate={isButtonEnabled ? { rotate: [0, -10, 10, -10, 0] } : {}}
                            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                            className="chat-input-send-button-icon-wrapper relative z-10"
                        >
                            {isButtonEnabled ? (
                                <Sparkles className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={1.5} />
                            ) : (
                                <SendHorizontal className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={1.5} />
                            )}
                        </motion.div>
                    </motion.button>

                </div>
            </motion.div>
            
            {/* EDIT NOTE */}
            <AnimatePresence>
                {editing && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="chat-input-edit-note mt-2 text-center"
                    >
                        <p className="chat-input-edit-note-text text-xs text-blue-600 dark:text-blue-400 font-semibold">
                            Editing message...
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* DISCLAIMER */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="chat-input-disclaimer mt-3 text-center"
            >
                <p className="chat-input-disclaimer-text text-xs text-blue-500/80 dark:text-blue-400/70 font-medium">
                    Gemini can make mistakes. Check important info.
                </p>
            </motion.div>
        </form>
    );
}