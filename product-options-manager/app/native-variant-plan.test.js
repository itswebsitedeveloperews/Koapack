import assert from "node:assert/strict";
import test from "node:test";
import { buildNativeVariantPlan } from "./native-variant-plan.js";

function fields(rows) {
  return [{ type: "quantity_discount", label: "Order Quantity" }, {
    type: "__variation_prices", config: { prices: rows.map(([quantity, size, gsm, price]) => ({
      selections: [{ field: "Order Quantity", value: `${quantity}+` }, { field: "Size", value: size }, { field: "GSM", value: gsm }], price,
    })) },
  }];
}

test("Pricing Sync stores per-piece prices for quantity, size, and GSM combinations", () => {
  const plan = buildNativeVariantPlan(fields([
    [10, "Small", "220", "1200"], [300, "Small", "220", "21000"],
    [1000, "14X16", "220", "28000"], [1000, "14X16", "400", "41000"],
  ]));
  assert.deepEqual(plan.productOptions.map(({ name }) => name), ["Order Quantity", "Size", "GSM"]);
  assert.deepEqual(plan.variants.map(({ price }) => price), ["120.00", "70.00", "28.00", "41.00"]);
  for (const [index, quantity] of [10, 300, 1000, 1000].entries()) {
    assert.equal(Number(plan.variants[index].price) * quantity, [1200, 21000, 28000, 41000][index]);
  }
});

test("refuses totals that cannot match Shopify's two-decimal unit price", () => {
  assert.throws(() => buildNativeVariantPlan(fields([[3, "Small", "220", "100"]])), /cannot be represented exactly/);
});

test("non-priced fields do not create price variants", () => {
  assert.equal(buildNativeVariantPlan([{ type: "upload", label: "Logo" }]), null);
});
