const VARIATION_PRICE_FIELD_TYPE = "__variation_prices";

export function buildNativeVariantPlan(fields) {
  const quantityLabels = new Set(
    fields
      .filter((field) => ["quantity", "quantity_discount"].includes(normalizeType(field.type)))
      .map((field) => String(field.label || field.name || "").trim())
      .filter(Boolean),
  );
  const priceField = fields.find((field) => {
    return (
      normalizeType(field.type) === VARIATION_PRICE_FIELD_TYPE ||
      normalizeType(field.name) === VARIATION_PRICE_FIELD_TYPE ||
      normalizeType(field.config?.storageType) === VARIATION_PRICE_FIELD_TYPE
    );
  });
  const rows = Array.isArray(priceField?.config?.prices)
    ? priceField.config.prices
    : [];
  const optionNames = [];

  for (const row of rows) {
    for (const selection of row.selections || []) {
      const name = String(selection.field || selection.label || "").trim();
      if (name && !optionNames.includes(name)) {
        optionNames.push(name);
      }
    }
  }

  if (!rows.length || !optionNames.length || optionNames.length > 3) return null;

  const optionValuesByName = new Map(optionNames.map((name) => [name, []]));
  const variantsByKey = new Map();

  for (const row of rows) {
    const selections = Array.isArray(row.selections) ? row.selections : [];
    const selectionMap = new Map(
      selections.map((selection) => [
        String(selection.field || selection.label || "").trim(),
        String(selection.value ?? "").trim(),
      ]),
    );
    const optionValues = optionNames.map((optionName) => ({
      optionName,
      name: selectionMap.get(optionName) || "",
    }));

    if (optionValues.some((option) => !option.name)) continue;

    const quantitySelection = selections.find((selection) =>
      quantityLabels.has(String(selection.field || selection.label || "").trim()),
    );
    const quantity = parsePositiveNumber(quantitySelection?.value) || 1;
    const totalPrice = Number(row.price);

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) continue;

    const unitPrice = (totalPrice / quantity).toFixed(2);
    if (Math.round(Number(unitPrice) * 100) * quantity !== Math.round(totalPrice * 100)) {
      throw new Error(`The total ${totalPrice} for quantity ${quantity} cannot be represented exactly by a two-decimal Shopify unit price. Update the variation total before syncing.`);
    }

    for (const option of optionValues) {
      const values = optionValuesByName.get(option.optionName);
      if (!values.includes(option.name)) values.push(option.name);
    }

    variantsByKey.set(selectionKey(optionValues), {
      optionValues,
      price: unitPrice,
    });
  }

  const variants = [...variantsByKey.values()];
  if (!variants.length) return null;

  return {
    productOptions: optionNames.map((name, index) => ({
      name,
      position: index + 1,
      values: optionValuesByName.get(name).map((value) => ({ name: value })),
    })),
    variants,
  };
}

function parsePositiveNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function selectionKey(selections) {
  return selections
    .map((selection) => {
      const name = String(selection.optionName || selection.name || "").trim();
      const value = String(selection.value ?? selection.name ?? "").trim();
      return `${name.toLowerCase()}=${value.toLowerCase()}`;
    })
    .sort()
    .join("|");
}
