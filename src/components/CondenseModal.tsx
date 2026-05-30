'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Copy, Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

interface CondenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: string | null;
    isLoading: boolean;
    error: string | null;
    onRegenerate?: () => void;
}

export default function CondenseModal({
    isOpen,
    onClose,
    summary,
    isLoading,
    error,
    onRegenerate,
}: CondenseModalProps) {
    // Track which summary text was copied so the indicator clears automatically
    // when the summary changes (e.g. after regenerating) without a setState effect.
    const [copiedSummary, setCopiedSummary] = useState<string | null>(null);
    const copied = copiedSummary !== null && copiedSummary === summary;

    // Prevent body scroll while open.
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Close on escape.
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleCopy = async () => {
        if (!summary) return;
        try {
            await navigator.clipboard.writeText(summary);
            setCopiedSummary(summary);
            setTimeout(() => setCopiedSummary(null), 2000);
        } catch {
            // Clipboard may be unavailable (e.g. insecure context); ignore silently.
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="condense-modal-backdrop fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Dialog */}
                    <div className="condense-modal-container fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{
                                duration: 0.3,
                                ease: [0.16, 1, 0.3, 1],
                                type: 'spring',
                                stiffness: 300,
                                damping: 30,
                            }}
                            className="condense-modal-content relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-lg w-full p-6 pointer-events-auto backdrop-blur-xl bg-white/95 dark:bg-gray-900/95"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close button */}
                            <motion.button
                                onClick={onClose}
                                whileHover={{ scale: 1.1, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
                                className="condense-modal-close-button absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </motion.button>

                            {/* Header */}
                            <div className="condense-modal-header flex items-center gap-3 mb-4 pr-8">
                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30 shrink-0">
                                    <Sparkles className="w-5 h-5 text-white" strokeWidth={1.75} />
                                </div>
                                <div>
                                    <h3 className="condense-modal-title text-lg font-bold text-gray-900 dark:text-white">
                                        Conversation Summary
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Used as context for your next questions
                                    </p>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="condense-modal-body min-h-[8rem]">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-500 dark:text-gray-400">
                                        <RefreshCw className="w-6 h-6 animate-spin text-purple-500" strokeWidth={1.75} />
                                        <span className="text-sm">Condensing your conversation…</span>
                                    </div>
                                ) : error ? (
                                    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                                        <TriangleAlert className="w-7 h-7 text-red-500" strokeWidth={1.5} />
                                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                    </div>
                                ) : (
                                    <div className="condense-modal-summary modern-scrollbar max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                                            {summary}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {!isLoading && (
                                <div className="condense-modal-actions flex gap-3 mt-6">
                                    {error ? (
                                        onRegenerate && (
                                            <motion.button
                                                onClick={onRegenerate}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 transition-all duration-200 shadow-lg flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
                                                Try again
                                            </motion.button>
                                        )
                                    ) : (
                                        <>
                                            <motion.button
                                                onClick={handleCopy}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2"
                                            >
                                                {copied ? (
                                                    <>
                                                        <Check className="w-4 h-4 text-green-500" strokeWidth={1.75} />
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="w-4 h-4" strokeWidth={1.75} />
                                                        Copy
                                                    </>
                                                )}
                                            </motion.button>
                                            <motion.button
                                                onClick={onClose}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 transition-all duration-200 shadow-lg"
                                            >
                                                Done
                                            </motion.button>
                                        </>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
