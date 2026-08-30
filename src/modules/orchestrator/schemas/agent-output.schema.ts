import { z } from 'zod';

export const FindingSchema = z.object({
  id: z.string().optional(),
  filePath: z.string().describe('Đường dẫn file phát hiện lỗi'),
  line: z.number().describe('Dòng code chứa lỗi hoặc bắt đầu đề xuất'),
  diffPosition: z.number().optional().describe('Vị trí dòng trong Git Diff'),
  category: z.enum(['SECURITY', 'PERFORMANCE', 'BUG', 'ARCHITECTURE', 'STYLE']),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  title: z.string().describe('Tiêu đề tóm tắt ngắn gọn'),
  comment: z.string().describe('Mô tả chi tiết nguyên nhân và rủi ro'),
  suggestion: z.string().optional().describe('Đoạn code sửa đổi thay thế (nếu có)'),
  confidenceScore: z
    .number()
    .min(0.0)
    .max(1.0)
    .describe('Độ tin cậy của phát hiện (từ 0.0 đến 1.0, ví dụ 0.95 cho lỗi chắc chắn)'),
});

export const AgentReviewResponseSchema = z.object({
  findings: z.array(FindingSchema),
  notes: z.array(z.string()).optional(),
});

export type AgentReviewResponse = z.infer<typeof AgentReviewResponseSchema>;