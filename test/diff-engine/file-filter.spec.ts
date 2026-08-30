import { DiffParserService } from '../../src/modules/diff-parser/diff-parser.service';
describe('DiffEngine - File Exclusion Filter (FR-2.1)', () => {
  let service: DiffParserService;

  beforeEach(() => {
    service = new DiffParserService();
  });

  const sampleFiles = [
    // Files to keep (Source logic)
    { filename: 'src/services/payment.service.ts', expected: true },
    { filename: 'api/controllers/auth_controller.py', expected: true },
    { filename: 'src/utils/math.js', expected: true },
    
    // Files to ignore (Non-business logic / noise)
    { filename: 'package-lock.json', expected: false },
    { filename: 'yarn.lock', expected: false },
    { filename: 'pnpm-lock.yaml', expected: false },
    { filename: 'dist/bundle.min.js', expected: false },
    { filename: 'src/types/app.d.ts', expected: false },
    { filename: 'public/assets/logo.svg', expected: false },
    { filename: 'public/images/avatar.png', expected: false },
    { filename: 'prisma/migrations/20260826001_init/migration.sql', expected: false },
    { filename: 'src/migrations/001_create_users_table.sql', expected: false },
  ];

  it('should only keep source code files containing business logic', () => {
    sampleFiles.forEach(({ filename, expected }) => {
      const isAccepted = service.shouldIncludeFile(filename);
      expect(isAccepted).toBe(expected);
    });
  });

  it('should correctly filter a raw GitHub PR file list', () => {
    const prFileList = sampleFiles.map((f) => ({ filename: f.filename, status: 'modified' }));
    const filtered = service.filterPrFiles(prFileList);

    expect(filtered.map((f) => f.filename)).toEqual([
      'src/services/payment.service.ts',
      'api/controllers/auth_controller.py',
      'src/utils/math.js',
    ]);
  });
});