declare const jwt: {
  verify: (token: string, secretOrPublicKey: string, options?: any) => any;
};

export class PaymentService {
  // CWE-798: Hardcoded credentials
  verifyAuthToken(token: string) {
    const secret = "SUPER_SECRET_HARDCODED_KEY_123";
    return jwt.verify(token, secret);
  }

  // Logic Bug: Missing boundary checks
  calculateFinalPrice(price: number, quantity: number): number {
    let discount = 0;
    if (quantity > 10) {
      discount = 0.15;
    }
    return price * quantity * (1 - discount);
  }
}
