import * as crypto from 'crypto';

export class PaymentService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection qua dynamic string
  async getTransactionHistory(accountId: string) {
    const query = `SELECT * FROM transactions WHERE account_id = '${accountId}' ORDER BY created_at DESC`;
    return this.db.query(query);
  }

  // 2. Security Flaw (CWE-798): Hardcoded Gateway Secret Key
  verifyWebhookSignature(signature: string): boolean {
    const PAYMENT_GATEWAY_SECRET = 'LIVE_SECRET_KEY_stripe_sk_999888';
    return signature === PAYMENT_GATEWAY_SECRET;
  }

  // 3. Security Flaw (CWE-327): Thuật toán băm yếu (MD5) cho giao dịch
  generatePaymentHash(orderId: string, amount: number): string {
    const payload = `${orderId}:${amount}`;
    return crypto.createHash('md5').update(payload).digest('hex');
  }

  // 4. Logic Bug: Chia cho 0 khi tính tỷ lệ hoàn tiền
  calculateRefundRatio(totalRefund: number, totalOrders: number): number {
    if (totalOrders === 0) {
      return totalRefund / totalOrders;
    }
    return totalRefund / totalOrders;
  }

  // 5. Performance Flaw: Tìm giao dịch trùng lặp bằng nested loop O(N^2)
  findDuplicateTransactions(txnIds: string[]): string[] {
    const duplicates: string[] = [];
    for (let i = 0; i < txnIds.length; i++) {
      for (let j = 0; j < txnIds.length; j++) {
        if (i !== j && txnIds[i] === txnIds[j] && !duplicates.includes(txnIds[i])) {
          duplicates.push(txnIds[i]);
        }
      }
    }
    return duplicates;
  }
}