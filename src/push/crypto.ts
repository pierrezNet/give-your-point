export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeb64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=');
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;
const SALT_LENGTH = 16;
const RECORD_SIZE = 4096;
const LAST_RECORD_PADDING_DELIMITER = 2;
const CONTENT_KEY_LENGTH = 16;
const NONCE_LENGTH = 12;
const AUTH_TAG_BITS = 128;
const VAPID_TOKEN_LIFETIME_SECONDS = 12 * 3600;
const encoder = new TextEncoder();

export interface EncryptionSeed {
  salt: Uint8Array;
  senderKeys: CryptoKeyPair;
}

async function randomSeed(): Promise<EncryptionSeed> {
  return {
    salt: crypto.getRandomValues(new Uint8Array(SALT_LENGTH)),
    senderKeys: await crypto.subtle.generateKey(P256, true, ['deriveBits']) as CryptoKeyPair,
  };
}

async function deriveInputKeyingMaterial(senderKeys: CryptoKeyPair, senderPublicKey: Uint8Array, receiverPublicKey: Uint8Array, authSecret: Uint8Array) {
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublicKey, P256, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, senderKeys.privateKey, 256));
  const pseudoRandomKey = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(encoder.encode('WebPush: info\x00'), receiverPublicKey, senderPublicKey, new Uint8Array([1]));
  return hmacSha256(pseudoRandomKey, keyInfo);
}

function encodeContentCodingHeader(salt: Uint8Array, senderPublicKey: Uint8Array): Uint8Array {
  const header = new Uint8Array(SALT_LENGTH + 4 + 1 + senderPublicKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(SALT_LENGTH, RECORD_SIZE, false);
  header[SALT_LENGTH + 4] = senderPublicKey.length;
  header.set(senderPublicKey, SALT_LENGTH + 5);
  return header;
}

export async function encryptPushPayload(payload: string, p256dhB64url: string, authB64url: string, seed?: EncryptionSeed): Promise<ArrayBuffer> {
  const { salt, senderKeys } = seed ?? await randomSeed();
  const receiverPublicKey = decodeb64url(p256dhB64url);
  const senderPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey) as ArrayBuffer);

  const inputKeyingMaterial = await deriveInputKeyingMaterial(senderKeys, senderPublicKey, receiverPublicKey, decodeb64url(authB64url));
  const contentKey = await hkdf(salt, inputKeyingMaterial, encoder.encode('Content-Encoding: aes128gcm\x00'), CONTENT_KEY_LENGTH);
  const nonce = await hkdf(salt, inputKeyingMaterial, encoder.encode('Content-Encoding: nonce\x00'), NONCE_LENGTH);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: AUTH_TAG_BITS },
    aesKey,
    concatBytes(encoder.encode(payload), new Uint8Array([LAST_RECORD_PADDING_DELIMITER])),
  ));
  return concatBytes(encodeContentCodingHeader(salt, senderPublicKey), ciphertext).buffer as ArrayBuffer;
}

export async function vapidJwt(endpoint: string, subject: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const audience = new URL(endpoint).origin;
  const expiresAt = Math.floor(Date.now() / 1000) + VAPID_TOKEN_LIFETIME_SECONDS;

  const header = b64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(encoder.encode(JSON.stringify({ aud: audience, exp: expiresAt, sub: subject })));
  const sigInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey('jwk', privateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(sigInput));
  return `${sigInput}.${b64url(sig)}`;
}
