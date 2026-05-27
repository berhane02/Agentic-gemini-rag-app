'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CircleAlert, X } from 'lucide-react';
import { useEffect } from 'react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: 'red' | 'blue' | 'green';
}

export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmColor = 'red',
}: ConfirmDialogProps) {
    // Prevent body scroll when dialog is open
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

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const confirmColorClasses = {
        red: 'bg-gradient-to-r from-red-500 via-red-600 to-red-500 hover:from-red-600 hover:via-red-700 hover:to-red-600 shadow-red-500/30 hover:shadow-red-500/50',
        blue: 'bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 hover:from-blue-600 hover:via-blue-700 hover:to-blue-600 shadow-blue-500/30 hover:shadow-blue-500/50',
        green: 'bg-gradient-to-r from-green-500 via-green-600 to-green-500 hover:from-green-600 hover:via-green-700 hover:to-green-600 shadow-green-500/30 hover:shadow-green-500/50',
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
                        className="confirm-dialog-backdrop fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Dialog */}
                    <div className="confirm-dialog-container fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20, rotateX: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20, rotateX: 10 }}
                            transition={{ 
                                duration: 0.3, 
                                ease: [0.16, 1, 0.3, 1],
                                type: "spring",
                                stiffness: 300,
                                damping: 30
                            }}
                            className="confirm-dialog-content relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full p-6 pointer-events-auto backdrop-blur-xl bg-white/95 dark:bg-gray-900/95"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Animated border glow */}
                            <motion.div
                                className="confirm-dialog-border-glow absolute inset-0 rounded-2xl bg-gradient-to-r from-red-500/20 via-red-600/30 to-red-500/20 opacity-0"
                                animate={{ opacity: [0, 0.5, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                            {/* Close button */}
                            <motion.button
                                onClick={onClose}
                                whileHover={{ scale: 1.1, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
                                className="confirm-dialog-close-button absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </motion.button>

                            {/* Icon */}
                            <motion.div 
                                className="confirm-dialog-icon-container flex justify-center mb-4"
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                            >
                                <div className="confirm-dialog-icon-wrapper relative">
                                    <motion.div 
                                        className="confirm-dialog-icon-glow absolute inset-0 bg-red-500/20 rounded-full blur-xl"
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    />
                                    <div className="confirm-dialog-icon-circle relative bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/40 dark:to-red-900/30 p-4 rounded-full border-2 border-red-200 dark:border-red-800">
                                        <CircleAlert className="w-8 h-8 text-red-600 dark:text-red-400" strokeWidth={1.5} />
                                    </div>
                                </div>
                            </motion.div>

                            {/* Title */}
                            <motion.h3 
                                className="confirm-dialog-title text-xl font-bold text-gray-900 dark:text-white text-center mb-2"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                            >
                                {title}
                            </motion.h3>

                            {/* Message */}
                            <div className="confirm-dialog-message-container bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4 mb-6">
                                <p className="confirm-dialog-message-text text-gray-700 dark:text-gray-300 text-center text-sm leading-relaxed">
                                    {message}
                                </p>
                            </div>

                            {/* Actions */}
                            <motion.div 
                                className="confirm-dialog-actions flex gap-3"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                <motion.button
                                    onClick={onClose}
                                    whileHover={{ scale: 1.02, x: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="confirm-dialog-cancel-button flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                >
                                    {cancelText}
                                </motion.button>
                                <motion.button
                                    onClick={() => {
                                        onConfirm();
                                        onClose();
                                    }}
                                    whileHover={{ scale: 1.02, x: 2 }}
                                    whileTap={{ scale: 0.98 }}
                                    className={`confirm-dialog-confirm-button group relative flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl overflow-hidden ${confirmColorClasses[confirmColor]}`}
                                >
                                    <div className="confirm-dialog-confirm-button-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                    <span className="confirm-dialog-confirm-button-text relative z-10 flex items-center justify-center gap-2">
                                        {confirmText}
                                        <CircleAlert className="w-4 h-4 opacity-80" strokeWidth={1.5} />
                                    </span>
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}

