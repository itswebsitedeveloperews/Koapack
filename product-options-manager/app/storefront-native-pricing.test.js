import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { setImmediate } from "node:timers";
import { readFile } from "node:fs/promises";

// Minimal DOM for executing the real storefront script and its event handlers.
class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
    this.style = {}; this.listeners = {}; this.value = ""; this.className = "";
    this.classList = {
      add: (name) => { this.className += ` ${name}`; },
      remove: (name) => { this.className = this.className.split(" ").filter((v) => v !== name).join(" "); },
      toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name),
    };
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ""; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
  remove() { this.parentElement.children = this.parentElement.children.filter((c) => c !== this); }
  scrollIntoView() {}
  focus() {}
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = (el, part) => {
      if (part.startsWith(".pom-field[")) return el.className.includes("pom-field") && el.dataset.pomRequired === "true";
      const named = part.match(/^\[name=['"](.*)['"]\]$/);
      if (named) return el.name === named[1];
      if (part.startsWith("input[type=")) return el.type === part.match(/type=['"]([^'"]+)/)[1] && (!part.includes(":checked") || el.checked);
      if (part.startsWith(".")) return el.className.split(" ").includes(part.slice(1));
      return el.tagName.toLowerCase() === part;
    };
    return this.children.flatMap((child) => [
      ...(selector.split(",").some((part) => matches(child, part.trim())) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

async function storefront({ variantPrice = 2800, available = true, groups = true } = {}) {
  const root = new Element();
  Object.assign(root.dataset, { productGid: "gid://shopify/Product/1", productHandle: "pouch", basePrice: "35000" });
  const form = new Element("form");
  const id = new Element("input"); id.name = "id"; id.value = "old-default"; form.appendChild(id);
  const submit = new Element("button"); form.appendChild(submit);
  const native = { textContent: JSON.stringify({ optionNames: ["Order Quantity", "Size"], variants: [
    { id: "synced-variant", options: ["1000+", "14X16"], price: variantPrice, available },
  ] }) };
  const document = {
    getElementById: () => root,
    body: new Element("body"),
    createElement: (tag) => new Element(tag),
    querySelector(selector) {
      if (selector.includes("data-pom-native-variants")) return native;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes("data-add-to-cart-button")) return [submit];
      if (selector === "form[action*='/cart/add']") return [form];
      return [];
    },
  };
  const fields = [
    { type: "quantity_discount", label: "Order Quantity", required: true, config: { rows: [{ quantity: 1000 }] } },
    { type: "dropdown", label: "Size", required: true, config: { values: [{ value: "14X16" }] } },
    { type: "__variation_prices", config: { prices: [{ selections: [
      { field: "Order Quantity", value: "1000+" }, { field: "Size", value: "14X16" },
    ], price: "28000" }] } },
  ];
  const window = { crypto: { randomUUID: () => "test-line-key" } };
  const source = await readFile(new URL("../../assets/product-options-manager.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    document, window, console, Event: class { constructor(type) { this.type = type; } },
    fetch: async () => ({ ok: true, json: async () => ({ groups: groups ? [{ fields }] : [] }) }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { root, form, id, submit, window,
    select() {
      root.querySelector(".pom-option-button").dispatchEvent({ type: "click" });
      const select = root.querySelector("select"); select.value = "14X16"; select.dispatchEvent({ type: "change" });
    },
  };
}

test("storefront submits synced ID and quantity, not a client price override", async () => {
  const page = await storefront();
  assert.equal(page.submit.disabled, true);
  page.select();
  assert.equal(page.submit.disabled, false);
  page.id.value = "theme-reset-default";
  assert.equal(page.window.ProductOptionsManagerSyncCartForm(page.form), true);
  assert.equal(page.id.value, "synced-variant");
  assert.equal(page.form.querySelector("[name='quantity']").value, "1000");
  assert.equal(page.form.querySelector('[name="properties[_pom_price_source]"]').value, "native_variant");
  assert.equal(page.root.querySelector(".pom-pricing-error"), null);
});

test("stale or unavailable variants cannot be submitted at the wrong price", async () => {
  for (const options of [{ variantPrice: 4100 }, { variantPrice: undefined, available: false }]) {
    const page = await storefront(options);
    page.select();
    assert.equal(page.submit.disabled, true);
    assert.equal(page.window.ProductOptionsManagerSyncCartForm(page.form), false);
    assert.ok(page.root.querySelector(".pom-pricing-error"));
  }
});

test("products without option groups retain their normal variant and quantity", async () => {
  const page = await storefront({ groups: false });
  assert.equal(page.window.ProductOptionsManagerSyncCartForm(page.form), true);
  assert.equal(page.id.value, "old-default");
  assert.equal(page.form.querySelector("[name='quantity']"), null);
});

test("cart templates never use hidden properties as display prices", async () => {
  for (const path of ["sections/main-cart-items.liquid", "sections/main-cart-footer.liquid", "snippets/cart-drawer.liquid"]) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.ok(!source.includes("_pom_final_price"), path);
    assert.ok(!source.includes("_pom_unit_price"), path);
    assert.ok(/item\.final_(?:line_)?price|cart\.total_price/.test(source), path);
  }
});
