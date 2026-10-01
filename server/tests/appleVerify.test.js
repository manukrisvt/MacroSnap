// Test the Apple JWT verification logic with a locally-generated RSA key
// mimicking Apple's JWKS format.
import crypto from 'crypto';

function base64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 1. Generate RSA keypair like Apple's
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }); // { kty, n, e, ... }

// 2. Build a fake Apple ID token
const header = { alg: 'RS256', kid: 'testkid' };
const payload = {
  iss: 'https://appleid.apple.com',
  aud: 'com.manukrisvt.macrosnap',
  exp: Math.floor(Date.now() / 1000) + 600,
  sub: '001234.testuser',
  email: 'test@example.com'
};
const headerB64 = b64url(Buffer.from(JSON.stringify(header)));
const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
const signature = crypto.sign('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), privateKey);
const sigB64 = b64url(signature);
const idToken = `${headerB64}.${payloadB64}.${sigB64}`;

// 3. Run the same verification as server/src/auth.js verifyWithKey
const jwkKey = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
const signedContent = Buffer.from(`${headerB64}.${payloadB64}`);
const sig = base64UrlDecode(sigB64);
const valid = crypto.verify('RSA-SHA256', signedContent, jwkKey, sig);

console.log('signature valid:', valid);

// 4. Also verify the payload decode path
const decoded = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
console.log('aud ok:', decoded.aud === 'com.manukrisvt.macrosnap');
console.log('sub:', decoded.sub);
