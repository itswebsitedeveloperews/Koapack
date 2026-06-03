const POM_CART_TRANSFORM_HANDLE = "pom-variation-price";

export async function ensurePomCartTransform(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        mutation PomCartTransformCreate($functionHandle: String!, $blockOnFailure: Boolean) {
          cartTransformCreate(
            functionHandle: $functionHandle,
            blockOnFailure: $blockOnFailure
          ) {
            cartTransform {
              id
              functionId
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
          functionHandle: POM_CART_TRANSFORM_HANDLE,
          blockOnFailure: false,
        },
      },
    );

    const result = await response.json();
    const errors = result.data?.cartTransformCreate?.userErrors || [];
    const unexpectedErrors = errors.filter(
      (error) => !/already registered/i.test(error.message || ""),
    );

    if (unexpectedErrors.length) {
      console.warn("POM cart transform was not activated", unexpectedErrors);
    }
  } catch (error) {
    console.warn("POM cart transform activation skipped", error);
  }
}
