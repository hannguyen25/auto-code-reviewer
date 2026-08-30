import { GoogleGenAI, Type } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

export const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || '',
});

/**
 * Định nghĩa JSON Schema theo chuẩn OpenAPI của Gemini Native SDK
 */
export const findingJsonSchema = {
  type: Type.OBJECT,
  properties: {
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          filePath: { type: Type.STRING },
          line: { type: Type.INTEGER },
          diffPosition: { type: Type.INTEGER },
          category: {
            type: Type.STRING,
            enum: ['SECURITY', 'PERFORMANCE', 'ARCHITECTURE', 'BUG', 'TEST_FAILURE', 'STYLE'],
          },
          severity: {
            type: Type.STRING,
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
          },
          title: { type: Type.STRING },
          comment: { type: Type.STRING },
          suggestion: { type: Type.STRING },
          confidenceScore: { type: Type.NUMBER },
        },
        required: [
          'filePath',
          'line',
          'diffPosition',
          'category',
          'severity',
          'title',
          'comment',
          'confidenceScore',
        ],
      },
    },
  },
  required: ['findings'],
};

// Khoảng cách tối thiểu giữa 2 request liên tiếp (ms) tránh nghẽn RPM
const MIN_REQUEST_INTERVAL_MS = 2500;
let lastRequestTime = 0;

async function throttleRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    const delay = MIN_REQUEST_INTERVAL_MS - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

/**
 * Wrapper gọi Gemini API có Throttling, Structured JSON và Retry Exponential Backoff
 */
export async function generateStructuredContent<T = any>(
  modelName: string,
  systemInstruction: string,
  prompt: string,
  responseSchema: any = findingJsonSchema,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await throttleRequest();

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.1,
        },
      });

      const text = response.text?.trim() || '{}';
      return JSON.parse(text) as T;
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('Too Many Requests');

      if (isRateLimit && attempt < maxRetries) {
        // Backoff tăng dần: 6s, 12s, 18s
        const backoffDelay = attempt * 6000;
        console.warn(
          `[GeminiClient] ⚠️ Dính Quota/Rate Limit (429). Đang chờ ${backoffDelay / 1000}s trước khi thử lại (${attempt}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }

      console.error(
        `[GeminiClient] ❌ Lỗi thực thi generateStructuredContent trên model ${modelName}:`,
        error?.message || error,
      );
      throw error;
    }
  }

  throw new Error('[GeminiClient] Đã vượt quá số lần retry tối đa.');
}

/**
 * Wrapper sinh text/code tự do (dành cho Test Generator Agent)
 */
export async function generateRawContent(
  modelName: string,
  systemInstruction: string,
  prompt: string,
  maxRetries = 3,
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await throttleRequest();

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      return response.text || '';
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('Too Many Requests');

      if (isRateLimit && attempt < maxRetries) {
        // Chờ tối thiểu 20s, 40s cho mỗi lần thử lại
        const backoffDelay = attempt * 20000;
        console.warn(
          `[GeminiClient] ⚠️ Dính Quota (429). Đang chờ ${backoffDelay / 1000}s trước khi thử lại (${attempt}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }
      console.error(`[GeminiClient] ❌ Lỗi thực thi generateRawContent:`, error?.message || error);
      throw error;
    }
  }

  throw new Error('[GeminiClient] Đã vượt quá số lần retry tối đa.');
}