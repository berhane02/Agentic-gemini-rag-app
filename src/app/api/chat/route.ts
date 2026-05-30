import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { queryRAG } from '@/lib/rag';
import { validateMessage, sanitizeMessage } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
    try {
    // Check authentication with Clerk
        let userId: string | null = null;
        try {
            const authResult = await auth();
            userId = authResult?.userId || null;
        } catch (authError) {
            logger.error('Clerk auth error', authError);
            // If auth fails due to chunk loading, try to get userId from headers
            const authHeader = req.headers.get('authorization');
            if (!authHeader) {
                logger.warn('Unauthorized chat request attempt - no auth header');
                return NextResponse.json(
                    { error: 'Unauthorized. Please log in to use the chat.' },
                    { status: 401 }
                );
            }
            // Fallback: return unauthorized if we can't authenticate
            return NextResponse.json(
                { error: 'Authentication error. Please try logging in again.' },
                { status: 401 }
            );
        }
        
    if (!userId) {
            logger.warn('Unauthorized chat request attempt');
            return NextResponse.json(
                { error: 'Unauthorized. Please log in to use the chat.' },
                { status: 401 }
            );
    }

        // Parse and validate request body
        let body;
        try {
            body = await req.json();
        } catch (error) {
            logger.error('Invalid JSON in chat request', error, { userId });
            return NextResponse.json(
                { error: 'Invalid request format' },
                { status: 400 }
            );
        }

        const { message, context } = body;

        // Validate message
        const validation = validateMessage(message);
        if (!validation.valid) {
            logger.warn('Invalid message in chat request', { userId, error: validation.error });
            return NextResponse.json(
                { error: validation.error || 'Invalid message' },
                { status: 400 }
            );
        }

        // Sanitize message
        const sanitizedMessage = sanitizeMessage(message);

        // Optional condensed conversation summary used as extra context.
        const conversationContext =
            typeof context === 'string' ? sanitizeMessage(context).slice(0, 10000) : undefined;

        // Query RAG system
        logger.info('Processing chat query', {
            userId,
            messageLength: sanitizedMessage.length,
            hasContext: !!conversationContext,
        });
        const stream = await queryRAG(sanitizedMessage, userId, conversationContext);

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache, no-transform',
            },
        });
    } catch (error) {
        logger.error('Error in chat route', error);
        return NextResponse.json(
            { error: 'Internal Server Error. Please try again later.' },
            { status: 500 }
        );
    }
}
