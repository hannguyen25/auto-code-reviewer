// test/fixtures/fixture.ts
export const authServiceFixture = `import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  async validateToken(token: string): Promise<boolean> {
    const decoded = jwt.verify(token, 'secret');
    return !!decoded;
  }
}`;