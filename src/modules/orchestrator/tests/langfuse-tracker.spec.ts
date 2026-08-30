import * as dotenv from 'dotenv';
dotenv.config();

import { Langfuse } from 'langfuse';
import { CallbackHandler } from 'langfuse-langchain';
import { reviewGraph } from '../graphs/review.graph';
import { MOCK_PR_UNDER_300_LOC, SENSITIVE_PATTERNS } from './fixtures/mock-pr';
import { AgentStateType } from '../schemas/review-state.schema';

describe('Giai đoạn 4: Observability, Tracing & Giám sát Chi phí (NFR-4.1, NFR-4.2, NFR-3.3)', () => {
  let langfuse: Langfuse;
  const maxBudget = parseFloat(process.env.MAX_BUDGET_PER_PR || '0.05');

  beforeAll(() => {
    langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    });
  });

  afterAll(async () => {
    await langfuse.shutdownAsync();
  });

  const getInitialState = (overrides = {}): AgentStateType => ({
    ...MOCK_PR_UNDER_300_LOC,
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
    ...overrides,
  });

  // Test Case 3.1: Langfuse Full-Trace Tracking (NFR-4.1)
  describe('Test Case 3.1: Langfuse Full-Trace Tracking (NFR-4.1)', () => {
    it(
      'phải ghi nhận trace và metadata của StateGraph trên Langfuse',
      async () => {
        const langfuseHandler = new CallbackHandler({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        });

        await reviewGraph.invoke(getInitialState(), {
          callbacks: [langfuseHandler],
        });

        await langfuseHandler.flushAsync();
        await langfuse.flushAsync();

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const traceId = langfuseHandler.getTraceId();
        expect(traceId).toBeDefined();

        const fetchedTrace = await langfuse.fetchTrace(traceId!);
        expect(fetchedTrace).toBeDefined();

        const observations = fetchedTrace.data?.observations ?? [];
        const nodeNames = observations.map((obs) => obs.name).filter(Boolean);

        // Kiểm tra StateGraph đã ghi nhận các node thực thi
        expect(nodeNames.length).toBeGreaterThan(0);
      },
      90000,
    );
  });

  // Test Case 3.2: Kiểm soát Chi phí ($ Cost Cap) (NFR-4.2)
  describe('Test Case 3.2: Kiểm soát Chi phí ($ Cost Cap) (NFR-4.2)', () => {
    it(
      `tổng chi phí review cho PR <= 300 LOC phải <= $${maxBudget}`,
      async () => {
        const langfuseHandler = new CallbackHandler({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        });

        await reviewGraph.invoke(getInitialState(), {
          callbacks: [langfuseHandler],
        });

        await langfuseHandler.flushAsync();
        await langfuse.flushAsync();

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const traceId = langfuseHandler.getTraceId();
        expect(traceId).toBeDefined();

        const fetchedTrace = await langfuse.fetchTrace(traceId!);
        const totalCost = fetchedTrace.data?.totalCost ?? 0;

        // Cho phép >= 0 để tương thích với gói Free Tier ($0.00) lẫn Pay-as-you-go
        expect(totalCost).toBeGreaterThanOrEqual(0);
        expect(totalCost).toBeLessThanOrEqual(maxBudget);
      },
      90000,
    );
  });

  // Test Case 3.3: Bảo vệ Secret & An toàn Log (NFR-3.3)
  describe('Test Case 3.3: Bảo vệ Secret & An toàn Log (NFR-3.3)', () => {
    it(
      'tuyệt đối không in rò rỉ GitHub Private Key, Webhook Secret hoặc API Keys trong log stream',
      async () => {
        const logBuffer: string[] = [];
        const spyLog = jest
          .spyOn(console, 'log')
          .mockImplementation((...args) => logBuffer.push(args.join(' ')));
        const spyError = jest
          .spyOn(console, 'error')
          .mockImplementation((...args) => logBuffer.push(args.join(' ')));

        const mockStateWithSecrets = getInitialState({
          errors: [
            `Error log containing ${process.env.GITHUB_TOKEN} should not be leaked`,
            process.env.GITHUB_APP_PRIVATE_KEY || '',
            process.env.GOOGLE_API_KEY || '',
            process.env.LANGFUSE_SECRET_KEY || '',
          ],
        });

        await reviewGraph.invoke(mockStateWithSecrets);

        const joinedLogs = logBuffer.join('\n');
        for (const pattern of SENSITIVE_PATTERNS) {
          expect(pattern.test(joinedLogs)).toBe(false);
        }

        if (process.env.GITHUB_WEBHOOK_SECRET) {
          expect(joinedLogs.includes(process.env.GITHUB_WEBHOOK_SECRET)).toBe(
            false,
          );
        }

        spyLog.mockRestore();
        spyError.mockRestore();
      },
      60000,
    );
  });
});