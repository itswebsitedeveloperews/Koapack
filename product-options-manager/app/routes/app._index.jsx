import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async () => {
  return null;
};

export default function Index() {
  return (
    <s-page heading="Product Options Manager">
      <s-section heading="Welcome">
        <s-paragraph>
          Create reusable option groups for quantity, size, printing, logo
          upload, pincode, price add-ons, and product targeting.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-link href="/app/options">
            <s-button variant="primary">Open Product Options</s-button>
          </s-link>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>Create option groups</s-list-item>
          <s-list-item>
            Add quantity, size, printing, logo upload, and pincode options
          </s-list-item>
          <s-list-item>Connect option groups to products</s-list-item>
          <s-list-item>Show options on the product page</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
