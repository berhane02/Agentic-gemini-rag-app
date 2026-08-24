'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, Loader2, CircleCheckBig, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_UPLOADS_PER_WINDOW = 5; // Max 5 uploads per minute
const RATE_LIMIT_STORAGE_KEY = 'file_upload_timestamps';

interface FileUploadProps {
    compact?: boolean; // Icon-only mode for mobile navbar
    showText?: boolean; // Show text label (e.g., "Upload Doc")
}

export default function FileUpload({ compact = false, showText = false }: FileUploadProps = {}) {
    const [uploading, setUploading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [processingStatus, setProcessingStatus] = useState<'uploading' | 'processing' | 'ready' | 'error' | null>(null);

    // Check rate limit
    const checkRateLimit = (): { allowed: boolean; timeUntilNext: number | null } => {
        if (typeof window === 'undefined') return { allowed: true, timeUntilNext: null };

        try {
            const timestampsStr = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
            const now = Date.now();

            if (!timestampsStr) {
                return { allowed: true, timeUntilNext: null };
            }

            const timestamps: number[] = JSON.parse(timestampsStr);
            // Filter out timestamps older than the rate limit window
            const recentTimestamps = timestamps.filter(
                timestamp => now - timestamp < RATE_LIMIT_WINDOW
            );

            if (recentTimestamps.length >= MAX_UPLOADS_PER_WINDOW) {
                const oldestTimestamp = Math.min(...recentTimestamps);
                const timeUntilNext = RATE_LIMIT_WINDOW - (now - oldestTimestamp);
                return { allowed: false, timeUntilNext };
            }

            return { allowed: true, timeUntilNext: null };
        } catch (error) {
            logger.error('Error checking rate limit', error);
            return { allowed: true, timeUntilNext: null };
        }
    };

    // Record upload timestamp
    const recordUpload = () => {
        if (typeof window === 'undefined') return;

        try {
            const timestampsStr = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
            const timestamps: number[] = timestampsStr ? JSON.parse(timestampsStr) : [];
            const now = Date.now();

            // Add current timestamp
            timestamps.push(now);

            // Keep only recent timestamps (within the window)
            const recentTimestamps = timestamps.filter(
                timestamp => now - timestamp < RATE_LIMIT_WINDOW * 2 // Keep a bit more for safety
            );

            localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recentTimestamps));
        } catch (error) {
            logger.error('Error recording upload', error);
        }
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const selectedFile = acceptedFiles[0];

            // Check file size immediately
            if (selectedFile.size > MAX_FILE_SIZE) {
                const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
                setErrorMessage(`File size (${fileSizeMB} MB) exceeds the maximum allowed size of 10 MB. Please upload a file less than 10 MB.`);
                setFile(null);
                setUploadSuccess(false);
                setIsDuplicate(false);
                // Clear error after 5 seconds
                setTimeout(() => setErrorMessage(null), 5000);
                return;
            }

            setFile(selectedFile);
            setUploadSuccess(false);
            setIsDuplicate(false);
            setErrorMessage(null);
            setProcessingStatus(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxFiles: 1,
        maxSize: MAX_FILE_SIZE,
        accept: {
            'text/plain': ['.txt', '.md'],
            'application/pdf': ['.pdf'],
        },
        onDropRejected: (fileRejections) => {
            if (fileRejections.length > 0) {
                const rejection = fileRejections[0];
                if (rejection.errors.some(e => e.code === 'file-too-large')) {
                    const fileSizeMB = rejection.file.size ? (rejection.file.size / (1024 * 1024)).toFixed(2) : 'unknown';
                    setErrorMessage(`File size (${fileSizeMB} MB) exceeds the maximum allowed size of 10 MB. Please upload a file less than 10 MB.`);
                    // Clear error after 5 seconds
                    setTimeout(() => setErrorMessage(null), 5000);
                } else {
                    setErrorMessage('File rejected. Please ensure the file is a TXT, MD, or PDF file.');
                    setTimeout(() => setErrorMessage(null), 5000);
                }
            }
        },
    });

    // Poll for processing status
    const checkProcessingStatus = useCallback(async () => {
        if (!file) return true;

        try {
            const response = await fetch('/api/upload/status');
            if (!response.ok) {
                logger.error('Failed to check processing status', new Error(`Status: ${response.status}`));
                return false; // Continue polling on error
            }
            const data = await response.json();

            // Find the status of the current file
            const currentFile = data.files?.find((f: any) => f.fileName === file.name);
            
            if (currentFile) {
                // Update status based on the specific file's status
                if (currentFile.status === 'ready') {
                    setProcessingStatus('ready');
                    return true; // File is ready, stop polling
                } else if (currentFile.status === 'error') {
                    setProcessingStatus('error');
                    setErrorMessage(currentFile.errorMessage || 'File processing failed');
                    return true; // Stop polling on error
                } else if (currentFile.status === 'processing' || currentFile.status === 'uploading') {
                    setProcessingStatus('processing');
                    return false; // Still processing, continue polling
                }
            }

            // Fallback to overall status if file not found
            if (data.allReady) {
                setProcessingStatus('ready');
                return true; // All files ready
            } else if (data.processingCount > 0) {
                setProcessingStatus('processing');
                return false; // Still processing
            } else if (data.errorCount > 0) {
                setProcessingStatus('error');
                setErrorMessage('Some files failed to process');
                return true; // Stop polling on error
            }
            
            return true; // No files, stop polling
        } catch (error) {
            logger.error('Error checking processing status', error);
            return false; // Continue polling on error
        }
    }, [file]);

    // Start polling after successful upload
    useEffect(() => {
        if (!uploadSuccess || !file) return;

        let pollCount = 0;
        const maxPolls = 40; // 2 minutes max (40 * 3 seconds)
        const pollInterval = 3000; // 3 seconds

        const pollTimer = setInterval(async () => {
            pollCount++;

            const shouldStop = await checkProcessingStatus();

            if (shouldStop || pollCount >= maxPolls) {
                clearInterval(pollTimer);
                if (pollCount >= maxPolls && processingStatus === 'processing') {
                    setProcessingStatus('error');
                    setErrorMessage('Processing timeout. Please try again.');
                }
            }
        }, pollInterval);

        // Initial check immediately
        checkProcessingStatus();

        return () => clearInterval(pollTimer);
    }, [uploadSuccess, file, checkProcessingStatus, processingStatus]);


    const handleUpload = async () => {
        if (!file) return;

        // Check file size again (client-side validation)
        if (file.size > MAX_FILE_SIZE) {
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            setErrorMessage(`File size (${fileSizeMB} MB) exceeds the maximum allowed size of 10 MB. Please choose a smaller file.`);
            return;
        }

        // Check rate limit
        const rateLimitCheck = checkRateLimit();
        if (!rateLimitCheck.allowed) {
            const secondsRemaining = Math.ceil((rateLimitCheck.timeUntilNext || 0) / 1000);
            setErrorMessage(`Upload rate limit exceeded. Please wait ${secondsRemaining} second${secondsRemaining !== 1 ? 's' : ''} before uploading again.`);
            return;
        }

        setUploading(true);
        setUploadSuccess(false);
        setErrorMessage(null);
        setProcessingStatus('uploading'); // Set status to uploading when upload starts
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || errorData.details || `Upload failed: ${response.status}`;
                throw new Error(errorMessage);
            }

            const result = await response.json();
            setUploadSuccess(true);
            setIsDuplicate(result.isDuplicate || false);
            setProcessingStatus(result.processingStatus || 'processing');
            // Record successful upload for rate limiting
            recordUpload();
            // Keep file info visible, don't auto-remove
        } catch (error) {
            logger.error('Upload error', error);
            let errorMsg = 'Failed to upload file';

            if (error instanceof Error) {
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                    errorMsg = 'Network error: Unable to connect to the server. Please check your connection and try again.';
                } else if (error.message.includes('Unauthorized')) {
                    errorMsg = 'Authentication error: Please log in again.';
                } else if (error.message.includes('File size')) {
                    errorMsg = error.message;
                } else if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
                    errorMsg = error.message;
                } else {
                    errorMsg = error.message;
                }
            }

            setErrorMessage(errorMsg);
            setProcessingStatus('error');
        } finally {
            setUploading(false);
        }
    };

    const removeFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setFile(null);
        setUploadSuccess(false);
        setIsDuplicate(false);
        setErrorMessage(null);
        setProcessingStatus(null);
    };

    // Auto-upload in compact mode when file is selected
    useEffect(() => {
        if (compact && file && !uploading && !uploadSuccess && !errorMessage) {
            handleUpload();
        }
    }, [compact, file]);

    // Compact icon-only mode for mobile navbar or navbar with text
    if (compact) {
        const isBusy = uploading || processingStatus === 'processing' || uploadSuccess;
        const isReady = processingStatus === 'ready';

        return (
            <div className="file-upload-compact relative">
                <div
                    {...getRootProps()}
                    className={clsx(
                        'relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden group flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95',
                        showText
                            ? 'px-2 md:px-2.5 lg:px-3 py-1 md:py-1.5'
                            : 'p-1.5',
                        isReady
                            ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-md shadow-green-500/30'
                            : isBusy
                                ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-md shadow-indigo-500/30'
                                : isDragActive
                                    ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30'
                                    : 'bg-gray-100/80 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-200/80 dark:hover:bg-gray-700/60'
                    )}
                    title={
                        uploading
                            ? 'Uploading...'
                            : processingStatus === 'processing'
                                ? 'Processing...'
                                : processingStatus === 'ready'
                                    ? 'Ready for query'
                                    : uploadSuccess
                                        ? 'Upload successful'
                                        : 'Upload file'
                    }
                >
                    {/* Glossy highlight overlay on gradient states */}
                    {(isReady || isBusy || isDragActive) && (
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                    )}
                    <input {...getInputProps()} className="file-upload-input" />
                    {uploading ? (
                        <Loader2 className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-white animate-spin" />
                    ) : processingStatus === 'ready' ? (
                        <CircleCheckBig className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-white" strokeWidth={1.75} />
                    ) : processingStatus === 'processing' || uploadSuccess ? (
                        <Loader2 className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-white animate-spin" />
                    ) : (
                        <Upload className="relative h-3.5 w-3.5 md:h-4 md:w-4 text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                    )}
                    {showText && (
                        <span className={clsx(
                            "relative text-xs md:text-sm font-bold transition-colors whitespace-nowrap",
                            isBusy || isReady || isDragActive
                                ? "text-white"
                                : "text-gray-700 dark:text-gray-300"
                        )}>
                            {uploading
                                ? 'Uploading...'
                                : processingStatus === 'processing'
                                    ? 'Processing...'
                                    : processingStatus === 'ready'
                                        ? 'Ready for query'
                                        : uploadSuccess
                                            ? 'Processing...'
                                            : 'Upload Doc'}
                        </span>
                    )}
                </div>
                <AnimatePresence>
                    {errorMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="file-upload-compact-error-message absolute top-full left-0 mt-1 px-2 py-1 bg-red-50/90 dark:bg-red-950/70 backdrop-blur-sm border border-red-300 dark:border-red-800 rounded-md text-[10px] text-red-700 dark:text-red-300 whitespace-nowrap z-50 shadow-lg"
                        >
                            {errorMessage}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="file-upload-component w-full max-w-[288px] mx-auto mb-3">
            {/* Error message displayed above dropzone when no file selected */}
            {errorMessage && !file && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="file-upload-error-message mb-3 p-3 bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-800 rounded-lg shadow-sm"
                >
                    <p className="file-upload-error-text text-xs sm:text-sm text-red-700 dark:text-red-300 font-semibold text-center">
                        {errorMessage}
                    </p>
                </motion.div>
            )}
            <AnimatePresence mode="wait">
                {!file ? (
                    <motion.div
                        key="dropzone"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="file-upload-dropzone-wrapper"
                    >
                        <div
                            {...getRootProps()}
                            className={clsx(
                                'file-upload-dropzone relative border-2 border-dashed rounded-xl p-1 sm:p-1.5 text-center cursor-pointer transition-all duration-300 overflow-hidden group backdrop-blur-sm',
                                isDragActive
                                    ? 'border-indigo-500 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/20 scale-105 shadow-lg shadow-indigo-500/20'
                                    : 'border-indigo-300/70 dark:border-indigo-700/70 hover:border-indigo-400 dark:hover:border-indigo-600 bg-gradient-to-br from-blue-50/50 via-white to-purple-50/30 dark:from-blue-950/10 dark:via-gray-900 dark:to-purple-950/10 hover:shadow-lg hover:shadow-indigo-500/10'
                            )}
                        >
                            {/* Animated background gradient */}
                            <div className="file-upload-dropzone-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

                            <input {...getInputProps()} className="file-upload-input" />
                            <motion.div
                                animate={isDragActive ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                                transition={{ duration: 0.2 }}
                                className="file-upload-content relative z-10"
                            >
                                <div className="file-upload-icon-wrapper relative inline-block mb-0.5">
                                    <div className="file-upload-icon-glow absolute inset-0 bg-indigo-500/20 rounded-full blur-lg" />
                                    <Upload className="file-upload-icon relative mx-auto h-3 w-3 sm:h-4 sm:w-4 text-indigo-500 dark:text-indigo-400" strokeWidth={1.75} />
                                </div>
                                <p className="file-upload-instruction text-[8px] sm:text-[9px] font-medium text-gray-700 dark:text-gray-300 mb-0 leading-tight">
                                    {isDragActive ? (
                                        <span className="file-upload-drag-active-text text-indigo-600 dark:text-indigo-400 font-semibold">Drop here...</span>
                                    ) : (
                                        'Drag & drop or click'
                                    )}
                                </p>
                                <p className="file-upload-file-types text-[8px] sm:text-[9px] text-indigo-500 dark:text-indigo-400 font-medium">
                                    TXT, MD, PDF (max 10MB)
                                </p>
                            </motion.div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="file-preview"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className="file-preview-container relative"
                    >
                        {uploadSuccess ? (
                            // Success state: Show file info on the right
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`file-upload-success-container flex items-center justify-between bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border rounded-xl p-2 sm:p-2.5 shadow-md ${isDuplicate
                                    ? 'border-yellow-500/50 dark:border-yellow-500/30 bg-yellow-50/30 dark:bg-yellow-950/10'
                                    : 'border-green-500/50 dark:border-green-500/30 bg-green-50/30 dark:bg-green-950/10'
                                    }`}
                            >
                                <div className="file-upload-success-status flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.1, type: "spring" }}
                                        className={`file-upload-success-icon relative p-1 sm:p-1.5 rounded-lg shadow-sm overflow-hidden ${isDuplicate
                                            ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                                            : 'bg-gradient-to-br from-green-500 to-emerald-500'
                                            }`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent" />
                                        <CircleCheckBig className="relative h-3 w-3 sm:h-4 sm:w-4 text-white" strokeWidth={1.75} />
                                    </motion.div>
                                    <span className={`file-upload-success-text text-[10px] sm:text-xs font-medium ${isDuplicate
                                        ? 'text-yellow-600 dark:text-yellow-400'
                                        : 'text-green-600 dark:text-green-400'
                                        }`}>
                                        {isDuplicate ? 'Exists' : 'Done'}
                                    </span>
                                </div>
                                <div className="file-upload-success-file-info flex items-center gap-2 sm:gap-3 ml-2 sm:ml-4">
                                    <div className="file-upload-file-details text-right">
                                        <p className="file-upload-file-name text-[10px] sm:text-xs font-semibold text-gray-900 dark:text-white truncate max-w-[100px] sm:max-w-[150px]">
                                            {file.name}
                                        </p>
                                        <p className="file-upload-file-size text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={removeFile}
                                        className="file-upload-remove-button p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                    >
                                        <X size={16} />
                                    </motion.button>
                                </div>
                            </motion.div>
                        ) : (
                            // Upload state: Show upload button
                            <div className={clsx(
                                "file-upload-pending-container bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border rounded-xl p-2 sm:p-2.5 shadow-lg transition-all duration-300",
                                processingStatus === 'processing' ? "border-indigo-500 dark:border-indigo-600" : "border-indigo-200/70 dark:border-indigo-800/70"
                            )}>
                                {/* Show processing status if file is being processed */}
                                {(processingStatus === 'processing' || (uploadSuccess && processingStatus !== 'ready')) && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="file-processing-status mb-2 p-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 rounded-lg flex items-center gap-2"
                                    >
                                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                                        <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">Processing document...</span>
                                    </motion.div>
                                )}
                                <div className="file-upload-pending-header flex items-center justify-between mb-2">
                                    <div className="file-upload-pending-file-info flex items-center gap-1.5 sm:gap-2 overflow-hidden flex-1">
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.1, type: "spring" }}
                                            className="file-upload-pending-icon relative p-1.5 sm:p-2 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-lg shadow-md shadow-indigo-500/30 overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent" />
                                            <FileText className="relative h-3 w-3 sm:h-4 sm:w-4 text-white" strokeWidth={1.75} />
                                        </motion.div>
                                        <div className="file-upload-pending-details min-w-0 flex-1">
                                            <p className="file-upload-pending-file-name text-[10px] sm:text-xs font-semibold text-gray-900 dark:text-white truncate">
                                                {file.name}
                                            </p>
                                            <p className="file-upload-pending-file-size text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={removeFile}
                                        className="file-upload-pending-remove-button p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        disabled={uploading}
                                    >
                                        <X size={16} />
                                    </motion.button>
                                </div>

                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="file-upload-submit-button w-full relative overflow-hidden group flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 text-white py-2 px-3 rounded-lg hover:from-blue-500 hover:via-indigo-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 text-xs font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <div className="file-upload-submit-button-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                    {uploading ? (
                                        <>
                                            <Loader2 className="file-upload-submit-loading-icon h-4 w-4 animate-spin relative z-10" />
                                            <span className="file-upload-submit-loading-text relative z-10">Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="file-upload-submit-icon h-4 w-4 relative z-10" />
                                            <span className="file-upload-submit-text relative z-10">Upload to Knowledge Base</span>
                                        </>
                                    )}
                                </motion.button>

                                {/* Error message */}
                                {errorMessage && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="file-upload-pending-error mt-2 p-2.5 bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-800 rounded-lg shadow-sm"
                                    >
                                        <p className="file-upload-pending-error-text text-xs text-red-700 dark:text-red-300 font-semibold text-center">
                                            {errorMessage}
                                        </p>
                                    </motion.div>
                                )}

                                {/* Processing status message - Ready */}
                                {processingStatus === 'ready' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="file-processing-ready mt-2 p-2 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg flex items-center gap-2"
                                    >
                                        <CircleCheckBig className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 dark:text-green-400" strokeWidth={1.75} />
                                        <span className="text-xs text-green-700 dark:text-green-300 font-medium">Ready for query</span>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
