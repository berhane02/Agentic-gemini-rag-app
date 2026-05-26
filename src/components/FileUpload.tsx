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
        return (
            <div className="file-upload-compact relative">
                <div
                    {...getRootProps()}
                        className={clsx(
                        'relative rounded-md cursor-pointer transition-all duration-200 overflow-hidden group flex items-center gap-1.5',
                        showText
                            ? 'px-2 md:px-2.5 lg:px-3 py-1 md:py-1.5'
                            : 'p-1.5',
                        uploading || processingStatus === 'processing'
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                            : processingStatus === 'ready'
                                ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                                : uploadSuccess
                                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                                    : isDragActive
                                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 scale-105 shadow-lg shadow-blue-500/30'
                                        : 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 hover:from-blue-200 hover:to-indigo-200 dark:hover:from-blue-800/50 dark:hover:to-indigo-800/50'
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
                    <input {...getInputProps()} className="file-upload-input" />
                    {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-white animate-spin" />
                    ) : processingStatus === 'ready' ? (
                        <CircleCheckBig className="h-3.5 w-3.5 md:h-4 md:w-4 text-white" strokeWidth={1.75} />
                    ) : processingStatus === 'processing' || uploadSuccess ? (
                        <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-white animate-spin" />
                    ) : (
                        <Upload className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors" />
                    )}
                    {showText && (
                        <span className={clsx(
                            "text-xs md:text-sm font-bold transition-colors whitespace-nowrap",
                            uploading || uploadSuccess || processingStatus === 'processing' || processingStatus === 'ready' || isDragActive
                                ? "text-white"
                                : "text-gray-800 dark:text-gray-200"
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
                {errorMessage && (
                    <div className="file-upload-compact-error-message absolute top-full left-0 mt-1 px-2 py-1 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded text-[10px] text-red-700 dark:text-red-300 whitespace-nowrap z-50 shadow-lg">
                        {errorMessage}
                    </div>
                )}
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
                                'file-upload-dropzone relative border-2 border-dashed rounded-lg p-1 sm:p-1.5 text-center cursor-pointer transition-all duration-300 overflow-hidden group',
                                isDragActive
                                    ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 scale-105 shadow-lg shadow-blue-500/20'
                                    : 'border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/10 dark:to-gray-900 hover:shadow-lg hover:shadow-blue-500/10'
                            )}
                        >
                            {/* Animated background gradient */}
                            <div className="file-upload-dropzone-shimmer absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

                            <input {...getInputProps()} className="file-upload-input" />
                            <motion.div
                                animate={isDragActive ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                                transition={{ duration: 0.2 }}
                                className="file-upload-content relative z-10"
                            >
                                <div className="file-upload-icon-wrapper relative inline-block mb-0.5">
                                    <div className="file-upload-icon-glow absolute inset-0 bg-blue-500/20 rounded-full blur-lg" />
                                    <Upload className="file-upload-icon relative mx-auto h-3 w-3 sm:h-4 sm:w-4 text-blue-500 dark:text-blue-400" strokeWidth={1.75} />
                                </div>
                                <p className="file-upload-instruction text-[8px] sm:text-[9px] font-medium text-gray-700 dark:text-gray-300 mb-0 leading-tight">
                                    {isDragActive ? (
                                        <span className="file-upload-drag-active-text text-blue-600 dark:text-blue-400 font-semibold">Drop here...</span>
                                    ) : (
                                        'Drag & drop or click'
                                    )}
                                </p>
                                <p className="file-upload-file-types text-[8px] sm:text-[9px] text-blue-500 dark:text-blue-400 font-medium">
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
                                className={`file-upload-success-container flex items-center justify-between bg-white dark:bg-gray-900 border rounded-lg p-2 sm:p-2.5 shadow-md ${isDuplicate
                                    ? 'border-yellow-500/50 dark:border-yellow-500/30 bg-yellow-50/30 dark:bg-yellow-950/10'
                                    : 'border-green-500/50 dark:border-green-500/30 bg-green-50/30 dark:bg-green-950/10'
                                    }`}
                            >
                                <div className="file-upload-success-status flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.1, type: "spring" }}
                                        className={`file-upload-success-icon p-1 sm:p-1.5 rounded-lg shadow-sm ${isDuplicate
                                            ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                                            : 'bg-gradient-to-br from-green-500 to-emerald-500'
                                            }`}
                                    >
                                        <CircleCheckBig className="h-3 w-3 sm:h-4 sm:w-4 text-white" strokeWidth={1.75} />
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
                                "file-upload-pending-container bg-white dark:bg-gray-900 border rounded-lg p-2 sm:p-2.5 shadow-lg transition-all duration-300",
                                processingStatus === 'processing' ? "border-blue-500 dark:border-blue-600" : "border-blue-200 dark:border-blue-800"
                            )}>
                                {/* Show processing status if file is being processed */}
                                {(processingStatus === 'processing' || (uploadSuccess && processingStatus !== 'ready')) && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="file-processing-status mb-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700 rounded-lg flex items-center gap-2"
                                    >
                                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Processing document...</span>
                                    </motion.div>
                                )}
                                <div className="file-upload-pending-header flex items-center justify-between mb-2">
                                    <div className="file-upload-pending-file-info flex items-center gap-1.5 sm:gap-2 overflow-hidden flex-1">
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.1, type: "spring" }}
                                            className="file-upload-pending-icon p-1.5 sm:p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md shadow-blue-500/30"
                                        >
                                            <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-white" strokeWidth={1.75} />
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
                                    className="file-upload-submit-button w-full relative overflow-hidden group flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 text-white py-2 px-3 rounded-lg hover:from-blue-500 hover:via-blue-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 text-xs font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98]"
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
