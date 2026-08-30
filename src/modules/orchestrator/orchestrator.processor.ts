import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

import { PRJobData } from '../webhook/webhook.service';
import { DiffParserService } from '../diff-parser/diff-parser.service';
import { ReviewGraphWorkflow } from './graphs/review.graph';
import { GithubDispatcherService } from '../github-dispatcher/github-dispatcher.service';
import { AppMetricsService } from '../metrics/metrics.service';
import { AgentStateType } from './schemas/review-state.schema';

@Processor('pr-review-queue', {
  concurrency: 20,
})
export class OrchestratorProcessor extends WorkerHost {
  private readonly logger = new Logger(OrchestratorProcessor.name);
  private readonly redisClient: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly diffParserService: DiffParserService,
    private readonly reviewWorkflow: ReviewGraphWorkflow,
    private readonly githubDispatcher: GithubDispatcherService,
    private readonly metricsService: AppMetricsService,
  ) {
    super();
    this.redisClient = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>(
        'REDIS_PASSWORD',
        'redis_password',
      ),
    });
  }

  async process(job: Job<PRJobData>): Promise<void> {
    const { prNumber, repoFullName } = job.data;
    this.logger.log(`⚡ [Job ${job.id}] Nhận xử lý PR #${prNumber} (${repoFullName})`);

    // 1. Metric: Ghi nhận Queue Latency trong BullMQ
    const queueWaitTimeSeconds = (Date.now() - job.timestamp) / 1000;
    this.metricsService.recordQueueLatency?.(
      'pr-review-queue',
      queueWaitTimeSeconds,
    );

    // 2. Metric: Bắt đầu đo thời gian chạy toàn bộ Agent Workflow
    const stopWorkflowTimer =
      this.metricsService.startAgentTimer?.('orchestrator_full_workflow');

    // Thiết lập cơ chế Abort / Cancel qua Redis (FR-1.3)
    const abortController = new AbortController();
    const abortKey = `abort_job:${job.id}`;

    const checkAbortInterval = setInterval(async () => {
      const isAborted = await this.redisClient.get(abortKey);
      if (isAborted) {
        this.logger.warn(
          `🛑 [Job ${job.id}] Nhận tín hiệu hủy từ Redis! Dừng Pipeline...`,
        );
        abortController.abort();
        clearInterval(checkAbortInterval);
      }
    }, 500);

    try {
      // 3. Thực thi Pipeline bóc tách Diff, chạy Multi-Agent và Dispatch kết quả
      const finalState = await this.executePipeline(
        job.data,
        abortController.signal,
      );

      // Ghi nhận Metric thành công cho Workflow & PR Status Counter
      if (stopWorkflowTimer) stopWorkflowTimer('SUCCESS');

      const isClean =
        finalState.sandboxReport?.success &&
        !finalState.sandboxReport?.hasSyntaxError;
      this.metricsService.recordReviewResult?.(
        finalState.isApproved,
        isClean,
        'SUCCESS',
      );

      this.logger.log(
        `✅ [Job ${job.id}] Hoàn tất thẩm định và đăng Review cho PR #${prNumber}`,
      );
    } catch (error: any) {
      if (stopWorkflowTimer) stopWorkflowTimer('FAILED');
      this.metricsService.recordReviewResult?.(false, false, 'ERROR');

      if (abortController.signal.aborted || error.message === 'AbortError') {
        this.logger.warn(`⚠️ [Job ${job.id}] Job đã bị hủy thành công.`);
      } else {
        this.logger.error(`❌ [Job ${job.id}] Lỗi trong Pipeline: ${error.message}`);
        throw error;
      }
    } finally {
      clearInterval(checkAbortInterval);
      await this.redisClient.del(abortKey);
    }
  }

  private async executePipeline(
    data: PRJobData,
    signal: AbortSignal,
  ): Promise<AgentStateType> {
    if (signal.aborted) throw new Error('AbortError');

    const { prNumber, repoFullName, headSha, baseSha } = data;

    // 1. AST Engine: Trích xuất Context & Line Mappings từ Git Diff (FR-2.2, FR-2.3)
    const rawDiff =
      data.rawDiff ||
      `diff --git a/src/calculator.ts b/src/calculator.ts
index 0000000..1111111 100644
--- a/src/calculator.ts
+++ b/src/calculator.ts
@@ -1,4 +1,7 @@
 export class Calculator {
+  multiply(a: number, b: number): number {
+    return a * b;
+  }
 }`;

    this.logger.log(`🔍 [AST Engine] Bóc tách Diff & Scope cho PR #${prNumber}...`);
    const { changedLines } = this.diffParserService.computeLineMappings(rawDiff);
    const { scopes, imports } =
      this.diffParserService.extractScopesAndImports(rawDiff);

    if (signal.aborted) throw new Error('AbortError');

    // 2. Chuẩn bị Initial State cho StateGraph (FR-3.1)
    const initialState: AgentStateType = {
      prNumber,
      repoFullName,
      headSha: headSha || 'head-sha-placeholder',
      baseSha: baseSha || 'base-sha-placeholder',
      parsedFiles: [
        {
          filePath: 'src/calculator.ts',
          rawDiff,
          changedLines,
          scopes,
          imports,
        },
      ],
      rawFindings: [],
      verifiedFindings: [],
      findings: [],
      generatedTestCode: '',
      sandboxReport: {
        executed: false,
        success: true,
        hasSyntaxError: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
      },
      retryCount: 0,
      summaryMarkdown: '',
      isApproved: false,
      errors: [],
    };

    // 3. Khởi chạy LangGraph Multi-Agent Workflow
    this.logger.log(`🤖 [LangGraph] Bắt đầu điều phối các Agent Nodes...`);
    const finalState = (await this.reviewWorkflow.graph.invoke(
      initialState,
    )) as AgentStateType;

    if (signal.aborted) throw new Error('AbortError');

    // 4. GitHub Dispatcher: Gửi findings đã được verify bởi Judge Node
    this.logger.log(
      `🚀 [GitHub Dispatcher] Đăng kết quả thẩm định lên GitHub PR #${prNumber}...`,
    );

    const validFindings =
      finalState.verifiedFindings && finalState.verifiedFindings.length > 0
        ? finalState.verifiedFindings
        : finalState.findings || [];

    const dispatchParams = {
      repoFullName,
      prNumber,
      commitSha: headSha || 'head-sha-placeholder',
      findings: validFindings,
      executionStats: {
        totalTests: finalState.sandboxReport?.totalTests || 0,
        testsPassed: finalState.sandboxReport?.passedTests || 0,
      },
    };

    // Gửi inline comments cho lỗi CRITICAL / HIGH
    await this.githubDispatcher.dispatchInlineComments(dispatchParams);

    // Gửi Báo cáo Executive Summary lên tab Conversation của PR
    await this.githubDispatcher.dispatchSummaryReport(dispatchParams);

    return finalState;
  }
}