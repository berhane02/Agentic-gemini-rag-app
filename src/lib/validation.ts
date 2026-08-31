/**
 * Input validation and sanitization utilities
 */

const MAX_MESSAGE_LENGTH = 10000;
const MAX_FILENAME_LENGTH = 255;
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMessage(message: unknown): ValidationResult {
  if (typeof message !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }

  if (message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  // Check for potential injection attempts
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(message)) {
      return { valid: false, error: 'Message contains potentially unsafe content' };
    }
  }

  return { valid: true };
}

export function validateFile(file: File): ValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (file.size > MAX_FILE_SIZE) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${fileSizeMB} MB) exceeds the maximum allowed size of 10 MB`,
    };
  }

  if (file.name.length > MAX_FILENAME_LENGTH) {
    return {
      valid: false,
      error: `Filename exceeds maximum length of ${MAX_FILENAME_LENGTH} characters`,
    };
  }

  // Validate file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'txt', 'md', 'doc', 'docx', 'csv', 'xls', 'xlsx'];
  
  if (!extension || !allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`,
    };
  }

  // Validate MIME type if available
  if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'File type not allowed',
    };
  }

  return { valid: true };
}

export function filenameFromUrl(url: string, title: string): string {
  let host = 'webpage';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // fall back to default host label
  }

  const titlePart = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  const base = titlePart ? `${host}-${titlePart}` : host;
  return sanitizeFilename(`${base}.txt`.slice(-MAX_FILENAME_LENGTH));
}

export function sanitizeFilename(filename: string): string {
  // Remove path separators and other potentially dangerous characters
  return filename
    .replace(/[\/\\]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .trim();
}

export function sanitizeMessage(message: string): string {
  // Basic sanitization - remove null bytes and trim
  return message.replace(/\0/g, '').trim();
}

