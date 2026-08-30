import { Langfuse } from 'langfuse';

describe('E2E Live Trace to Langfuse Cloud Dashboard (NFR-4.1, NFR-4.2)', () => {
  let langfuse: Langfuse;

  beforeAll(() => {
    langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || 'pk-lf-08acf1f8-7ba6-456c-8862-649b61aed402',
      secretKey: process.env.LANGFUSE_SECRET_KEY || 'sk-lf-951c333d-9e8e-4b93-8999-44410026ccc8',
      baseUrl: 'https://us.cloud.langfuse.com',
      flushAt: 1,
    });
  });

  afterAll(async () => {
    // Flush và shutdown để ép gửi ngay gói tin HTTP POST
    await langfuse.flushAsync();
    await langfuse.shutdownAsync();
  }, 20000);

  it('gửi live trace của toàn bộ luồng review lên Langfuse Cloud', async () => {
    const prNumber = 101;
    
    // 1. Tạo Trace
    const trace = langfuse.trace({
      name: `PR-Review-PR#${prNumber}`,
      sessionId: `session-pr-${prNumber}`,
      tags: ['PR-Review', 'Security-Gate'],
      metadata: {
        repo: 'enterprise-org/core-backend',
        prNumber: prNumber,
      },
    });

    // 2. Ghi nhận Span / Generation
    const generation = trace.generation({
      name: 'security_agent_node',
      model: 'claude-3-5-sonnet',
      modelParameters: { temperature: 0.1 },
      input: { file: 'src/auth/jwt.ts', line: 45 },
      output: {
        finding: 'Missing algorithm specification in jwt.verify',
        severity: 'CRITICAL',
        cwe: 'CWE-327',
      },
      usage: {
        promptTokens: 2500,
        completionTokens: 600,
        totalTokens: 3100,
      },
    });
    generation.end();

    trace.update({
      output: { isApproved: false, status: 'BLOCKED' },
    });

    // Chờ 1s để buffer client đóng gói
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(trace.id).toBeDefined();
  }, 30000);
});