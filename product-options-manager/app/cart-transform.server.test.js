import assert from "node:assert/strict";
import test from "node:test";
import { disablePomCartTransform } from "./cart-transform.server.js";
import { cartTransformRun } from "../extensions/pom-variation-price/src/index.js";

function mockAdmin(responses) {
  const calls = [];
  return { calls, async graphql(query, options) {
    calls.push({ query, options });
    assert.ok(!query.includes("cartTransformCreate"));
    const payload = responses.shift();
    assert.ok(payload, "Unexpected API request");
    return { json: async () => payload };
  } };
}
const connection = (name, nodes, next = null) => ({ data: {
  [name]: { nodes, pageInfo: { hasNextPage: Boolean(next), endCursor: next } },
} });

test("native-only migration removes only the legacy POM transform", async () => {
  const admin = mockAdmin([
    connection("cartTransforms", [{ id: "legacy", functionId: "pom-fn" }, { id: "other", functionId: "other-fn" }]),
    connection("shopifyFunctions", [{ id: "other-fn", title: "Other feature" }], "cursor"),
    connection("shopifyFunctions", [{ id: "pom-fn", title: "POM Variation Price" }]),
    { data: { cartTransformDelete: { deletedId: "legacy", userErrors: [] } } },
  ]);
  assert.deepEqual(await disablePomCartTransform(admin), { ok: true, removedCount: 1 });
  assert.equal(admin.calls[2].options.variables.after, "cursor");
  assert.equal(admin.calls[3].options.variables.id, "legacy");
});

test("cleanup is idempotent and never creates a transform", async () => {
  const admin = mockAdmin([connection("cartTransforms", [])]);
  assert.deepEqual(await disablePomCartTransform(admin), { ok: true, removedCount: 0 });
  assert.equal(admin.calls.length, 1);
  const other = mockAdmin([
    connection("cartTransforms", [{ id: "other", functionId: "other-fn" }]),
    connection("shopifyFunctions", [{ id: "other-fn", title: "Other feature" }]),
  ]);
  assert.deepEqual(await disablePomCartTransform(other), { ok: true, removedCount: 0 });
});

test("cleanup surfaces errors instead of claiming removal", async () => {
  for (const response of [
    { errors: [{ message: "Access denied" }] },
    { data: { cartTransformDelete: { deletedId: null, userErrors: [{ message: "Denied" }] } } },
    { data: { cartTransformDelete: { deletedId: null, userErrors: [] } } },
  ]) {
    const admin = mockAdmin([
      connection("cartTransforms", [{ id: "legacy", functionId: "pom-fn" }]),
      connection("shopifyFunctions", [{ id: "pom-fn", title: "POM Variation Price" }]), response,
    ]);
    assert.equal((await disablePomCartTransform(admin)).ok, false);
  }
});

test("legacy function never overrides client-supplied prices", () => {
  assert.deepEqual(cartTransformRun({ cart: { lines: [{ id: "line", priceSource: { value: "exact_variation" }, unitPrice: { value: "0.01" } }] } }), { operations: [] });
  assert.deepEqual(cartTransformRun(), { operations: [] });
});
