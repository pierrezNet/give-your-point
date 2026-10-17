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

export interface EncryptionSeed {
  salt: Uint8Array;
  senderKeys: CryptoKeyPair;
}

async function randomSeed(): Promise<EncryptionSeed> {
  return {
    salt: crypto.getRandomValues(new Uint8Array(16)),
    senderKeys: await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair,
  };
}

export async function encryptPushPayload(payload: string, p256dhB64url: string, authB64url: string, seed?: EncryptionSeed): Promise<ArrayBuffer> {
  const te = new TextEncoder();
  const { salt, senderKeys: senderPair } = seed ?? await randomSeed();

  const receiverPubRaw = decodeb64url(p256dhB64url);
  const receiverKey = await crypto.subtle.importKey('raw', receiverPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  const senderPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderPair.publicKey) as ArrayBuffer);

  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey } as any, senderPair.privateKey, 256));

  // RFC 8291 key derivation
  const authSecret = decodeb64url(authB64url);
  const prk = await hmacSha256(authSecret, ecdhBits);
  const ikm = await hmacSha256(prk, concatBytes(te.encode('WebPush: info\x00'), receiverPubRaw, senderPubRaw, new Uint8Array([1])));

  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\x00'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    concatBytes(te.encode(payload), new Uint8Array([2])) // payload + padding delimiter
  ));

  // RFC 8291 binary body: salt(16) | rs(4) | idlen(1) | sender_pub(65) | ciphertext
  const header = new Uint8Array(21 + senderPubRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = senderPubRaw.length;
  header.set(senderPubRaw, 21);
  return concatBytes(header, ciphertext).buffer as ArrayBuffer;
}

export async function vapidJwt(endpoint: string, subject: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const te = new TextEncoder();
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(te.encode(JSON.stringify({ aud, exp, sub: subject })));
  const sigInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey('jwk', privateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(sigInput));
  return `${sigInput}.${b64url(sig)}`;
}
