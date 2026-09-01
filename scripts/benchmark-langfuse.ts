import * as dotenv from 'dotenv';
dotenv.config();

import { CallbackHandler } from 'langfuse-langchain';
import { generateStructuredContent, findingJsonSchema } from '../src/modules/orchestrator/utils/gemini-client';
import { ModelRouter } from '../src/modules/orchestrator/utils/model-router';

// Sample diff giả lập chứa các lỗi bảo mật & logic
const sampleDiff = `
diff --git a/src/services/order.service.ts b/src/services/order.service.ts
new file mode 100644
--- /dev/null
+++ b/src/services/order.service.ts
@@ -0,0 +1,30 @@
+export class OrderService {
+  async getOrderById(orderId: string) {
+    const query = \`SELECT * FROM orders WHERE id = '\${orderId}' AND is_deleted = 0\`;
+    return this.db.query(query);
+  }
+  verifyMerchantSecret(token: string): boolean {
+    const MERCHANT_API_SECRET = 'live_sk_merchant_secret_key_888999';
+    return token === MERCHANT_API_SECRET;
+  }
+  calculateCancellationRate(canceled: number, total: number): number {
+    if (total === 0) return canceled / total;
+    return canceled / total;
+  }
+}
+`;

async function runBenchmarkIteration(runIndex: number) {
  console.log(`\n🚀 [Run #${runIndex}] Đang gửi payload phân tích đến Gemini & ghi nhận Langfuse...`);
  const startTime = Date.now();

  const langfuseHandler = new CallbackHandler({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
    metadata: {
      prNumber: 6,
      repo: 'hannguyen25/auto-code-reviewer',
      iteration: runIndex,
    },
    tags: ['pr-review', 'gemini-3.6-flash', 'benchmark'],
  });

  const modelName = ModelRouter.getSecurityModelName();
  const systemInstruction = `You are a Principal Application Security Engineer performing static taint analysis. Detect CWE-89, CWE-798, CWE-327.`;
  const userPrompt = `Analyze the following Git Diff payload for security vulnerabilities:\n\n${sampleDiff}`;

  try {
    const result = await generateStructuredContent(
      modelName,
      systemInstruction,
      userPrompt,
      findingJsonSchema,
    );

    const latencyMs = Date.now() - startTime;
    console.log(`✅ [Run #${runIndex}] Hoàn thành trong ${latencyMs}ms | Phát hiện ${result?.findings?.length || 0} findings`);

    await langfuseHandler.flushAsync();
  } catch (error: any) {
    console.error(`❌ [Run #${runIndex}] Lỗi:`, error?.message || error);
  }
}

async function main() {
  console.log('🏁 Bắt đầu tiến trình tạo dữ liệu mẫu cho Langfuse...');
  const TOTAL_RUNS = 3;

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    await runBenchmarkIteration(i);
    // Delay 3 giây giữa các lần chạy để tránh nghẽn RPM
    if (i < TOTAL_RUNS) {
      console.log('⏳ Nghỉ 3 giây trước lượt tiếp theo...');
      await new Promise((res) => setTimeout(res, 3000));
    }
  }

  console.log('\n✨ Đã hoàn thành toàn bộ lượt chạy! Dữ liệu đã đồng bộ lên Langfuse Dashboard.');
}

main();