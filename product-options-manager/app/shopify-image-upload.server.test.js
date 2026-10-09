/* global globalThis */
import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import {
  imageUploadErrorMessage,
  uploadImageToShopifyFiles,
  waitForImageUrl,
} from "./shopify-image-upload.server.js";

const sampleImage = () => new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" });
const stagedPayload = {
  data: { stagedUploadsCreate: {
    userErrors: [],
    stagedTargets: [{
      url: "https://upload.example.test/image",
      resourceUrl: "https://upload.example.test/resource",
      parameters: [{ name: "key", value: "example-key" }],
    }],
  } },
};

test("stages the image, posts its bytes, and uses Shopify fileCreate", async (context) => {
  const uploaded = { id: "gid://shopify/MediaImage/1", fileStatus: "READY", image: { url: "https://cdn.example.test/image.png" } };
  let call = 0;
  const admin = { graphql: async (query, options) => {
    call += 1;
    if (call === 1) {
      assert.match(query, /stagedUploadsCreate\(input:/);
      assert.equal(options.variables.input[0].fileSize, "3");
      return Response.json(stagedPayload);
    }
    assert.match(query, /\bfileCreate\(files:/);
    assert.doesNotMatch(query, /filesCreate/);
    assert.equal(options.variables.files[0].originalSource, "https://upload.example.test/resource");
    return Response.json({ data: { fileCreate: { userErrors: [], files: [uploaded] } } });
  } };
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://upload.example.test/image");
    assert.equal(options.body.get("key"), "example-key");
    assert.equal(options.body.get("file").name, "sample.png");
    assert.equal(options.body.get("file").size, 3);
    return new Response(null, { status: 204 });
  });

  assert.deepEqual(await uploadImageToShopifyFiles(admin, sampleImage()), uploaded);
  assert.equal(await waitForImageUrl(admin, uploaded), uploaded.image.url);
  assert.equal(call, 2);
});

test("staging errors stop before transferring or creating a file", async () => {
  const admin = { graphql: async () => Response.json({ data: {
    stagedUploadsCreate: { userErrors: [{ message: "Unsupported image type" }] },
  } }) };
  await assert.rejects(uploadImageToShopifyFiles(admin, sampleImage()), /Unsupported image type/);
});

test("failed storage transfers never call fileCreate", async (context) => {
  let calls = 0;
  const admin = { graphql: async () => { calls += 1; return Response.json(stagedPayload); } };
  context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  await assert.rejects(uploadImageToShopifyFiles(admin, sampleImage()), /HTTP 503/);
  assert.equal(calls, 1);
});

test("fileCreate user errors and missing confirmation are surfaced", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  for (const result of [
    { userErrors: [{ message: "Invalid image file" }] },
    { files: [], userErrors: [] },
  ]) {
    let call = 0;
    const admin = { graphql: async () => Response.json(++call === 1 ? stagedPayload : { data: { fileCreate: result } }) };
    await assert.rejects(uploadImageToShopifyFiles(admin, sampleImage()), /Invalid image file|did not confirm/);
  }
});

test("swatch uploads wait for Shopify image processing", async () => {
  const file = { id: "gid://shopify/MediaImage/1", fileStatus: "PROCESSING", image: null };
  const admin = { graphql: async (_query, { variables }) => {
    assert.equal(variables.id, file.id);
    return Response.json({ data: { node: { ...file, fileStatus: "READY", image: { url: "https://cdn.example.test/ready.png" } } } });
  } };
  assert.equal(await waitForImageUrl(admin, file), "https://cdn.example.test/ready.png");
});

test("missing files, non-images, GraphQL errors, and permission errors have useful messages", async () => {
  await assert.rejects(uploadImageToShopifyFiles({}, null), /Choose an image/);
  await assert.rejects(uploadImageToShopifyFiles({}, new File(["data"], "data.csv", { type: "text/csv" })), /Only image/);
  const admin = { graphql: async () => Response.json({ errors: [{ message: "Access denied for fileCreate" }] }) };
  await assert.rejects(uploadImageToShopifyFiles(admin, sampleImage()), /Access denied/);
  assert.match(imageUploadErrorMessage(new Error("Access denied for fileCreate")), /Reauthorize/);
  await assert.rejects(waitForImageUrl({}, { fileStatus: "FAILED", fileErrors: [{ message: "Corrupt image" }] }), /Corrupt image/);
});
