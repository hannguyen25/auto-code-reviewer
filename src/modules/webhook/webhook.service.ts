import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

export interface PRJobData {
  prNumber: number;
  repoFullName: string;
  installationId: number;
  headSha: string;
  baseSha: string;
  diffUrl: string;
  action: string;
}

export interface PRJobData {
  prNumber: number;
  repoFullName: string;
  headSha: string;
  baseSha: string;
  rawDiff?: string; 
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly redisClient: Redis;

  constructor(
    @InjectQueue('pr-review-queue') private readonly reviewQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.redisClient = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', 'redis_password'),
    });
  }

  async handlePullRequestEvent(payload: any) {
    const action = payload.action;
    const prNumber = payload.pull_request.number;
    const repoFullName = payload.repository.full_name;
    const repoId = payload.repository.id;
    const headSha = payload.pull_request.head.sha;
    const baseSha = payload.pull_request.base.sha;
    const diffUrl = payload.pull_request.diff_url;
    const installationId = payload.installation?.id;

    // Khóa định danh PR duy nhất trên Redis
    const prKey = `active_pr:${repoFullName}#${prNumber}`;

    // FR-1.3: Debounce & Cancellation khi nhận commit mới
    if (action === 'synchronize') {
      const activeJobId = await this.redisClient.get(prKey);
      if (activeJobId) {
        this.logger.warn(`🔄 New commit pushed on PR #${prNumber}. Cancelling old Job ID: ${activeJobId}`);
        // 1. Gắn cờ huỷ trên Redis để Worker phát hiện và kích hoạt AbortController
        await this.redisClient.set(`abort_job:${activeJobId}`, '1', 'EX', 300);

        // 2. Nếu job còn đang nằm chờ trong hàng đợi (delayed/waiting), xóa trực tiếp
        const oldJob = await this.reviewQueue.getJob(activeJobId);
        if (oldJob) {
          const state = await oldJob.getState();
          if (state === 'waiting' || state === 'delayed') {
            await oldJob.remove();
          }
        }
      }
    }

    const jobData: PRJobData = {
      prNumber,
      repoFullName,
      installationId,
      headSha,
      baseSha,
      diffUrl,
      action,
    };

    // Định danh duy nhất theo chuẩn Deduplication: pr-{repo_id}-{pr_number}-{head_sha}
    const uniqueJobId = `pr-${repoId}-${prNumber}-${headSha}`;

    // Đẩy Job mới vào Queue với cấu hình Retry & DLQ
    const newJob = await this.reviewQueue.add('review-pr', jobData, {
      jobId: uniqueJobId,
      delay: 2000,
      attempts: 3,                  // Thử lại tối đa 3 lần nếu có lỗi
      backoff: {
        type: 'exponential',        // Backoff lũy tiến: 1s, 2s, 4s...
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,          // Lưu lại job trong danh sách failed (DLQ)
    });

    // Cập nhật Job ID mới nhất cho PR này
    if (newJob.id) {
      await this.redisClient.set(prKey, newJob.id, 'EX', 86400);
      this.logger.log(`📥 Enqueued PR #${prNumber} (${repoFullName}) - Job ID: ${newJob.id}`);
    }
  }
}