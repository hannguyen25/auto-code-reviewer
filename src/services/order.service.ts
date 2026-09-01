import * as crypto from 'crypto';

export class OrderService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection qua Template String
  async getOrderById(orderId: string) {
    const query = `SELECT * FROM orders WHERE id = '${orderId}' AND is_deleted = 0`;
    return this.db.query(query);
  }

  // 2. Security Flaw (CWE-798): Hardcoded Secret API Token
  verifyMerchantSecret(token: string): boolean {
    const MERCHANT_API_SECRET = 'live_sk_merchant_secret_key_888999';
    return token === MERCHANT_API_SECRET;
  }

  // 3. Security Flaw (CWE-327): Sử dụng thuật toán băm yếu (MD5)
  createOrderChecksum(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // 4. Logic Bug: Chia cho 0 (Division by Zero)
  calculateCancellationRate(canceledCount: number, totalOrders: number): number {
    if (totalOrders === 0) {
      return canceledCount / totalOrders;
    }
    return canceledCount / totalOrders;
  }

  // 5. Performance Flaw: Tìm trùng lặp với thuật toán O(N^2)
  findDuplicateItems(itemIds: string[]): string[] {
    const duplicates: string[] = [];
    for (let i = 0; i < itemIds.length; i++) {
      for (let j = 0; j < itemIds.length; j++) {
        if (i !== j && itemIds[i] === itemIds[j] && !duplicates.includes(itemIds[i])) {
          duplicates.push(itemIds[i]);
        }
      }
    }
    return duplicates;
  }
}