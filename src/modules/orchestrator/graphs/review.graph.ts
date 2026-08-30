import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentStateAnnotation } from './review-state.annotation';
import { AgentStateType } from '../schemas/review-state.schema';
import { securityAgentNode } from '../agents/security.agent';
import { logicPerformanceAgentNode } from '../agents/logic-performance.agent';
import { testGeneratorAgentNode } from '../agents/test-generator.agent';
import { sandboxVerifierAgentNode } from '../agents/sandbox-verifier.agent';
import { judgeReflectionAgentNode } from '../agents/judge-reflection.agent';
import { ReportFormatter } from '../utils/report-formatter';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ReviewGraphWorkflow {
  public graph;

  constructor() {
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(AgentStateAnnotation)
      .addNode('security_agent', securityAgentNode)
      .addNode('logic_performance_agent', logicPerformanceAgentNode)
      .addNode('test_generator_agent', testGeneratorAgentNode)
      .addNode('sandbox_verifier', sandboxVerifierAgentNode)
      .addNode('judge_reflection', judgeReflectionAgentNode)
      .addNode('aggregator', this.aggregatorNode)

      // 1. Phân nhánh chạy song song từ START (FR-3.2, FR-3.3, FR-3.4)
      .addEdge(START, 'security_agent')
      .addEdge(START, 'logic_performance_agent')
      .addEdge(START, 'test_generator_agent')

      // 2. Chuyển test code vào Isolated Docker Sandbox (FR-4.1)
      .addEdge('test_generator_agent', 'sandbox_verifier')

      // 3. Gom toàn bộ raw_findings và log sandbox vào Judge Node (FR-3.5)
      .addEdge('security_agent', 'judge_reflection')
      .addEdge('logic_performance_agent', 'judge_reflection')
      .addEdge('sandbox_verifier', 'judge_reflection')

      // 4. Kiểm soát Retry Loop tối đa 2 lần (FR-4.2)
      .addConditionalEdges(
        'judge_reflection',
        (state: AgentStateType) => {
          const hasError = state.sandboxReport?.hasSyntaxError || !state.sandboxReport?.success;
          if (hasError && (state.retryCount || 0) < 2) {
            return 'retry';
          }
          return 'proceed';
        },
        {
          retry: 'test_generator_agent',
          proceed: 'aggregator',
        },
      )
      .addEdge('aggregator', END);

    return workflow.compile();
  }

  private aggregatorNode(state: AgentStateType) {
    // Đánh giá dựa trên verifiedFindings đã qua bộ lọc
    const hasCritical = (state.verifiedFindings || []).some(
      (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH',
    );
    const isApproved = !hasCritical && (state.sandboxReport?.success ?? true);

    // Chuẩn hóa báo cáo Markdown tổng kết theo FR-5.3
    const fullSummaryMarkdown = ReportFormatter.generateSummaryReport({
      ...state,
      findings: state.verifiedFindings,
    });

    return {
      isApproved,
      summaryMarkdown: fullSummaryMarkdown,
    };
  }
}

export const reviewGraphWorkflow = new ReviewGraphWorkflow();
export const reviewGraph = reviewGraphWorkflow.graph;