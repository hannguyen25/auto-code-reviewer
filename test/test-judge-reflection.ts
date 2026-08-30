import * as dotenv from 'dotenv';
dotenv.config();

import { ReviewGraphWorkflow } from '../src/modules/orchestrator/graphs/review.graph';
import { AgentStateSchema } from '../src/modules/orchestrator/schemas/review-state.schema';

async function runJudgeReflectionTest() {
  console.log('🧪 Bắt đầu kiểm thử Test Generator, Adversarial Filter (< 0.85) & Reflection Retry Loop...\n');

  const reviewWorkflow = new ReviewGraphWorkflow();

  const initialInput = {
    prNumber: 888,
    repoFullName: 'hannguyen25/auto-code-reviewer',
    headSha: 'commit_sha_888',
    baseSha: 'base_sha_000',
    parsedFiles: [
      {
        filePath: 'src/utils/math.js',
        changedLines: [1, 2, 3, 4, 5],
        rawDiff: `
function parseDiscount(type, rate) {
  if (type === 'VIP') {
    return rate * 1.5;
  } else if (type === 'MEMBER') {
    return rate * 1.1;
  }
  return rate;
}
module.exports = { parseDiscount };
        `,
        scopes: [{ scopeType: 'function', scopeName: 'parseDiscount', startLine: 1, endLine: 8 }],
        imports: [],
      },
    ],
    // Giả lập 2 findings: 1 cái điểm cao (0.95) và 1 cái hallucination (0.60)
    findings: [
      {
        id: 'f-valid',
        filePath: 'src/utils/math.js',
        line: 2,
        diffPosition: 2,
        category: 'SECURITY',
        severity: 'MEDIUM',
        title: 'Missing Type Verification',
        comment: 'Rate input should be validated as number.',
        confidenceScore: 0.95, // Giữ lại
      },
      {
        id: 'f-noise',
        filePath: 'src/utils/math.js',
        line: 3,
        diffPosition: 3,
        category: 'PERFORMANCE',
        severity: 'LOW',
        title: 'Unnecessary If Statement',
        comment: 'Possible hallucinated comment with low confidence.',
        confidenceScore: 0.62, // Phải bị Adversarial filter loại bỏ
      },
    ],
  };

  const validatedInput = AgentStateSchema.parse(initialInput);
  console.log('🚀 Khởi chạy StateGraph...');

  const finalState = await reviewWorkflow.graph.invoke(validatedInput);

  console.log('\n--- KẾT QUẢ FINAL STATE ---');
  console.log(`- Approved Status : ${finalState.isApproved ? 'YES ✅' : 'NO ❌'}`);
  console.log(`- Retry Count     : ${finalState.retryCount}`);
  console.log(`- Số lượng Finding sau Filter: ${finalState.findings.length}`);
  
  finalState.findings.forEach((f: any) => {
    console.log(`  ✅ [Giữ lại] ${f.title} (Confidence: ${f.confidenceScore})`);
  });

  console.log('\n- Test Code sinh tự động:');
  console.log(finalState.generatedTestCode);

  console.log('\n- Báo cáo tổng hợp:');
  console.log(finalState.summaryMarkdown);
}

runJudgeReflectionTest();