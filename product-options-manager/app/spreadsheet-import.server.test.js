import assert from "node:assert/strict";
import test from "node:test";
import {
  createImportToken,
  parseRateSheet,
  readImportToken,
} from "./spreadsheet-import.server.js";

test("parses a quantity-by-size rate matrix and multiplies rate by quantity", () => {
  const sheet = parseRateSheet("Drawstring rates", [
    [null, "COTTON DRAWSTRING POUCH"],
    ["https://koapack.in/products/cotton-drawstring-potli-pouch"],
    [null, null, "QTY"],
    ["Sl No", "SIZE", 1, 10, 50, 100],
    [1, "3X4", 100, 18, 15, 12],
    [2, "4X5", 100, 20, 19, 15],
  ]);

  assert.deepEqual(sheet.errors, []);
  assert.equal(sheet.groupName, "COTTON DRAWSTRING POUCH");
  assert.equal(sheet.productHandle, "cotton-drawstring-potli-pouch");
  assert.deepEqual(sheet.quantities, [1, 10, 50, 100]);
  assert.equal(sheet.variationCount, 8);

  const prices = sheet.fields.find((field) => field.type === "__variation_prices");
  const tenByThreeFour = prices.config.prices.find((row) =>
    row.selections.some(
      (selection) => selection.field === "Order Quantity" && selection.value === "10+",
    ) &&
    row.selections.some(
      (selection) => selection.field === "Size" && selection.value === "3X4",
    ),
  );

  assert.equal(tenByThreeFour.price, "180");
});

test("supports two spreadsheet option columns plus quantity", () => {
  const sheet = parseRateSheet("Colored bags", [
    ["COLORED BAG"],
    ["https://koapack.in/products/colored-bag"],
    [null, null, null, "QTY"],
    ["Sl No", "SIZE", "COLOR", 10, 50],
    [1, "3X4", "Red", 20, 15],
    [2, "3X4", "Blue", 22, 16],
  ]);

  assert.deepEqual(sheet.errors, []);
  assert.deepEqual(sheet.optionLabels, ["Size", "Color"]);
  assert.equal(sheet.variationCount, 4);
  assert.equal(sheet.fields.filter((field) => field.type === "radio").length, 2);
});

test("reports missing product URLs without creating fields", () => {
  const sheet = parseRateSheet("Missing URL", [
    ["PRODUCT"],
    ["Sl No", "SIZE", 10, 50],
    [1, "3X4", 20, 15],
  ]);

  assert.ok(sheet.errors.some((error) => error.includes("product URL")));
  assert.deepEqual(sheet.fields, []);
});

test("signs and verifies import previews", () => {
  const plan = {
    shop: "example.myshopify.com",
    createdAt: Date.now(),
    items: [
      {
        groupName: "Pouch",
        target: { id: "gid://shopify/Product/1", title: "Pouch" },
        fields: [{ type: "quantity_discount", label: "Order Quantity" }],
      },
    ],
  };
  const token = createImportToken(plan, "test-secret");

  assert.deepEqual(readImportToken(token, "test-secret"), plan);
  assert.throws(() => readImportToken(`${token}x`, "test-secret"));
});
