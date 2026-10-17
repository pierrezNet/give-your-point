const VAPID_KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url');

const keyPair = await crypto.subtle.generateKey(VAPID_KEY_ALGORITHM, true, ['sign', 'verify']);
const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));
const privateKeyJwk = toBase64Url(JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.privateKey)));

console.log("Ajoute ces lignes dans .dev.vars (local) et dans les variables d'environnement Cloudflare Pages (prod) :\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY_JWK=${privateKeyJwk}`);
console.log('VAPID_SUBJECT=mailto:admin@example.com');
