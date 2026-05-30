import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { logger } from './logger';
import { getGoogleApiKey } from './env';

// User-specific file search stores (in-memory for demo)
// Format: Map<userId, store>
const userFileStores = new Map<string, any>();
let ai: GoogleGenAI | null = null;

// Processing status type
export type FileProcessingStatus = 'uploading' | 'processing' | 'ready' | 'error';

// Track uploaded files per user to detect duplicates (in-memory)
// Format: Map<userId_fileName_size, { userId, fileName, size, uploadedAt, storeName, fileDocumentName, processingStatus }>
const uploadedFiles = new Map<string, {
    userId: string;
    fileName: string;
    size: number;
    uploadedAt: Date;
    storeName?: string;
    fileDocumentName?: string | null;
    processingStatus: FileProcessingStatus;
    errorMessage?: string;
}>();

// Lock mechanism to prevent race conditions when creating stores
// Format: Map<userId, Promise<store>>
const storeCreationPromises = new Map<string, Promise<any>>();

async function getAI() {
    if (!ai) {
        // Initialize with API key as per official documentation
        ai = new GoogleGenAI({ apiKey: getGoogleApiKey() });
        logger.info('GoogleGenAI client initialized');
    }
    return ai;
}

export async function getOrCreateFileSearchStore(userId: string) {
    // Check if user already has a store in memory
    if (userFileStores.has(userId)) {
        const store = userFileStores.get(userId);
        logger.debug('Using existing file search store', { userId, storeName: store.name });
        return store;
    }

    // Check if store creation is already in progress for this user (prevent race condition)
    if (storeCreationPromises.has(userId)) {
        logger.debug('Store creation already in progress, waiting', { userId });
        return await storeCreationPromises.get(userId);
    }

    // Create a promise for store creation and store it to prevent concurrent creation
    const creationPromise = (async () => {
        const client = await getAI();

        try {
            // Double-check after acquiring lock (another request might have created it)
            if (userFileStores.has(userId)) {
                const store = userFileStores.get(userId);
                logger.debug('Store was created by another request', { userId, storeName: store.name });
                return store;
            }

            logger.info('Creating new file search store', { userId });
            // Create user-specific store with user ID in display name
            const storeDisplayName = `RAG-Chatbot-Store-${userId}`;

            const newStore = await client.fileSearchStores.create({
                config: {
                    displayName: storeDisplayName
                }
            });

            logger.info('Created file search store', {
                userId,
                storeName: newStore.name,
                displayName: storeDisplayName,
            });

            // Store it in the user-specific map
            userFileStores.set(userId, newStore);

            return newStore;
        } catch (error) {
            logger.error('Error creating file search store', error, { userId });
            throw error;
        } finally {
            // Remove the promise from the map once creation is complete (success or failure)
            storeCreationPromises.delete(userId);
        }
    })();

    // Store the promise to prevent concurrent creation
    storeCreationPromises.set(userId, creationPromise);

    return await creationPromise;
}

