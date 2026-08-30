// test/sandbox/dynamic-runner.e2e-spec.ts
import { SandboxService } from '../../src/modules/sandbox/sandbox.service';
import { TestCaseItem } from '../../src/modules/sandbox/sandbox.interface';

describe('Sandbox Dynamic Test Runner & Reflection Loop (FR-4.1, FR-4.2)', () => {
  let sandboxService: SandboxService;

  beforeAll(() => {
    sandboxService = new SandboxService();
  });

  // Test Case 4.1: Thực thi test case thành công (Test Pass)
  it('Test Case 4.1: should execute valid test cases and parse structured report', async () => {
    // Mã nguồn PR nghiệp vụ (Payment discount calculator)
    const sourceCode = `
      module.exports = {
        applyDiscount: (orderTotal, discountPercent) => {
          if (discountPercent < 0 || discountPercent > 100) {
            throw new Error('Invalid discount percentage');
          }
          return orderTotal - (orderTotal * (discountPercent / 100));
        }
      };
    `;

    // Danh sách test cases do Test Generator Agent tự động sinh ra
    const testCases: TestCaseItem[] = [
      {
        id: 'TC-01',
        description: 'Calculate 20% discount on 100 USD',
        fnName: 'applyDiscount',
        args: [100, 20],
        expected: 80,
      },
      {
        id: 'TC-02',
        description: 'Calculate 0% discount on 50 USD',
        fnName: 'applyDiscount',
        args: [50, 0],
        expected: 50,
      },
      {
        id: 'TC-03',
        description: 'Throw error when discount percentage exceeds 100',
        fnName: 'applyDiscount',
        args: [100, 150],
        expectThrow: true,
      },
    ];

    const result = await sandboxService.runDynamicTestSuite({
      sourceCode,
      testCases,
      timeoutMs: 15000,
    });

    // Khẳng định kết quả thực thi
    expect(result.success).toBe(true);
    expect(result.totalTests).toBe(3);
    expect(result.passedTests).toBe(3);
    expect(result.failedTests).toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);

    // Kiểm tra cấu trúc metadata của từng test assertion
    expect(result.assertions).toHaveLength(3);
    expect(result.assertions[0]).toEqual(
      expect.objectContaining({
        testId: 'TC-01',
        status: 'passed',
        received: 80,
      }),
    );
  }, 20000);

  // Test Case 4.2.1: Test Runner bắt Runtime Logic Error
  it('Test Case 4.2.1: should capture assertion failure details when PR code contains bugs', async () => {
    // Code có bug: Không kiểm tra số âm, tính toán sai
    const buggyCode = `
      module.exports = {
        divide: (a, b) => a / b
      };
    `;

    const testCases: TestCaseItem[] = [
      {
        id: 'TC-BUG-01',
        description: 'Should throw when dividing by zero',
        fnName: 'divide',
        args: [10, 0],
        expectThrow: true, // Kỳ vọng ném lỗi nhưng code thật trả về Infinity
      },
      {
        id: 'TC-BUG-02',
        description: 'Normal division 10 / 2 = 5',
        fnName: 'divide',
        args: [10, 2],
        expected: 5,
      },
    ];

    const result = await sandboxService.runDynamicTestSuite({
      sourceCode: buggyCode,
      testCases,
      timeoutMs: 15000,
    });

    expect(result.success).toBe(false);
    expect(result.totalTests).toBe(2);
    expect(result.passedTests).toBe(1);
    expect(result.failedTests).toBe(1);

    const failedAssertion = result.assertions.find((a) => a.testId === 'TC-BUG-01');
    expect(failedAssertion).toBeDefined();
    expect(failedAssertion?.status).toBe('failed');
    expect(failedAssertion?.error).toContain('Expected function to throw error');
  }, 20000);

  // Test Case 4.2.2: Test Runner bắt trọn vẹn Cú pháp / Runtime Traceback cho Reflection Loop
  it('Test Case 4.2.2: should capture full stack trace when test script has syntax or runtime crash', async () => {
    const validSourceCode = `module.exports = { ping: () => 'pong' };`;

    // File test bị lỗi cú pháp / gọi hàm không tồn tại để kích hoạt runtime crash
    const brokenTestCode = `
      const mod = require('./index.js');
      // Lỗi runtime cố tình: Gọi hàm không tồn tại trên undefined
      const unassignedObj = null;
      unassignedObj.crashPipeline();
    `;

    const rawExecutionResult = await sandboxService.runIsolatedCode({
      sourceCode: validSourceCode,
      testCode: brokenTestCode,
      timeoutMs: 10000,
    });

    // Khẳng định: Runner phải bắt được exit code lỗi và chi tiết Traceback
    expect(rawExecutionResult.exitCode).not.toBe(0);
    
    const combinedErrorLog = rawExecutionResult.stdout + '\n' + rawExecutionResult.stderr;
    
    // Kiểm tra thông tin lỗi cần thiết cho LLM Reflection Node
    expect(combinedErrorLog).toMatch(/TypeError|crashPipeline|Cannot read propert/i);
    expect(combinedErrorLog).toContain('runner.test.js'); // Đảm bảo có vị trí dòng gây lỗi trong stack trace
  }, 20000);
});