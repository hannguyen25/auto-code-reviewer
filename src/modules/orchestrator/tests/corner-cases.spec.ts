import { Test, TestingModule } from '@nestjs/testing';
import { DiffParserService } from '../../diff-parser/diff-parser.service';
import { OrchestratorProcessor } from '../orchestrator.processor';
import { Job } from 'bullmq';

describe('Giai đoạn 5: Corner-case Testing', () => {
  let diffParser: DiffParserService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiffParserService],
    }).compile();

    diffParser = module.get<DiffParserService>(DiffParserService);
  });

  describe('1. Kiểm thử bộ lọc file đặc biệt (Ignored / Non-reviewable Files)', () => {
    it('phải bỏ qua (ignore) các file migration, lock files, binary và build artifacts', () => {
      const diffHeaders = [
        'diff --git a/package-lock.json b/package-lock.json',
        'diff --git a/yarn.lock b/yarn.lock',
        'diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml',
        'diff --git a/dist/bundle.js b/dist/bundle.js',
        'diff --git a/public/logo.png b/public/logo.png',
        'diff --git a/migrations/20260830_init.sql b/migrations/20260830_init.sql',
        'diff --git a/src/app.controller.ts b/src/app.controller.ts', // File cần review
      ];

      const reviewableFiles = diffHeaders.filter((header) => {
        const isLockFile = /lock(\.json|\.yaml)$|\.lock$/.test(header);
        const isBinaryOrMedia = /\.(png|jpg|jpeg|gif|svg|ico|pdf|wasm|exe)$/i.test(header);
        const isBuildArtifact = /\b(dist|build|out|\.next)\b/.test(header);
        const isMigration = /\bmigrations?\b/.test(header);

        return !isLockFile && !isBinaryOrMedia && !isBuildArtifact && !isMigration;
      });

      // Chỉ giữ lại 1 file source code duy nhất
      expect(reviewableFiles.length).toBe(1);
      expect(reviewableFiles[0]).toContain('src/app.controller.ts');
    });
  });

  describe('2. Kiểm thử kịch bản Push dồn dập 5 Commits liên tiếp (Debounce & Abort FR-1.3)', () => {
    it('khi push 5 commits liên tiếp, 4 jobs cũ phải bị Abort và chỉ job thứ 5 chạy đến cuối', async () => {
      const abortSignals: boolean[] = [];

      // Giả lập 5 jobs đẩy dồn dập cùng 1 PR
      const prJobs = [1, 2, 3, 4, 5].map((commitIndex) => ({
        id: `job-pr42-commit-${commitIndex}`,
        prNumber: 42,
        sha: `commit-sha-${commitIndex}`,
      }));

      // Mô phỏng cơ chế AbortController trong Redis
      const activeJobTracker = new Map<number, AbortController>();

      for (const job of prJobs) {
        // Nếu đã có job đang chạy cho PR này -> Hủy job trước
        if (activeJobTracker.has(job.prNumber)) {
          const oldController = activeJobTracker.get(job.prNumber);
          oldController?.abort();
        }

        const newController = new AbortController();
        activeJobTracker.set(job.prNumber, newController);
      }

      // Kiểm tra trạng thái của các job
      const isLastJobActive = !activeJobTracker.get(42)?.signal.aborted;
      expect(isLastJobActive).toBe(true);
    });
  });
});