export async function uploadFileToGemini(fileBuffer: Buffer, fileName: string, mimeType: string, userId: string) {
    if (!userId) {
        throw new Error('User ID is required for file upload');
    }

    // Check if file was already uploaded by this user (by userId, name and size)
    const fileKey = `${userId}_${fileName}_${fileBuffer.length}`;

    try {
        const existingFile = uploadedFiles.get(fileKey);

        if (existingFile && existingFile.userId === userId) {
            logger.info('File already uploaded', { userId, fileName });
            const userStore = userFileStores.get(userId);
            return {
                success: true,
                fileName,
                storeName: userStore?.name || null,
                isDuplicate: true,
                uploadedAt: existingFile.uploadedAt
            };
        }

        const client = await getAI();
        const store = await getOrCreateFileSearchStore(userId);

        // Double-check for duplicate after getting store (race condition protection)
        // Another concurrent request might have uploaded the same file
        const existingFileAfterStore = uploadedFiles.get(fileKey);
        if (existingFileAfterStore && existingFileAfterStore.userId === userId && existingFileAfterStore !== existingFile) {
            logger.info('File was uploaded by another concurrent request', { userId, fileName });
            const userStore = userFileStores.get(userId);
            return {
                success: true,
                fileName,
                storeName: userStore?.name || null,
                isDuplicate: true,
                uploadedAt: existingFileAfterStore.uploadedAt
            };
        }

        logger.info('Uploading file to store', { userId, storeName: store.name, fileName, mimeType, size: fileBuffer.length });

        // Track file immediately as 'uploading' so polling can see it
        uploadedFiles.set(fileKey, {
            userId,
            fileName,
            size: fileBuffer.length,
            uploadedAt: new Date(),
            storeName: store.name,
            processingStatus: 'uploading'
        });

        // Save buffer to temporary file with unique name to prevent collisions
        // Include userId and timestamp to ensure uniqueness across concurrent uploads
        const tempDir = os.tmpdir();
        const uniqueFileName = `${userId}_${Date.now()}_${fileName}`;
        const tempPath = path.join(tempDir, uniqueFileName);
        await fs.writeFile(tempPath, fileBuffer);
        logger.debug('Temporary file created', { tempPath });

        // Upload and import file into File Search store
        let operation = await client.fileSearchStores.uploadToFileSearchStore({
            file: tempPath,
            fileSearchStoreName: store.name,
            config: {
                displayName: fileName,
            }
        });

        logger.info('Upload operation started', { operationName: operation.name });

        // Update status to 'processing'
        updateFileProcessingStatus(userId, fileName, fileBuffer.length, 'processing');

        // Wait until import is complete (as per official docs: check every 5 seconds)
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max wait time
        while (!operation.done && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await client.operations.get({ operation });
            attempts++;

            if (operation.error) {
                logger.error('Operation error', operation.error, { userId, fileName });
                throw new Error(`Upload operation failed: ${JSON.stringify(operation.error)}`);
            }

            if (attempts % 6 === 0) {
                logger.debug('Still processing upload', { attempts, elapsedSeconds: attempts * 5 });
            }
        }

        if (!operation.done) {
            logger.error('Upload operation timed out', undefined, { userId, fileName, maxAttempts });
            throw new Error('Upload operation timed out after 5 minutes');
        }

        // Check if operation completed successfully
        if (operation.error) {
            logger.error('Operation completed with error', operation.error, { userId, fileName });
            throw new Error(`Upload operation failed: ${JSON.stringify(operation.error)}`);
        }

        // Log operation response details
        logger.info('Operation completed successfully', { operationName: operation.name });

        // Check if response contains file information
        let fileDocumentName: string | null = null;
        if (operation.response) {
            const responseData = operation.response as any;
            // Try multiple possible paths for file document name
            fileDocumentName = responseData.fileSearchDocument?.name ||
                responseData.fileSearchDocument?.file?.name ||
                responseData.document?.name ||
                responseData.document?.file?.name ||
                responseData.file?.name ||
                responseData.name;
            logger.debug('File document created', { 
                fileDocumentName, 
                responseKeys: Object.keys(responseData),
                responseData: JSON.stringify(responseData).substring(0, 500) // Log first 500 chars for debugging
            });
        }

        // Wait additional time for indexing to complete (File Search needs time to index)
        // We do this in the background so we can return "processing" status to the UI immediately
        verifyFileStateInBackground(client, store.name, fileName, fileDocumentName, fileKey, userId, fileBuffer.length, tempPath);

        const userFileCount = Array.from(uploadedFiles.values()).filter(f => f.userId === userId).length;
        logger.debug('File tracked successfully', {
            userId,
            totalFiles: userFileCount,
            trackedFiles: Array.from(uploadedFiles.values())
                .filter(f => f.userId === userId)
                .map(f => `${f.fileName} (store: ${f.storeName})`),
        });

        return {
            success: true,
            fileName,
            storeName: store.name,
            operationName: operation.name,
            isDuplicate: false
        };
    } catch (error: any) {
        logger.error('Error uploading to Gemini', error, { userId, fileName });

        // Update status to error
        updateFileProcessingStatus(userId, fileName, fileBuffer.length, 'error', error.message);

        // Check if error indicates file already exists
        const errorMessage = error?.message || JSON.stringify(error);
        if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
            // File might already exist in the store
            const userStore = userFileStores.get(userId);
            uploadedFiles.set(fileKey, {
                userId,
                fileName,
                size: fileBuffer.length,
                uploadedAt: new Date(),
                storeName: userStore?.name || null,
                processingStatus: 'ready' // Assume ready if duplicate
            });

            return {
                success: true,
                fileName,
                storeName: userStore?.name || null,
                isDuplicate: true,
                message: 'File already exists in the store'
            };
        }

        throw error;
    }
}

