import db from "../db.server";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/gid:\/\/shopify\/product\//i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromHandle(handle) {
  return String(handle || "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseSavedField(field) {
  let saved = {};

  try {
    saved = JSON.parse(field.valuesJson || "{}");
  } catch {
    saved = {};
  }

  return {
    id: field.id,
    type: field.type,
    label: saved.label || field.label,
    name: saved.name || field.label,
    required: Boolean(field.required),
    config: saved.config || {},
  };
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  const productId = url.searchParams.get("productId");
  const productHandle = url.searchParams.get("handle");
  const readableTitle = titleFromHandle(productHandle);

  const incomingMatches = [
    productId,
    productHandle,
    readableTitle,
    normalize(productId),
    normalize(productHandle),
    normalize(readableTitle),
  ].filter(Boolean);

  const allGroups = await db.optionGroup.findMany({
    where: {
      OR: [{ status: "active" }, { status: "Active" }, { status: "ACTIVE" }],
    },
    include: {
      fields: {
        orderBy: {
          sortOrder: "asc",
        },
      },
      targets: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  const matchedGroups = allGroups.filter((group) => {
    // No target means show on all products
    if (!group.targets || group.targets.length === 0) {
      return true;
    }

    return group.targets.some((target) => {
      const targetMatches = [
        target.productId,
        target.productTitle,
        normalize(target.productId),
        normalize(target.productTitle),
      ].filter(Boolean);

      return targetMatches.some((targetValue) =>
        incomingMatches.includes(targetValue),
      );
    });
  });

  return Response.json({
    ok: true,
    productId,
    productHandle,
    readableTitle,
    debug: {
      incomingMatches,
      totalActiveGroups: allGroups.length,
      matchedGroups: matchedGroups.length,
      allTargets: allGroups.map((group) => ({
        groupId: group.id,
        groupName: group.name,
        status: group.status,
        targets: group.targets.map((target) => ({
          productId: target.productId,
          productTitle: target.productTitle,
          normalizedProductId: normalize(target.productId),
          normalizedProductTitle: normalize(target.productTitle),
        })),
      })),
    },
    groups: matchedGroups.map((group) => ({
      id: group.id,
      name: group.name,
      status: group.status,
      targets: group.targets.map((target) => ({
        productId: target.productId,
        productTitle: target.productTitle,
      })),
      fields: group.fields.map(parseSavedField),
    })),
  });
};
