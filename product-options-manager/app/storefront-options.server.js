import { DEFAULT_UPLOAD_HELP } from "./upload-help.js";

const COMPACT_UPLOAD_HELP = 'Contact us on <strong>WhatsApp <span aria-hidden="true">☎</span></strong><span>For customizations and design query. </span>';

function normalize(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/gid:\/\/shopify\/product\//i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function loadStorefrontOptions(database, { id, handle, title }) {
  const readableTitle = title || String(handle || "").split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const matches = new Set([id, handle, readableTitle, normalize(id), normalize(handle), normalize(readableTitle)].filter(Boolean));
  const groups = await database.optionGroup.findMany({
    where: { OR: [{ status: "active" }, { status: "Active" }, { status: "ACTIVE" }] },
    include: { fields: { orderBy: { sortOrder: "asc" } }, targets: true },
    orderBy: { id: "desc" },
  });
  return { groups: groups.filter((group) => !group.targets.length || group.targets.some((target) =>
    [target.productId, target.productTitle, normalize(target.productId), normalize(target.productTitle)].some((value) => matches.has(value)),
  )).map((group) => ({
    id: group.id, name: group.name, fields: group.fields.map((field) => {
      let saved = {};
      try { saved = JSON.parse(field.valuesJson || "{}"); } catch { /* Keep malformed legacy fields safe. */ }
      const config = saved.config || {};
      // The supplied default embeds a 276KB raster in an SVG. Keep its message
      // compact in the storefront snapshot; the admin's editable original stays intact.
      if (config.advanced?.help === DEFAULT_UPLOAD_HELP) config.advanced.help = COMPACT_UPLOAD_HELP;
      return { id: field.id, type: field.type, label: saved.label || field.label,
        name: saved.name || field.label, required: Boolean(field.required), config };
    }),
  })) };
}

export async function publishStorefrontOptions(admin, productId, data) {
  const value = JSON.stringify({ schemaVersion: 1, productId, ...data });
  const response = await admin.graphql(`#graphql
    mutation PublishPomStorefrontOptions($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { message }
      }
    }`, { variables: { metafields: [{ ownerId: productId, namespace: "product_options_manager",
      key: "storefront", type: "json", value }] } });
  const payload = await response.json();
  const result = payload.data?.metafieldsSet;
  const errors = [...(payload.errors || []), ...(result?.userErrors || [])];
  if (errors.length || !result?.metafields?.length) throw new Error(errors.map((error) => error.message).join("; ") || "Shopify did not confirm storefront option publishing.");
}
