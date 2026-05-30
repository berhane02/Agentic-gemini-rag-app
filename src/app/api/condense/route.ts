import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { condenseConversation } from '@/lib/gemini-file-search';
import { logger } from '@/lib/logger';

// Bound the request so a huge thread can't blow up the prompt.
const MAX_MESSAGES = 200;

export async function POST(req: NextRequest) {
    try {
        // Check authentication with Clerk (mirrors /api/chat).
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
            logger.warn('Unauthorized condense request attempt');
            return NextResponse.json(
                { error: 'Unauthorized. Please log in to condense a conversation.' },
                { status: 401 }
            );
        }

        // Parse request body.
        let body;
        try {
            body = await req.json();
        } catch (error) {
            logger.error('Invalid JSON in condense request', error, { userId });
            return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
        }

        const { messages } = body;

        // Validate the messages array.
        if (!Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'No conversation to condense' }, { status: 400 });
        }

        if (messages.length < 2) {
            return NextResponse.json(
                { error: 'Not enough messages to condense yet' },
                { status: 400 }
            );
        }

        if (messages.length > MAX_MESSAGES) {
            return NextResponse.json(
                { error: `Conversation is too long to condense (max ${MAX_MESSAGES} messages)` },
                { status: 400 }
            );
        }

        const validShape = messages.every((m: unknown) => {
            if (typeof m !== 'object' || m === null) return false;
            const { role, content } = m as { role?: unknown; content?: unknown };
            return (
                (role === 'user' || role === 'model') &&
                typeof content === 'string' &&
                content.trim().length > 0
            );
        });
        if (!validShape) {
            return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
        }

        logger.info('Condensing conversation', { userId, messageCount: messages.length });
        const summary = await condenseConversation(messages, userId);

        if (!summary) {
            return NextResponse.json(
                { error: 'Could not generate a summary. Please try again.' },
                { status: 502 }
            );
        }

        return NextResponse.json({ summary });
    } catch (error) {
        logger.error('Error in condense route', error);
        return NextResponse.json(
            { error: 'Failed to condense conversation. Please try again later.' },
            { status: 500 }
        );
    }
}
