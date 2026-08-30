import * as dotenv from 'dotenv';
dotenv.config();

import { ReviewGraphWorkflow } from '../src/modules/orchestrator/graphs/review.graph';
import { AgentStateSchema } from '../src/modules/orchestrator/schemas/review-state.schema';

async function runMultiAgentTest() {
  console.log('🧪 Bắt đầu kiểm thử Multi-Agent Nodes (Security + Performance Router)...\n');

  const reviewWorkflow = new ReviewGraphWorkflow();

  // Dữ liệu PR giả lập chứa cả lỗi SQLi (Security) và N+1 Query (Performance)
  const initialInput = {
    prNumber: 777,
    repoFullName: 'hannguyen25/auto-code-reviewer',
    headSha: 'c0ffee12345678',
    baseSha: 'base0001112223',
    parsedFiles: [
      {
        filePath: 'src/services/order.service.ts',
        changedLines: [15, 16, 25, 26, 27],
        rawDiff: `
@@ -10,10 +10,18 @@ export class OrderService {
+  async getOrdersByUser(userId: string) {
+    // Vulnerability: CWE-89 SQL Injection
+    const sql = "SELECT * FROM orders WHERE user_id = '" + userId + "'";
+    return this.db.query(sql);
+  }
+
+  async populateOrderItems(orderIds: string[]) {
+    const results = [];
+    // Bottleneck: N+1 Database Query inside loop
+    for (const id of orderIds) {
+      const items = await this.db.query(\`SELECT * FROM order_items WHERE order_id = \${id}\`);
+      results.push(items);
+    }
+    return results;
+  }
        `,
        scopes: [
          {
            scopeType: 'class',
            scopeName: 'OrderService',
            startLine: 10,
            endLine: 35,
          },
        ],
        imports: ["import { Injectable } from '@nestjs/common';"],
      },
    ],
    sandboxReport: {
      executed: true,
      success: true,
      totalTests: 2,
      passedTests: 2,
      failedTests: 0,
    },
  };

  const validatedInput = AgentStateSchema.parse(initialInput);
  console.log('🚀 Đang kích hoạt StateGraph chạy qua Security & Performance Agents...');

  const finalState = await reviewWorkflow.graph.invoke(validatedInput);

  console.log('\n--- KẾT QUẢ FINAL STATE GRAPH ---');
  console.log(`- Approved Status  : ${finalState.isApproved ? 'YES ✅' : 'NO ❌'}`);
  console.log(`- Số lượng Findings : ${finalState.findings.length}\n`);

  finalState.findings.forEach((f: any, idx: number) => {
    console.log(`📌 Finding #${idx + 1}: [${f.severity}] [${f.category}] ${f.title}`);
    console.log(`   - File: ${f.filePath} (Line ${f.line}, DiffPos: ${f.diffPosition})`);
    console.log(`   - Comment: ${f.comment}`);
    if (f.suggestion) console.log(`   - Suggestion:\n${f.suggestion}`);
    console.log('--------------------------------------------------');
  });

  console.log('\n- Báo cáo tổng hợp:');
  console.log(finalState.summaryMarkdown);
}

runMultiAgentTest();