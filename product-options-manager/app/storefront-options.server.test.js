import assert from "node:assert/strict";
import test from "node:test";
import { loadStorefrontOptions, publishStorefrontOptions } from "./storefront-options.server.js";
import { DEFAULT_UPLOAD_HELP } from "./upload-help.js";

test("snapshot includes only matched active groups and keeps help compact", async () => {
  const field = { type: "upload", label: "Logo", valuesJson: JSON.stringify({ config: { advanced: { help: DEFAULT_UPLOAD_HELP } } }) };
  const database = { optionGroup: { findMany: async (query) => {
    assert.equal(query.where.OR[0].status, "active");
    return [
      { id: 1, name: "Cotton", targets: [{ productId: "cotton-pouch" }], fields: [field] },
      { id: 2, name: "Unrelated", targets: [{ productId: "other-pouch" }], fields: [field] },
    ];
  } } };
  const data = await loadStorefrontOptions(database, { id: "gid://shopify/Product/1", handle: "cotton-pouch" });
  assert.equal(data.groups.length, 1);
  assert.equal(data.groups[0].fields[0].type, "upload");
  assert.match(data.groups[0].fields[0].config.advanced.help, /WhatsApp/);
  assert.ok(JSON.stringify(data).length < 2000);
});

test("snapshot publishing writes the correct product and handles removed groups", async () => {
  for (const data of [{ groups: [] }, { groups: [{ name: "Cotton", fields: [] }] }]) {
    const admin = { graphql: async (query, { variables }) => {
      const input = variables.metafields[0];
      assert.equal(input.ownerId, "gid://shopify/Product/1");
      assert.equal(input.namespace, "product_options_manager");
      assert.equal(input.key, "storefront");
      assert.deepEqual(JSON.parse(input.value), { schemaVersion: 1, productId: input.ownerId, ...data });
      return { json: async () => ({ data: { metafieldsSet: { metafields: [{ id: "meta" }], userErrors: [] } } }) };
    } };
    await publishStorefrontOptions(admin, "gid://shopify/Product/1", data);
  }
});

test("publishing never silently accepts Shopify errors", async () => {
  const admin = { graphql: async () => ({ json: async () => ({ errors: [{ message: "Access denied" }] }) }) };
  await assert.rejects(publishStorefrontOptions(admin, "gid://shopify/Product/1", { groups: [] }), /Access denied/);
});
