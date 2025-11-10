
import { Client } from '@replit/object-storage';

// Initialize Replit Object Storage client
const client = new Client();

export async function saveToObjectStorage(key: string, data: Buffer): Promise<void> {
  await client.uploadFromBytes(key, data);
}

export async function getFromObjectStorage(key: string): Promise<Buffer> {
  const bytes = await client.downloadAsBytes(key);
  return Buffer.from(bytes);
}

export async function deleteFromObjectStorage(key: string): Promise<void> {
  await client.delete(key);
}

export async function existsInObjectStorage(key: string): Promise<boolean> {
  try {
    await client.downloadAsBytes(key);
    return true;
  } catch {
    return false;
  }
}
