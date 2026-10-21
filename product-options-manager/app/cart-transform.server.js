const POM_FUNCTION_TITLE = "POM Variation Price";

// Pricing Sync uses ordinary variant prices, not Plus-only lineUpdate operations.
// Only remove this app's legacy POM function, never another app's transforms.
export async function disablePomCartTransform(admin) {
  try {
    const transforms = await readConnection(admin, "cartTransforms", "id functionId");
    if (!transforms.length) return { ok: true, removedCount: 0 };
    const functions = await readConnection(admin, "shopifyFunctions", "id title");
    const pomIds = new Set(functions.filter((fn) => fn.title === POM_FUNCTION_TITLE).map((fn) => fn.id));
    const legacyTransforms = transforms.filter((transform) => pomIds.has(transform.functionId));
    let removedCount = 0;
    for (const transform of legacyTransforms) {
      const response = await admin.graphql(
        `#graphql
          mutation DisablePomCartTransform($id: ID!) {
            cartTransformDelete(id: $id) {
              deletedId
              userErrors { message }
            }
          }`,
        { variables: { id: transform.id } },
      );
      const payload = await response.json();
      const result = payload.data?.cartTransformDelete;
      assertNoErrors(payload, result?.userErrors);
      if (result?.deletedId !== transform.id) throw new Error("Shopify did not confirm removal of the legacy price transform.");
      removedCount += 1;
    }
    return { ok: true, removedCount };
  } catch (error) {
    console.warn("Legacy POM cart transform cleanup failed", error);
    return {
      ok: false,
      error: "The legacy POM price transform could not be disabled. Reopen the app to retry; check app permissions if this persists.",
    };
  }
}

async function readConnection(admin, name, fields) {
  const nodes = [];
  let after = null;
  do {
    const response = await admin.graphql(
      `query LegacyPomFunctions($after: String) {
        ${name}(first: 100, after: $after) {
          nodes { ${fields} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { variables: { after } },
    );
    const payload = await response.json();
    assertNoErrors(payload);
    const connection = payload.data?.[name];
    if (!Array.isArray(connection?.nodes)) throw new Error(`Shopify did not return ${name}.`);
    nodes.push(...connection.nodes);
    const next = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
    if (connection.pageInfo?.hasNextPage && (!next || next === after)) throw new Error("Shopify returned invalid pagination.");
    after = next;
  } while (after);
  return nodes;
}

function assertNoErrors(payload, userErrors = []) {
  const errors = [...(payload.errors || []), ...(userErrors || [])];
  if (errors.length) throw new Error(errors.map((error) => error.message).join("; "));
}
