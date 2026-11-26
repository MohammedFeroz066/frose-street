import type { FastifyReply } from 'fastify';

export interface SessionCookieNames {
  access: string;
  refresh: string;
}

/**
 * Returns environment-appropriate session cookie names.
 * Production uses `__Host-` prefix (requires Secure, Path=/, and no Domain).
 */
export function getSessionCookieNames(nodeEnv: string): SessionCookieNames {
  const isProd = nodeEnv === 'production';
  return {
    access: isProd ? '__Host-frose_access_token' : 'frose_access_token',
    refresh: isProd ? '__Host-frose_refresh_token' : 'frose_refresh_token',
  };
}

export function readAccessTokenCookie(
  cookies: Record<string, string | undefined> | undefined,
  nodeEnv: string
): string | undefined {
  if (!cookies) return undefined;
  const { access } = getSessionCookieNames(nodeEnv);
  return cookies[access];
}

export function readRefreshTokenCookie(
  cookies: Record<string, string | undefined> | undefined,
  nodeEnv: string
): string | undefined {
  if (!cookies) return undefined;
  const { refresh } = getSessionCookieNames(nodeEnv);
  return cookies[refresh];
}

export function hasSessionCookie(
  cookies: Record<string, string | undefined> | undefined,
  rawCookieHeader: string | undefined,
  nodeEnv: string
): boolean {
  const { access, refresh } = getSessionCookieNames(nodeEnv);
  return Boolean(
    cookies?.[access] ||
    cookies?.[refresh] ||
    (rawCookieHeader && (rawCookieHeader.includes(access) || rawCookieHeader.includes(refresh)))
  );
}

export function setAccessCookie(reply: FastifyReply, nodeEnv: string, accessToken: string, maxAgeSeconds: number = 900) {
  const isProd = nodeEnv === 'production';
  const { access } = getSessionCookieNames(nodeEnv);
  reply.setCookie(access, accessToken, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: maxAgeSeconds,
  });
}

export function setSessionCookies(
  reply: FastifyReply,
  nodeEnv: string,
  accessToken: string,
  refreshToken: string
) {
  const isProd = nodeEnv === 'production';
  const { access, refresh } = getSessionCookieNames(nodeEnv);

  reply.setCookie(access, accessToken, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 900, // 15 minutes
  });

  reply.setCookie(refresh, refreshToken, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 30 * 86400, // 30 days
  });
}

export function clearSessionCookies(reply: FastifyReply, nodeEnv: string) {
  const isProd = nodeEnv === 'production';
  const { access, refresh } = getSessionCookieNames(nodeEnv);
  const opts = { path: '/', httpOnly: true, secure: isProd, sameSite: 'strict' as const };
  reply.clearCookie(access, opts);
  reply.clearCookie(refresh, opts);
}
