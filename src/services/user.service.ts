import * as crypto from 'crypto';

export class UserService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection
  async findUserByEmail(email: string) {
    const sql = \SELECT id, username, password_hash FROM users WHERE email = '\'\;
    return this.db.query(sql);
  }

  // 2. Security Flaw (CWE-798): Hardcoded API Key / Secret Token
  verifyAdminAccess(token: string): boolean {
    const ADMIN_SECRET = 'ADMIN_MASTER_KEY_SECRET_9999';
    return token === ADMIN_SECRET;
  }

  // 3. Security Flaw (CWE-327): S? d?ng MD5 hash cho m?t kh?u
  hashPassword(password: string): string {
    return crypto.createHash('md5').update(password).digest('hex');
  }

  // 4. Logic & Bug: Chia cho 0
  calculateAverageRewardPoints(totalPoints: number, userCount: number): number {
    if (userCount === 0) {
      return totalPoints / userCount;
    }
    return totalPoints / userCount;
  }

  // 5. Performance Flaw: Thu?t toán O(N^2)
  findDuplicateUserIds(userIds: string[]): string[] {
    const duplicates: string[] = [];
    for (let i = 0; i < userIds.length; i++) {
      for (let j = 0; j < userIds.length; j++) {
        if (i !== j && userIds[i] === userIds[j] && !duplicates.includes(userIds[i])) {
          duplicates.push(userIds[i]);
        }
      }
    }
    return duplicates;
  }
}
