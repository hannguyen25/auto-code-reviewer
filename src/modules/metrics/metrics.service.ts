import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

@Injectable()
export class AppMetricsService implements OnModuleInit {
  // 1. Queue Latency: Thời gian message/PR nằm chờ trong Redis BullMQ trước khi được bốc xử lý (ms)
  public readonly queueLatencyHistogram = new Histogram({
    name: 'pr_review_queue_latency_seconds',
    help: 'Thời gian PR job chờ trong hàng đợi BullMQ trước khi bắt đầu xử lý',
    labelNames: ['queue_name'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register],
  });

  // 2. Agent Execution Time: Thời gian thực thi chi tiết của từng Agent Node / Docker Sandbox (giây)
  public readonly agentExecutionDuration = new Histogram({
    name: 'pr_agent_execution_duration_seconds',
    help: 'Thời gian thực thi chi tiết của từng Agent Node và Sandbox',
    labelNames: ['agent_name', 'status'],
    buckets: [0.5, 1, 2.5, 5, 10, 20, 30, 60],
    registers: [register],
  });

  // 3. Success / Failure Rate: Đếm số lượt review thành công, bị từ chối hoặc gặp lỗi hệ thống
  public readonly reviewStatusCounter = new Counter({
    name: 'pr_review_total_events',
    help: 'Tổng số lượt xử lý PR phân loại theo kết quả thẩm định',
    labelNames: ['status', 'is_approved', 'has_sandbox_error'],
    registers: [register],
  });

  // Warm-up khởi tạo sẵn metric structure ngay khi Module Metrics nạp vào NestJS
  onModuleInit() {
    this.queueLatencyHistogram.observe({ queue_name: 'pr-review-queue' }, 0);
    this.agentExecutionDuration.observe({ agent_name: 'security_agent', status: 'SUCCESS' }, 0);
    this.agentExecutionDuration.observe({ agent_name: 'logic_performance_agent', status: 'SUCCESS' }, 0);
    this.agentExecutionDuration.observe({ agent_name: 'test_generator_agent', status: 'SUCCESS' }, 0);
    this.reviewStatusCounter.inc({ status: 'SUCCESS', is_approved: 'true', has_sandbox_error: 'false' }, 0);
  }

  // Ghi nhận thời gian chờ hàng đợi
  recordQueueLatency(queueName: string, waitTimeMs: number) {
    this.queueLatencyHistogram.observe({ queue_name: queueName }, waitTimeMs / 1000);
  }

  // Đo thời gian chạy của Node
  startAgentTimer(agentName: string) {
    const end = this.agentExecutionDuration.startTimer({ agent_name: agentName });
    return (status: 'SUCCESS' | 'FAILED') => {
      end({ status });
    };
  }

  // Ghi nhận kết quả hoàn tất PR
  recordReviewResult(isApproved: boolean, hasSandboxError: boolean, status: 'SUCCESS' | 'ERROR') {
    this.reviewStatusCounter.inc({
      status,
      is_approved: String(isApproved),
      has_sandbox_error: String(hasSandboxError),
    });
  }
}