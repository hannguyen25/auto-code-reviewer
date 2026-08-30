import { Annotation } from '@langchain/langgraph';
import {
  ParsedDiffContext,
  ReviewFinding,
  SandboxExecutionReport,
} from '../schemas/review-state.schema';

export const AgentStateAnnotation = Annotation.Root({
  prNumber: Annotation<number>(),
  repoFullName: Annotation<string>(),
  headSha: Annotation<string>(),
  baseSha: Annotation<string>(),
  parsedFiles: Annotation<ParsedDiffContext[]>({
    reducer: (prev, next) => next ?? prev ?? [],
    default: () => [],
  }),
  // FR-3.1: raw_findings nhận đóng góp song song từ Security & Logic Agent
  rawFindings: Annotation<ReviewFinding[]>({
    reducer: (prev, next) => {
      const combined = [...(prev || []), ...(next || [])];
      return combined.filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.title === item.title && t.line === item.line),
      );
    },
    default: () => [],
  }),
  // FR-3.1 & FR-3.5: verified_findings là kết quả sau khi qua Judge Node
  verifiedFindings: Annotation<ReviewFinding[]>({
    reducer: (prev, next) => next ?? prev ?? [],
    default: () => [],
  }),
  generatedTestCode: Annotation<string>({
    reducer: (prev, next) => next ?? prev ?? '',
    default: () => '',
  }),
  sandboxReport: Annotation<SandboxExecutionReport>({
    reducer: (prev, next) => next ?? prev,
    default: () => ({
      executed: false,
      success: true,
      hasSyntaxError: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
    }),
  }),
  retryCount: Annotation<number>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => 0,
  }),
  summaryMarkdown: Annotation<string>({
    reducer: (prev, next) => next ?? prev ?? '',
    default: () => '',
  }),
  isApproved: Annotation<boolean>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => false,
  }),
  errors: Annotation<string[]>({
    reducer: (prev, next) => [...(prev || []), ...(next || [])],
    default: () => [],
  }),
});