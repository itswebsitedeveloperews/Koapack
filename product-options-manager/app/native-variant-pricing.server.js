import db from "./db.server";

const VARIATION_PRICE_FIELD_TYPE = "__variation_prices";
const LEGACY_BASE_PRICES = new Map([
  ["gid://shopify/Product/8974959476907", "0.00"],
  ["gid://shopify/Product/8519458029739", "350.00"],
]);

export async function syncProductNativeVariants(admin, fields, targets, { shop }) {
  const plan = buildNativeVariantPlan(fields);

  if (!plan) return { synced: false };

  const products = await resolveTargetProducts(admin, targets);
  if (!products.length) return { synced: false };

  const results = [];

  for (const product of products) {
    await saveOriginalProduct(admin, shop, product);
    results.push(await syncProduct(admin, product, plan));
  }

  return {
    synced: true,
    productIds: products.map((product) => product.id),
    productCount: results.length,
    variantCount: results.reduce(
      (total, result) => total + result.variantCount,
      0,
    ),
  };
}

export async function restoreOrphanedProductNativeVariants(
  admin,
  { shop, targets },
) {
  const orphanedTargets = [];

  for (const target of targets || []) {
    const productId = String(
      target.productId || target.id || target.handle || "",
    ).trim();
    if (!productId) continue;

    const remainingTargets = await db.productTarget.count({
      where: { productId },
    });

    if (remainingTargets === 0) orphanedTargets.push(target);
  }

  return restoreProductNativeVariants(admin, {
    shop,
    targets: orphanedTargets,
  });
}

export async function restoreProductNativeVariants(admin, { shop, targets }) {
  const products = await resolveTargetProducts(admin, targets);
  const results = [];

  for (const product of products) {
    const backup = await db.nativePricingBackup.findUnique({
      where: { shop_productId: { shop, productId: product.id } },
    });

    if (!backup) continue;

    const snapshot = JSON.parse(backup.snapshotJson);
    const restored = await setProductOptionsAndVariants(admin, product.id, snapshot);
    await db.nativePricingBackup.delete({ where: { id: backup.id } });
    results.push(restored);
  }

  return {
    restored: results.length > 0,
    productCount: results.length,
    variantCount: results.reduce((total, result) => total + result.variantCount, 0),
  };
}

// Keep the old export temporarily so an older route bundle cannot fail during a
// rolling Render deployment.
export const syncApprovedProductNativeVariants = syncProductNativeVariants;

async function syncProduct(admin, currentProduct, plan) {
  const productId = currentProduct.id;
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

  return setProductOptionsAndVariants(admin, productId, {
    productOptions: plan.productOptions,
    variants,
  });
}

async function setProductOptionsAndVariants(admin, productId, input) {
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
        identifier: { id: productId },
        input: {
          productOptions: input.productOptions,
          variants: input.variants,
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
    productId,
    variantCount: payload.data?.productSet?.product?.variants?.nodes?.length || 0,
  };
}

async function saveOriginalProduct(admin, shop, product) {
  const existing = await db.nativePricingBackup.findUnique({
    where: { shop_productId: { shop, productId: product.id } },
  });

  if (existing) return;

  const legacyPrice = LEGACY_BASE_PRICES.get(product.id);

  if (!legacyPrice && !hasOnlyDefaultVariant(product)) {
    throw new Error(
      "Native Product Options pricing currently supports products with one default Shopify variant. This product already has merchant-created variants, so it was left unchanged.",
    );
  }

  const snapshot = legacyPrice
    ? defaultVariantSnapshot(product, legacyPrice)
    : snapshotProduct(product);

  await db.nativePricingBackup.create({
    data: {
      shop,
      productId: product.id,
      snapshotJson: JSON.stringify(snapshot),
    },
  });
}

function hasOnlyDefaultVariant(product) {
  const options = product.options || [];
  const variants = product.variants?.nodes || [];

  return (
    variants.length === 1 &&
    options.length === 1 &&
    String(options[0]?.name || "").toLowerCase() === "title" &&
    String(options[0]?.values?.[0] || "").toLowerCase() === "default title"
  );
}

function snapshotProduct(product) {
  return {
    productOptions: (product.options || []).map((option, index) => ({
      name: option.name,
      position: option.position || index + 1,
      values: (option.values || []).map((value) => ({ name: value })),
    })),
    variants: (product.variants?.nodes || []).map((variant, index) => ({
      optionValues: variant.selectedOptions.map((selection) => ({
        optionName: selection.name,
        name: selection.value,
      })),
      price: variant.price,
      ...(variant.compareAtPrice ? { compareAtPrice: variant.compareAtPrice } : {}),
      position: index + 1,
      taxable: variant.taxable,
      inventoryPolicy: variant.inventoryPolicy,
      inventoryItem: {
        requiresShipping: variant.inventoryItem?.requiresShipping ?? false,
        tracked: variant.inventoryItem?.tracked ?? false,
      },
    })),
  };
}

function defaultVariantSnapshot(product, price) {
  const source = product.variants?.nodes?.[0];

  return {
    productOptions: [
      { name: "Title", position: 1, values: [{ name: "Default Title" }] },
    ],
    variants: [
      {
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        price,
        position: 1,
        taxable: source?.taxable ?? true,
        inventoryPolicy: source?.inventoryPolicy || "DENY",
        inventoryItem: {
          requiresShipping: source?.inventoryItem?.requiresShipping ?? true,
          tracked: source?.inventoryItem?.tracked ?? false,
        },
      },
    ],
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
          options {
            name
            position
            values
          }
          variants(first: 100) {
            nodes {
              id
              price
              compareAtPrice
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

async function loadProductByHandle(admin, handle) {
  const escapedHandle = String(handle || "").replace(/['\\]/g, "");
  const response = await admin.graphql(
    `#graphql
      query PomNativeVariantProductByHandle($query: String!) {
        products(first: 1, query: $query) {
          nodes {
            id
            options {
              name
              position
              values
            }
            variants(first: 100) {
              nodes {
                id
                price
                compareAtPrice
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
      }
    `,
    { variables: { query: `handle:'${escapedHandle}'` } },
  );
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data?.products?.nodes?.[0] || null;
}

async function resolveTargetProducts(admin, targets) {
  const productsById = new Map();

  for (const target of targets || []) {
    const reference = String(
      target.productId || target.id || target.handle || "",
    ).trim();
    if (!reference) continue;

    const gid = normalizeProductId(reference);
    const product = gid
      ? await loadProduct(admin, gid)
      : await loadProductByHandle(admin, reference);

    if (!product) {
      throw new Error(
        `Shopify product ${target.title || target.productTitle || reference} could not be found.`,
      );
    }

    productsById.set(product.id, product);
  }

  return [...productsById.values()];
}

function normalizeProductId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("gid://shopify/Product/")) return text;
  return /^\d+$/.test(text) ? `gid://shopify/Product/${text}` : "";
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
