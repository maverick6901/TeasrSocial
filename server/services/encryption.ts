import crypto from 'crypto';

// Master key for encrypting/decrypting post keys (from environment)
const MASTER_KEY = process.env.JWT_SECRET || 'development-master-key-change-in-production';
const MASTER_KEY_BUFFER = Buffer.from(MASTER_KEY.padEnd(32, '0').substring(0, 32));

export interface EncryptionResult {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export interface EncryptedKeyData {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

/**
 * Generate a random 256-bit encryption key for content
 */
export function generateContentKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Encrypt a buffer with AES-256-GCM using the provided key
 */
export function encryptBuffer(buffer: Buffer, key: Buffer): EncryptionResult {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return { encrypted, iv, authTag };
}

/**
 * Decrypt a buffer with AES-256-GCM using the provided key
 */
export function decryptBuffer(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
}

/**
 * Encrypt a content key with the master key for storage
 */
export function encryptContentKey(contentKey: Buffer): EncryptedKeyData {
  const result = encryptBuffer(contentKey, MASTER_KEY_BUFFER);
  
  return {
    encryptedKey: result.encrypted.toString('base64'),
    iv: result.iv.toString('base64'),
    authTag: result.authTag.toString('base64'),
  };
}

/**
 * Decrypt a content key using the master key
 */
export function decryptContentKey(encryptedKeyData: EncryptedKeyData): Buffer {
  const encrypted = Buffer.from(encryptedKeyData.encryptedKey, 'base64');
  const iv = Buffer.from(encryptedKeyData.iv, 'base64');
  const authTag = Buffer.from(encryptedKeyData.authTag, 'base64');
  
  return decryptBuffer(encrypted, MASTER_KEY_BUFFER, iv, authTag);
}
