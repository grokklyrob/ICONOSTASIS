/**
 * Inspector — selected operator params with modulated badge (§7.3).
 */

import type { OperatorRegistry, ParamSpec } from "@iconostasis/engine";
import {
  modulatedParamsFor,
  type ProjectStore,
} from "../store/projectStore.js";

export function mountInspector(
  body: HTMLElement,
  store: ProjectStore,
  registry: OperatorRegistry,
): void {
  const render = (): void => {
    const { doc, selection } = store.getState();
    body.replaceChildren();
    if (!selection) {
      body.innerHTML = `<p class="muted">Select an operator</p>`;
      return;
    }
    const node = doc.nodes.find((n) => n.id === selection);
    if (!node) {
      body.innerHTML = `<p class="muted">Missing node</p>`;
      return;
    }
    let factory;
    try {
      factory = registry.get(node.type);
    } catch {
      body.innerHTML = `<p class="muted">Unknown type ${node.type}</p>`;
      return;
    }

    const head = document.createElement("div");
    head.innerHTML = `<strong>${node.id}</strong><div class="muted">${node.type}</div>`;
    body.appendChild(head);

    const modded = modulatedParamsFor(doc, node.id);

    for (const spec of factory.params) {
      body.appendChild(renderParam(store, node.id, spec, node.params[spec.id], modded.has(spec.id)));
    }

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete";
    del.style.marginTop = "0.75rem";
    del.addEventListener("click", () => store.removeNode(node.id));
    body.appendChild(del);
  };

  store.subscribe(render);
  render();
}

function renderParam(
  store: ProjectStore,
  opId: string,
  spec: ParamSpec,
  value: unknown,
  isMod: boolean,
): HTMLElement {
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = spec.id;
  if (isMod) {
    const badge = document.createElement("span");
    badge.className = "mod-badge";
    badge.textContent = "modulated";
    label.appendChild(badge);
  }
  wrap.appendChild(label);

  if (spec.type === "bool") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.disabled = isMod;
    input.addEventListener("change", () => {
      store.setParam(opId, spec.id, input.checked);
    });
    wrap.appendChild(input);
    return wrap;
  }

  if (spec.type === "enum" && spec.enumValues) {
    const sel = document.createElement("select");
    sel.disabled = isMod;
    for (const v of spec.enumValues) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      if (String(value) === v) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      store.setParam(opId, spec.id, sel.value);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  if (spec.type === "float" || spec.type === "int") {
    const input = document.createElement("input");
    input.type = "number";
    input.step = spec.type === "int" ? "1" : String(spec.step ?? 0.01);
    if (spec.min !== undefined) input.min = String(spec.min);
    if (spec.max !== undefined) input.max = String(spec.max);
    input.value = String(value ?? spec.default);
    input.disabled = isMod;
    input.addEventListener("change", () => {
      const n = Number(input.value);
      store.setParam(opId, spec.id, Number.isFinite(n) ? n : spec.default);
    });
    wrap.appendChild(input);
    if (
      spec.modulatable &&
      spec.min !== undefined &&
      spec.max !== undefined
    ) {
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(spec.min);
      range.max = String(spec.max);
      range.step = String(spec.step ?? (spec.type === "int" ? 1 : 0.01));
      range.value = String(value ?? spec.default);
      range.disabled = isMod;
      range.addEventListener("input", () => {
        const n = Number(range.value);
        input.value = range.value;
        store.setParam(opId, spec.id, n);
      });
      wrap.appendChild(range);
    }
    return wrap;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = String(value ?? "");
  input.disabled = isMod;
  input.addEventListener("change", () => {
    store.setParam(opId, spec.id, input.value);
  });
  wrap.appendChild(input);
  return wrap;
}
