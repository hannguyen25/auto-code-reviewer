import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GithubDispatcherService } from '../github-dispatcher.service';
import { ReviewFinding } from '../../orchestrator/schemas/review-state.schema';

async function runDispatcherTest() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dispatcher = app.get(GithubDispatcherService);

  const target = {
    repoFullName: 'hannguyen25/auto-code-reviewer',
    prNumber: 4,
    commitSha: 'c9decf7d97d5f4c2a4aebbde7dd88836faf99a6e', 
  };

  const testFindings: ReviewFinding[] = [
    {
      id: 'find-1',
      filePath: 'test-file.ts',
      line: 2,
      diffPosition: 2,
      category: 'SECURITY',
      severity: 'CRITICAL',
      title: 'Console Log Exposure',
      comment: 'Sensitive debug info leaked in log.',
      suggestion: "console.info('safe');",
      confidenceScore: 0.95,
    },
    {
      id: 'find-2',
      filePath: 'test-file.ts',
      line: 1,
      diffPosition: 1,
      category: 'BUG',
      severity: 'LOW',
      title: 'Formatting',
      comment: 'Consider cleaning up legacy console outputs.',
      confidenceScore: 0.88,
    },
  ];

  const executionStats = {
    processingTime: '28.4s',
    tokensUsed: 4120,
    cost: '$0.021',
    testsPassed: 2,
    totalTests: 2,
  };

  console.log('🚀 Bắt đầu test Dispatcher...');

  try {
    // Test FR-5.1 & FR-5.2
    await dispatcher.dispatchInlineComments({
      ...target,
      findings: testFindings,
    });

    // Test FR-5.3
    await dispatcher.dispatchSummaryReport({
      ...target,
      findings: testFindings,
      executionStats,
    });

    console.log('🎉 Hoàn tất kiểm thử Dispatcher!');
  } catch (err: any) {
    console.error('❌ Lỗi:', err.response?.data || err.message);
  } finally {
    await app.close();
  }
}

runDispatcherTest();