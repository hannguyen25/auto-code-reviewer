import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
const Parser = require('web-tree-sitter');
import { LineMapping, ParsedScopeContext } from './diff-parser.interface';

@Injectable()
export class DiffParserService implements OnModuleInit {
  private readonly logger = new Logger(DiffParserService.name);
  private parser: any;

  // Danh sách đuôi file & mẫu đường dẫn bị loại trừ (FR-2.1)
  private readonly excludedPatterns: RegExp[] = [
    /\.lock$/i,
    /package-lock\.json$/i,
    /yarn\.lock$/i,
    /pnpm-lock\.yaml$/i,
    /\.min\.(js|css)$/i,
    /\.d\.ts$/i,
    /\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|tar|gz)$/i,
    /(?:^|\/)migrations?\//i,
    /\.prisma\/migrations\//i,
  ];

  async onModuleInit() {
    try {
      const TreeSitter = Parser.default || Parser;
      if (typeof TreeSitter?.init === 'function') {
        await TreeSitter.init();
        this.parser = new TreeSitter();
        this.logger.log('🌲 Tree-sitter Parser initialized successfully');
      }
    } catch (err: any) {
      this.logger.warn(`Tree-sitter init warning: ${err.message}`);
    }
  }

  /**
   * 1. FILE EXCLUSION FILTER (FR-2.1)
   */
  public shouldIncludeFile(filename: string): boolean {
    if (!filename) return false;
    return !this.excludedPatterns.some((pattern) => pattern.test(filename));
  }

  /**
   * Hỗ trợ lọc danh sách file bất kể object dùng `filename`, `path` hay `filePath`
   */
  public filterPrFiles<T extends { filename?: string; path?: string; filePath?: string }>(files: T[]): T[] {
    return files.filter((file) => {
      const targetPath = file.filename || file.path || file.filePath || '';
      return this.shouldIncludeFile(targetPath);
    });
  }

  /**
   * 2. MODULE TÍNH TOÁN LINE MAPPING (FR-2.3)
   */
  public computeLineMappings(rawFileDiff: string): {
    lineMappings: Map<number, LineMapping>;
    changedLines: number[];
  } {
    const lineMappings = new Map<number, LineMapping>();
    const changedLines: number[] = [];

    if (!rawFileDiff) return { lineMappings, changedLines };

    const lines = rawFileDiff.split('\n');
    let diffPosition = 0;
    let currentNewLine = 0;
    let inHunk = false;

    for (const line of lines) {
      const hunkHeaderMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

      if (hunkHeaderMatch) {
        inHunk = true;
        diffPosition++;
        currentNewLine = parseInt(hunkHeaderMatch[1], 10);
        continue;
      }

      if (!inHunk) continue;

      diffPosition++;

      if (line.startsWith('+')) {
        lineMappings.set(currentNewLine, {
          newLineNumber: currentNewLine,
          diffPosition,
          content: line.substring(1),
          type: 'add',
        });
        changedLines.push(currentNewLine);
        currentNewLine++;
      } else if (line.startsWith('-')) {
        // Line bị xóa bỏ qua
      } else {
        lineMappings.set(currentNewLine, {
          newLineNumber: currentNewLine,
          diffPosition,
          content: line.startsWith(' ') ? line.substring(1) : line,
          type: 'normal',
        });
        currentNewLine++;
      }
    }

    return { lineMappings, changedLines };
  }

  /**
   * 3. BÓC TÁCH SCOPES & IMPORTS (FR-2.2)
   */
  public extractScopesAndImports(fileContent: string): {
    scopes: ParsedScopeContext[];
    imports: string[];
  } {
    const scopes: ParsedScopeContext[] = [];
    const imports: string[] = [];

    if (!fileContent) return { scopes, imports };

    const lines = fileContent.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // Bóc tách Imports
      if (
        trimmed.startsWith('import ') ||
        (trimmed.startsWith('const ') && trimmed.includes('require('))
      ) {
        imports.push(trimmed);
      }

      // Bóc tách Class Scope
      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
      if (classMatch) {
        scopes.push({
          scopeType: 'class',
          scopeName: classMatch[1],
          startLine: lineNum,
          endLine: this.findScopeEndLine(lines, index),
        });
      }

      // Bóc tách Function / Method Scope
      const fnMatch = trimmed.match(
        /^(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z0-9_]+)|(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{)/
      );
      if (fnMatch) {
        const fnName = fnMatch[1] || fnMatch[2];
        if (fnName && !['if', 'for', 'while', 'switch', 'catch'].includes(fnName)) {
          scopes.push({
            scopeType: fnMatch[1] ? 'function' : 'method',
            scopeName: fnName,
            startLine: lineNum,
            endLine: this.findScopeEndLine(lines, index),
          });
        }
      }
    });

    return { scopes, imports };
  }

  private findScopeEndLine(lines: string[], startIndex: number): number {
    let openBraces = 0;
    let foundStart = false;

    for (let i = startIndex; i < lines.length; i++) {
      // Loại bỏ chuỗi template string hoặc string literal để tránh đếm nhầm ${...}
      const sanitizedLine = lines[i]
        .replace(/`[\s\S]*?`/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/"[^"]*"/g, '""');

      for (const char of sanitizedLine) {
        if (char === '{') {
          openBraces++;
          foundStart = true;
        } else if (char === '}') {
          openBraces--;
          if (foundStart && openBraces === 0) {
            return i + 1;
          }
        }
      }
    }
    return lines.length;
  }

  public findEnclosingScope(lineNumber: number, scopes: ParsedScopeContext[]): ParsedScopeContext | null {
    const matches = scopes.filter((s) => lineNumber >= s.startLine && lineNumber <= s.endLine);
    if (matches.length === 0) return null;

    return matches.reduce((prev, curr) =>
      curr.endLine - curr.startLine < prev.endLine - prev.startLine ? curr : prev
    );
  }
}