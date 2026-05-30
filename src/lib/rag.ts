import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs/promises";
import path from "path";
import { logger } from "./logger";
import { getGoogleApiKey } from "./env";

let vectorStore: HNSWLib | null = null;

function createErrorStream(message: string) {
    const encoder = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            const chunks = message.split(/(?=[ \n])/);
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            controller.close();
        }
    });
}

export async function getVectorStore() {
    if (vectorStore) return vectorStore;

    try {
    const text = await fs.readFile(path.join(process.cwd(), 'knowledge_base.txt'), 'utf-8');
    const docs = text.split('\n').filter(line => line.trim()).map(line => new Document({ pageContent: line }));

    const embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: getGoogleApiKey(),
        taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    vectorStore = await HNSWLib.fromDocuments(docs, embeddings);
        logger.info('Vector store initialized successfully');
    return vectorStore;
    } catch (error) {
        logger.error('Failed to initialize vector store', error);
        throw error;
    }
}

function iteratorToStream(iterator: AsyncIterable<any>) {
    const encoder = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            try {
                let hasReceivedData = false;
                for await (const chunk of iterator) {
                    let text = '';
                    
                    // Handle different chunk formats from @google/genai SDK
                    if (typeof chunk === 'string') {
                        text = chunk;
                    } else if (chunk?.text && typeof chunk.text === 'function') {
                        // SDK method to extract text (handles executableCode parts automatically)
                        try {
                            text = chunk.text();
                            hasReceivedData = true;
                        } catch (e) {
                            // If text() fails, try other methods
                            logger.debug('chunk.text() failed, trying alternative extraction');
                        }
                    } else if (chunk?.text && typeof chunk.text === 'string') {
                        text = chunk.text;
                        hasReceivedData = true;
                    } else if (chunk?.candidates?.[0]?.content?.parts) {
                        // Handle response format with candidates - extract only text parts
                        const parts = chunk.candidates[0].content.parts;
                        text = parts
                            .filter((part: any) => part.text && !part.executableCode)
                            .map((part: any) => part.text)
                            .join('');
                        if (text) hasReceivedData = true;
                    } else if (chunk?.response?.text) {
                        text = typeof chunk.response.text === 'function' 
                            ? chunk.response.text() 
                            : chunk.response.text;
                        hasReceivedData = true;
                    } else if (chunk?.response?.candidates?.[0]?.content?.parts) {
                        const parts = chunk.response.candidates[0].content.parts;
                        text = parts
                            .filter((part: any) => part.text && !part.executableCode)
                            .map((part: any) => part.text)
                            .join('');
                        if (text) hasReceivedData = true;
                    } else {
                        // Try to extract text from any text property, skip executableCode
                        if (chunk?.executableCode) {
                            // Skip executable code parts - SDK warning is expected
                            continue;
                        }
                        text = chunk?.text || chunk?.content || '';
                        if (text && typeof text === 'string') {
                            hasReceivedData = true;
                        }
                    }
                    
                    if (text && text.trim()) {
                        // Check if controller is still open before enqueueing
                        try {
                            controller.enqueue(encoder.encode(text));
                        } catch (enqueueError: any) {
                            // If controller is closed, stop processing
                            if (enqueueError?.code === 'ERR_INVALID_STATE' || enqueueError?.message?.includes('closed')) {
                                logger.warn('Stream controller was closed, stopping iteration');
                                return;
                            }
                            throw enqueueError;
                        }
                    }
                }
                
                if (!hasReceivedData) {
                    logger.warn('No text data received from stream');
                }
            } catch (error) {
                logger.error('Error in iteratorToStream', error);
                // Only error if controller is still open
                try {
                    controller.error(error);
                } catch (errorError) {
                    // Controller might already be closed, ignore
                    logger.warn('Could not send error to closed controller');
                }
                return;
            }
            // Only close if controller is still open
            try {
                controller.close();
            } catch (closeError) {
                // Controller might already be closed, ignore
                logger.warn('Controller was already closed');
            }
        }
    });
}

