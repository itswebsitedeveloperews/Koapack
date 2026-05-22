import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  return {
    images: await loadShopifyMediaImages(admin),
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    throw new Response("Image file is required", { status: 400 });
  }

  try {
    await uploadImageToShopifyFiles(admin, file);
  } catch (error) {
    if (isShopifyFileScopeError(error)) {
      throw new Response(
        "Missing Shopify Files permission. Add read_files/write_files scopes, then restart the app and reauthorize it in Shopify.",
        { status: 403 },
      );
    }
    throw error;
  }

  return redirect("/app/options/assets");
};

export default function AssetsPage() {
  const { images } = useLoaderData();
  const navigation = useNavigation();
  const isUploading = navigation.state === "submitting";

  return (
    <s-page heading="Assets">
      <s-link slot="breadcrumb" href="/app/options">
        Product Options
      </s-link>

      <s-section heading="Upload image">
        <Form method="post" encType="multipart/form-data">
          <div style={uploadRowStyle}>
            <input
              type="file"
              name="file"
              accept="image/*"
              style={inputStyle}
              required
            />
            <button
              style={primarySubmitStyle}
              type="submit"
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </Form>
      </s-section>

      <s-section heading="Uploaded images">
        {images.length ? (
          <div style={assetGridStyle}>
            {images.map((image) => (
              <div key={image.id || image.url} style={assetCardStyle}>
                <img
                  src={image.url}
                  alt={image.alt || "Uploaded asset"}
                  style={assetImageStyle}
                />
                <div style={assetMetaStyle}>
                  <strong style={assetNameStyle}>
                    {image.alt ||
                      image.url?.split("/").pop()?.split("?")[0] ||
                      "Image"}
                  </strong>
                  <input style={urlInputStyle} value={image.url} readOnly />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={mutedStyle}>No uploaded image assets found.</p>
        )}
      </s-section>
    </s-page>
  );
}

async function loadShopifyMediaImages(admin) {
  try {
    const response = await admin.graphql(`#graphql
      query ProductOptionAssetsImages {
        files(first: 100, query: "media_type:IMAGE", sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            alt
            createdAt
            ... on MediaImage {
              image {
                url
                altText
                width
                height
              }
            }
          }
        }
      }
    `);
    const payload = await response.json();

    return (payload.data?.files?.nodes || [])
      .map((file) => ({
        id: file.id,
        url: file.image?.url,
        alt: file.image?.altText || file.alt || "",
        width: file.image?.width,
        height: file.image?.height,
      }))
      .filter((image) => image.url);
  } catch (error) {
    console.error("Unable to load Shopify media images", error);
    return [];
  }
}

async function uploadImageToShopifyFiles(admin, file) {
  const originalFilename = String(file.name || "option-asset");
  const mimeType = String(file.type || "image/*");

  if (!mimeType.startsWith("image/")) {
    throw new Response("Only image uploads are allowed", { status: 400 });
  }

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
  const stagedErrors =
    stagedPayload?.data?.stagedUploadsCreate?.userErrors || [];
  if (stagedErrors.length) {
    throw new Response(stagedErrors.map((error) => error.message).join("; "), {
      status: 400,
    });
  }

  const stagedTarget =
    stagedPayload?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!stagedTarget?.url || !stagedTarget?.resourceUrl) {
    throw new Response("Upload target was not returned by Shopify", {
      status: 500,
    });
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
    throw new Response("Shopify staged upload failed", { status: 502 });
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
    throw new Response(userErrors.map((error) => error.message).join("; "), {
      status: 400,
    });
  }

  return payload?.data?.filesCreate?.files?.[0];
}

function isShopifyFileScopeError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Access denied") &&
    (message.includes("stagedUploadsCreate") || message.includes("filesCreate"))
  );
}

const inputStyle = {
  width: "100%",
  minHeight: "40px",
  padding: "9px 12px",
  border: "1px solid #c9cccf",
  borderRadius: "6px",
  boxSizing: "border-box",
  font: "inherit",
  background: "#ffffff",
};

const uploadRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "12px",
  alignItems: "center",
};

const primarySubmitStyle = {
  border: 0,
  borderRadius: "6px",
  minHeight: "40px",
  padding: "9px 16px",
  background: "#202223",
  color: "white",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
};

const assetGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: "16px",
};

const assetCardStyle = {
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  overflow: "hidden",
  background: "#ffffff",
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.04)",
};

const assetImageStyle = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  display: "block",
  background: "#f6f6f7",
};

const assetMetaStyle = {
  display: "grid",
  gap: "8px",
  padding: "10px",
};

const assetNameStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const urlInputStyle = {
  ...inputStyle,
  fontSize: "12px",
  color: "#6d7175",
};

const mutedStyle = {
  color: "#6d7175",
  fontSize: "13px",
};
