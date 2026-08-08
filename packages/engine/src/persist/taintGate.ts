/**
 * Serialization taint gate (architecture.md §12.3).
 * Blocking secret scan on every serialize/export/publish path.
 * Failed gate is a loud error — never a warning.
 */

import { isSha256Base64, isSha256Hex } from "./hash.js";

export interface TaintFinding {
  path: string;
  reason: string;
  /** Snippet redacted for logs (never full secret). */
  redacted: string;
}

export interface TaintGateOptions {
  /**
   * Exact raw secrets held in Vault / session (exact equality detector).
   */
  vaultSecrets?: readonly string[];
  /** Additional blocking patterns (adapter-maintained). */
  extraPatterns?: readonly RegExp[];
}

export class TaintGateError extends Error {
  readonly findings: readonly TaintFinding[];

  constructor(findings: readonly TaintFinding[]) {
    const summary = findings
      .map((f) => `${f.path}: ${f.reason}`)
      .join("; ");
    super(`Taint gate blocked serialization (${findings.length}): ${summary}`);
    this.name = "TaintGateError";
    this.findings = findings;
  }
}

/** Field names that must never block (content hashes / digests). */
const EXEMPT_KEY_EXACT = new Set([
  "sha256",
  "artifacthash",
  "prompthash",
  "hash",
  "contenthash",
  "digest",
]);

function isExemptKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  if (EXEMPT_KEY_EXACT.has(k)) return true;
  // assets[].sha256 style already covered; also *Hash suffix of digests
  if (k.endsWith("hash") && k.length <= 24) return true;
  if (k.endsWith("sha256")) return true;
  return false;
}

function isExemptDigestString(value: string): boolean {
  const t = value.trim();
  if (isSha256Hex(t)) return true;
  if (isSha256Base64(t)) return true;
  // sha256:hex form
  if (/^sha256:[0-9a-fA-F]{64}$/i.test(t)) return true;
  return false;
}

/**
 * Known provider key prefixes / formats (blocking) — §12.3.
 * Minimum: sk-…, sk-ant-…; room for adapter allowlist growth.
 */
const DEFAULT_KEY_PATTERNS: readonly RegExp[] = [
  // OpenAI-style: sk-... (length-guarded to reduce false positives)
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  // Anthropic
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  // OpenRouter-ish
  /\bsk-or-[A-Za-z0-9_-]{16,}\b/g,
  // Google AI style AIza...
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  // Bearer-looking openai project keys
  /\bsk-proj-[A-Za-z0-9_-]{16,}\b/g,
];

function redact(s: string): string {
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

function matchPatterns(
  text: string,
  patterns: readonly RegExp[],
  path: string,
  findings: TaintFinding[],
): void {
  for (const re of patterns) {
    // Fresh lastIndex for global regexes
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const g = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const hit = m[0] ?? "";
      if (isExemptDigestString(hit)) continue;
      findings.push({
        path,
        reason: `matches secret pattern ${re.source}`,
        redacted: redact(hit),
      });
    }
  }
}

function matchVault(
  text: string,
  vault: readonly string[],
  path: string,
  findings: TaintFinding[],
): void {
  for (const secret of vault) {
    if (!secret || secret.length === 0) continue;
    if (text.includes(secret)) {
      findings.push({
        path,
        reason: "exact equality against vault/session secret",
        redacted: redact(secret),
      });
    }
  }
}

/**
 * Walk JSON-like values; scan string leaves.
 * Exempt keys and digest-shaped strings are skipped (§12.3).
 */
export function scanForSecrets(
  value: unknown,
  opts: TaintGateOptions = {},
  path = "$",
): TaintFinding[] {
  const findings: TaintFinding[] = [];
  const patterns = [
    ...DEFAULT_KEY_PATTERNS,
    ...(opts.extraPatterns ?? []),
  ];
  const vault = opts.vaultSecrets ?? [];

  const walk = (v: unknown, p: string, exemptSubtree: boolean): void => {
    if (v === null || v === undefined) return;

    if (typeof v === "string") {
      if (exemptSubtree || isExemptDigestString(v)) return;
      matchPatterns(v, patterns, p, findings);
      matchVault(v, vault, p, findings);
      return;
    }

    if (typeof v === "number" || typeof v === "boolean") return;

    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`, exemptSubtree));
      return;
    }

    if (typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const childPath = `${p}.${k}`;
        const exempt = exemptSubtree || isExemptKey(k);
        walk(child, childPath, exempt);
      }
    }
  };

  walk(value, path, false);
  return findings;
}

/**
 * Scan a raw text blob (e.g. serialized JSON file contents).
 * Not used for binary zip members (non-string zip members are exempt).
 */
export function scanTextForSecrets(
  text: string,
  opts: TaintGateOptions = {},
  path = "<text>",
): TaintFinding[] {
  return scanForSecrets(text, opts, path);
}

/** Blocking assert — throws TaintGateError if any finding. */
export function assertUntainted(
  value: unknown,
  opts: TaintGateOptions = {},
  path = "$",
): void {
  const findings = scanForSecrets(value, opts, path);
  if (findings.length > 0) throw new TaintGateError(findings);
}

/**
 * Advisory high-entropy diagnostic (NON-blocking, §12.3).
 * Must not reject exempt digests; for diagnostics only.
 */
export function advisoryHighEntropy(
  value: string,
): { score: number; advisory: boolean } {
  if (isExemptDigestString(value) || value.length < 24) {
    return { score: 0, advisory: false };
  }
  // Shannon entropy rough
  const freq = new Map<string, number>();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / value.length;
    h -= p * Math.log2(p);
  }
  // High entropy + long → advisory only
  const advisory = h > 4.5 && value.length >= 32;
  return { score: h, advisory };
}