export async function queryWithFileSearch(query: string, userId: string) {
    if (!userId) {
        throw new Error('User ID is required for querying');
    }

    const client = await getAI();
    const store = await getOrCreateFileSearchStore(userId);

    // Use officially supported models for File Search (per documentation)
    // Supported models: gemini-2.5-pro, gemini-2.5-flash
    const models = [
        "gemini-2.5-flash",    // Recommended: Fast and efficient
        "gemini-2.5-pro",      // More capable, slower
    ];

    let lastError: any = null;
    for (const model of models) {
        try {
            // Generate content with File Search tool (per official documentation format)
            const response = await client.models.generateContent({
                model: model,
                contents: query,
                config: {
                    tools: [
                        {
                            fileSearch: {
                                fileSearchStoreNames: [store.name]
                            }
                        }
                    ]
                }
            });
            logger.info('Using model for query', { model, userId });
            return response;
        } catch (error: any) {
            lastError = error;
            if (error?.status === 404 || error?.code === 404) {
                // Model not found, try next one
                logger.debug('Model not available, trying next', { model, userId });
                continue;
            }
            if (error?.status === 400 || error?.code === 400) {
                // Invalid argument - might be model doesn't support this format, try next
                logger.debug('Model returned invalid argument error, trying next', { model, userId });
                continue;
            }
            if (error?.status === 429) {
                logger.warn('Rate limit exceeded', { userId });
                throw error;
            }
            // Other errors, throw immediately
            throw error;
        }
    }

    throw lastError || new Error("No available models found");
}

export async function queryWithFileSearchStream(query: string, userId: string) {
    if (!userId) {
        throw new Error('User ID is required for querying');
    }

    const client = await getAI();
    const store = await getOrCreateFileSearchStore(userId);

    logger.info('Querying with File Search', { userId, storeName: store.name, queryLength: query.length });

    // Verify store exists and warn if it might be empty
    if (!store?.name) {
        logger.error('File search store name is missing', undefined, { userId });
        throw new Error('File search store is not properly initialized. Please upload a file first.');
    }

    // Check if we have any tracked files for this user (for logging only)
    // Note: We don't throw errors here because the in-memory Map gets cleared on server restart
    // Even if files exist in Gemini, we should try to query and let Gemini handle empty stores
    const userTrackedFiles = Array.from(uploadedFiles.values()).filter(f => f.userId === userId);
    const trackedFilesCount = userTrackedFiles.length;

    if (trackedFilesCount === 0) {
        logger.warn('No files tracked in memory (normal after server restart)', { userId, storeName: store.name });
    } else {
        const filesInCurrentStore = userTrackedFiles.filter(f => f.storeName === store.name);
        logger.debug('Tracked files found', {
            userId,
            totalTracked: trackedFilesCount,
            inCurrentStore: filesInCurrentStore.length,
            files: userTrackedFiles.map(f => f.fileName),
        });
    }

    // Use officially supported models for File Search (per documentation)
    // Supported models: gemini-2.5-pro, gemini-2.5-flash
    const models = [
        "gemini-2.5-flash",    // Recommended: Fast and efficient
        "gemini-2.5-pro",      // More capable, slower
    ];

    let lastError: any = null;
    for (const model of models) {
        try {
            // Generate content stream with File Search tool (per official documentation format)
            // Ensure we're using the exact store name format
            const storeName = store.name;
            logger.debug('Attempting query with model', { model, storeName, userId });

            const response = await client.models.generateContentStream({
                model: model,
                contents: query,
                config: {
                    tools: [
                        {
                            fileSearch: {
                                fileSearchStoreNames: [storeName]
                            }
                        }
                    ]
                }
            });

            logger.info('Successfully started streaming', { model, storeName, userId });
            return response;
        } catch (error: any) {
            lastError = error;
            logger.error('Error with model', error, { model, userId });
            if (error?.status === 404 || error?.code === 404) {
                // Model not found, try next one
                logger.debug('Model not available, trying next', { model, userId });
                continue;
            }
            if (error?.status === 400 || error?.code === 400) {
                // Invalid argument - might be model doesn't support this format, try next
                logger.debug('Model returned invalid argument error, trying next', { model, userId });
                continue;
            }
            if (error?.status === 429) {
                logger.warn('Rate limit exceeded', { userId });
                throw error;
            }
            // Other errors, throw immediately
            throw error;
        }
    }

    throw lastError || new Error("No available models found");
}

