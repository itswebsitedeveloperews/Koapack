import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import {
  createImportToken,
  parseCsv,
  parseRateSheet,
  parseRateUpload,
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
  assert.deepEqual(sheet.products, [{
    url: "https://koapack.in/products/cotton-drawstring-potli-pouch",
    handle: "cotton-drawstring-potli-pouch",
  }]);
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
        targets: [
          { id: "gid://shopify/Product/1", title: "Blue pouch" },
          { id: "gid://shopify/Product/2", title: "Red pouch" },
        ],
        fields: [{ type: "quantity_discount", label: "Order Quantity" }],
      },
    ],
  };
  const token = createImportToken(plan, "test-secret");

  assert.deepEqual(readImportToken(token, "test-secret"), plan);
  assert.throws(() => readImportToken(`${token}x`, "test-secret"));
});

test("imports the shared zipper pouch table from CSV with three products", async () => {
  const csv = [
    "https://koapack.in/products/blue-canvas-zipper-box-kit",
    "https://koapack.in/products/red-canvas-box-kit",
    "https://koapack.in/products/black-cotton-canvas-zipper-box-kit",
    "",
    "Sl No,SIZE,1,10,50,100,300,500,1000",
    '1,"7.5"" x 3.5"" by 3.5""",300,180,130,110,105,100,90',
  ].join("\r\n");
  const [sheet] = await parseRateUpload(Buffer.from(`\uFEFF${csv}`), "Zipper-Pouches.csv");

  assert.deepEqual(sheet.errors, []);
  assert.equal(sheet.groupName, "Zipper-Pouches");
  assert.deepEqual(sheet.products.map((product) => product.handle), [
    "blue-canvas-zipper-box-kit",
    "red-canvas-box-kit",
    "black-cotton-canvas-zipper-box-kit",
  ]);
  assert.deepEqual(sheet.quantities, [1, 10, 50, 100, 300, 500, 1000]);
  const prices = sheet.fields.find((field) => field.type === "__variation_prices").config.prices;
  assert.deepEqual(prices.map((row) => Number(row.price)), [
    300, 1800, 6500, 11000, 31500, 50000, 90000,
  ]);
  assert.equal(prices[0].selections[1].value, '7.5" x 3.5" by 3.5"');
});

test("deduplicates product URLs above the matrix and ignores URLs below it", () => {
  const sheet = parseRateSheet("Shared pouch rates", [
    ["https://koapack.in/products/blue https://koapack.in/products/red"],
    ["https://koapack.in/products/blue?variant=1"],
    ["Sl No", "SIZE", 1, 10],
    [1, "Small", 300, 180],
    [], [], [], [],
    ["https://koapack.in/products/unrelated"],
  ]);

  assert.deepEqual(sheet.errors, []);
  assert.deepEqual(sheet.products.map((product) => product.handle), ["blue", "red"]);
  assert.equal(sheet.groupName, "Shared pouch rates");
});

test("CSV preserves quoted commas, quotes, and embedded newlines", () => {
  assert.deepEqual(parseCsv('Size,Description\n"Large, wide","First line\nSecond ""quoted"" line"'), [
    ["Size", "Description"],
    ["Large, wide", 'First line\nSecond "quoted" line'],
  ]);
  assert.deepEqual(parseCsv('Size,Rate\rSmall,180\r'), [["Size", "Rate"], ["Small", "180"]]);
  assert.throws(() => parseCsv('Size,"unclosed'), /unclosed quoted value/);
});

test("downloadable examples import cleanly and share identical pouch prices", async () => {
  const workbook = await parseRateUpload(
    await readFile(new URL("../public/examples/product-options-example.xlsx", import.meta.url)),
    "product-options-example.xlsx",
  );
  const [csv] = await parseRateUpload(
    await readFile(new URL("../public/examples/product-options-example.csv", import.meta.url)),
    "product-options-example.csv",
  );

  assert.equal(workbook.length, 3);
  for (const sheet of [...workbook, csv]) {
    assert.deepEqual(sheet.errors, []);
    assert.deepEqual(sheet.warnings, []);
    assert.ok(sheet.fields.length > 0);
  }
  assert.deepEqual(workbook[1].optionLabels, ["Size", "Color"]);
  assert.equal(workbook[2].products.length, 3);
  assert.deepEqual(csv.products, workbook[2].products);
  assert.deepEqual(csv.fields, workbook[2].fields);
});
