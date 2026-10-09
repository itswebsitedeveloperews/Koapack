export function validateImageUpload(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.name) {
    throw new Error("Choose an image file to upload.");
  }
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }
  if (!file.size) throw new Error("The selected image is empty.");
}

export async function uploadImageToShopifyFiles(admin, file) {
  validateImageUpload(file);
  const originalFilename = String(file.name);
  const stagedPayload = await graphqlPayload(
    admin,
    `#graphql
      mutation StageOptionImage($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `,
    {
      input: [{
        filename: originalFilename,
        mimeType: file.type,
        httpMethod: "POST",
        resource: "FILE",
        fileSize: String(file.size),
      }],
    },
  );
  const staged = stagedPayload.data?.stagedUploadsCreate;
  assertNoUserErrors(staged);
  const target = staged?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    throw new Error("Shopify did not return an upload destination. Please try again.");
  }

  const uploadForm = new FormData();
  for (const parameter of target.parameters || []) {
    uploadForm.append(parameter.name, parameter.value);
  }
  uploadForm.append("file", file, originalFilename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Shopify could not receive the image (HTTP ${uploadResponse.status}). Please try again.`);
  }

  const payload = await graphqlPayload(
    admin,
    `#graphql
      mutation CreateOptionImage($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            fileErrors { message }
            ... on MediaImage {
              image { url }
            }
          }
          userErrors { field message }
        }
      }
    `,
    {
      files: [{
        contentType: "IMAGE",
        originalSource: target.resourceUrl,
        alt: originalFilename,
        filename: originalFilename,
      }],
    },
  );
  assertNoUserErrors(payload.data?.fileCreate);
  const createdFile = payload.data?.fileCreate?.files?.[0];
  if (!createdFile?.id) {
    throw new Error("Shopify did not confirm the image upload. Please try again.");
  }
  assertFileProcessed(createdFile);
  return createdFile;
}

export async function waitForImageUrl(admin, file) {
  let image = file;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    assertFileProcessed(image);
    if (image.image?.url) return image.image.url;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const payload = await graphqlPayload(
      admin,
      `#graphql
        query OptionImageStatus($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              id
              fileStatus
              fileErrors { message }
              image { url }
            }
          }
        }
      `,
      { id: file.id },
    );
    image = payload.data?.node;
    if (!image) throw new Error("The uploaded image could not be found in Shopify Files.");
  }
  assertFileProcessed(image);
  if (image.image?.url) return image.image.url;
  throw new Error("The image was uploaded but Shopify is still processing it. Select it from Assets once processing finishes.");
}

export function imageUploadErrorMessage(error) {
  const details = error?.body?.errors?.graphQLErrors || [];
  const message = details.map((item) => item.message).filter(Boolean).join("; ") || error?.message;
  if (/access denied|access_denied|permission|scope/i.test(String(message || ""))) {
    return "Shopify Files permission is missing. Reauthorize the app with read_files and write_files permissions, then try again.";
  }
  return message || "The image could not be uploaded. Please try again.";
}

async function graphqlPayload(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return payload;
}

function assertNoUserErrors(result) {
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join("; "));
  }
}

function assertFileProcessed(file) {
  if (file.fileStatus === "FAILED") {
    throw new Error(file.fileErrors?.map((error) => error.message).join("; ") || "Shopify could not process this image. Try a different image.");
  }
}