export async function queryRAG(query: string, userId: string, context?: string) {
    if (!userId) {
        const errorMessage = `**Authentication Error**

User ID is required to query documents. Please log in and try again.`;
        logger.warn('Query attempted without userId');
        return createErrorStream(errorMessage);
    }

    // When a condensed summary of the earlier conversation is provided, prepend it
    // so the model can answer follow-up questions with awareness of prior turns.
    const effectiveQuery = context && context.trim()
        ? `Here is a summary of the earlier conversation for context:\n\n${context.trim()}\n\nUsing that context together with the documents, answer the user's current message:\n\n${query}`
        : query;

    try {
        // Try to use Gemini File Search first - user-specific
        // We'll let Gemini handle the "no files" error rather than checking in-memory Map
        // (which gets cleared on server restart even if files exist in Gemini)
        const { queryWithFileSearchStream, getOrCreateFileSearchStore } = await import('./gemini-file-search');
        
        try {
            // Ensure user's store exists (creates if needed)
            const store = await getOrCreateFileSearchStore(userId);
            logger.info('Using file search store for query', { userId, storeName: store.name });
            
            // Attempt query - Gemini will return appropriate error if store is empty
            const response = await queryWithFileSearchStream(effectiveQuery, userId);
            return iteratorToStream(response);
        } catch (queryError: any) {
            logger.error('Query error for user', queryError, { userId });
            
            // Check if error is due to empty store or no files
            const errorMessage = queryError?.message || JSON.stringify(queryError);
            const errorString = errorMessage.toLowerCase();
            
            if (errorString.includes('empty') || 
                errorString.includes('not found') || 
                errorString.includes('no files') ||
                errorString.includes('not accessible') ||
                errorString.includes('no documents') ||
                errorString.includes('file search store is not properly initialized')) {
            const noFilesMessage = `**No Documents Uploaded**

I can't answer questions yet because no documents have been uploaded to your knowledge base.

**To get started:**
1. Upload a document using the file upload area above
2. Wait a few seconds for the document to be processed (up to 30 seconds)
3. Then ask your question

Once you upload a document, I'll be able to answer questions about its content!`;
                return createErrorStream(noFilesMessage);
            }
            // Re-throw other errors to be handled by outer catch
            throw queryError;
        }
    } catch (fileSearchError: any) {
        logger.error('File Search error', fileSearchError, { userId });

        // If rate limited, return helpful message
        if (fileSearchError?.status === 429) {
            const errorMessage = `**Rate Limit Exceeded**

You've hit the API quota limit. This usually happens when:
- Making too many requests in a short time
- Using experimental models with lower quotas

**Solutions:**
1. Wait a minute and try again
2. Use a paid API key for higher limits
3. The system will automatically retry in a moment

Please try your question again in about a minute.`;
            return createErrorStream(errorMessage);
        }

        // For model not found or other API errors
        if (fileSearchError?.status === 404 || fileSearchError?.code === 404) {
            const errorMessage = `**Model Configuration Issue**

The AI model is temporarily unavailable. This has been logged and will be fixed.

Please try again in a moment.`;
            return createErrorStream(errorMessage);
        }

        // For invalid argument errors (400)
        if (fileSearchError?.status === 400 || fileSearchError?.code === 400) {
            const errorMessage = `**Configuration Error**

There was an issue with the request format. This has been logged.

Please try again in a moment.`;
            return createErrorStream(errorMessage);
        }

        // Check if error indicates files aren't accessible
        const errorMessage = fileSearchError?.message || JSON.stringify(fileSearchError);
        if (errorMessage.includes('not accessible') || 
            errorMessage.includes('not found') || 
            errorMessage.includes('empty') ||
            errorMessage.includes('different store')) {
            const fileAccessErrorMessage = `**File Access Issue**

It seems the uploaded files are not accessible. This can happen if:
- The server was restarted (files are in a different store)
- Files are still being indexed (wait 30 seconds after upload)
- No files have been uploaded yet

**Solutions:**
1. Re-upload your file(s) to ensure they're in the current store
2. Wait 30 seconds after uploading before querying
3. Check the server logs for detailed error information

Please try uploading your file again and wait a moment before querying.`;
            return createErrorStream(fileAccessErrorMessage);
        }

        // Generic error fallback
        const genericErrorMessage = `**Service Temporarily Unavailable**

I'm having trouble processing your request right now. 

**Error details:** ${errorMessage}

Please try again in a moment.`;
        return createErrorStream(genericErrorMessage);
    }
}

export async function addDocument(text: string) {
    try {
    const vectorStore = await getVectorStore();
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([text]);
    await vectorStore.addDocuments(docs);
        logger.info('Document added to vector store', { chunks: docs.length });
    return docs.length;
    } catch (error) {
        logger.error('Failed to add document to vector store', error);
        throw error;
    }
}
