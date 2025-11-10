// Object Storage is disabled - using local filesystem only
// This file is kept for compatibility but all functions throw errors

export async function saveToObjectStorage(key: string, data: Buffer): Promise<void> {
  throw new Error('Object Storage not configured - using local filesystem');
}

export async function getFromObjectStorage(key: string): Promise<Buffer> {
  throw new Error('Object Storage not configured - using local filesystem');
}

export async function deleteFromObjectStorage(key: string): Promise<void> {
  throw new Error('Object Storage not configured - using local filesystem');
}

export async function existsInObjectStorage(key: string): Promise<boolean> {
  return false;
}