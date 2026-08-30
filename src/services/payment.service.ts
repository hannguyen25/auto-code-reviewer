// Mock stub cho jsonwebtoken để tránh lỗi TypeScript
declare const jwt: {
  verify: (token: string, secretOrPublicKey: string, options?: any) => any;
};

export class PaymentService {
  // Lỗi 1 (Security - CWE-798 & CWE-327): Hardcoded Secret & không định nghĩa algorithm
  verifyAuthToken(token: string) {
    const secret = "SUPER_SECRET_HARDCODED_KEY_123";
    return jwt.verify(token, secret);
  }

  // Lỗi 2 (Logic / Bug): Lỗi điều kiện giảm giá dẫn tới kết quả âm hoặc sai tỷ lệ
  calculateFinalPrice(price: number, quantity: number): number {
    let discount = 0;
    if (quantity > 10) {
      discount = 0.15;
    }
    // Bug: Không kiểm tra price < 0 hoặc quantity < 0
    return price * quantity * (1 - discount);
  }
}