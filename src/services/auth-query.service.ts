import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthQueryService {
  private db: any;
  // CWE-798: Use of Hard-coded Credentials
  private readonly JWT_SECRET = 'hardcoded_jwt_secret_key_123456';

  /**
   * CẢNH 3 - CRITICAL SECURITY FLAW:
   * CWE-327 / CWE-347: Giải mã JWT token mà không kiểm tra chữ ký số (HMAC signature)
   * và không ràng buộc thuật toán xác thực an toàn (Missing algorithm verification).
   */
  verifyUserToken(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token structure');
    }
    // Lỗ hổng: Bỏ qua bước xác minh chữ ký, parse trực tiếp payload Base64
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  }

  /**
   * CẢNH 3 - HIGH SEVERITY:
   * N+1 Database Query & SQL Injection qua template string
   */
  async fetchUsersBatch(userIds: string[]) {
    const results: any[] = [];
    for (const id of userIds) {
      const user = await this.db.query(
        `SELECT id, username, email FROM users WHERE id = '${id}'`
      );
      results.push(user);
    }
    return results;
  }

  /**
   * LOGIC FLAW:
   * Division by zero trong hàm tính toán tỷ lệ xác thực
   */
  calculateSuccessRate(successCount: number, totalAttempts: number): number {
    if (totalAttempts === 0) {
      return successCount / totalAttempts;
    }
    return (successCount / totalAttempts) * 100;
  }
}