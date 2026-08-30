export interface ExecutionPayload {
  sourceCode: string;
  testCode: string;
  fileName?: string;
  testFileName?: string;
  timeoutMs?: number;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  isTimeout: boolean;
  error?: string;
}

export interface TestCaseItem {
  id: string;
  description: string;
  fnName: string;
  args: any[];
  expected?: any;
  expectThrow?: boolean;
}

export interface DynamicRunnerPayload {
  sourceCode: string;
  testCases: TestCaseItem[];
  timeoutMs?: number;
}

export interface TestAssertionResult {
  testId: string;
  description: string;
  status: 'passed' | 'failed';
  expected?: any;
  received?: any;
  durationMs: number;
  error?: string;
}

export interface DynamicRunnerResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  assertions: TestAssertionResult[];
  rawStdout: string;
  rawStderr: string;
  durationMs: number;
}