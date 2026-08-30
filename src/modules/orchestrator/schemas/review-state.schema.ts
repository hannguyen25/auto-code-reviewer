import { z } from 'zod';

export const ReviewFindingSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  filePath: z.string(),
  line: z.number(),
  diffPosition: z.number().int().positive(),
  category: z.enum([
    'SECURITY',
    'PERFORMANCE',
    'ARCHITECTURE',
    'BUG',
    'TEST_FAILURE',
    'STYLE',
  ]),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  title: z.string(),
  comment: z.string(),
  suggestion: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).default(0.9), // Điểm tự tin của LLM
});

export const SandboxExecutionReportSchema = z.object({
  executed: z.boolean().default(false),
  success: z.boolean().default(true),
  hasSyntaxError: z.boolean().default(false),
  totalTests: z.number().default(0),
  passedTests: z.number().default(0),
  failedTests: z.number().default(0),
  rawOutput: z.string().optional(),
  error: z.string().optional(),
});

export const ParsedDiffContextSchema = z.object({
  filePath: z.string(),
  changedLines: z.array(z.number()),
  rawDiff: z.string(),
  scopes: z.array(
    z.object({
      scopeType: z.string(),
      scopeName: z.string(),
      startLine: z.number(),
      endLine: z.number(),
    }),
  ),
  imports: z.array(z.string()),
});

export const AgentStateSchema = z.object({
  prNumber: z.number(),
  repoFullName: z.string(),
  headSha: z.string(),
  baseSha: z.string(),
  parsedFiles: z.array(ParsedDiffContextSchema).default([]),
  rawFindings: z.array(ReviewFindingSchema).default([]), // Output chưa lọc từ các Agent Node (FR-3.1)
  verifiedFindings: z.array(ReviewFindingSchema).default([]), // Output đã qua Judge / Reflection Node (FR-3.5)
  findings: z.array(ReviewFindingSchema).default([]), // Tương thích ngược
  generatedTestCode: z.string().default(''), // Code test sinh tự động
  sandboxReport: SandboxExecutionReportSchema.default({
    executed: false,
    success: true,
    hasSyntaxError: false,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
  }),
  retryCount: z.number().int().default(0), // Đếm chu kỳ retry (max 2)
  summaryMarkdown: z.string().default(''),
  isApproved: z.boolean().default(false),
  errors: z.array(z.string()).default([]),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type SandboxExecutionReport = z.infer<typeof SandboxExecutionReportSchema>;
export type ParsedDiffContext = z.infer<typeof ParsedDiffContextSchema>;
export type AgentStateType = z.infer<typeof AgentStateSchema>;