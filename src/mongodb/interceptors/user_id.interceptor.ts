import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable } from 'rxjs';

@Injectable()
export class UserIdInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {

    const { jwtDecrypt, jwtVerify } = await import('jose');

    const request = context.switchToHttp().getRequest();
    const version = request.url.split('/')[1];

    if (version === 'v2') {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authorization token missing or invalid');
      }

      const token = authHeader.split(' ')[1];
      try {
        // 🔹 Step 1: Generate Hash Key
        const secret_key = process.env.JOSE_SECRET || '';
        const hash = createHash('sha256').update(secret_key).digest();

        // 🔹 Step 2: Decrypt the Token
        const jwtDecryptedToken = await jwtDecrypt(token, hash);

        if (!jwtDecryptedToken.payload.jwtSignedToken) {
          throw new UnauthorizedException("jwtSignedToken not found in decrypted payload");
        }
       // 🔹 Step 3: Verify the Inner JWT
        const jwtSignedToken = String(jwtDecryptedToken.payload.jwtSignedToken);
        const jwtSigninKey = new TextEncoder().encode(process.env.JWT_SIGNIN_PRIVATE_KEY);
        const verifiedToken = await jwtVerify(jwtSignedToken, jwtSigninKey);

        if (!verifiedToken.payload.virtual_id) {
          throw new UnauthorizedException('User ID missing in token');
        }
        // 🔹 Step 4: Attach User ID to the request
        request.params.userId = verifiedToken.payload.virtual_id;

      } catch (error) {
        console.error('JWT Verification Error:', error.message);
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    return next.handle();
  }
}
