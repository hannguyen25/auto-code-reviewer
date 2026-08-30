import { AgentStateType, ReviewFinding } from '../schemas/review-state.schema';

export class ReportFormatter {
  /**
   * Sinh báo cáo Markdown hoàn chỉnh kèm collapsible accordion cho PR
   */
  static generateSummaryReport(state: AgentStateType): string {
    const findings = state.findings || [];
    const criticalHighFindings = findings.filter(
      (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH',
    );
    const minorFindings = findings.filter(
      (f) => f.severity === 'MEDIUM' || f.severity === 'LOW' || f.severity === 'INFO',
    );

    const isSandboxPassed = state.sandboxReport?.success ?? true;
    const hasBlocker = criticalHighFindings.length > 0 || !isSandboxPassed;
    const statusBadge = hasBlocker
      ? '🔴 **CHANGES REQUESTED**'
      : '🟢 **APPROVED / READY TO MERGE**';

    // 1. Header & Executive Summary Table
    let md = `## 🤖 AI Code Review Summary Report\n\n`;
    md += `| Trạng thái | Điểm Sandbox | Lỗi Nghiêm trọng (P1/P2) | Góp ý Cải tiến (P3/P4) | Chu kỳ Reflection |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: |\n`;
    md += `| ${statusBadge} | ${isSandboxPassed ? '✅ PASSED' : '❌ FAILED'} | **${criticalHighFindings.length}** | **${minorFindings.length}** | \`${state.retryCount || 0}/2\` |\n\n`;

    // 2. Chi tiết kết quả Docker Sandbox
    md += `### 🐳 Docker Sandbox Verification\n`;
    if (state.sandboxReport?.executed) {
      md += `- **Kết quả kiểm thử tự động:** ${state.sandboxReport.success ? '✅ Vượt qua toàn bộ branch tests' : '❌ Thất bại'}\n`;
      md += `- **Tổng số test cases:** ${state.sandboxReport.totalTests} (Passed: ${state.sandboxReport.passedTests}, Failed: ${state.sandboxReport.failedTests})\n`;
      if (state.sandboxReport.error) {
        md += `\n> **Chi tiết lỗi Sandbox:**\n\`\`\`text\n${state.sandboxReport.error.trim()}\n\`\`\`\n\n`;
      }
    } else {
      md += `*Không có test case tự động nào cần xác thực trong môi trường cô lập.*\n\n`;
    }

    // 3. Phần cảnh báo Critical / High (Hiển thị trực tiếp)
    if (criticalHighFindings.length > 0) {
      md += `### 🚨 Lỗ hổng & Vấn đề Cần Chỉnh sửa Ngay (${criticalHighFindings.length})\n\n`;
      criticalHighFindings.forEach((finding, idx) => {
        md += `#### ${idx + 1}. [${finding.severity}] ${finding.title}\n`;
        md += `- **File:** \`${finding.filePath}\` (Dòng: \`${finding.line}\`)\n`;
        md += `- **Phân loại:** \`${finding.category}\` | **Độ tin cậy:** \`${(finding.confidenceScore * 100).toFixed(0)}%\`\n`;
        md += `- **Mô tả:** ${finding.comment}\n`;
        if (finding.suggestion) {
          md += `\n\`\`\`suggestion\n${finding.suggestion.trim()}\n\`\`\`\n`;
        }
        md += `\n---\n`;
      });
    }

    // 4. Phần Góp ý Nhẹ / Code Style gom trong Collapsible Accordion (<details>)
    if (minorFindings.length > 0) {
      md += `\n<details>\n`;
      md += `<summary>🔍 <b>Xem thêm ${minorFindings.length} góp ý tối ưu mã nguồn (Medium / Low / Code Style)</b></summary>\n\n`;
      md += `> Các đề xuất bên dưới nhằm mục đích nâng cao chất lượng mã nguồn, khả năng bảo trì và hiệu năng phụ.\n\n`;

      minorFindings.forEach((finding, idx) => {
        md += `##### ${idx + 1}. [${finding.severity}] \`${finding.filePath}:${finding.line}\` - ${finding.title}\n`;
        md += `- **Chi tiết:** ${finding.comment}\n`;
        if (finding.suggestion) {
          md += `\`\`\`typescript\n${finding.suggestion.trim()}\n\`\`\`\n`;
        }
        md += `\n`;
      });

      md += `</details>\n\n`;
    }

    md += `\n---\n*Được thẩm định bởi AI Reviewer Pipeline (LangGraph & Isolated Sandbox).*`;
    return md;
  }
}