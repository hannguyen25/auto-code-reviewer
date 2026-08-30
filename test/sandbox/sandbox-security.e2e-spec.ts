// test/sandbox/sandbox-security.spec.ts
import { SandboxService } from '../../src/modules/sandbox/sandbox.service';

describe('Sandbox Hardening & Resource Isolation (NFR-3.1)', () => {
  let sandboxService: SandboxService;

  beforeAll(() => {
    sandboxService = new SandboxService();
  });

  // Test Case 3.1: Cô lập mạng tuyệt đối
  it('Test Case 3.1 (Network): should block outbound network requests', async () => {
    const sourceCode = `
      module.exports = {
        attackNetwork: async () => {
          const res = await fetch('https://api.github.com');
          return res.status;
        }
      };
    `;

    const testCode = `
      const assert = require('assert');
      const mod = require('./index.js');
      (async () => {
        try {
          await mod.attackNetwork();
          process.exit(0); // Không bị chặn -> Test thất bại
        } catch (err) {
          console.error('BLOCKED_NETWORK:', err.message);
          process.exit(1); // Bị chặn -> Test thành công
        }
      })();
    `;

    const result = await sandboxService.runIsolatedCode({
      sourceCode,
      testCode,
      timeoutMs: 10000,
    });

    console.log('DEBUG RUNNER ERROR:', result.error || result.stderr);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/fetch failed|ENOTFOUND|getaddrinfo|BLOCKED_NETWORK/i);
  }, 15000);

  // Test Case 3.2: Thực thi với quyền Non-Root (UID/GID 1000)
  it('Test Case 3.2 (Non-Root): should execute strictly as UID 1000 and disallow root operations', async () => {
    const sourceCode = `
      const fs = require('fs');
      module.exports = {
        checkPrivileges: () => {
          const uid = process.getuid ? process.getuid() : -1;
          const gid = process.getgid ? process.getgid() : -1;
          
          let rootWriteAttempt = false;
          try {
            fs.writeFileSync('/etc/hacked.txt', 'root test');
            rootWriteAttempt = true;
          } catch (e) {
            rootWriteAttempt = false;
          }

          return { uid, gid, rootWriteAttempt };
        }
      };
    `;

    const testCode = `
      const mod = require('./index.js');
      const res = mod.checkPrivileges();
      console.log('__REPORT__' + JSON.stringify(res) + '__REPORT__');
      process.exit(0);
    `;

    const result = await sandboxService.runIsolatedCode({
      sourceCode,
      testCode,
      timeoutMs: 10000,
    });

    expect(result.exitCode).toBe(0);
    const match = result.stdout.match(/__REPORT__(.*?)__REPORT__/);
    expect(match).toBeDefined();

    const data = JSON.parse(match![1]);
    expect(data.uid).toBe(1000);
    expect(data.gid).toBe(1000);
    expect(data.rootWriteAttempt).toBe(false);
  }, 15000);

  // Test Case 3.3: Filesystem Read-Only (Chỉ cho phép ghi /tmp)
  it('Test Case 3.3 (Read-Only FS): should prevent writes outside /tmp', async () => {
    const sourceCode = `
      const fs = require('fs');
      module.exports = {
        testFileSystem: () => {
          let rootWriteBlocked = false;
          let tmpWriteSuccess = false;

          // 1. Thử ghi vào root filesystem
          try {
            fs.writeFileSync('/test.txt', 'forbidden');
          } catch (e) {
            rootWriteBlocked = true;
          }

          // 2. Thử ghi vào tmpfs /tmp
          try {
            fs.writeFileSync('/tmp/valid.txt', 'allowed');
            tmpWriteSuccess = fs.existsSync('/tmp/valid.txt');
          } catch (e) {
            tmpWriteSuccess = false;
          }

          return { rootWriteBlocked, tmpWriteSuccess };
        }
      };
    `;

    const testCode = `
      const mod = require('./index.js');
      const res = mod.testFileSystem();
      console.log('__FS_REPORT__' + JSON.stringify(res) + '__FS_REPORT__');
      process.exit(0);
    `;

    const result = await sandboxService.runIsolatedCode({
      sourceCode,
      testCode,
      timeoutMs: 10000,
    });

    expect(result.exitCode).toBe(0);
    const match = result.stdout.match(/__FS_REPORT__(.*?)__FS_REPORT__/);
    expect(match).toBeDefined();

    const data = JSON.parse(match![1]);
    expect(data.rootWriteBlocked).toBe(true);
    expect(data.tmpWriteSuccess).toBe(true);
  }, 15000);

  // Test Case 3.4.1: Giới hạn RAM (OOM Killed / Memory Cap)
  it('Test Case 3.4 (RAM Limit): should fail or get killed when allocating excessive memory', async () => {
    const sourceCode = `
      module.exports = {
        leakMemory: () => {
          const memoryArrays = [];
          while (true) {
            memoryArrays.push(Buffer.alloc(50 * 1024 * 1024)); // Cấp phát 50MB liên tục đến khi chạm 512MB
          }
        }
      };
    `;

    const testCode = `
      const mod = require('./index.js');
      mod.leakMemory();
    `;

    const result = await sandboxService.runIsolatedCode({
      sourceCode,
      testCode,
      timeoutMs: 15000,
    });

    // Exit code khác 0 khi Node.js runtime bị kill do OOM
    expect(result.exitCode).not.toBe(0);
  }, 20000);

  // Test Case 3.4.2: Execution Timeout (Tự động kill container)
  it('Test Case 3.4 (Timeout): should terminate process when reaching execution timeout', async () => {
    const sourceCode = `
      module.exports = {
        infiniteLoop: () => {
          while (true) {}
        }
      };
    `;

    const testCode = `
      const mod = require('./index.js');
      mod.infiniteLoop();
    `;

    const startTime = performance.now();
    const result = await sandboxService.runIsolatedCode({
      sourceCode,
      testCode,
      timeoutMs: 4000, // Đặt timeout 4s để kiểm thử
    });
    const durationMs = performance.now() - startTime;

    expect(result.isTimeout).toBe(true);
    expect(result.exitCode).toBe(124);
    expect(durationMs).toBeGreaterThanOrEqual(4000);
    expect(durationMs).toBeLessThanOrEqual(6000);
  }, 10000);
});