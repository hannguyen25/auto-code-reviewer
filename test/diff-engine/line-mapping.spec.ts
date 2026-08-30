// test/diff-engine/line-mapping.spec.ts
import { DiffParserService } from '../../src/modules/diff-parser/diff-parser.service';

describe('DiffEngine - Line Mapping Multi-Hunk (FR-2.3 & NFR-2.2)', () => {
  let diffParserService: DiffParserService;

  beforeEach(() => {
    diffParserService = new DiffParserService();
  });

  const multiHunkDiff = 
`@@ -10,6 +10,12 @@ export class AuthService {
 const token = 'old_token';
-const legacySecret = '123456';
+const newSecret = process.env.JWT_SECRET;
+const algorithm = 'HS256';
+const expiresIn = '1h';
 return true;
@@ -45,4 +51,8 @@ export class PaymentService {
 const amount = 500;
-const discount = 0;
+const discount = amount * 0.05;
+const finalAmount = amount - discount;
 return finalAmount;`;

  it('should compute exact diff_position across multiple hunks', () => {
    const { lineMappings, changedLines } = diffParserService.computeLineMappings(multiHunkDiff);

    // 1. Kiểm tra danh sách các dòng mới thêm
    expect(changedLines).toEqual([11, 12, 13, 52, 53]);

    // 2. Kiểm tra tọa độ Hunk 1
    // Line 11 (newSecret) ở diffPosition = 4
    const line11 = lineMappings.get(11);
    expect(line11).toBeDefined();
    expect(line11?.diffPosition).toBe(4);
    expect(line11?.type).toBe('add');
    expect(line11?.content).toBe('const newSecret = process.env.JWT_SECRET;');

    // Line 12 (algorithm) ở diffPosition = 5
    expect(lineMappings.get(12)?.diffPosition).toBe(5);

    // Line 13 (expiresIn) ở diffPosition = 6
    expect(lineMappings.get(13)?.diffPosition).toBe(6);

    // 3. Kiểm tra tọa độ Hunk 2
    // Line 52 (discount) ở diffPosition = 11
    const line52 = lineMappings.get(52);
    expect(line52).toBeDefined();
    expect(line52?.diffPosition).toBe(11);
    expect(line52?.type).toBe('add');
    expect(line52?.content).toBe('const discount = amount * 0.05;');

    // Line 53 (finalAmount) ở diffPosition = 12
    expect(lineMappings.get(53)?.diffPosition).toBe(12);
  });

  it('should return undefined when looking up an unmodified line not in hunks', () => {
    const { lineMappings } = diffParserService.computeLineMappings(multiHunkDiff);
    expect(lineMappings.get(999)).toBeUndefined();
  });
});