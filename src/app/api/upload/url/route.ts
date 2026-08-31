import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { uploadFileToGemini } from '@/lib/gemini-file-search';
import { fetchAndExtractWebpage } from '@/lib/web-extract';
import { filenameFromUrl } from '@/lib/validation';
import { logger } from '@/lib/logger';

// Rate limiting: Store ingestion timestamps per user (in-memory, resets on server restart)
const ingestTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_INGESTS_PER_WINDOW = 5; // Max 5 URL ingests per minute per user

function checkRateLimit(userId: string): { allowed: boolean; timeUntilNext: number | null } {
    const now = Date.now();
    const timestamps = ingestTimestamps.get(userId) || [];
    const recentTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

    if (recentTimestamps.length >= MAX_INGESTS_PER_WINDOW) {
        const oldestTimestamp = Math.min(...recentTimestamps);
        return { allowed: false, timeUntilNext: RATE_LIMIT_WINDOW - (now - oldestTimestamp) };
    }

    return { allowed: true, timeUntilNext: null };
}

function recordIngest(userId: string) {
    const now = Date.now();
    const timestamps = ingestTimestamps.get(userId) || [];
    timestamps.push(now);
    const recentTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW * 2);
    ingestTimestamps.set(userId, recentTimestamps);
}

export async function POST(req: NextRequest) {
    try {
        // Check authentication with Clerk
        let userId: string | null = null;
        try {
            const authResult = await auth();
            userId = authResult?.userId || null;
        } catch (authError) {
            logger.error('Clerk auth error', authError);
            return NextResponse.json(
                { error: 'Authentication error. Please try logging in again.' },
                { status: 401 }
            );
        }

        if (!userId) {
            logger.warn('Unauthorized URL ingest request attempt');
            return NextResponse.json(
                { error: 'Unauthorized. Please log in to add a website.' },
                { status: 401 }
            );
        }

        // Check rate limit
        const rateLimitCheck = checkRateLimit(userId);
        if (!rateLimitCheck.allowed) {
            const secondsRemaining = Math.ceil((rateLimitCheck.timeUntilNext || 0) / 1000);
            logger.warn('URL ingest rate limit exceeded', { userId, secondsRemaining });
            return NextResponse.json(
                {
                    error: `Rate limit exceeded. Please wait ${secondsRemaining} second${secondsRemaining !== 1 ? 's' : ''} before adding another website.`,
                },
                { status: 429 }
            );
        }

        // Parse request body
        let body: any;
        try {
            body = await req.json();
        } catch (error) {
            logger.error('Failed to parse URL ingest request body', error, { userId });
            return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
        }

        const { url } = body || {};
        if (typeof url !== 'string' || !url.trim()) {
            return NextResponse.json({ error: 'A website URL is required' }, { status: 400 });
        }

        // Fetch and extract the webpage content
        let extracted;
        try {
            extracted = await fetchAndExtractWebpage(url.trim());
        } catch (error: any) {
            logger.warn('Failed to extract webpage', { userId, url, error: error?.message });
            return NextResponse.json(
                { error: error?.message || 'Failed to fetch and read the website' },
                { status: 400 }
            );
        }

        const fileName = filenameFromUrl(extracted.url, extracted.title);
        const buffer = Buffer.from(
            `Source: ${extracted.url}\nTitle: ${extracted.title}\n\n${extracted.text}`,
            'utf-8'
        );

        logger.info('Ingesting website into knowledge base', {
            userId,
            url: extracted.url,
            title: extracted.title,
            fileName,
            textLength: extracted.text.length,
        });

        const result = await uploadFileToGemini(buffer, fileName, 'text/plain', userId);

        recordIngest(userId);

        const processingStatus = result.isDuplicate ? ('ready' as const) : ('processing' as const);

        return NextResponse.json({
            success: true,
            message: result.isDuplicate
                ? `"${extracted.title}" is already in the knowledge base`
                : `Added "${extracted.title}" to the knowledge base`,
            fileName: result.fileName,
            title: extracted.title,
            url: extracted.url,
            storeName: result.storeName,
            isDuplicate: result.isDuplicate || false,
            processingStatus,
        });
    } catch (error) {
        logger.error('URL ingest error', error);
        return NextResponse.json(
            { error: 'Internal Server Error. Please try again later.' },
            { status: 500 }
        );
    }
}
