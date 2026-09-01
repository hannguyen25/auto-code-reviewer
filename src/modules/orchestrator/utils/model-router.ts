import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import * as dotenv from 'dotenv';
dotenv.config();

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
}