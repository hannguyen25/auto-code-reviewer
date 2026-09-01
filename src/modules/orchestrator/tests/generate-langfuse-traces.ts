import * as dotenv from 'dotenv';
dotenv.config();

import { Langfuse } from 'langfuse';
import { LangfuseTracker } from '../utils/langfuse-tracker';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
});

async function main() {
  console.log('🚀 Đang gửi traces và cost metrics lên Langfuse...');

  const tracesData = [
    { pr: 42, repo: 'enterprise-org/core-backend', inTok: 1540, outTok: 420, latency: 1.8 },
    { pr: 43, repo: 'enterprise-org/core-backend', inTok: 2890, outTok: 780, latency: 2.6 },
    { pr: 44, repo: 'enterprise-org/auth-service', inTok: 1200, outTok: 310, latency: 1.2 },
  ];

  for (const item of tracesData) {
    const cost = LangfuseTracker.calculateCost({
      inputTokens: item.inTok,
      outputTokens: item.outTok,
      model: 'gemini-2.5-flash',
    });

    const trace = langfuse.trace({
      id: `trace-pr-${item.pr}-${Date.now()}`,
      name: `PR Review Flow #${item.pr}`,
      sessionId: `pr-${item.repo.replace('/', '-')}-${item.pr}`,
      tags: ['gemini-2.5-flash', 'pr-review', item.repo],
      metadata: { prNumber: item.pr, repo: item.repo },
    });

    trace.generation({
      name: 'Security & Logic Analysis',
      model: 'gemini-2.5-flash',
      startTime: new Date(Date.now() - item.latency * 1000),
      endTime: new Date(),
      usage: {
        promptTokens: item.inTok,
        completionTokens: item.outTok,
        totalTokens: item.inTok + item.outTok,
        unit: 'TOKENS',
      },
      metadata: {
        costUsd: cost,
        budgetLimit: '$0.05',
      },
    });

    console.log(`✅ Đã gửi PR #${item.pr} | Tokens: ${item.inTok + item.outTok} | Cost: $${cost.toFixed(5)}`);
  }

  await langfuse.flushAsync();
  console.log('🎉 Hoàn tất! Vui lòng F5 lại trang Langfuse.');
}

main();