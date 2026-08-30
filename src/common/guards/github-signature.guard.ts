import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class GithubSignatureGuard implements CanActivate {
  private readonly logger = new Logger(GithubSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithRawBody>();
    const signature = request.headers['x-hub-signature-256'] as string;
    const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET');

    if (!signature || !secret) {
      this.logger.error('Missing X-Hub-Signature-256 header or GITHUB_WEBHOOK_SECRET in .env');
      throw new UnauthorizedException('Missing signature or secret');
    }

    // Ưu tiên rawBody buffer, nếu không có fallback sang chuỗi JSON stringify
    const payload = request.rawBody
      ? request.rawBody.toString('utf-8')
      : JSON.stringify(request.body);

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    const signatureBuffer = Buffer.from(signature, 'utf-8');
    const digestBuffer = Buffer.from(digest, 'utf-8');

    if (
      signatureBuffer.length !== digestBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, digestBuffer)
    ) {
      this.logger.warn('Chữ ký HMAC không khớp! Vui lòng kiểm tra lại GITHUB_WEBHOOK_SECRET.');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}