import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

export interface PRJobData {
  prNumber: number;
  repoFullName: string;
  installationId?: number;
  headSha: string;
  baseSha: string;
  diffUrl?: string;
  action?: string;
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
    const prNumber = payload.pull_request?.number;
    const repoFullName = payload.repository?.full_name;
    const repoId = payload.repository?.id;
    const headSha = payload.pull_request?.head?.sha;
    const baseSha = payload.pull_request?.base?.sha;
    const diffUrl = payload.pull_request?.diff_url;
    const installationId = payload.installation?.id;

    if (!prNumber || !repoFullName) {
      this.logger.warn('⚠️ Webhook payload không chứa đủ thông tin PR.');
      return;
    }

    // Khóa định danh PR duy nhất trên Redis
    const prKey = `active_pr:${repoFullName}#${prNumber}`;

    // FR-1.3: Debounce & Cancellation khi nhận commit mới
    if (action === 'synchronize') {
      const activeJobId = await this.redisClient.get(prKey);
      if (activeJobId) {
        this.logger.warn(`🔄 New commit pushed on PR #${prNumber}. Cancelling old Job ID: ${activeJobId}`);
        await this.redisClient.set(`abort_job:${activeJobId}`, '1', 'EX', 300);

        const oldJob = await this.reviewQueue.getJob(activeJobId);
        if (oldJob) {
          const state = await oldJob.getState();
          if (state === 'waiting' || state === 'delayed') {
            await oldJob.remove();
          }
        }
      }
    }

    // Tải trực tiếp diff từ GitHub Pull Request API
    let rawDiff = '';
    try {
      const githubToken = this.configService.get<string>('GITHUB_TOKEN') || process.env.GITHUB_TOKEN;
      const apiUrl = `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`;
      
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'NestJS-AI-Code-Reviewer',
          'Accept': 'application/vnd.github.v3.diff',
          ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
        },
      });

      if (response.ok) {
        rawDiff = await response.text();
        this.logger.log(`📄 Đã tải Git Diff thành công (${rawDiff.length} ký tự).`);
      } else {
        this.logger.error(`❌ Lỗi tải diff từ GitHub: ${response.status} ${response.statusText}`);
      }
    } catch (err: any) {
      this.logger.error(`❌ Không thể tải rawDiff: ${err.message}`);
    }

    const jobData: PRJobData = {
      prNumber,
      repoFullName,
      installationId,
      headSha,
      baseSha,
      diffUrl,
      action,
      rawDiff,
    };

    const uniqueJobId = `pr-${repoId}-${prNumber}-${headSha}`;

    const newJob = await this.reviewQueue.add('review-pr', jobData, {
      jobId: uniqueJobId,
      delay: 2000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    if (newJob.id) {
      await this.redisClient.set(prKey, newJob.id, 'EX', 86400);
      this.logger.log(`📥 Enqueued PR #${prNumber} (${repoFullName}) - Job ID: ${newJob.id}`);
    }
  }
}