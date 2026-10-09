import { authenticate } from "../shopify.server";
import {
  imageUploadErrorMessage,
  uploadImageToShopifyFiles,
  waitForImageUrl,
} from "../shopify-image-upload.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    const formData = await request.formData();
    const uploaded = await uploadImageToShopifyFiles(admin, formData.get("file"));
    const url = await waitForImageUrl(admin, uploaded);
    return Response.json({ ok: true, url });
  } catch (error) {
    const message = imageUploadErrorMessage(error);
    console.error("Swatch image upload failed:", message);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
};
