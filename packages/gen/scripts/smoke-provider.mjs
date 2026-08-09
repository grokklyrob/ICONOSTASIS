/**
 * CI-optional live smoke: openai-compat → any OpenAI-compatible endpoint
 * (§19 adapter contract tests, AMD-30).
 *
 * Provider-agnostic on purpose: the adapter is generic, so the smoke is too.
 * Cloud and local servers are the same code path — only the env differs.
 *
 *   # Cloud (the §18 M2 reference path)
 *   ICONOSTASIS_SMOKE_API_KEY=sk-or-... pnpm smoke:provider
 *
 *   # A local server, no key
 *   ICONOSTASIS_SMOKE_BASE_URL=http://127.0.0.1:11434/v1 \
 *   ICONOSTASIS_SMOKE_MODEL=smollm:135m pnpm smoke:provider
 *
 *   # The Local Helper mock — no key, no spend, always available
 *   ICONOSTASIS_SMOKE_BASE_URL=http://127.0.0.1:47821/v1/mock pnpm smoke:provider
 *
 * Exit 0 on success, 2 if the endpoint is unreachable (skip, not fail — this is
 * CI-optional), 1 on a real invoke failure.
 */

const rawBase =
  process.env.ICONOSTASIS_SMOKE_BASE_URL ?? "https://openrouter.ai/api/v1";
const base = rawBase.replace(/\/+$/, "");
const model =
  process.env.ICONOSTASIS_SMOKE_MODEL ?? "anthropic/claude-3.5-haiku";
const apiKey = process.env.ICONOSTASIS_SMOKE_API_KEY ?? "";

const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(base);

async function main() {
  if (!apiKey && !isLoopback) {
    console.error(
      `[smoke-provider] ${base} is not loopback and no ICONOSTASIS_SMOKE_API_KEY is set.`,
    );
    console.error(
      "BYOK: this smoke spends the user's own money, so it never invents a key.",
    );
    process.exit(2);
  }

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly one word: lumen" }],
        stream: false,
        max_tokens: 16,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    console.error(
      `[smoke-provider] unreachable at ${base}:`,
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(
      `[smoke-provider] chat/completions HTTP ${res.status}: ${text.slice(0, 400)}`,
    );
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[smoke-provider] non-JSON response", text.slice(0, 200));
    process.exit(1);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  const usage = parsed?.usage?.total_tokens;
  console.log(`[smoke-provider] ok base=${base} model=${parsed?.model ?? model}`);
  console.log(`[smoke-provider] reply: ${String(content).slice(0, 200)}`);
  if (usage !== undefined) console.log(`[smoke-provider] tokens: ${usage}`);
  process.exit(0);
}

main();
