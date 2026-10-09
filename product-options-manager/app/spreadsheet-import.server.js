import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { gunzipSync, gzipSync } from "node:zlib";
import readXlsxFile from "read-excel-file/node";
import { DEFAULT_UPLOAD_HELP } from "./upload-help.js";

const PRODUCT_URL_PATTERN = /https?:\/\/[^\s/]+\/products\/([^\s/?#]+)/gi;
const PRODUCT_URL_TEST_PATTERN = /https?:\/\/[^\s/]+\/products\/[^\s/?#]+/i;
const SYSTEM_COLUMN_PATTERN = /^(?:sl\.?\s*no\.?|s\.?\s*no\.?|serial(?:\s+no)?|#)$/i;
const MAX_SHEETS = 100;
const MAX_OPTIONS = 3;
const MAX_VARIANTS = 250;

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

export async function parseRateUpload(input, filename) {
  if (String(filename || "").toLowerCase().endsWith(".csv")) {
    const data = parseCsv(Buffer.from(input).toString("utf8"));
    return [parseRateSheet(cleanTitle(filename), data)];
  }

  return parseRateWorkbook(input);
}

export async function parseRateWorkbook(input) {
  const sheets = await readXlsxFile(input);

  if (!Array.isArray(sheets) || !sheets.length) {
    throw new Error("The workbook does not contain any worksheets.");
  }

  if (sheets.length > MAX_SHEETS) {
    throw new Error(`The workbook has more than ${MAX_SHEETS} worksheets.`);
  }

  return sheets.map(({ sheet, data }) => parseRateSheet(sheet, data));
}

export function parseRateSheet(sheetName, rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const header = findMatrixHeader(normalizedRows);
  const productReferences = findProductReferences(
    normalizedRows.slice(0, header ? header.rowIndex : 100),
  );
  const errors = [];
  const warnings = [];

  if (!productReferences.length) {
    errors.push("Add a Shopify product URL containing /products/<handle> near the top of the sheet.");
  }

  if (!header) {
    errors.push("Could not find the rate table header. Include an option column such as SIZE and numeric quantity columns.");
  }

  if (errors.length) {
    return invalidSheet(sheetName, productReferences, errors);
  }

  const axisColumns = header.axisColumns;
  const extraFields = parseExtraFields(normalizedRows, errors);
  const reservedNames = new Set(["quantity", "order_quantity", "variation_prices", ...axisColumns.map((axis) => fieldName(axis.label))]);
  for (const field of extraFields) {
    if (reservedNames.has(fieldName(field.label))) {
      errors.push(`Extra field “${field.label}” repeats another field or a reserved name. Use a unique label.`);
    }
    reservedNames.add(fieldName(field.label));
  }
  if (axisColumns.length + 1 > MAX_OPTIONS) {
    errors.push(
      `The table has ${axisColumns.length} option columns plus Quantity. Shopify supports at most ${MAX_OPTIONS} product options.`,
    );
  }

  const records = [];
  const seenCombinations = new Set();
  let consecutiveEmptyRows = 0;

  for (let rowIndex = header.rowIndex + 1; rowIndex < normalizedRows.length; rowIndex += 1) {
    const row = normalizedRows[rowIndex] || [];
    if (isExtraFieldsMarker(row)) break;
    const axisValues = axisColumns.map((axis) => cellText(row[axis.columnIndex]));
    const hasAxisValues = axisValues.some(Boolean);
    const hasRates = header.quantityColumns.some(
      (quantity) => parseMoneyNumber(row[quantity.columnIndex]) !== null,
    );

    if (!hasAxisValues && !hasRates) {
      consecutiveEmptyRows += 1;
      if (consecutiveEmptyRows >= 4 && records.length) break;
      continue;
    }

    consecutiveEmptyRows = 0;

    if (axisValues.some((value) => !value)) {
      warnings.push(`Row ${rowIndex + 1} was skipped because an option value is blank.`);
      continue;
    }

    const combinationKey = axisValues.map(normalizeKeyPart).join("|");
    if (seenCombinations.has(combinationKey)) {
      errors.push(`Row ${rowIndex + 1} repeats the same option combination (${axisValues.join(" / ")}).`);
      continue;
    }
    seenCombinations.add(combinationKey);

    for (const quantityColumn of header.quantityColumns) {
      const rate = parseMoneyNumber(row[quantityColumn.columnIndex]);
      if (rate === null) continue;

      if (rate < 0) {
        errors.push(`Row ${rowIndex + 1}, quantity ${quantityColumn.quantity}: the rate cannot be negative.`);
        continue;
      }

      records.push({
        quantity: quantityColumn.quantity,
        rate,
        total: roundCurrency(quantityColumn.quantity * rate),
        selections: axisColumns.map((axis, index) => ({
          field: axis.label,
          value: axisValues[index],
        })),
      });
    }
  }

  if (!records.length) {
    errors.push("No numeric rates were found below the quantity headers.");
  }

  if (records.length > MAX_VARIANTS) {
    errors.push(
      `This sheet creates ${records.length} variants. The importer limit is ${MAX_VARIANTS} variants per product.`,
    );
  }

  const quantitiesWithRates = new Set(records.map((record) => record.quantity));
  for (const quantityColumn of header.quantityColumns) {
    if (!quantitiesWithRates.has(quantityColumn.quantity)) {
      warnings.push(`Quantity ${quantityColumn.quantity} has no rates and will not be imported.`);
    }
  }

  const groupName =
    findSheetTitle(normalizedRows, productReferences[0]?.rowIndex ?? -1) ||
    cleanTitle(sheetName);
  const fields = errors.length
    ? []
    : buildImportedFields({
        axisColumns,
        records,
        extraFields,
      });

  return {
    sheetName: String(sheetName || "Sheet"),
    groupName,
    products: productReferences.map(({ url, handle }) => ({ url, handle })),
    quantities: uniqueSorted(records.map((record) => record.quantity)),
    optionLabels: axisColumns.map((axis) => axis.label),
    optionValueCounts: axisColumns.map((axis) => ({
      label: axis.label,
      count: new Set(
        records.flatMap((record) =>
          record.selections
            .filter((selection) => selection.field === axis.label)
            .map((selection) => selection.value),
        ),
      ).size,
    })),
    variationCount: records.length,
    minTotal: records.length ? Math.min(...records.map((record) => record.total)) : null,
    maxTotal: records.length ? Math.max(...records.map((record) => record.total)) : null,
    warnings: uniqueStrings(warnings),
    errors: uniqueStrings(errors),
    fields,
  };
}

export function createImportToken(plan, secret) {
  const payload = gzipSync(Buffer.from(JSON.stringify(plan), "utf8")).toString("base64url");
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function readImportToken(token, secret) {
  const [payload, signature, ...extra] = String(token || "").split(".");
  if (!payload || !signature || extra.length) throw new Error("The import preview has expired. Upload the workbook again.");

  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("The import preview is invalid. Upload the workbook again.");
  }

  const parsed = JSON.parse(gunzipSync(Buffer.from(payload, "base64url")).toString("utf8"));
  validateImportPlan(parsed);
  return parsed;
}

export function serializeImportedField(field, index) {
  return {
    label: field.label || "Option",
    type: field.type || "text",
    required: Boolean(field.required),
    sortOrder: index,
    valuesJson: JSON.stringify({
      name: field.name || "",
      label: field.label || "",
      config: field.config || {},
    }),
  };
}

function buildImportedFields({ axisColumns, records, extraFields = [] }) {
  const quantities = uniqueSorted(records.map((record) => record.quantity));
  const quantityField = {
    type: "quantity_discount",
    name: "quantity",
    label: "Order Quantity",
    required: true,
    config: {
      rows: quantities.map((quantity) => ({ quantity })),
      advanced: {},
    },
  };

  const axisFields = axisColumns.map((axis) => {
    const values = uniqueStrings(
      records.flatMap((record) =>
        record.selections
          .filter((selection) => selection.field === axis.label)
          .map((selection) => selection.value),
      ),
    );

    return {
      type: "radio",
      name: fieldName(axis.label),
      label: axis.label,
      required: true,
      config: {
        value: "",
        values: values.map((value) => ({ value, text: "" })),
        advanced: {},
      },
    };
  });

  const variationPrices = records.map((record) => {
    const selections = [
      {
        field: quantityField.label,
        label: quantityField.label,
        value: `${formatNumber(record.quantity)}+`,
        text: "",
      },
      ...record.selections.map((selection) => ({
        field: selection.field,
        label: selection.field,
        value: selection.value,
        text: "",
      })),
    ];

    return {
      key: selections
        .map((selection) => `${encodeURIComponent(selection.field)}=${encodeURIComponent(selection.value)}`)
        .join("&"),
      selections,
      price: formatCurrency(record.total),
    };
  });

  return [
    quantityField,
    ...axisFields,
    ...extraFields,
    {
      type: "__variation_prices",
      name: "__variation_prices",
      label: "Variation prices",
      required: false,
      config: {
        storageType: "__variation_prices",
        prices: variationPrices,
      },
    },
  ];
}

function isExtraFieldsMarker(row) {
  return cellText(row[0]).toLowerCase() === "extra fields";
}

function parseExtraFields(rows, errors) {
  const markerIndex = rows.findIndex(isExtraFieldsMarker);
  if (markerIndex < 0) return [];
  const header = (rows[markerIndex + 1] || []).map((value) => cellText(value).toLowerCase());
  const labels = ["label", "type", "enabled", "required", "values"];
  if (labels.some((label, index) => header[index] !== label)) {
    errors.push("The Extra Fields header must be: Label, Type, Enabled, Required, Values.");
    return [];
  }
  const fields = [];
  const supportedTypes = new Set(["text", "number", "date", "upload", "radio", "dropdown"]);
  for (let index = markerIndex + 2; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (!row.some((value) => cellText(value))) break;
    const label = cellText(row[0]);
    const enabled = cellText(row[2]).toLowerCase();
    const required = cellText(row[3]).toLowerCase();
    if (!["yes", "no", ""].includes(enabled)) {
      errors.push(`Extra Fields row ${index + 1}: Enabled must be Yes or No.`);
      continue;
    }
    if (enabled !== "yes") continue;
    if (!label || !/[a-z0-9]/i.test(label)) {
      errors.push(`Extra Fields row ${index + 1}: add a valid field label.`);
      continue;
    }
    const type = cellText(row[1]).toLowerCase();
    if (!supportedTypes.has(type)) {
      errors.push(`Extra field “${label}”: use text, number, date, upload, radio, or dropdown.`);
      continue;
    }
    if (!["yes", "no", ""].includes(required)) {
      errors.push(`Extra field “${label}”: Required must be Yes or No.`);
      continue;
    }
    const config = { value: "", advanced: {} };
    if (type === "radio" || type === "dropdown") {
      const values = uniqueStrings(cellText(row[4]).split("|"));
      if (!values.length) {
        errors.push(`Extra field “${label}”: enter choices separated by | in Values.`);
        continue;
      }
      config.values = values.map((value) => ({ value, text: "" }));
    }
    if (type === "upload") {
      Object.assign(config, { buttonText: "Upload Your File", maxFileSize: 10, allowedFileTypes: "" });
      config.advanced.help = DEFAULT_UPLOAD_HELP;
    }
    if (type === "number") config.stepButtons = false;
    if (type === "date") Object.assign(config, { dateFormat: "yyyy-mm-dd", minDate: "", maxDate: "" });
    fields.push({ type, name: fieldName(label), label, required: required === "yes", config });
  }
  return fields;
}

function findProductReferences(rows) {
  const products = [];
  const seenHandles = new Set();

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 100); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    for (const value of row) {
      const text = cellText(value);
      for (const match of text.matchAll(PRODUCT_URL_PATTERN)) {
        const handle = decodeURIComponent(match[1]).trim();
        const key = handle.toLowerCase();
        if (!handle || seenHandles.has(key)) continue;
        seenHandles.add(key);
        products.push({ url: match[0], handle, rowIndex });
      }
    }
  }

  return products;
}

function findMatrixHeader(rows) {
  let best = null;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 60); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const quantityColumns = [];

    row.forEach((value, columnIndex) => {
      const quantity = parsePositiveInteger(value);
      if (quantity !== null) quantityColumns.push({ columnIndex, quantity });
    });

    if (!quantityColumns.length) continue;

    const firstQuantityColumn = Math.min(...quantityColumns.map((column) => column.columnIndex));
    const axisColumns = [];

    for (let columnIndex = 0; columnIndex < firstQuantityColumn; columnIndex += 1) {
      const rawLabel = cellText(row[columnIndex]);
      if (!rawLabel || SYSTEM_COLUMN_PATTERN.test(rawLabel)) continue;
      if (/^(?:qty|quantity)$/i.test(rawLabel)) continue;
      axisColumns.push({ columnIndex, label: humanizeLabel(rawLabel) });
    }

    const nearbyText = [rows[rowIndex - 1] || [], rows[rowIndex - 2] || []]
      .flat()
      .map(cellText)
      .join(" ");
    const score =
      quantityColumns.length * 5 +
      axisColumns.length * 4 +
      (/\bqty|quantity\b/i.test(nearbyText) ? 10 : 0);

    if (axisColumns.length && (!best || score > best.score)) {
      best = { rowIndex, quantityColumns, axisColumns, score };
    }
  }

  if (!best) return null;

  const quantities = new Set();
  best.quantityColumns = best.quantityColumns.filter(({ quantity }) => {
    if (quantities.has(quantity)) return false;
    quantities.add(quantity);
    return true;
  });

  return best;
}

