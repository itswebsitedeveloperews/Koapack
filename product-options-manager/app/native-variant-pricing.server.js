const APPROVED_PRODUCT_ID = "gid://shopify/Product/8974959476907";
const VARIATION_PRICE_FIELD_TYPE = "__variation_prices";

export async function syncApprovedProductNativeVariants(admin, fields, targets) {
  const isApprovedTarget = targets.some(
    (target) => normalizeProductId(target.id || target.productId) === APPROVED_PRODUCT_ID,
  );

  if (!isApprovedTarget) return { synced: false };

  const plan = buildNativeVariantPlan(fields);

  if (!plan) {
    throw new Error("Native pricing requires variation prices and at least one non-quantity option.");
  }

  const currentProduct = await loadProduct(admin, APPROVED_PRODUCT_ID);

  if (!currentProduct) {
    throw new Error("The approved Shopify product could not be found.");
  }

  const currentVariants = currentProduct.variants?.nodes || [];
  const fallbackVariant = currentVariants[0];
  const variantsBySelections = new Map(
    currentVariants.map((variant) => [selectionKey(variant.selectedOptions), variant]),
  );
  const variants = plan.variants.map((variant, index) => {
    const existing = variantsBySelections.get(selectionKey(variant.optionValues));
    const source = existing || fallbackVariant;

    return {
      ...(existing ? { id: existing.id } : {}),
      optionValues: variant.optionValues,
      price: variant.price,
      position: index + 1,
      taxable: source?.taxable ?? true,
      inventoryPolicy: source?.inventoryPolicy || "DENY",
      inventoryItem: {
        requiresShipping: source?.inventoryItem?.requiresShipping ?? false,
        tracked: source?.inventoryItem?.tracked ?? false,
      },
    };
  });

  const response = await admin.graphql(
    `#graphql
      mutation SyncPomNativeVariants(
        $identifier: ProductSetIdentifiers!
        $input: ProductSetInput!
      ) {
        productSet(identifier: $identifier, input: $input, synchronous: true) {
          product {
            id
            options {
              name
              values
            }
            variants(first: 100) {
              nodes {
                id
                price
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        identifier: { id: APPROVED_PRODUCT_ID },
        input: {
          productOptions: plan.productOptions,
          variants,
        },
      },
    },
  );
  const payload = await response.json();
  const topLevelErrors = payload.errors || [];
  const userErrors = payload.data?.productSet?.userErrors || [];

  if (topLevelErrors.length || userErrors.length) {
    const messages = [...topLevelErrors, ...userErrors]
      .map((error) => error.message)
      .filter(Boolean);
    throw new Error(messages.join("; ") || "Shopify rejected the native variant update.");
  }

  return {
    synced: true,
    productId: APPROVED_PRODUCT_ID,
    variantCount: payload.data?.productSet?.product?.variants?.nodes?.length || 0,
  };
}

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
      if (name && !quantityLabels.has(name) && !optionNames.includes(name)) {
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

    for (const option of optionValues) {
      const values = optionValuesByName.get(option.optionName);
      if (!values.includes(option.name)) values.push(option.name);
    }

    variantsByKey.set(selectionKey(optionValues), {
      optionValues,
      price: (totalPrice / quantity).toFixed(2),
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

async function loadProduct(admin, id) {
  const response = await admin.graphql(
    `#graphql
      query PomNativeVariantProduct($id: ID!) {
        product(id: $id) {
          id
          variants(first: 100) {
            nodes {
              id
              taxable
              inventoryPolicy
              selectedOptions {
                name
                value
              }
              inventoryItem {
                requiresShipping
                tracked
              }
            }
          }
        }
      }
    `,
    { variables: { id } },
  );
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data?.product || null;
}

function normalizeProductId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("gid://shopify/Product/")
    ? text
    : `gid://shopify/Product/${text.replace(/\D/g, "")}`;
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
