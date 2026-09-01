import { GoogleGenAI, Type } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

export const ai = new GoogleGenAI({ apiKey });

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
const MIN_REQUEST_INTERVAL_MS = 2000;
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
 * Bọc hàm gọi API với Timeout để tránh bị treo socket/network hang
 */
async function executeWithTimeout<T>(promiseFn: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Request timeout sau ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promiseFn(), timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

function isRetryableError(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  return (
    error?.status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('timeout')
  );
}

function extractRetryDelay(error: any, fallbackMs: number): number {
  try {
    const match = (error?.message || '').match(/retry in ([0-9.]+)s/i);
    if (match && match[1]) {
      return Math.ceil(parseFloat(match[1])) * 1000 + 1000;
    }
  } catch {
    // Sử dụng fallback nếu không parse được
  }
  return fallbackMs;
}

/**
 * Wrapper gọi Gemini API có Timeout, Throttling, Structured JSON và Auto-Retry
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

      const response = await executeWithTimeout(async () => {
        return await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.1,
          },
        });
      }, 30000);

      const rawText = response.text?.trim() || '{}';
      
      // Bóc tách JSON an toàn nếu dính markdown code block
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const cleanJson = jsonMatch ? jsonMatch[0] : rawText;

      return JSON.parse(cleanJson) as T;
    } catch (error: any) {
      if (isRetryableError(error) && attempt < maxRetries) {
        const backoffDelay = extractRetryDelay(error, attempt * 5000);
        console.warn(
          `[GeminiClient] ⚠️ Sự cố kết nối/Quota (${error?.message || error}). Thử lại sau ${backoffDelay / 1000}s (${attempt}/${maxRetries})...`,
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

  throw new Error('[GeminiClient] Đã vượt quá số lần retry tối đa cho structured content.');
}

/**
 * Wrapper sinh text/code tự do (dành cho Test Generator Agent) có Timeout & Auto-Retry
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

      const response = await executeWithTimeout(async () => {
        return await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.2,
          },
        });
      }, 30000);

      return response.text || '';
    } catch (error: any) {
      if (isRetryableError(error) && attempt < maxRetries) {
        const backoffDelay = extractRetryDelay(error, attempt * 5000);
        console.warn(
          `[GeminiClient] ⚠️ Sự cố kết nối/Quota (${error?.message || error}). Thử lại sau ${backoffDelay / 1000}s (${attempt}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }

      console.error(`[GeminiClient] ❌ Lỗi thực thi generateRawContent:`, error?.message || error);
      throw error;
    }
  }

  throw new Error('[GeminiClient] Đã vượt quá số lần retry tối đa cho raw content.');
}