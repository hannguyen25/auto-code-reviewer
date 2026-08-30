import { ParsedDiffContext } from '../../schemas/review-state.schema';

export const MOCK_PARSED_FILES: ParsedDiffContext[] = [
  {
    filePath: 'src/auth/jwt.ts',
    changedLines: [45, 46, 47],
    rawDiff: '@@ -40,6 +40,8 @@\n+ const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });',
    scopes: [
      {
        scopeType: 'function',
        scopeName: 'verifyToken',
        startLine: 40,
        endLine: 60,
      },
    ],
    imports: ['import * as jwt from "jsonwebtoken";'],
  },
  {
    filePath: 'src/services/order.ts',
    changedLines: [112, 113, 114, 115],
    rawDiff: '@@ -100,10 +100,15 @@\n+ for (const item of items) { await db.query(...); }',
    scopes: [
      {
        scopeType: 'method',
        scopeName: 'processOrder',
        startLine: 100,
        endLine: 150,
      },
    ],
    imports: ['import { db } from "../database";'],
  },
];

export const MOCK_PR_UNDER_300_LOC = {
  prNumber: 42,
  repoFullName: 'enterprise-org/core-backend',
  headSha: 'a1b2c3d4e5f6',
  baseSha: 'f9e8d7c6b5a4',
  parsedFiles: MOCK_PARSED_FILES,
};

export const SENSITIVE_PATTERNS = [
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN PRIVATE KEY-----/,
  /ghp_[a-zA-Z0-9]{36}/,
  /sk-ant-[a-zA-Z0-9_\-]{40,}/,
  /sk-[a-zA-Z0-9]{48}/,
  /AQ\.[a-zA-Z0-9_\-]{40,}/,
];