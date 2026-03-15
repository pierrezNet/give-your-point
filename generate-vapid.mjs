// Génère des clés VAPID pour les push notifications
// Usage : node generate-vapid.mjs
// Requiert Node.js 18+

const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
);

const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pubKey = b64url(publicKeyRaw);
const privKey = b64url(Buffer.from(JSON.stringify(privateKeyJwk)));

console.log('Ajoute ces lignes dans .dev.vars (local) et dans les variables d\'environnement Cloudflare Pages (prod) :');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${pubKey}`);
console.log(`VAPID_PRIVATE_KEY_JWK=${privKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@example.com`);
