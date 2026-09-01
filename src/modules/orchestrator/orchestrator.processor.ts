import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { CallbackHandler } from 'langfuse-langchain';

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

    const queueWaitTimeSeconds = (Date.now() - job.timestamp) / 1000;
    this.metricsService.recordQueueLatency?.(
      'pr-review-queue',
      queueWaitTimeSeconds,
    );

    const stopWorkflowTimer =
      this.metricsService.startAgentTimer?.('orchestrator_full_workflow');

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
      const finalState = await this.executePipeline(
        job.data,
        abortController.signal,
      );

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

    // 1. Trích xuất danh sách file từ Webhook Data
    let incomingFiles: Array<{ filePath: string; rawDiff: string }> = [];

    if ((data as any).files && Array.isArray((data as any).files) && (data as any).files.length > 0) {
      incomingFiles = (data as any).files.map((f: any) => ({
        filePath: f.filename || f.path || f.filePath,
        rawDiff: f.patch || f.rawDiff || '',
      }));
    } else {
      incomingFiles = [
        {
          filePath: (data as any).filePath || 'src/services/order.service.ts',
          rawDiff: data.rawDiff || '',
        },
      ];
    }

    const filteredFiles = this.diffParserService.filterPrFiles(incomingFiles);
    this.logger.log(`🔍 [AST Engine] Bóc tách Diff & Scope cho PR #${prNumber} (${filteredFiles.length} files)...`);

    // 2. Phân tích cú pháp AST & Line Mappings
    const parsedFiles = filteredFiles.map((file) => {
      const { changedLines } = this.diffParserService.computeLineMappings(file.rawDiff);
      const { scopes, imports } = this.diffParserService.extractScopesAndImports(file.rawDiff);

      return {
        filePath: file.filePath,
        rawDiff: file.rawDiff,
        changedLines,
        scopes,
        imports,
      };
    });

    if (signal.aborted) throw new Error('AbortError');

    // 3. Chuẩn bị Initial State cho StateGraph
    const initialState: AgentStateType = {
      prNumber,
      repoFullName,
      headSha: headSha || 'head-sha-placeholder',
      baseSha: baseSha || 'base-sha-placeholder',
      parsedFiles,
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

    // 4. Khởi tạo Langfuse Callback Handler
    const langfusePublicKey = this.configService.get<string>('LANGFUSE_PUBLIC_KEY');
    const langfuseSecretKey = this.configService.get<string>('LANGFUSE_SECRET_KEY');
    const langfuseHost = this.configService.get<string>('LANGFUSE_HOST', 'https://cloud.langfuse.com');

    let langfuseHandler: CallbackHandler | undefined;

    if (langfusePublicKey && langfuseSecretKey) {
      langfuseHandler = new CallbackHandler({
        publicKey: langfusePublicKey,
        secretKey: langfuseSecretKey,
        baseUrl: langfuseHost,
        metadata: {
          prNumber,
          repoFullName,
          headSha,
        },
        tags: ['pr-review', 'langgraph-agents'],
      });
    }

    // 5. Khởi chạy LangGraph Multi-Agent Workflow
    this.logger.log(`🤖 [LangGraph] Bắt đầu điều phối các Agent Nodes...`);
    const finalState = (await this.reviewWorkflow.graph.invoke(
      initialState,
      langfuseHandler ? { callbacks: [langfuseHandler] } : undefined,
    )) as AgentStateType;

    if (langfuseHandler) {
      await langfuseHandler.flushAsync();
    }

    if (signal.aborted) throw new Error('AbortError');

    // 6. GitHub Dispatcher: Gửi findings
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