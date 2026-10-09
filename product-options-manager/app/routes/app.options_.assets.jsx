import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { imageUploadErrorMessage, uploadImageToShopifyFiles } from "../shopify-image-upload.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    return { images: await loadShopifyMediaImages(admin), error: null };
  } catch (error) {
    const message = imageUploadErrorMessage(error);
    console.error("Unable to load Shopify media images:", message);
    return { images: [], error: message };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    const formData = await request.formData();
    const uploaded = await uploadImageToShopifyFiles(admin, formData.get("file"));
    return { ok: true, processing: uploaded.fileStatus !== "READY" };
  } catch (error) {
    const message = imageUploadErrorMessage(error);
    console.error("Asset image upload failed:", message);
    return { ok: false, error: message };
  }
};

export default function AssetsPage() {
  const { images, error: loadError } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isUploading = navigation.state !== "idle";

  return (
    <s-page heading="Assets">
      <s-link slot="breadcrumb" href="/app/options">
        Product Options
      </s-link>

      <s-section heading="Upload image">
        <Form method="post" encType="multipart/form-data">
          <label htmlFor="asset-image" style={{ display: "block", marginBottom: 8 }}>Image file</label>
          <div style={uploadRowStyle}>
            <input
              id="asset-image"
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
        {actionData?.error ? <p role="alert" style={errorStyle}>{actionData.error}</p> : null}
        {actionData?.ok ? (
          <p role="status" style={successStyle}>
            {actionData.processing
              ? "Image uploaded. Shopify is processing it; refresh the images below in a moment."
              : "Image uploaded successfully."}
          </p>
        ) : null}
      </s-section>

      <s-section heading="Uploaded images">
        <s-button href="/app/options/assets">Refresh images</s-button>
        {loadError ? <p role="alert" style={errorStyle}>{loadError}</p> : null}
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
                  <input aria-label="Uploaded image URL" style={urlInputStyle} value={image.url} readOnly />
                </div>
              </div>
            ))}
          </div>
        ) : (
          !loadError ? <p style={mutedStyle}>No uploaded image assets found.</p> : null
        )}
      </s-section>
    </s-page>
  );
}

async function loadShopifyMediaImages(admin) {
  const response = await admin.graphql(`#graphql
    query ProductOptionAssetsImages {
      files(first: 100, query: "media_type:IMAGE", sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          alt
          ... on MediaImage { image { url altText } }
        }
      }
    }
  `);
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return (payload.data?.files?.nodes || [])
    .map((file) => ({
      id: file.id,
      url: file.image?.url,
      alt: file.image?.altText || file.alt || "",
    }))
    .filter((image) => image.url);
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
  marginTop: 16,
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
const errorStyle = { padding: 12, background: "#fff4f4", color: "#8e1f1f", borderRadius: 6 };
const successStyle = { padding: 12, background: "#edf9f0", color: "#174d27", borderRadius: 6 };
