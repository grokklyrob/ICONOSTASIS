# Rules of engagement — ICONOSTASIS

`architecture.md` is the spec and the source of truth. Section numbers (§) are
citable and binding. Cite them in plans, PR descriptions, and code comments where
a non-obvious constraint is being satisfied.

## Hard invariants
Violating any of these fails review regardless of whether tests pass:
1. No secret may reach any serialization, export, or publish path (§12.3 taint gate).
2. GEN operators never block a frame; they hold lastGoodValue and crossfade (§7.1).
3. The exported player never calls an AI provider (§13.1).
4. WebGL2 fallback is first-class; WebGPU is never required (§8.4).
5. `packages/engine` is UI-free and headless-testable. It imports nothing from the editor.
6. The flash limiter is always on in the player (§16.4).

## Spec amendments
Do NOT silently implement changes to §4 (Pillars), §5 (Aesthetic), or §15 (Security).
If the work requires one, stop and emit a block titled `SPEC AMENDMENT PROPOSAL`
with: the section, the current text, the proposed text, and the forcing reason.

## Process
- Work milestone by milestone (§18). The italic *Demo* line in each milestone is
  the acceptance test. Do not start M(n+1) until M(n)'s demo passes.
- Before writing code in a package, read that package's existing tests first.
- Prefer deleting scope to adding it. §20.6 is one-in-one-out.
- Ask before adding any dependency not listed in §17.

## Style
- TypeScript strict. No `any` without an adjacent comment justifying it.
- Small files. If a file passes 400 lines, propose a split before continuing.
- Tests colocated. Every operator ships with a cook-order test.