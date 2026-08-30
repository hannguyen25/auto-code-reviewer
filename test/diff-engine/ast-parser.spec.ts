import { DiffParserService } from '../../src/modules/diff-parser/diff-parser.service';
import { authServiceFixture } from '../fixtures/fixture';

describe('DiffEngine - Semantic Scope & Import Extraction (FR-2.2)', () => {
  let diffParserService: DiffParserService;

  beforeEach(() => {
    diffParserService = new DiffParserService();
  });

  it('should extract enclosing class, method scope, and imports for modified line', () => {
    // Dòng bị sửa: line 7 -> const decoded = jwt.verify(token, 'secret');
    const targetLine = 7;

    const { scopes, imports } = diffParserService.extractScopesAndImports(authServiceFixture);
    const enclosingScope = diffParserService.findEnclosingScope(targetLine, scopes);

    // 1. Kiểm tra Enclosing Scope
    expect(enclosingScope).toBeDefined();
    expect(enclosingScope?.scopeName).toBe('validateToken');
    expect(enclosingScope?.scopeType).toBe('method');

    // 2. Kiểm tra Class Scope có tồn tại trong danh sách scopes
    const classScope = scopes.find((s) => s.scopeType === 'class');
    expect(classScope).toBeDefined();
    expect(classScope?.scopeName).toBe('AuthService');

    // 3. Kiểm tra Imports được bóc tách
    expect(imports).toEqual(
      expect.arrayContaining([
        expect.stringContaining('@nestjs/common'),
        expect.stringContaining('jsonwebtoken'),
      ]),
    );
  });
});