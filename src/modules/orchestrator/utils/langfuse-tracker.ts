import { CallbackHandler } from '@langfuse/langchain';
import { Langfuse } from 'langfuse';
import { Logger } from '@nestjs/common';

export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export class LangfuseTracker {
  private static readonly logger = new Logger('LangfuseTracker');
  private static readonly MAX_BUDGET = parseFloat(process.env.MAX_BUDGET_PER_PR || '0.05');

  
  public static readonly langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
  });

  private static activeHandlers: CallbackHandler[] = [];

  /**
   * Bảng giá chuẩn (USD / 1 triệu tokens) để tính toán $ Cost Cap (NFR-4.2)
   */
  private static readonly PRICING: Record<string, { prompt: number; completion: number }> = {
    'gemini-1.5-flash': { prompt: 0.075, completion: 0.3 },
    'gemini-1.5-pro': { prompt: 1.25, completion: 5.0 },
    'gemini-2.5-flash': { prompt: 0.075, completion: 0.3 },
    'gemini-2.5-pro': { prompt: 1.25, completion: 5.0 },
  };

  
  static createCallbackHandler(prNumber: number, repoFullName: string): CallbackHandler {
    const handler = new CallbackHandler({
      sessionId: `pr-${repoFullName.replace('/', '-')}-${prNumber}`,
      tags: [`pr-${prNumber}`, repoFullName],
    });

    this.activeHandlers.push(handler);
    return handler;
  }

  /**
   * Flush toàn bộ trace từ bộ nhớ đệm lên Langfuse Cloud trước khi tắt tiến trình (NFR-4.1)
   */
  static async flush(): Promise<void> {
    try {
      await Promise.all(
        this.activeHandlers.map(async (h: any) => {
          if (typeof h.flushAsync === 'function') await h.flushAsync();
          if (typeof h.shutdownAsync === 'function') await h.shutdownAsync();
        }),
      );
      await this.langfuse.flushAsync();
      this.activeHandlers = [];
      this.logger.log('✅ [Langfuse] Đã flush toàn bộ traces lên Cloud.');
    } catch (err: any) {
      this.logger.warn(`⚠️ [Langfuse Warning] Lỗi khi flush traces: ${err.message}`);
    }
  }

  /**
   * Tính toán chi phí thực tế cho từng Node dựa trên số lượng Token tiêu thụ
   */
  static calculateCost(usage: TokenUsageStats): number {
    const rate = this.PRICING[usage.model] || this.PRICING['gemini-1.5-flash'];
    const inputCost = (usage.inputTokens / 1_000_000) * rate.prompt;
    const outputCost = (usage.outputTokens / 1_000_000) * rate.completion;
    return inputCost + outputCost;
  }

  /**
   * Chốt chặn ngân sách: Tự động cảnh báo và ngắt nếu chi phí vượt quá $0.05 / PR (NFR-4.2)
   */
  static checkBudgetLimit(accumulatedCost: number): { isExceeded: boolean; message?: string } {
    if (accumulatedCost > this.MAX_BUDGET) {
      const msg = `🚨 [Cost Limit Exceeded] Tổng chi phí $${accumulatedCost.toFixed(4)} vượt mức cho phép ($${this.MAX_BUDGET}/PR).`;
      this.logger.error(msg);
      return { isExceeded: true, message: msg };
    }
    return { isExceeded: false };
  }
}