// Condense a conversation into a short summary that can be reused as context.
// Uses a plain generateContent call (no File Search tool) since we're summarizing
// the chat transcript itself, not querying the knowledge base.
export async function condenseConversation(
    messages: { role: 'user' | 'model'; content: string }[],
    userId: string
): Promise<string> {
    if (!userId) {
        throw new Error('User ID is required to condense a conversation');
    }

    const client = await getAI();

    const transcript = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

    const prompt = `You are summarizing a conversation between a user and a document-based AI assistant. ` +
        `Write a concise summary (under 200 words) that captures the user's main questions and goals, ` +
        `the key facts and answers established so far, and any unresolved threads. ` +
        `Write it as compact notes that can be fed back in as context to continue the conversation. ` +
        `Do not add information that was not discussed.\n\nConversation:\n${transcript}\n\nSummary:`;

    // Same model preference order as File Search queries.
    const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];

    let lastError: any = null;
    for (const model of models) {
        try {
            const response = await client.models.generateContent({
                model,
                contents: prompt,
            });

            // The @google/genai SDK exposes text as either a getter or a method
            // depending on version, so handle both.
            const text =
                typeof (response as any)?.text === 'function'
                    ? (response as any).text()
                    : (response as any)?.text;

            logger.info('Condensed conversation', { userId, model, messageCount: messages.length });
            return (text || '').trim();
        } catch (error: any) {
            lastError = error;
            if (error?.status === 404 || error?.code === 404 || error?.status === 400 || error?.code === 400) {
                logger.debug('Model not usable for condense, trying next', { model, userId });
                continue;
            }
            logger.error('Error condensing conversation', error, { userId, model });
            throw error;
        }
    }

    throw lastError || new Error('No available models found for condensing');
}

export function getFileSearchStoreName(userId: string) {
    const store = userFileStores.get(userId);
    return store?.name || null;
}

// Function to list files in the store (for debugging)
export async function listFilesInStore(userId: string) {
    if (!userId) {
        throw new Error('User ID is required to list files');
    }

    try {
        const client = await getAI();
        const store = await getOrCreateFileSearchStore(userId);

        // Also return user's uploaded files
        const userFiles = Array.from(uploadedFiles.values()).filter(f => f.userId === userId);
        logger.debug('Listed files in store', { userId, storeName: store.name, fileCount: userFiles.length });

        return { store, userFiles };
    } catch (error) {
        logger.error('Error listing files in store', error, { userId });
        throw error;
    }
}

// Function to verify store has files before querying
export async function verifyStoreHasFiles(userId: string) {
    try {
        const store = await getOrCreateFileSearchStore(userId);
        // The store object might contain file count or we need to check differently
        // For now, just verify store exists
        return !!store?.name;
    } catch (error) {
        logger.error('Error verifying store', error, { userId });
        return false;
    }
}

// Function to check if any files have been uploaded by a specific user
export function hasUploadedFiles(userId?: string): boolean {
    if (!userId) {
        return uploadedFiles.size > 0;
    }
    return Array.from(uploadedFiles.values()).some(f => f.userId === userId);
}

