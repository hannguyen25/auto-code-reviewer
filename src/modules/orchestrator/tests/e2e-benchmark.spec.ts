import { Test, TestingModule } from '@nestjs/testing';
import { ReviewGraphWorkflow } from '../graphs/review.graph';
import { AgentStateType } from '../schemas/review-state.schema';
import { AppMetricsService } from '../../metrics/metrics.service';
import * as geminiClient from '../utils/gemini-client';

describe('Giai đoạn 5: E2E Benchmark Pipeline (NFR-1.1, NFR-4.2)', () => {
  let reviewWorkflow: ReviewGraphWorkflow;

  beforeAll(async () => {
    // 1. Mock tầng Gemini Client để tránh dính Rate Limit (429) & Quota Cap
    jest.spyOn(geminiClient, 'generateStructuredContent').mockImplementation(async (model, sys, prompt) => {
      // Giả lập độ trễ mạng thực tế của LLM (400ms)
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        findings: [
          {
            filePath: 'src/services/order.service.ts',
            line: 3,
            diffPosition: 3,
            category: 'LOGIC',
            severity: 'LOW',
            title: 'Boundary Check Validated',
            comment: 'Input validation logic is sound.',
            suggestion: '',
            confidenceScore: 0.95,
          },
        ],
      } as any;
    });

    jest.spyOn(geminiClient, 'generateRawContent').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return `
const assert = require('assert');
// Automated benchmark test stub
assert.strictEqual(typeof 42, 'number');
console.log('✅ Unit test benchmark passed cleanly');
`;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewGraphWorkflow,
        {
          provide: AppMetricsService,
          useValue: {
            startAgentTimer: () => () => {},
            recordQueueLatency: () => {},
            recordReviewResult: () => {},
          },
        },
      ],
    }).compile();

    reviewWorkflow = module.get<ReviewGraphWorkflow>(ReviewGraphWorkflow);
  }, 30000);

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('E2E Latency trên 50 PR benchmark (<= 300 LOC) phải <= 60s/PR', async () => {
    const totalPRs = 50;
    const latencies: number[] = [];

    const mockDiff = `diff --git a/src/services/order.service.ts b/src/services/order.service.ts
index 1111111..2222222 100644
--- a/src/services/order.service.ts
+++ b/src/services/order.service.ts
@@ -1,5 +1,15 @@
 export class OrderService {
+  calculateDiscount(price: number, quantity: number): number {
+    if (price < 0 || quantity <= 0) throw new Error('Invalid input');
+    let rate = 0;
+    if (quantity >= 10) rate = 0.1;
+    if (quantity >= 50) rate = 0.2;
+    return price * quantity * (1 - rate);
+  }
 }`;

    for (let i = 1; i <= totalPRs; i++) {
      const state: AgentStateType = {
        prNumber: 100 + i,
        repoFullName: 'enterprise/core-repo',
        headSha: `sha-${i}`,
        baseSha: 'main-sha',
        parsedFiles: [
          {
            filePath: 'src/services/order.service.ts',
            rawDiff: mockDiff,
            changedLines: [2, 3, 4, 5, 6, 7, 8],
            scopes: [
              {
                scopeType: 'method',
                scopeName: 'calculateDiscount',
                startLine: 1,
                endLine: 10,
              },
            ],
            imports: [],
          },
        ],
        rawFindings: [],
        verifiedFindings: [],
        findings: [],
        generatedTestCode: '',
        sandboxReport: {
          executed: false,
          success: true,
          hasSyntaxError: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
        },
        retryCount: 0,
        summaryMarkdown: '',
        isApproved: false,
        errors: [],
      };

      const start = Date.now();
      const result = await reviewWorkflow.graph.invoke(state);
      const durationSeconds = (Date.now() - start) / 1000;
      latencies.push(durationSeconds);

      expect(result).toBeDefined();
      expect(durationSeconds).toBeLessThanOrEqual(60);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log(`\n================ BENCHMARK REPORT ================`);
    console.log(`Total Processed: ${totalPRs} PRs`);
    console.log(`Average Latency: ${avgLatency.toFixed(2)}s`);
    console.log(`Max Latency    : ${maxLatency.toFixed(2)}s`);
    console.log(`Target Status  : ${maxLatency <= 60 ? 'PASS (<= 60s)' : 'FAIL'}`);
    console.log(`==================================================\n`);

    expect(maxLatency).toBeLessThanOrEqual(60);
  }, 300000);
});