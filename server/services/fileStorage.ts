import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { saveToObjectStorage, getFromObjectStorage, existsInObjectStorage } from './objectStorage';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const THUMBNAIL_DIR = path.join(UPLOAD_DIR, 'thumbnails');

// Use Object Storage for production, local filesystem for development
const USE_OBJECT_STORAGE = process.env.NODE_ENV === 'production' || process.env.USE_OBJECT_STORAGE === 'true';

// Ensure directories exist
async function ensureDirs() {
  if (!USE_OBJECT_STORAGE) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(THUMBNAIL_DIR, { recursive: true });
  }
}

ensureDirs();

export interface FileMetadata {
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Save encrypted file to disk
 */
export async function saveEncryptedFile(encryptedBuffer: Buffer, extension: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${extension}.enc`;

  if (USE_OBJECT_STORAGE) {
    await saveToObjectStorage(`uploads/${filename}`, encryptedBuffer);
  } else {
    const filepath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filepath, encryptedBuffer);
  }

  return filename;
}

/**
 * Read encrypted file from disk
 */
export async function readEncryptedFile(filename: string): Promise<Buffer> {
  if (USE_OBJECT_STORAGE) {
    return await getFromObjectStorage(`uploads/${filename}`);
  } else {
    const filepath = path.join(UPLOAD_DIR, filename);
    return await fs.readFile(filepath);
  }
}

/**
 * Generate blurred thumbnail from image buffer
 */
export async function generateBlurredThumbnail(imageBuffer: Buffer): Promise<string> {
  const filename = `thumb_${crypto.randomUUID()}.jpg`;

  const blurredBuffer = await sharp(imageBuffer)
    .resize(500)
    .blur(20)
    .jpeg({ quality: 70 })
    .toBuffer();

  if (USE_OBJECT_STORAGE) {
    await saveToObjectStorage(`uploads/thumbnails/${filename}`, blurredBuffer);
  } else {
    const filepath = path.join(THUMBNAIL_DIR, filename);
    await fs.writeFile(filepath, blurredBuffer);
  }

  return `thumbnails/${filename}`;
}

/**
 * Get file extension from mime type
 */
export function getFileExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };

  return mimeMap[mimeType] || 'bin';
}