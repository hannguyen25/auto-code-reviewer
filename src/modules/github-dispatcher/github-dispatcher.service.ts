import { Injectable, Logger } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { ReviewFinding } from '../orchestrator/schemas/review-state.schema';

export interface PostReviewParams {
  repoFullName: string; // VD: "hannguyen25/auto-code-reviewer"
  prNumber: number;
  commitSha: string;
  findings: ReviewFinding[];
  summaryMarkdown?: string;
  executionStats?: {
    processingTime?: string;
    tokensUsed?: number;
    cost?: string;
    testsPassed?: number;
    totalTests?: number;
  };
}

@Injectable()
export class GithubDispatcherService {
  private readonly logger = new Logger(GithubDispatcherService.name);
  private octokit: Octokit;
  private readonly SUMMARY_WATERMARK = '<!-- AI-SECURITY-GATE-SUMMARY-REPORT -->';

  constructor() {
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
    if (!token) {
      this.logger.warn('⚠️ GITHUB_TOKEN chưa được cấu hình. Dispatcher chạy ở chế độ Dry-Run.');
    }
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Tạo inline review comments cho lỗi CRITICAL và HIGH (FR-5.1, FR-5.2)
   */
  async dispatchInlineComments(params: PostReviewParams): Promise<number> {
    const { repoFullName, prNumber, commitSha, findings } = params;
    const [owner, repo] = repoFullName.split('/');

    const actionableFindings = findings.filter(
      (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH',
    );

    if (actionableFindings.length === 0) {
      this.logger.log(`PR #${prNumber}: Không có lỗi CRITICAL/HIGH cần comment inline.`);
      return 0;
    }

    const comments = actionableFindings.map((finding) => {
      let body = `### 🚨 [${finding.severity}] ${finding.title}\n\n`;
      body += `${finding.comment}\n\n`;

      // FR-5.2: GitHub Multi-line Suggestion chuẩn
      if (finding.suggestion && finding.suggestion.trim().length > 0) {
        body += `\`\`\`suggestion\n${finding.suggestion.trim()}\n\`\`\`\n\n`;
      }

      body += `*Độ tin cậy: ${(finding.confidenceScore * 100).toFixed(0)}% | Phân loại: ${finding.category}*`;

      return {
        path: finding.filePath,
        line: finding.line,
        side: 'RIGHT' as const,
        body,
      };
    });

    const event = 'COMMENT';

    const response = await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event,
      comments,
    });

    this.logger.log(`✅ Đã tạo Review #${response.data.id} với ${comments.length} inline comments.`);
    return comments.length;
  }

  /**
   * Đăng hoặc Cập nhật báo cáo tổng hợp duy nhất (FR-5.3 - Idempotent Summary Comment)
   */
  async dispatchSummaryReport(params: PostReviewParams): Promise<void> {
    const { repoFullName, prNumber, findings, executionStats } = params;
    const [owner, repo] = repoFullName.split('/');

    const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
    const highCount = findings.filter((f) => f.severity === 'HIGH').length;
    const minorFindings = findings.filter(
      (f) => f.severity === 'MEDIUM' || f.severity === 'LOW' || f.severity === 'INFO',
    );

    const isBlocked = criticalCount > 0 || highCount > 0;
    const statusText = isBlocked
      ? `❌ Changes Requested (${criticalCount} Critical, ${highCount} High Issues Found)`
      : `✅ Passed (No critical issues)`;

    const processingTime = executionStats?.processingTime || 'N/A';
    const tokens = executionStats?.tokensUsed ? executionStats.tokensUsed.toLocaleString() : 'N/A';
    const cost = executionStats?.cost || '$0.00';

    // 1. Render Markdown Báo cáo chuẩn FR-5.3 kèm Watermark
    let report = `${this.SUMMARY_WATERMARK}\n`;
    report += `## 🛡️ AI Security Gate & Code Review Summary\n\n`;
    report += `**Status:** ${statusText}\n`;
    report += `**Processing Time:** ${processingTime} | **Tokens Used:** ${tokens} (~${cost})\n\n`;
    report += `---\n\n`;

    // 2. Bảng lỗi Critical / High
    const majorFindings = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    if (majorFindings.length > 0) {
      report += `### 🚨 Critical & High Priority Issues\n\n`;
      report += `| Severity | Category | File | Location | Description |\n`;
      report += `| :--- | :--- | :--- | :--- | :--- |\n`;
      majorFindings.forEach((f) => {
        report += `| \`${f.severity}\` | ${f.category} | \`${f.filePath}\` | Line ${f.line} | ${f.title}: ${f.comment} |\n`;
      });
      report += `\n---\n\n`;
    }

    // 3. Kết quả Sandbox Execution
    if (executionStats?.totalTests !== undefined) {
      report += `### 🧪 Automated Sandbox Verification\n`;
      report += `* **Generated Tests:** ${executionStats.totalTests} test cases created.\n`;
      report += `* **Execution Status:** ${executionStats.testsPassed === executionStats.totalTests ? '✅ Passed' : '⚠️ Has Failures'}\n\n`;
    }

    // 4. Accordion cho Minor issues (<details><summary>)
    if (minorFindings.length > 0) {
      report += `<details><summary>🔍 <b>Nitpicks & Minor Recommendations (${minorFindings.length})</b></summary>\n\n`;
      minorFindings.forEach((f, idx) => {
        report += `${idx + 1}. \`${f.filePath}:${f.line}\`: **[${f.category}]** ${f.comment}\n`;
      });
      report += `\n</details>\n`;
    }

    // 5. Kiểm tra tính Idempotent: Tìm comment đã tồn tại qua Watermark
    const existingComments = await this.octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const previousSummary = existingComments.data.find((c) =>
      c.body?.includes(this.SUMMARY_WATERMARK),
    );

    if (previousSummary) {
      await this.octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: previousSummary.id,
        body: report,
      });
      this.logger.log(`🔄 [GitHub Dispatcher] Đã cập nhật Summary Report cũ (#${previousSummary.id}).`);
    } else {
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: report,
      });
      this.logger.log(`✅ [GitHub Dispatcher] Đã tạo mới Executive Summary Report lên PR #${prNumber}.`);
    }
  }

  /**
   * Điều phối cả 2 luồng inline comments và summary report cho Processor
   */
  async dispatchReview(params: PostReviewParams): Promise<{ postedCommentsCount: number }> {
    const postedCommentsCount = await this.dispatchInlineComments(params);
    await this.dispatchSummaryReport(params);
    return { postedCommentsCount };
  }
}