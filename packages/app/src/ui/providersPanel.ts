/**
 * Provider Registry shell + session Vault UI (§9.3, §15.1, M2a).
 * Secrets stay in GenHost vault; panel never writes them to ProjectStore.
 */

import {
  OPENAI_COMPAT_ADAPTER_ID,
  type SecretRef,
} from "@iconostasis/gen";
import type { GenHost } from "../gen/genHost.js";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountProvidersPanel(
  root: HTMLElement,
  host: GenHost,
  opts?: { onStatus?: (msg: string) => void },
): void {
  const status = opts?.onStatus ?? (() => undefined);
  let busyId: string | null = null;

  const render = (): void => {
    root.replaceChildren();

    root.appendChild(el("h2", undefined, "Providers"));
    root.appendChild(
      el(
        "p",
        "muted tiny",
        "BYOK · session vault · single fetch boundary. Browser→Ollama needs OLLAMA_ORIGINS including this origin (or *).",
      ),
    );

    const arming = host.stack.arming.snapshot();
    const spend = host.stack.spend.snapshot();

    const controls = el("div", "providers-controls");
    const armRow = el("div", "providers-row");
    armRow.appendChild(
      el(
        "span",
        "muted",
        `Arm (${arming.mode}): ${arming.globalArmed ? "ARMED" : "disarmed"}`,
      ),
    );
    const armBtn = el(
      "button",
      "providers-btn",
      arming.globalArmed ? "Disarm" : "Arm",
    ) as HTMLButtonElement;
    armBtn.type = "button";
    armBtn.addEventListener("click", () => {
      host.setGlobalArmed(arming.mode, !arming.globalArmed);
    });
    armRow.appendChild(armBtn);
    controls.appendChild(armRow);

    const spendRow = el("div", "providers-row");
    spendRow.appendChild(
      el(
        "span",
        "muted",
        `Session spend: ${spend.used}/${spend.ceiling} ${spend.unit}` +
          (spend.hardStopped ? " · HARD STOP" : "") +
          " (est. when provider omits usage)",
      ),
    );
    const raiseBtn = el(
      "button",
      "providers-btn",
      "+ceiling",
    ) as HTMLButtonElement;
    raiseBtn.type = "button";
    raiseBtn.title = "Raise spend ceiling (explicit user action)";
    raiseBtn.addEventListener("click", () => {
      const next =
        spend.unit === "tokens" ? spend.ceiling + 50_000 : spend.ceiling + 50;
      try {
        host.raiseSpendCeiling(next);
        status(`spend ceiling → ${next} ${spend.unit}`);
      } catch {
        /* ignore */
      }
    });
    spendRow.appendChild(raiseBtn);
    controls.appendChild(spendRow);
    root.appendChild(controls);

    // Vault
    const vaultSec = el("section", "providers-section");
    vaultSec.appendChild(el("h3", undefined, "Session vault"));
    vaultSec.appendChild(
      el(
        "p",
        "muted tiny",
        "Keys live in memory only — gone on tab close. Never written to graph / .icx.",
      ),
    );

    const entries = host.stack.vault.list();
    if (entries.length === 0) {
      vaultSec.appendChild(el("p", "muted tiny", "No secrets held."));
    } else {
      const ul = el("ul", "providers-list");
      for (const e of entries) {
        const li = el("li");
        li.appendChild(el("span", undefined, e.label));
        li.appendChild(el("code", "tiny", `${e.ref.slice(0, 12)}…`));
        const rev = el(
          "button",
          "providers-btn danger",
          "Revoke",
        ) as HTMLButtonElement;
        rev.type = "button";
        rev.addEventListener("click", () => {
          host.revokeSecret(e.ref);
          status(`revoked vault entry ${e.label}`);
        });
        li.appendChild(rev);
        ul.appendChild(li);
      }
      vaultSec.appendChild(ul);
    }

    const addKey = el("div", "providers-form");
    const keyLabel = el("input") as HTMLInputElement;
    keyLabel.type = "text";
    keyLabel.placeholder = "label (e.g. openrouter)";
    keyLabel.autocomplete = "off";
    const keyVal = el("input") as HTMLInputElement;
    keyVal.type = "password";
    keyVal.placeholder = "API key";
    keyVal.autocomplete = "off";
    const keyBtn = el("button", "providers-btn", "Hold key") as HTMLButtonElement;
    keyBtn.type = "button";
    keyBtn.addEventListener("click", () => {
      const label = keyLabel.value.trim() || "key";
      const secret = keyVal.value;
      if (!secret) return;
      host.putSecret(label, secret);
      keyVal.value = "";
      status(`vault holds “${label}” (SecretRef only in registry)`);
    });
    addKey.append(keyLabel, keyVal, keyBtn);
    vaultSec.appendChild(addKey);
    root.appendChild(vaultSec);

    // Provider instances
    const provSec = el("section", "providers-section");
    provSec.appendChild(el("h3", undefined, "Registry"));
    const instances = host.stack.registry.listInstances();
    for (const inst of instances) {
      const card = el("div", "provider-card");
      card.appendChild(el("div", "provider-title", inst.label));
      card.appendChild(
        el(
          "div",
          "muted tiny",
          `${inst.adapterId} · ${String(inst.config.baseUrl ?? "")}`,
        ),
      );
      card.appendChild(
        el(
          "div",
          "muted tiny",
          `routing: ${inst.routing}` +
            (inst.secretRef ? " · key bound" : " · no key"),
        ),
      );

      // Editable model
      const modelRow = el("div", "providers-row");
      modelRow.appendChild(el("span", "muted tiny", "model"));
      const modelIn = el("input") as HTMLInputElement;
      modelIn.type = "text";
      modelIn.value = String(inst.config.model ?? "");
      modelIn.placeholder = "model id";
      modelIn.addEventListener("change", () => {
        host.upsertProvider({
          ...inst,
          config: { ...inst.config, model: modelIn.value.trim() },
        });
      });
      modelRow.appendChild(modelIn);
      card.appendChild(modelRow);

      const actions = el("div", "providers-row");
      const testBtn = el(
        "button",
        "providers-btn",
        busyId === inst.id ? "Calling…" : "Test call",
      ) as HTMLButtonElement;
      testBtn.type = "button";
      testBtn.disabled = busyId === inst.id;
      testBtn.addEventListener("click", () => {
        busyId = inst.id;
        status(`test call → ${inst.label}…`);
        render();
        void host
          .testCall(inst.id)
          .then((r) => {
            if (r.status === "ok") {
              status(
                `test ok · ${inst.label}: ${(r.text ?? "").slice(0, 80)}`,
              );
            } else {
              status(
                `test ${r.status} · ${r.errorMessage ?? "failed"}`.slice(
                  0,
                  120,
                ),
              );
            }
          })
          .finally(() => {
            busyId = null;
            render();
          });
      });
      actions.appendChild(testBtn);

      if (inst.secretRef === null && entries.length > 0) {
        const bind = el("select") as HTMLSelectElement;
        bind.appendChild(new Option("Bind key…", ""));
        for (const e of entries) {
          bind.appendChild(new Option(e.label, e.ref));
        }
        bind.addEventListener("change", () => {
          if (!bind.value) return;
          const ref = bind.value as SecretRef;
          if (inst.adapterId === OPENAI_COMPAT_ADAPTER_ID) {
            host.upsertProvider({
              ...inst,
              secretRef: ref,
              config: { ...inst.config, requireAuth: true },
            });
          } else {
            host.bindSecretToProvider(inst.id, ref);
          }
          status(`bound vault key to ${inst.label}`);
        });
        actions.appendChild(bind);
      }

      if (inst.id !== "local-ollama") {
        const rm = el("button", "providers-btn danger", "Remove") as HTMLButtonElement;
        rm.type = "button";
        rm.addEventListener("click", () => {
          host.removeProvider(inst.id);
          status(`removed ${inst.label}`);
        });
        actions.appendChild(rm);
      }

      card.appendChild(actions);
      provSec.appendChild(card);
    }

    const addForm = el("div", "providers-form");
    addForm.appendChild(el("h3", undefined, "Add openai-compat"));
    const labelIn = el("input") as HTMLInputElement;
    labelIn.placeholder = "label";
    labelIn.value = "Cloud OpenAI-compat";
    const baseIn = el("input") as HTMLInputElement;
    baseIn.placeholder = "baseUrl";
    baseIn.value = "https://openrouter.ai/api/v1";
    const modelNew = el("input") as HTMLInputElement;
    modelNew.placeholder = "model";
    modelNew.value = "openai/gpt-4o-mini";
    const addBtn = el(
      "button",
      "providers-btn",
      "Add provider",
    ) as HTMLButtonElement;
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      const id = `prov_${Date.now().toString(36)}`;
      host.upsertProvider({
        id,
        adapterId: OPENAI_COMPAT_ADAPTER_ID,
        label: labelIn.value.trim() || id,
        config: {
          baseUrl: baseIn.value.trim(),
          model: modelNew.value.trim(),
          requireAuth: true,
        },
        secretRef: null,
        routing: "direct",
      });
      status(`added provider ${id}`);
    });
    addForm.append(labelIn, baseIn, modelNew, addBtn);
    provSec.appendChild(addForm);
    root.appendChild(provSec);

    const last = host.getLastTest();
    if (last) {
      const box = el("div", "providers-test-result");
      const ok = last.result.status === "ok";
      box.classList.toggle("ok", ok);
      box.classList.toggle("err", !ok);
      const preview =
        last.result.text?.slice(0, 160) ??
        last.result.errorMessage ??
        last.result.status;
      const usage = last.result.usage
        ? ` · tokens ${last.result.usage.totalTokens ?? "?"}`
        : "";
      box.textContent = `Last test: ${last.result.status}${usage} — ${preview}`;
      root.appendChild(box);
    }
  };

  host.subscribe(render);
  render();
}
