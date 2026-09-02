import * as http from 'node:http';
import * as https from 'node:https';
import { createHash } from 'node:crypto';
import * as jose from 'jose';

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

export const postJson = <T = any>(
  urlStr: string,
  body: unknown,
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
            try {
              const parsed = JSON.parse(responseBody);
              resolve(parsed);
            } catch (parseErr) {
              console.error(
                'Failed to parse JSON response from auth service:',
                parseErr,
              );
              reject(parseErr);
            }
          });
        },
      );
      req.on('error', (err) => {
        console.error('HTTP request error to auth service:', err.message);
        reject(err);
      });
      req.write(data);
      req.end();
    } catch (err) {
      console.error('Invalid URL or request setup:', err);
      reject(err);
    }
  });
};

export const checkTokenStatus = async (
  userId: number | string,
  token: string,
): Promise<{ isActive: boolean }> => {
  const orcServiceUrl = process.env.ALL_ORC_SERVICE_URL;
  const loginServiceUrl = process.env.AXL_LOGIN_SERVICE_URL;

  if (orcServiceUrl) {
    try {
      const response: any = await postJson(orcServiceUrl, {
        user_id: userId,
        token: token,
      });
      const isActive =
        response?.result?.isActive ??
        response?.data?.result?.isActive ??
        response?.isActive ??
        null;
      if (isActive !== null) {
        return { isActive: Boolean(isActive) };
      }
    } catch (err: any) {
      console.error(
        'Error fetching token status from orchestration service:',
        err?.message || err,
      );
    }
  }

  if (loginServiceUrl) {
    try {
      const statusData: any = await postJson(
        loginServiceUrl,
        {
          user_id: Number(userId) || userId,
        },
      );
      const activeToken =
        statusData?.responseObj?.responseDataParams?.data?.token ??
        statusData?.data?.token ??
        statusData?.token ??
        null;
      if (activeToken) {
        return { isActive: activeToken === token };
      }
    } catch (fetchErr: any) {
      console.error(
        'Error fetching token status from axl-login-service:',
        fetchErr?.message || fetchErr,
      );
    }
  }

  return { isActive: false };
};
