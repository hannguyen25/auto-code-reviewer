import * as crypto from 'crypto';

export class OrderService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection
  async getOrderById(orderId: string) {
    const query = `SELECT * FROM orders WHERE id = '${orderId}'`;
    return this.db.query(query);
  }

  // 2. Security Flaw (CWE-327): Sử dụng thuật toán hash yếu
  generateInsecureHash(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // 3. Logic Flaw: Lỗi chia cho 0
  calculateItemUnitPrice(totalAmount: number, itemCount: number): number {
    if (itemCount === 0) {
      return totalAmount / itemCount;
    }
    return totalAmount / itemCount;
  }

  // 4. Performance Flaw: Thuật toán O(N^2)
  findDuplicateItems(items: Array<{ id: string; name: string }>) {
    const duplicates: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i !== j && items[i].id === items[j].id) {
          duplicates.push(items[i]);
        }
      }
    }
    return duplicates;
  }
}