import type { Timestamp } from 'firebase-admin/firestore';

export interface UserDoc {
  email: string;
  displayName: string;
  createdAt: Timestamp;
  activeBrandId?: string;
  apiKeys?: {
    anthropic?: string; // KMS ciphertext (or base64 plaintext in emulator mode)
    metaGraph?: string;
  };
}
