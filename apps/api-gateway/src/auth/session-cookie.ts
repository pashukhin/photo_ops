import { serialize } from 'cookie';

export const SESSION_COOKIE_NAME = process.env.IDENTITY_SESSION_COOKIE_NAME ?? 'photoops_session';

export function serializeSessionCookie(sessionId: string, expires: Date) {
  return serialize(SESSION_COOKIE_NAME, sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === 'true', path: '/', expires });
}

export function serializeClearedSessionCookie() {
  return serialize(SESSION_COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === 'true', path: '/', expires: new Date(0) });
}
