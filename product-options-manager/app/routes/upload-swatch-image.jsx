import { authenticate } from "../shopify.server";

/**
 * Upload a swatch image (from ChoiceOptionEditor) to Shopify Files.
 * Returns CDN URL.
 */
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return Response.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const originalFilename = String(file.name || "swatch-image");
  const mimeType = String(file.type || "image/*");

  if (!mimeType.startsWith("image/")) {
    return Response.json(
      { ok: false, error: "Only image uploads are allowed" },
      { status: 400 },
    );
  }

  try {
    const stagedResult = await admin.graphql(
      `#graphql
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
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
    `,
      {
        variables: {
          input: [
            {
              filename: originalFilename,
              mimeType,
              httpMethod: "POST",
              resource: "FILE",
            },
          ],
        },
      },
    );

    const stagedPayload = await stagedResult.json();
    const stagedErrors = stagedPayload?.data?.stagedUploadsCreate?.userErrors || [];
    if (stagedErrors.length) {
      return Response.json(
        { ok: false, error: stagedErrors.map((e) => e.message).join("; ") },
        { status: 400 },
      );
    }

    const stagedTarget = stagedPayload?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget?.url || !stagedTarget?.resourceUrl) {
      return Response.json(
        { ok: false, error: "Upload target was not returned by Shopify" },
        { status: 500 },
      );
    }

    const uploadFormData = new FormData();
    for (const parameter of stagedTarget.parameters || []) {
      uploadFormData.append(parameter.name, parameter.value);
    }
    uploadFormData.append("file", file, originalFilename);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      return Response.json(
        { ok: false, error: "Shopify staged upload failed" },
        { status: 502 },
      );
    }

    const result = await admin.graphql(
      `#graphql
      mutation FilesCreate($files: [FileCreateInput!]!) {
        filesCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              image {
                url
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
          files: [
            {
              contentType: "IMAGE",
              originalSource: stagedTarget.resourceUrl,
              alt: originalFilename,
              filename: originalFilename,
            },
          ],
        },
      },
    );

    const payload = await result.json();
    const userErrors = payload?.data?.filesCreate?.userErrors || [];
    if (userErrors.length) {
      return Response.json(
        { ok: false, error: userErrors.map((e) => e.message).join("; ") },
        { status: 400 },
      );
    }

    const url =
      payload?.data?.filesCreate?.files?.[0]?.image?.url ||
      payload?.data?.filesCreate?.files?.[0]?.url;

    if (!url) {
      return Response.json(
        { ok: false, error: "Upload succeeded but URL was not returned" },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, url });
  } catch (e) {
    console.error("Swatch image upload failed:", e);
    return Response.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
};
