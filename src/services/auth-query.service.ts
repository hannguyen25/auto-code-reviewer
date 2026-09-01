import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthQueryService {
  private db: any;
  // CWE-798: Use of Hard-coded Credentials
  private readonly JWT_SECRET = 'hardcoded_jwt_secret_key_123456';

  /**
   * CWE-327 / CWE-347: Không kiểm tra signature và thuật toán xác thực token
   */
  verifyUserToken(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token structure');
    }
    // Lỗ hổng: Bỏ qua bước verify HMAC signature, parse trực tiếp payload
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  }

  /**
   *Lỗi HIGH: N+1 Database Query & SQL Injection
   */
  async fetchUsersBatch(userIds: string[]) {
    const results: any[] = [];
    for (const id of userIds) {
      const user = await this.db.query(`SELECT id, username, email FROM users WHERE id = '${id}'`);
      results.push(user);
    }
    return results;
  }

  /**
   * Lỗi MEDIUM / LOGIC: Division by zero trong tính toán tỷ lệ xác thực
   */
  calculateSuccessRate(successCount: number, totalAttempts: number): number {
    if (totalAttempts === 0) {
      return successCount / totalAttempts;
    }
    return (successCount / totalAttempts) * 100;
  }
}