import { Logger } from '@nestjs/common';
import { AgentStateType } from '../schemas/review-state.schema';
import { sanitizeLog } from '../utils/log-sanitizer.util';

export async function judgeReflectionAgentNode(
  state: AgentStateType,
): Promise<Partial<AgentStateType>> {
  const logger = new Logger('JudgeReflectionAgent');
  logger.log(sanitizeLog(`⚖️ [Judge / Reflection] Thẩm định Adversarial Filter cho PR #${state.prNumber}...`));

  // FR-3.5: Đọc từ rawFindings
  const rawFindings = state.rawFindings || [];
  const initialCount = rawFindings.length;

  // 1. Adversarial Filter: Loại bỏ finding có confidenceScore < 0.85 (FR-3.5)
  const verifiedFindings = rawFindings.filter((f) => {
    const score = f.confidenceScore ?? 0.9;
    const isReliable = score >= 0.85;

    if (!isReliable) {
      logger.warn(
        sanitizeLog(`🗑️ [Adversarial Drop] Bỏ finding "${f.title}" do confidenceScore (${score}) < 0.85`),
      );
    }
    return isReliable;
  });

  logger.log(`⚖️ [Judge] Giữ lại ${verifiedFindings.length}/${initialCount} findings hợp lệ.`);

  // 2. Kiểm tra lỗi Sandbox và kích hoạt Reflection Loop (FR-4.2: Tối đa 2 chu kỳ)
  const sandbox = state.sandboxReport;
  const hasSandboxError =
    Boolean(sandbox?.hasSyntaxError) || (Boolean(sandbox?.executed) && sandbox?.success === false);

  const currentRetry = state.retryCount ?? 0;
  const canRetry = hasSandboxError && currentRetry < 2;

  if (canRetry) {
    const nextRetry = currentRetry + 1;
    logger.warn(
      sanitizeLog(`🔄 [Reflection Loop] Phát hiện lỗi Sandbox. Kích hoạt Retry chu kỳ #${nextRetry}/2...`),
    );
    return {
      verifiedFindings,
      retryCount: nextRetry,
    };
  }

  return {
    verifiedFindings,
    retryCount: currentRetry,
  };
}