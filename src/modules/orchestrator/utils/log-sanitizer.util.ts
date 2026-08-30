// src/modules/orchestrator/utils/log-sanitizer.util.ts
export const SENSITIVE_PATTERNS = [
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /ghs_[a-zA-Z0-9]{36}/g,
  /sk-[a-zA-Z0-9]{48}/g,
  /AIza[0-9A-Za-z-_]{35}/g,
  /[a-f0-9]{64}/g,
];

export function sanitizeLog(message: string): string {
  if (!message || typeof message !== 'string') return message;
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '***[REDACTED_SECRET]***');
  }
  return sanitized;
}