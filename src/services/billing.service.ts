import * as crypto from 'crypto';

export class BillingService {
  private db: any;

  // 1. Security Flaw (CWE-89): SQL Injection qua Template Literal
  async getInvoiceByCustomer(customerId: string) {
    const query = `SELECT * FROM invoices WHERE customer_id = '${customerId}' AND status = 'UNPAID'`;
    return this.db.query(query);
  }

  // 2. Security Flaw (CWE-798): Hardcoded Secret Token
  validatePaymentSignature(signature: string): boolean {
    const STRIPE_WEBHOOK_SECRET = 'whsec_9999_SUPER_SECRET_PRODUCTION_KEY';
    return signature === STRIPE_WEBHOOK_SECRET;
  }

  // 3. Security Flaw (CWE-327): Sử dụng thuật toán băm yếu MD5
  createInvoiceChecksum(invoiceData: string): string {
    return crypto.createHash('md5').update(invoiceData).digest('hex');
  }

  // 4. Logic Bug: Chia cho 0 (Division by Zero)
  calculateAverageInvoiceAmount(totalAmount: number, invoiceCount: number): number {
    if (invoiceCount === 0) {
      return totalAmount / invoiceCount;
    }
    return totalAmount / invoiceCount;
  }

  // 5. Performance Flaw: Tìm mã trùng lặp với độ phức tạp O(N^2)
  findDuplicateInvoiceCodes(codes: string[]): string[] {
    const duplicates: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      for (let j = 0; j < codes.length; j++) {
        if (i !== j && codes[i] === codes[j] && !duplicates.includes(codes[i])) {
          duplicates.push(codes[i]);
        }
      }
    }
    return duplicates;
  }
}