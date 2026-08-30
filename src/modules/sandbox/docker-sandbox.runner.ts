import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SandboxExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTimeMs: number;
}

@Injectable()
export class DockerSandboxRunner {
  private readonly logger = new Logger(DockerSandboxRunner.name);

  /**
   * Thực thi code và test trong môi trường Docker Container cô lập
   */
  async executeTest(
    sourceCode: string,
    testCode: string,
    timeoutSeconds = 10,
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-sandbox-'));

    try {
      // 1. Ghi file nguồn và file test vào thư mục tạm
      const sourceFilePath = path.join(tempDir, 'index.js');
      const testFilePath = path.join(tempDir, 'test.js');

      fs.writeFileSync(sourceFilePath, sourceCode, 'utf-8');
      fs.writeFileSync(testFilePath, testCode, 'utf-8');

      // Chuẩn hóa đường dẫn cho Windows / Linux mount vào Docker
      const formattedMountPath = tempDir.replace(/\\/g, '/');

      // 2. Lệnh chạy container Docker với giới hạn tài nguyên nghiêm ngặt
      // - Đóng mạng hoàn toàn: --network none
      // - Giới hạn RAM: --memory 128m
      // - Giới hạn CPU: --cpus 0.5
      // - Read-only root filesystem
      const dockerCmd = `docker run --rm --network none --memory=128m --cpus="0.5" -v "${formattedMountPath}:/app:ro" node:20-alpine node /app/test.js`;

      const { stdout, stderr } = await execAsync(dockerCmd, {
        timeout: timeoutSeconds * 1000,
      });

      return {
        success: true,
        output: stdout || stderr,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.warn(`Docker Sandbox Test Failed: ${error.message}`);
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      // 3. Dọn dẹp thư mục tạm
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        this.logger.error(`Failed to clean up sandbox directory: ${cleanupErr}`);
      }
    }
  }
}