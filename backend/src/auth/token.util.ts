import { createHmac, timingSafeEqual } from 'crypto';

export type AuthTokenPayload = {
  sub: string;
  sid: string;
  login: string;
  nickname: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function getSecret() {
  return process.env.JWT_SECRET ?? 'diplom-dev-secret';
}

function signValue(value: string) {
  return createHmac('sha256', getSecret()).update(value).digest();
}

export function signAuthToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>, expiresInSeconds: number) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = base64UrlEncode(signValue(`${encodedHeader}.${encodedPayload}`));
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = signValue(`${encodedHeader}.${encodedPayload}`);
  const actualSignature = Buffer.from(
    signature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signature.length / 4) * 4, '='),
    'base64',
  );

  if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AuthTokenPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}
