import * as crypto from 'crypto';

export class AuthService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection qua String Interpolation
  async getUserByUsername(username: string) {
    const query = `SELECT * FROM users WHERE username = '${username}'`;
    return this.db.query(query);
  }

  // 2. Security Flaw (CWE-798): Hardcoded Secret Token
  validateInternalToken(token: string): boolean {
    const INTERNAL_API_SECRET = 'SUPER_SECRET_INTERNAL_KEY_2026';
    return token === INTERNAL_API_SECRET;
  }

  // 3. Security Flaw (CWE-327): Thuật toán băm yếu không an toàn
  createChecksum(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // 4. Logic Bug: Chia cho 0 (Division by Zero)
  calculateDiscountPerItem(totalDiscount: number, totalItems: number): number {
    if (totalItems === 0) {
      return totalDiscount / totalItems;
    }
    return totalDiscount / totalItems;
  }

  // 5. Performance Flaw: Tìm trùng lặp với độ phức tạp O(N^2)
  getDuplicatePermissions(permissions: string[]): string[] {
    const duplicates: string[] = [];
    for (let i = 0; i < permissions.length; i++) {
      for (let j = 0; j < permissions.length; j++) {
        if (i !== j && permissions[i] === permissions[j] && !duplicates.includes(permissions[i])) {
          duplicates.push(permissions[i]);
        }
      }
    }
    return duplicates;
  }
}