function findSheetTitle(rows, productUrlRowIndex) {
  const end = productUrlRowIndex >= 0 ? productUrlRowIndex : Math.min(rows.length, 8);
  const candidates = [];

  for (let rowIndex = Math.max(0, end - 6); rowIndex < end; rowIndex += 1) {
    for (const value of rows[rowIndex] || []) {
      const text = cellText(value);
      if (!text || PRODUCT_URL_TEST_PATTERN.test(text) || /^\d+(?:\.\d+)?$/.test(text)) continue;
      if (/^(?:qty|quantity|size|color|sl\.?\s*no\.?)$/i.test(text)) continue;
      candidates.push(text);
    }
  }

  const title = candidates.sort((a, b) => b.length - a.length)[0];
  return title ? cleanTitle(title) : "";
}

function invalidSheet(sheetName, productReferences, errors) {
  return {
    sheetName: String(sheetName || "Sheet"),
    groupName: cleanTitle(sheetName),
    products: productReferences.map(({ url, handle }) => ({ url, handle })),
    quantities: [],
    optionLabels: [],
    optionValueCounts: [],
    variationCount: 0,
    minTotal: null,
    maxTotal: null,
    warnings: [],
    errors,
    fields: [],
  };
}

function validateImportPlan(plan) {
  if (!plan || !Array.isArray(plan.items) || !plan.items.length) {
    throw new Error("The import preview does not contain any valid products.");
  }

  for (const item of plan.items) {
    if (
      !item ||
      !String(item.groupName || "").trim() ||
      !Array.isArray(item.targets) ||
      !item.targets.length ||
      item.targets.some(
        (target) =>
          !String(target?.id || "").startsWith("gid://shopify/Product/") ||
          !String(target?.title || "").trim(),
      ) ||
      !Array.isArray(item.fields) ||
      !item.fields.length
    ) {
      throw new Error("The import preview contains invalid product data.");
    }
  }
}

function sign(payload, secret) {
  if (!secret) throw new Error("SHOPIFY_API_SECRET is required for spreadsheet imports.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text || "").trim();
    if ("result" in value) return cellText(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("").trim();
  }
  return String(value).replace(/\s+/g, " ").trim();
}

export function parseCsv(value) {
  const text = String(value || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new Error("The CSV contains an unclosed quoted value. Export the sheet as CSV again.");
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parsePositiveInteger(value) {
  const text = cellText(value).replace(/,/g, "").replace(/\+$/, "").trim();
  if (!/^\d+(?:\.0+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMoneyNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cellText(value).replace(/,/g, "").replace(/₹|rs\.?/gi, "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanizeLabel(value) {
  const text = cellText(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "Option";
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function fieldName(label) {
  return String(label || "option")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "option";
}

function cleanTitle(value) {
  return cellText(value).replace(/\.(?:xlsx?|xlsm|csv)$/i, "").trim() || "Imported options";
}

function normalizeKeyPart(value) {
  return cellText(value).toLowerCase();
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value) {
  return roundCurrency(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 6 });
}
