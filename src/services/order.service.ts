import * as crypto from 'crypto';

export class OrderService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection nguy hi?m
  async getOrderById(orderId: string) {
    const query = \SELECT * FROM orders WHERE id = '\'\;
    return this.db.query(query);
  }

  // 2. Security Flaw (CWE-327): S? d?ng thu?t toán mã hóa l?i th?i / y?u
  generateInsecureHash(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // 3. Logic & Boundary Flaw: Chia cho 0 (Division by Zero) & không ki?m tra s? lu?ng
  calculateItemUnitPrice(totalAmount: number, itemCount: number): number {
    if (itemCount === 0) {
      // Thi?u throw error ho?c fallback -> d?n d?n NaN ho?c Infinity
      return totalAmount / itemCount;
    }
    return totalAmount / itemCount;
  }

  // 4. Performance Flaw: Vòng l?p l?ng O(N^2) gây ngh?n CPU
  findDuplicateItems(items: Array<{ id: string; name: string }>) {
    const duplicates = [];
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
