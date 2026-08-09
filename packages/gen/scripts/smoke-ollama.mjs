/**
 * CI-optional / local live smoke: openai-compat → Ollama (§19, M2a exit).
 *
 * Usage:
 *   node packages/gen/scripts/smoke-ollama.mjs
 *   OLLAMA_MODEL=llama3.2 node packages/gen/scripts/smoke-ollama.mjs   # override
 *
 * Exit 0 on success, 2 if Ollama unreachable, 1 on invoke failure.
 */

const base = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(
  /\/$/,
  "",
);
// Default matches DEFAULT_OLLAMA in packages/app/src/gen/genHost.ts so the
// smoke and the app exercise the same model.
const model = process.env.OLLAMA_MODEL ?? "smollm:135m";
const v1 = base.endsWith("/v1") ? base : `${base}/v1`;

async function main() {
  let tags;
  try {
    const res = await fetch(`${base.replace(/\/v1$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`tags HTTP ${res.status}`);
    tags = await res.json();
  } catch (err) {
    console.error(
      `[smoke-ollama] Ollama unreachable at ${base}:`,
      err instanceof Error ? err.message : err,
    );
    console.error(`Start Ollama, then re-run. Example: ollama serve && ollama pull ${model}`);
    process.exit(2);
  }

  const names = (tags?.models ?? []).map((m) => m.name);
  console.log(`[smoke-ollama] models: ${names.join(", ") || "(none)"}`);

  const body = {
    model,
    messages: [
      { role: "user", content: "Reply with exactly one word: lumen" },
    ],
    stream: false,
    options: { temperature: 0, num_predict: 16 },
  };

  // Prefer OpenAI-compat path (what the adapter uses)
  const res = await fetch(`${v1}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: body.messages,
      stream: false,
      max_tokens: 16,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[smoke-ollama] chat/completions HTTP ${res.status}: ${text.slice(0, 400)}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[smoke-ollama] non-JSON response", text.slice(0, 200));
    process.exit(1);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  console.log(`[smoke-ollama] ok model=${parsed?.model ?? model}`);
  console.log(`[smoke-ollama] reply: ${String(content).slice(0, 200)}`);
  process.exit(0);
}

main();
