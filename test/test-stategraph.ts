import { ReviewGraphWorkflow } from '../src/modules/orchestrator/graphs/review.graph';
import { AgentStateSchema } from '../src/modules/orchestrator/schemas/review-state.schema';

async function testStateGraph() {
  console.log('🧪 Bắt đầu kiểm thử StateGraph (LangGraph.js + Zod Validation)...\n');

  const reviewWorkflow = new ReviewGraphWorkflow();

  // Dữ liệu đầu vào giả lập sau khi qua AST Parse
  const initialInput = {
    prNumber: 601,
    repoFullName: 'hannguyen25/auto-code-reviewer',
    headSha: 'abc999888777',
    baseSha: 'root111222333',
    parsedFiles: [
      {
        filePath: 'src/user.service.ts',
        changedLines: [12, 13],
        rawDiff: `+ async getUser(id) {\n+   const query = "SELECT * FROM users WHERE id = " + id;\n+   console.log(query);\n+ }`,
        scopes: [
          {
            scopeType: 'class',
            scopeName: 'UserService',
            startLine: 5,
            endLine: 20,
          },
        ],
        imports: ["import { Injectable } from '@nestjs/common';"],
      },
    ],
    sandboxReport: {
      executed: true,
      success: true,
      totalTests: 3,
      passedTests: 3,
      failedTests: 0,
    },
  };

  // 1. Kiểm tra tính hợp lệ của input bằng Zod
  const validatedInput = AgentStateSchema.parse(initialInput);
  console.log('✅ 1. Khởi tạo & Validate AgentState Schema đầu vào thành công');

  // 2. Thực thi workflow LangGraph
  console.log('🚀 2. Đang thực thi StateGraph Pipeline...');
  const finalState = await reviewWorkflow.graph.invoke(validatedInput);

  console.log('\n--- KẾT QUẢ FINAL STATE GRAPH ---');
  console.log(`- Approved Status : ${finalState.isApproved ? 'YES ✅' : 'NO ❌'}`);
  console.log(`- Số lượng Findings: ${finalState.findings.length}`);
  finalState.findings.forEach((f: any, idx: number) => {
    console.log(`  ${idx + 1}. [${f.severity}] [${f.category}] ${f.title} (Line ${f.line}, DiffPos: ${f.diffPosition})`);
  });

  console.log('\n- Báo cáo Markdown tạo ra:');
  console.log(finalState.summaryMarkdown);

  if (finalState.findings.length >= 2 && finalState.errors.length === 0) {
    console.log('\n🎉 TEST STATEGRAPH WORKFLOW: PASSED (Zod + LangGraph hoạt động chuẩn xác)');
  } else {
    console.log('\n❌ TEST STATEGRAPH WORKFLOW: FAILED');
  }
}

testStateGraph();