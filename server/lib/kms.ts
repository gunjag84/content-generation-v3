import { KeyManagementServiceClient } from '@google-cloud/kms';

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const KEY_NAME = process.env.KMS_KEY_NAME;
let client: KeyManagementServiceClient | null = null;

function getClient(): KeyManagementServiceClient {
  if (!client) client = new KeyManagementServiceClient();
  return client;
}

export async function kmsEncrypt(plaintext: string): Promise<string> {
  if (isEmulator) {
    // D-11: dev-mode bypass. Store plaintext as base64 to keep ciphertext-shape contract.
    return Buffer.from(plaintext, 'utf8').toString('base64');
  }
  if (!KEY_NAME) throw new Error('KMS_KEY_NAME not set');
  const [r] = await getClient().encrypt({ name: KEY_NAME, plaintext: Buffer.from(plaintext) });
  return Buffer.from(r.ciphertext as Uint8Array).toString('base64');
}

export async function kmsDecrypt(ciphertext: string): Promise<string> {
  if (isEmulator) {
    return Buffer.from(ciphertext, 'base64').toString('utf8');
  }
  if (!KEY_NAME) throw new Error('KMS_KEY_NAME not set');
  const [r] = await getClient().decrypt({ name: KEY_NAME, ciphertext: Buffer.from(ciphertext, 'base64') });
  return Buffer.from(r.plaintext as Uint8Array).toString('utf8');
}
