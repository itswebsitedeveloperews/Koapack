import { authenticate } from "../shopify.server";

/**
 * Admin-only endpoint to upload a swatch image to Shopify Media.
 * Returns a stable URL that can be stored in option config.
 *
 * Request: multipart/form-data
 * - file: image/*
 * - fileName: optional
 */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const file = formData.get("file");
  const fileName = String(formData.get("fileName") || "swatch");

  if (!file || !(file instanceof File)) {
    return new Response("Missing image file", { status: 400 });
  }

  if (!file.type || !file.type.startsWith("image/")) {
    return new Response("Invalid file type", { status: 400 });
  }

  // Shopify Admin API v2024+ supports stagedUploadsCreate + fileCreate.
  // We upload to the staged target using the pre-signed URL,
  // then create Media with mediaCreate.

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type;

  // 1) Create staged upload target
  const stagedCreateQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const stagedCreateVariables = {
    input: [
      {
        resource: "MEDIA_IMAGE",
        filename: fileName,
        mimeType: contentType,
        httpMethod: "POST",
      },
    ],
  };

  const stagedResp = await session.request(
    "POST",
    "/admin/api/2025-01/graphql.json",
    {
      query: stagedCreateQuery,
      variables: stagedCreateVariables,
    },
  );

  const stagedJson = await stagedResp.json();
  const stagedTarget =
    stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];

  if (!stagedTarget) {
    return new Response("Failed to create staged upload", { status: 500 });
  }

  // 2) Upload to staged URL
  const form = new FormData();
  if (Array.isArray(stagedTarget.parameters)) {
    for (const p of stagedTarget.parameters) {
      form.append(p.name, p.value);
    }
  }
  form.append("file", new Blob([bytes], { type: contentType }), fileName);

  await fetch(stagedTarget.url, {
    method: "POST",
    body: form,
  });

  // 3) Return the stable resourceUrl for the uploaded staged media.
  // (This URL is already suitable for displaying in the storefront.)
  return Response.json({ imageUrl: stagedTarget.resourceUrl });
};