// Function to get count of uploaded files for a specific user
// Background verification function
async function verifyFileStateInBackground(
    client: any,
    storeName: string,
    fileName: string,
    fileDocumentName: string | null,
    fileKey: string,
    userId: string,
    fileSize: number,
    tempPath: string
) {
    logger.debug('Starting background file verification', { fileName });

    try {
        // Verify file is in the store and has ACTIVE state
        // Following the pattern from Google Gemini API sample: poll until file is ACTIVE
        let fileReady = false;
        let checkAttempts = 0;
        const maxCheckAttempts = 60; // 2 minutes max (60 * 2 seconds)

        while (!fileReady && checkAttempts < maxCheckAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between checks (as per sample)
            checkAttempts++;

            try {
                // If we have the file document name, check it directly using Gemini API
                if (fileDocumentName) {
                    const fileStatus = await client.files.get({ name: fileDocumentName });
                    logger.debug('File status check', {
                        fileName,
                        state: fileStatus.state,
                        name: fileStatus.name,
                        checkAttempts
                    });

                    // Check state (Gemini uses uppercase states: PROCESSING, ACTIVE, FAILED)
                    // Following the sample pattern: loop while state is PROCESSING
                    if (fileStatus.state === 'ACTIVE') {
                        fileReady = true;
                        logger.info('File is ACTIVE and ready for search', { fileName, fileDocumentName });
                    } else if (fileStatus.state === 'FAILED') {
                        throw new Error(`File processing failed with state: ${fileStatus.state}`);
                    } else if (fileStatus.state === 'PROCESSING') {
                        // Continue polling while processing (this is the expected state during processing)
                        if (checkAttempts % 5 === 0) {
                            // Log every 5th attempt to avoid spam
                            logger.debug('File is processing...', { fileName, checkAttempts, elapsedSeconds: checkAttempts * 2 });
                        }
                    } else {
                        // Unknown state, log and continue polling
                        logger.warn('File in unknown state, continuing to check', { fileName, state: fileStatus.state, checkAttempts });
                    }
                } else {
                    // Fallback: If we don't have fileDocumentName, the operation completed successfully
                    // so we'll wait a reasonable time for indexing and then mark as ready
                    // Since the operation already completed, the file should be ready soon
                    logger.debug('No fileDocumentName available, waiting for indexing', {
                        fileName,
                        checkAttempts,
                        maxCheckAttempts
                    });
                    
                    // After a few checks (about 10-12 seconds), assume ready since operation completed
                    if (checkAttempts >= 6) {
                        logger.info('Operation completed successfully, marking file as ready after wait period', {
                            fileName,
                            checkAttempts
                        });
                        fileReady = true;
                    }
                }
            } catch (checkError: any) {
                // Only log errors that are not expected transient states
                // 404 errors are expected when file is still processing or not yet available
                const isExpectedError = checkError?.status === 404 || 
                                       checkError?.code === 404 ||
                                       checkError?.message?.includes('not found') ||
                                       checkError?.message?.includes('404');
                
                if (!isExpectedError) {
                    logger.warn('Error checking file status in background', {
                        fileName,
                        checkAttempts,
                        fileDocumentName: fileDocumentName || 'none',
                        errorMessage: checkError?.message,
                        errorStatus: checkError?.status || checkError?.code,
                        error: checkError
                    });
                }
                
                // If error is fatal (like auth error or processing failed), stop
                if (checkError?.message?.includes('processing failed') || 
                    checkError?.message?.includes('FAILED') ||
                    checkError?.status === 401 || 
                    checkError?.status === 403) {
                    updateFileProcessingStatus(userId, fileName, fileSize, 'error', checkError.message || 'File processing failed');
                    await fs.unlink(tempPath).catch(() => { });
                    return;
                }
                // For expected errors (like 404), continue checking
                // This handles the case where file might not be immediately available after upload
            }
        }

        if (fileReady) {
            logger.info('File is ACTIVE and ready for search (background check)', { fileName });
            updateFileProcessingStatus(userId, fileName, fileSize, 'ready');

            // Update the entry with the fileDocumentName if we have it
            const finalFileEntry = uploadedFiles.get(fileKey);
            if (finalFileEntry && fileDocumentName) {
                uploadedFiles.set(fileKey, {
                    ...finalFileEntry,
                    fileDocumentName: fileDocumentName
                });
            }
        } else {
            logger.warn('File verification timed out in background', { fileName });
            updateFileProcessingStatus(userId, fileName, fileSize, 'error', 'Processing timed out');
        }
    } catch (error: any) {
        logger.error('Background verification error', error);
        updateFileProcessingStatus(userId, fileName, fileSize, 'error', 'Processing failed');
    } finally {
        // Clean up temp file
        await fs.unlink(tempPath).catch(() => { });
    }
}

export function getUploadedFilesCount(userId?: string): number {
    if (!userId) {
        return uploadedFiles.size;
    }
    return Array.from(uploadedFiles.values()).filter(f => f.userId === userId).length;
}

// Function to get processing status for all files of a user
export function getFileProcessingStatus(userId: string) {
    if (!userId) {
        return {
            files: [],
            allReady: false,
            processingCount: 0,
            readyCount: 0,
            errorCount: 0
        };
    }

    const userFiles = Array.from(uploadedFiles.values())
        .filter(f => f.userId === userId)
        .map(f => ({
            fileName: f.fileName,
            status: f.processingStatus,
            uploadedAt: f.uploadedAt,
            errorMessage: f.errorMessage,
            size: f.size
        }));

    const processingCount = userFiles.filter(f => f.status === 'processing' || f.status === 'uploading').length;
    const readyCount = userFiles.filter(f => f.status === 'ready').length;
    const errorCount = userFiles.filter(f => f.status === 'error').length;
    const allReady = userFiles.length > 0 && processingCount === 0 && errorCount === 0;

    return {
        files: userFiles,
        allReady,
        processingCount,
        readyCount,
        errorCount,
        totalFiles: userFiles.length
    };
}

// Function to update processing status for a specific file
export function updateFileProcessingStatus(
    userId: string,
    fileName: string,
    fileSize: number,
    status: FileProcessingStatus,
    errorMessage?: string
) {
    const fileKey = `${userId}_${fileName}_${fileSize}`;
    const existingFile = uploadedFiles.get(fileKey);

    if (existingFile && existingFile.userId === userId) {
        uploadedFiles.set(fileKey, {
            ...existingFile,
            processingStatus: status,
            errorMessage: errorMessage
        });
        logger.debug('Updated file processing status', { userId, fileName, status, errorMessage });
        return true;
    }

    return false;
}
