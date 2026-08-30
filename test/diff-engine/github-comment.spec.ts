import { DiffParserService } from '../../src/modules/diff-parser/diff-parser.service';


describe('GitHub Dispatcher - Dry-run Comment Verification (Test Case 2.2)', () => {
  let diffParserService: DiffParserService;
  let mockOctokit: any;

  beforeEach(() => {
    diffParserService = new DiffParserService();
    mockOctokit = {
      pulls: {
        createReviewComment: jest.fn().mockResolvedValue({
          status: 201,
          data: { id: 101, body: 'Review comment posted' },
        }),
      },
    };
  });

  const rawDiff = `@@ -10,3 +10,4 @@ export class AppService {
 const x = 1;
+const y = x + 2;
 return y;`;

  it('should dispatch inline comment using valid diff_position and return 201', async () => {
    const filePath = 'src/app.service.ts';
    const commitSha = 'a1b2c3d4e5f6g7h8i9';
    const targetLineNumber = 11; // Dòng "+const y = x + 2;"

    // 1. Tính toán tọa độ
    const { lineMappings } = diffParserService.computeLineMappings(rawDiff);
    const mapping = lineMappings.get(targetLineNumber);

    expect(mapping).toBeDefined();
    const computedPosition = mapping!.diffPosition; // Kỳ vọng pos = 3

    // 2. Gửi request qua Octokit
    const payload = {
      owner: 'test-org',
      repo: 'test-repo',
      pull_number: 42,
      commit_id: commitSha,
      path: filePath,
      position: computedPosition,
      body: '```suggestion\nconst y = x + 5;\n```\nLogic optimization recommendation.',
    };

    const response = await mockOctokit.pulls.createReviewComment(payload);

    // 3. Khẳng định kết quả
    expect(response.status).toBe(201);
    expect(mockOctokit.pulls.createReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 3,
        path: 'src/app.service.ts',
        commit_id: commitSha,
      }),
    );
  });
});