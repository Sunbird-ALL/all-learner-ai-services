import axios from 'axios';
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ValidateApiKeyInterceptor implements NestInterceptor {
    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        try {
            const apiKeyEnabled = process.env.API_KEY_ENABLE === 'true';
            const clientApiKey = request.headers['api-key'];
            const validateUrl = process.env.AUTH_SERVICE_API || '';

            if (!apiKeyEnabled) {
                return next.handle();
            }
            if (!clientApiKey || typeof clientApiKey !== 'string') {
                throw new HttpException('API key missing or invalid', HttpStatus.UNAUTHORIZED);
            }
            const responseFromAuth = await axios.post(validateUrl, { apiKey: clientApiKey });

            if (responseFromAuth.data.isValid === true) {
                return next.handle();
            } else {
                throw new HttpException('Unauthorized: API key invalid', HttpStatus.UNAUTHORIZED);
            }
        } catch (err) {
            console.error('API key validation error:', err);
            if (err instanceof HttpException) {
                throw err;
            }
            throw new HttpException('Error validating API key', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}

export default ValidateApiKeyInterceptor;