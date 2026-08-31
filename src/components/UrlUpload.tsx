'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, Loader2, CircleCheckBig, X, Link2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger';

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_INGESTS_PER_WINDOW = 5;
const RATE_LIMIT_STORAGE_KEY = 'url_ingest_timestamps';

type Status = 'idle' | 'fetching' | 'processing' | 'ready' | 'error';

interface UrlUploadProps {
    showText?: boolean;
}

export default function UrlUpload({ showText = false }: UrlUploadProps = {}) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [pageTitle, setPageTitle] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close popover on outside click
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const checkRateLimit = (): { allowed: boolean; timeUntilNext: number | null } => {
        if (typeof window === 'undefined') return { allowed: true, timeUntilNext: null };
        try {
            const timestampsStr = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
            const now = Date.now();
            if (!timestampsStr) return { allowed: true, timeUntilNext: null };

            const timestamps: number[] = JSON.parse(timestampsStr);
            const recentTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

            if (recentTimestamps.length >= MAX_INGESTS_PER_WINDOW) {
                const oldestTimestamp = Math.min(...recentTimestamps);
                return { allowed: false, timeUntilNext: RATE_LIMIT_WINDOW - (now - oldestTimestamp) };
            }
            return { allowed: true, timeUntilNext: null };
        } catch (error) {
            logger.error('Error checking URL ingest rate limit', error);
            return { allowed: true, timeUntilNext: null };
        }
    };

    const recordIngest = () => {
        if (typeof window === 'undefined') return;
        try {
            const timestampsStr = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
            const timestamps: number[] = timestampsStr ? JSON.parse(timestampsStr) : [];
            const now = Date.now();
            timestamps.push(now);
            const recentTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW * 2);
            localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recentTimestamps));
        } catch (error) {
            logger.error('Error recording URL ingest', error);
        }
    };

    // Poll processing status by fileName, same endpoint FileUpload uses.
    const checkProcessingStatus = useCallback(async (name: string) => {
        try {
            const response = await fetch('/api/upload/status');
            if (!response.ok) return false;
            const data = await response.json();
            const currentFile = data.files?.find((f: any) => f.fileName === name);

            if (currentFile) {
                if (currentFile.status === 'ready') {
                    setStatus('ready');
                    return true;
                } else if (currentFile.status === 'error') {
                    setStatus('error');
                    setErrorMessage(currentFile.errorMessage || 'Processing failed');
                    return true;
                } else {
                    setStatus('processing');
                    return false;
                }
            }
            return false;
        } catch (error) {
            logger.error('Error checking URL ingest status', error);
            return false;
        }
    }, []);

    useEffect(() => {
        if (status !== 'processing' && status !== 'fetching') return;
        if (!fileName || status === 'fetching') return;

        let pollCount = 0;
        const maxPolls = 40; // 2 minutes
        const pollTimer = setInterval(async () => {
            pollCount++;
            const shouldStop = await checkProcessingStatus(fileName);
            if (shouldStop || pollCount >= maxPolls) {
                clearInterval(pollTimer);
                if (pollCount >= maxPolls) {
                    setStatus('error');
                    setErrorMessage('Processing timeout. Please try again.');
                }
            }
        }, 3000);

        return () => clearInterval(pollTimer);
    }, [status, fileName, checkProcessingStatus]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedUrl = url.trim();
        if (!trimmedUrl || status === 'fetching' || status === 'processing') return;

        const rateLimitCheck = checkRateLimit();
        if (!rateLimitCheck.allowed) {
            const secondsRemaining = Math.ceil((rateLimitCheck.timeUntilNext || 0) / 1000);
            setErrorMessage(`Rate limit exceeded. Please wait ${secondsRemaining}s before adding another website.`);
            setStatus('error');
            return;
        }

        setStatus('fetching');
        setErrorMessage(null);
        setPageTitle(null);
        setFileName(null);

        try {
            const response = await fetch('/api/upload/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: trimmedUrl }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `Request failed: ${response.status}`);
            }

            setPageTitle(data.title || null);
            setFileName(data.fileName || null);
            recordIngest();
            setStatus(data.processingStatus === 'ready' ? 'ready' : 'processing');
        } catch (error) {
            logger.error('Error ingesting URL', error);
            setErrorMessage(error instanceof Error ? error.message : 'Failed to add website');
            setStatus('error');
        }
    };

    const reset = () => {
        setUrl('');
        setStatus('idle');
        setErrorMessage(null);
        setFileName(null);
        setPageTitle(null);
    };

    const isBusy = status === 'fetching' || status === 'processing';
    const isReady = status === 'ready';

    return (
        <div className="url-upload-component relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={clsx(
                    'relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden group flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95',
                    showText ? 'px-2 md:px-2.5 lg:px-3 py-1 md:py-1.5' : 'p-1.5',
                    isReady
                        ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-md shadow-green-500/30'
                        : isBusy
                            ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-md shadow-indigo-500/30'
                            : 'bg-gray-100/80 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-200/80 dark:hover:bg-gray-700/60'
                )}
                title="Add website to knowledge base"
            >
                {(isReady || isBusy) && (
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                )}
                {isBusy ? (
                    <Loader2 className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-white animate-spin" />
                ) : isReady ? (
                    <CircleCheckBig className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-white" strokeWidth={1.75} />
                ) : (
                    <Globe className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                )}
                {showText && (
                    <span
                        className={clsx(
                            'relative text-xs md:text-sm font-bold transition-colors whitespace-nowrap',
                            isBusy || isReady ? 'text-white' : 'text-gray-700 dark:text-gray-300'
                        )}
                    >
                        {status === 'fetching'
                            ? 'Fetching...'
                            : status === 'processing'
                                ? 'Processing...'
                                : status === 'ready'
                                    ? 'Ready'
                                    : 'Add Website'}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="url-upload-popover absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-3 z-50"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                <Link2 className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.75} />
                                Add a website
                            </span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {status === 'ready' ? (
                            <div className="p-2.5 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                    <CircleCheckBig className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" strokeWidth={1.75} />
                                    <span className="text-xs font-semibold text-green-700 dark:text-green-300 truncate">
                                        {pageTitle || 'Added'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-green-600 dark:text-green-400 mb-2">
                                    Ready — ask questions about it in chat.
                                </p>
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="w-full text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    Add another
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <input
                                    ref={inputRef}
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://example.com/article"
                                    disabled={isBusy}
                                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
                                />

                                {status === 'processing' && (
                                    <div className="mt-2 p-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 rounded-lg flex items-center gap-2">
                                        <Loader2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                                        <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                                            Indexing page content...
                                        </span>
                                    </div>
                                )}

                                {errorMessage && (
                                    <p className="mt-2 text-[11px] text-red-600 dark:text-red-400 font-medium">
                                        {errorMessage}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isBusy || !url.trim()}
                                    className="mt-2 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 text-white py-2 px-3 rounded-lg hover:from-blue-500 hover:via-indigo-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 text-xs font-semibold shadow-lg shadow-indigo-500/30"
                                >
                                    {status === 'fetching' ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Fetching page...
                                        </>
                                    ) : (
                                        <>
                                            <Globe className="h-3.5 w-3.5" />
                                            Summarize & Add
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
