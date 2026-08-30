export interface LineMapping {
  newLineNumber: number;  // Dòng thực tế trong file mới
  oldLineNumber?: number; // Dòng trong file cũ (nếu có)
  diffPosition: number;   // Chỉ số offset trong hunk diff (1-indexed theo quy ước GitHub API)
  content: string;
  type: 'add' | 'del' | 'normal';
}

export interface ParsedScopeContext {
  scopeType: 'function' | 'class' | 'method' | 'global';
  scopeName: string;
  startLine: number;
  endLine: number;
}

export interface ParsedFileDiff {
  filePath: string;
  oldPath?: string;
  isNew: boolean;
  isDeleted: boolean;
  rawDiff: string;
  lineMappings: Map<number, LineMapping>; // Tra cứu nhanh: newLineNumber -> LineMapping
  changedLines: number[];
  scopes: ParsedScopeContext[];
  imports: string[];
}