import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import * as tar from 'tar-stream';
import {
  DynamicRunnerPayload,
  DynamicRunnerResult,
  ExecutionPayload,
  ExecutionResult,
  TestCaseItem,
} from './sandbox.interface';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly docker: Docker;

  constructor() {
    const isWindows = process.platform === 'win32';
    this.docker = new Docker(
      isWindows
        ? { socketPath: '//./pipe/docker_engine' }
        : { socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' }
    );
  }

  /**
   * Đóng gói mã nguồn và file test vào tar stream
   */
  private createTarStream(sourceCode: string, testCode: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pack = tar.pack();
      const chunks: Buffer[] = [];

      pack.on('data', (chunk: Buffer) => chunks.push(chunk));
      pack.on('end', () => resolve(Buffer.concat(chunks)));
      pack.on('error', reject);

      // Ghi trực tiếp vào thư mục /tmp/sandbox
      pack.entry({ name: 'index.js', mode: 0o644 }, sourceCode);
      pack.entry({ name: 'runner.test.js', mode: 0o644 }, testCode);

      pack.finalize();
    });
  }

  public generateDynamicTestFile(testCases: TestCaseItem[]): string {
    return `
const assert = require('assert');
const sourceModule = require('./index.js');

const testCases = ${JSON.stringify(testCases, null, 2)};
const results = [];

(async () => {
  for (const tc of testCases) {
    const startTime = performance.now();
    let status = 'passed';
    let received = undefined;
    let errorMsg = undefined;

    try {
      const fn = sourceModule[tc.fnName] || (typeof sourceModule === 'function' ? sourceModule : null);
      if (!fn || typeof fn !== 'function') {
        throw new Error('Function ' + tc.fnName + ' not exported in module');
      }

      if (tc.expectThrow) {
        let threw = false;
        try {
          await fn(...tc.args);
        } catch (e) {
          threw = true;
          received = e.message;
        }
        assert.strictEqual(threw, true, 'Expected function to throw error');
      } else {
        received = await fn(...tc.args);
        assert.deepStrictEqual(received, tc.expected);
      }
    } catch (err) {
      status = 'failed';
      errorMsg = err.message;
    }

    const duration = performance.now() - startTime;
    results.push({
      testId: tc.id,
      description: tc.description,
      status,
      expected: tc.expected,
      received,
      durationMs: parseFloat(duration.toFixed(2)),
      error: errorMsg,
    });
  }

  console.log('__RUNNER_REPORT_START__' + JSON.stringify(results) + '__RUNNER_REPORT_END__');
  process.exit(results.some(r => r.status === 'failed') ? 1 : 0);
})();
`;
  }

  /**
   * Thực thi code cô lập tuyệt đối tuân thủ NFR-3.1 (Zero Disk Write & Readonly Rootfs)
   */

  async runIsolatedCode(payload: ExecutionPayload): Promise<ExecutionResult> {
    const { sourceCode, testCode, timeoutMs = 30000 } = payload;
    const startTime = performance.now();

    let container: Docker.Container | null = null;
    let isTimeout = false;
    let timer: NodeJS.Timeout | null = null;

    try {
      const srcBase64 = Buffer.from(sourceCode).toString('base64');
      const testBase64 = Buffer.from(testCode).toString('base64');

      // Bootstrap script: Giải mã Base64 và thực thi trực tiếp từ memory/tmpfs
      const bootstrapCmd = [
        'node',
        '-e',
        `
        const fs = require('fs');
        const path = '/tmp/runner.test.js';
        const srcPath = '/tmp/index.js';

        // Ghi vào tmpfs
        fs.writeFileSync(srcPath, Buffer.from(process.env.SRC_PAYLOAD, 'base64').toString('utf8'));
        fs.writeFileSync(path, Buffer.from(process.env.TEST_PAYLOAD, 'base64').toString('utf8'));

        // Thực thi runner script
        require(path);
        `,
      ];

      container = await this.docker.createContainer({
        Image: 'code-reviewer-sandbox:latest',
        Cmd: bootstrapCmd,
        User: '1000:1000',
        NetworkDisabled: true, // Network Isolation (Test Case 3.1)
        Env: [
          `SRC_PAYLOAD=${srcBase64}`,
          `TEST_PAYLOAD=${testBase64}`,
        ],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        HostConfig: {
          NetworkMode: 'none',
          Memory: 512 * 1024 * 1024, // 512MB RAM
          MemorySwap: 512 * 1024 * 1024,
          NanoCpus: 1.0 * 1e9,
          ReadonlyRootfs: true, // Filesystem Read-Only (Test Case 3.3)
          Tmpfs: {
            '/tmp': 'rw,exec,size=64m', // Tmpfs bộ nhớ tạm
          },
          AutoRemove: false,
        },
      });

      if (!container) throw new Error('Container creation failed');

      await container.start();

      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(async () => {
          isTimeout = true;
          try {
            if (container) await container.kill();
          } catch {}
          reject(new Error('Sandbox Execution Timeout'));
        }, timeoutMs);
      });

      const waitPromise = container.wait();
      const waitResult: any = await Promise.race([waitPromise, timeoutPromise]);

      if (timer) clearTimeout(timer);

      const logBuffer = await container.logs({ stdout: true, stderr: true, follow: false });
      const rawLog = logBuffer.toString('utf8');
      const durationMs = performance.now() - startTime;

      // 2. Nếu đã bị timeout gắn cờ, trả về isTimeout = true và exitCode 124
      return {
        stdout: rawLog,
        stderr: '',
        exitCode: isTimeout ? 124 : (waitResult?.StatusCode ?? 0),
        durationMs,
        isTimeout,
      };
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error.message,
        exitCode: isTimeout ? 124 : 1,
        durationMs: performance.now() - startTime,
        isTimeout,
        error: error.message,
      };
    } finally {
      if (timer) clearTimeout(timer);
      if (container) {
        try {
          await container.remove({ force: true });
        } catch {}
      }
    }
  }

  async runDynamicTestSuite(payload: DynamicRunnerPayload): Promise<DynamicRunnerResult> {
    const { sourceCode, testCases, timeoutMs = 15000 } = payload;
    const testCode = this.generateDynamicTestFile(testCases);

    const execResult = await this.runIsolatedCode({
      sourceCode,
      testCode,
      timeoutMs,
    });

    let assertions: any[] = [];
    // Regex tối ưu bắt đa dòng (dotAll)
    const match = execResult.stdout.match(/__RUNNER_REPORT_START__([\s\S]*?)__RUNNER_REPORT_END__/);

    if (match && match[1]) {
      try {
        assertions = JSON.parse(match[1].trim());
      } catch (e) {
        this.logger.error('Không thể parse kết quả JSON từ Sandbox:', e);
      }
    }

    const totalTests = testCases.length;
    const passedTests = assertions.filter((a) => a.status === 'passed').length;
    const failedTests = totalTests - passedTests;

    return {
      success: execResult.exitCode === 0 && failedTests === 0,
      totalTests,
      passedTests,
      failedTests,
      assertions,
      rawStdout: execResult.stdout,
      rawStderr: execResult.stderr,
      durationMs: execResult.durationMs,
    };
  }
}