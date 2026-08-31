import * as cheerio from 'cheerio';
import { logger } from './logger';

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10MB, matches file upload cap
const MAX_TEXT_CHARS = 2 * 1024 * 1024; // 2M chars of extracted text is plenty for a webpage

export interface ExtractedWebpage {
    url: string;
    title: string;
    text: string;
}

// Blocks obvious SSRF targets (loopback, link-local, private ranges, cloud metadata).
// This is hostname-based only; it does not protect against DNS rebinding.
function isBlockedHost(hostname: string): boolean {
    const host = hostname.toLowerCase();

    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === '0.0.0.0' || host === '::1' || host === '169.254.169.254') return true;

    // IPv4 literal checks
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
        if (a === 127) return true; // loopback
        if (a === 10) return true; // private
        if (a === 172 && b >= 16 && b <= 31) return true; // private
        if (a === 192 && b === 168) return true; // private
        if (a === 169 && b === 254) return true; // link-local
        if (a === 0) return true;
    }

    // IPv6 private/link-local prefixes (fc00::/7 unique local, fe80::/10 link-local)
    if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;

    return false;
}

export function validateWebsiteUrl(rawUrl: string): { valid: boolean; error?: string; url?: URL } {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
        return { valid: false, error: 'URL is required' };
    }

    if (rawUrl.length > 2048) {
        return { valid: false, error: 'URL is too long' };
    }

    let parsed: URL;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, error: 'Only http and https URLs are supported' };
    }

    if (isBlockedHost(parsed.hostname)) {
        return { valid: false, error: 'This URL points to a restricted or internal address' };
    }

    return { valid: true, url: parsed };
}

export async function fetchAndExtractWebpage(rawUrl: string): Promise<ExtractedWebpage> {
    const validation = validateWebsiteUrl(rawUrl);
    if (!validation.valid || !validation.url) {
        throw new Error(validation.error || 'Invalid URL');
    }
    const url = validation.url;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(url.toString(), {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RAG-Chatbot-Fetcher/1.0)',
                Accept: 'text/html,application/xhtml+xml',
            },
        });
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error('Request timed out while fetching the URL');
        }
        throw new Error(`Failed to fetch URL: ${error?.message || 'network error'}`);
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch URL: server responded with status ${response.status}`);
    }

    // The final URL after redirects might resolve to a different host; re-validate to
    // guard against a redirect to an internal address.
    const finalValidation = validateWebsiteUrl(response.url || url.toString());
    if (!finalValidation.valid) {
        throw new Error(finalValidation.error || 'Redirected to a restricted address');
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new Error('URL does not point to an HTML page');
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_HTML_BYTES) {
        throw new Error('Page is too large to process (max 10MB)');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_HTML_BYTES) {
        throw new Error('Page is too large to process (max 10MB)');
    }

    const html = buffer.toString('utf-8');
    const $ = cheerio.load(html);

    $('script, style, noscript, svg, iframe, nav, footer, header, form').remove();

    const title = ($('title').first().text() || $('h1').first().text() || url.hostname).trim().slice(0, 200);

    const bodyText = $('body').text();
    const text = bodyText
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim()
        .slice(0, MAX_TEXT_CHARS);

    if (!text || text.length < 20) {
        throw new Error('Could not extract meaningful content from this page');
    }

    logger.info('Extracted webpage content', { url: url.toString(), title, textLength: text.length });

    return { url: url.toString(), title, text };
}
