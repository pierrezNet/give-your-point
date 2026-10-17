import { describe, expect, it } from 'vitest';
import { b64url, decodeb64url, encryptPushPayload } from '../../src/push/crypto';

const RFC8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

async function rfcSenderKeys(): Promise<CryptoKeyPair> {
  const publicBytes = decodeb64url(RFC8291.asPublic);
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64url(publicBytes.slice(1, 33)),
    y: b64url(publicBytes.slice(33, 65)),
    d: RFC8291.asPrivate,
  };
  const algorithm = { name: 'ECDH', namedCurve: 'P-256' };
  const { d: _, ...publicJwk } = jwk;
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, algorithm, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('jwk', publicJwk, algorithm, true, []),
  };
}

describe('base64url', () => {
  it('fait un aller-retour sans padding', () => {
    const bytes = new Uint8Array([0, 251, 255, 1, 2]);
    expect(b64url(bytes)).not.toContain('=');
    expect([...decodeb64url(b64url(bytes))]).toEqual([...bytes]);
  });
});

describe('encryptPushPayload (RFC 8291, annexe A)', () => {
  it('produit exactement le message chiffré de la RFC', async () => {
    const body = await encryptPushPayload(RFC8291.plaintext, RFC8291.uaPublic, RFC8291.authSecret, {
      salt: decodeb64url(RFC8291.salt),
      senderKeys: await rfcSenderKeys(),
    });
    const expected = [...decodeb64url(RFC8291.header), ...decodeb64url(RFC8291.ciphertext)];
    expect([...new Uint8Array(body)]).toEqual(expected);
  });

  it('utilise un sel aléatoire par défaut', async () => {
    const [a, b] = await Promise.all([1, 2].map(() => encryptPushPayload('x', RFC8291.uaPublic, RFC8291.authSecret)));
    expect(b64url(a).slice(0, 22)).not.toBe(b64url(b).slice(0, 22));
  });
});
