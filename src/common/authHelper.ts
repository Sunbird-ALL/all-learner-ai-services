import * as http from 'node:http';
import * as https from 'node:https';
import { createHash } from 'node:crypto';
import * as jose from 'jose';

// Token checks go to axl-login-service on every authenticated request. Reuse
// connections instead of opening a new TCP connection per check. Idle sockets
// are closed after 4 s, before Node's default 5 s server keep-alive timeout.
const KEEP_ALIVE_AGENT_OPTIONS = { keepAlive: true, timeout: 4000 };
const httpAgent = new http.Agent(KEEP_ALIVE_AGENT_OPTIONS);
const httpsAgent = new https.Agent(KEEP_ALIVE_AGENT_OPTIONS);

export const getEncryptionKey = (): Uint8Array => {
  const encKeyStr = process.env.JOSE_ENCRYPTION_PRIVATE_KEY;
  if (encKeyStr) {
    return jose.base64url.decode(encKeyStr);
  }
  const secretKey = process.env.JOSE_SECRET || '';
  return createHash('sha256').update(secretKey).digest();
};

export const getSigningKey = (): Uint8Array => {
  const signinKeyStr = process.env.JOSE_SIGNIN_PRIVATE_KEY || '';
  return new TextEncoder().encode(signinKeyStr);
};

export class AuthServiceUnavailableError extends Error {
  public readonly code?: string;
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AuthServiceUnavailableError';
    this.code = (cause as { code?: string } | undefined)?.code;
  }
}

function logAuthServiceEvent(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.error(
    JSON.stringify({
      level: 'error',
      event,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

export const postJson = <T = any>(
  urlStr: string,
  body: unknown,
  attempt = 0,
): Promise<T | null> => {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const data = JSON.stringify(body);
      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(
        url,
        {
          method: 'POST',
          agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            const statusCode = res.statusCode ?? 0;
            if (statusCode < 200 || statusCode >= 300) {
              logAuthServiceEvent('auth_service_unexpected_status', {
                url: urlStr,
                statusCode,
                bodySnippet: responseBody.slice(0, 200),
              });
              reject(
                new AuthServiceUnavailableError(
                  `Auth service responded with unexpected status ${statusCode}`,
                ),
              );
              return;
            }
            try {
              const parsed = JSON.parse(responseBody);
              resolve(parsed);
            } catch (parseErr) {
              logAuthServiceEvent('auth_service_invalid_response', {
                url: urlStr,
                statusCode,
                bodySnippet: responseBody.slice(0, 200),
                error:
                  parseErr instanceof Error
                    ? parseErr.message
                    : String(parseErr),
              });
              reject(
                new AuthServiceUnavailableError(
                  'Auth service returned an invalid response',
                  parseErr,
                ),
              );
            }
          });
        },
      );
      req.on('error', (err: NodeJS.ErrnoException) => {
        // The server may close an idle keep-alive socket just as it is reused;
        // that request never reached it, so send it once more on a new socket.
        if (attempt === 0 && req.reusedSocket && err.code === 'ECONNRESET') {
          postJson<T>(urlStr, body, 1).then(resolve, reject);
          return;
        }
        logAuthServiceEvent('auth_service_unreachable', {
          url: urlStr,
          errorCode: err.code ?? null,
          error: err.message,
        });
        reject(new AuthServiceUnavailableError('Auth service is unreachable', err));
      });
      req.write(data);
      req.end();
    } catch (err) {
      logAuthServiceEvent('auth_service_request_setup_failed', {
        url: urlStr,
        error: err instanceof Error ? err.message : String(err),
      });
      reject(
        new AuthServiceUnavailableError(
          'Auth service request could not be constructed',
          err,
        ),
      );
    }
  });
};

// Optional: remember an "active" answer for a short time, so a learner's
// requests do not each call axl-login-service. Off unless
// TOKEN_STATUS_CACHE_TTL_MS is set (> 0). While on, a token that was logged out
// keeps working for up to that long, so agree the value with the login team.
// Only "active" answers are kept; "inactive" and errors are never cached.
const TOKEN_STATUS_CACHE_MAX_ENTRIES = 50000;
const tokenStatusCache = new Map<string, number>();

const tokenStatusCacheTtlMs = (): number => {
  const ttl = Number(process.env.TOKEN_STATUS_CACHE_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 0;
};

const tokenStatusCacheKey = (userId: number | string, token: string): string =>
  `${userId}:${createHash('sha256').update(token).digest('base64')}`;

// Checks whether `token` is the user's currently active session token, by asking
// axl-login-service's tokenStatus API directly. Strictly no local fallback: either
// axl-login-service answers true/false, or this throws AuthServiceUnavailableError.
export const checkTokenStatus = async (
  userId: number | string,
  token: string,
): Promise<boolean> => {
  const loginServiceUrl = process.env.AXL_LOGIN_SERVICE_URL || '';
  const ttl = tokenStatusCacheTtlMs();
  const cacheKey = ttl > 0 ? tokenStatusCacheKey(userId, token) : '';
  if (ttl > 0) {
    const expiresAt = tokenStatusCache.get(cacheKey);
    if (expiresAt !== undefined) {
      if (expiresAt > Date.now()) return true;
      tokenStatusCache.delete(cacheKey);
    }
  }

  try {
    const statusData: any = await postJson(loginServiceUrl, {
      user_id: Number(userId) || userId,
      token,
    });
    const isActive =
      statusData?.responseObj?.responseDataParams?.data?.isActive ??
      statusData?.data?.isActive ??
      statusData?.isActive ??
      false;
    const active = Boolean(isActive);
    if (active && ttl > 0) {
      if (tokenStatusCache.size >= TOKEN_STATUS_CACHE_MAX_ENTRIES) {
        // Drop the oldest entry (Map keeps insertion order).
        tokenStatusCache.delete(tokenStatusCache.keys().next().value);
      }
      tokenStatusCache.set(cacheKey, Date.now() + ttl);
    }
    return active;
  } catch (err) {
    logAuthServiceEvent('auth_service_check_failed', {
      url: loginServiceUrl,
      userId,
      errorCode:
        err instanceof AuthServiceUnavailableError ? err.code ?? null : null,
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof AuthServiceUnavailableError) {
      throw err;
    }
    throw new AuthServiceUnavailableError(
      'Not able to connect with axl-login-service',
      err,
    );
  }
};
