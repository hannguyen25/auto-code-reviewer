import { Logger } from '@nestjs/common';
import { AgentStateType } from '../schemas/review-state.schema';
import { DockerSandboxRunner } from '../../sandbox/docker-sandbox.runner';

const sandboxRunner = new DockerSandboxRunner();

export async function sandboxVerifierAgentNode(state: AgentStateType) {
  const logger = new Logger('SandboxVerifier');
  logger.log(`🐳 [Sandbox Verifier] Đang thực thi mã test trong Docker Sandbox cô lập...`);

  if (!state.generatedTestCode) {
    return {
      sandboxReport: {
        executed: false,
        success: true,
        hasSyntaxError: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        rawOutput: 'No test code provided.',
      },
    };
  }

  const mainFileContent = state.parsedFiles?.[0]?.rawDiff || `
function parseDiscount(type, rate) {
  if (type === 'VIP') return rate * 1.5;
  if (type === 'MEMBER') return rate * 1.1;
  return rate;
}
module.exports = { parseDiscount };
`;

  const result = await sandboxRunner.executeTest(mainFileContent, state.generatedTestCode, 10);

  return {
    sandboxReport: {
      executed: true,
      success: result.success,
      hasSyntaxError: (result.error || '').includes('SyntaxError'),
      totalTests: 1,
      passedTests: result.success ? 1 : 0,
      failedTests: result.success ? 0 : 1,
      rawOutput: result.output,
      error: result.error,
    },
  };
}