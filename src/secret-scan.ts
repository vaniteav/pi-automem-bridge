export interface SecretFinding {
  kind: string;
  match: string;
}

const SECRET_PATTERNS: Array<{ kind: string; regex: RegExp }> = [
  { kind: "private-key", regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/i },
  { kind: "bearer-token", regex: /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i },
  { kind: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { kind: "openai-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "aws-secret-key", regex: /\bAWS_SECRET_ACCESS_KEY\s*[:=]\s*[^\s'"]{20,}/i },
  { kind: "secret-assignment", regex: /\b(?:api[_-]?key|token|secret|password|passwd|credential)[_a-z0-9]*\s*[:=]\s*['\"]?[^\s'\"]{20,}/i },
  { kind: "connection-string", regex: /\b(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/i },
  // PII — keep these conservative (very low false-positive) since a finding blocks the write.
  { kind: "pii-ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { kind: "pii-email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
];

export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const pattern of SECRET_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match && match[0]) {
      findings.push({ kind: pattern.kind, match: redact(match[0]) });
    }
  }
  return findings;
}

function redact(_value: string): string {
  // Never reveal any portion of a detected secret/PII. Even a 6-char prefix can
  // be sensitive, and these findings surface in thrown error messages and tool
  // `details`, so the match must be fully opaque.
  return "[redacted]";
}
