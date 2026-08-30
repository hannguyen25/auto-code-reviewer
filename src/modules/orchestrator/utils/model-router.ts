import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

export class ModelRouter {
  static readonly SECURITY_MODEL_NAME = 'gemini-3.6-flash';
  static readonly QUALITY_MODEL_NAME = 'gemini-3.6-flash';

  static getSecurityModelName(): string {
    return this.SECURITY_MODEL_NAME;
  }

  static getQualityModelName(): string {
    return this.QUALITY_MODEL_NAME;
  }

  static getSecurityModel() {
    return new ChatGoogleGenerativeAI({
      model: this.SECURITY_MODEL_NAME,
      apiKey: apiKey,
      temperature: 0.1,
    });
  }

  static getQualityModel() {
    return new ChatGoogleGenerativeAI({
      model: this.QUALITY_MODEL_NAME,
      apiKey: apiKey,
      temperature: 0.1,
    });
  }
}