import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncApprovedProductNativeVariants } from "../native-variant-pricing.server";

const MOONFLOWER_PRODUCT_ID = "gid://shopify/Product/8519458029739";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const group = await loadMoonflowerGroup();

  return {
    ready: Boolean(group),
    groupName: group?.name || null,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const group = await loadMoonflowerGroup();

  if (!group) {
    return {
      ok: false,
      error: "No active Product Options group targets Moonflower Tote.",
    };
  }

  try {
    const result = await syncApprovedProductNativeVariants(
      admin,
      group.fields.map(parseSavedField),
      group.targets,
    );

    if (!result.synced) {
      return {
        ok: false,
        error: "Moonflower Tote is not enabled for native price syncing.",
      };
    }

    return {
      ok: true,
      variantCount: result.variantCount,
      productCount: result.productCount,
    };
  } catch (error) {
    console.error("Moonflower native price sync failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export default function PricingSyncPage() {
  const { ready, groupName } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const syncing = navigation.state === "submitting";

  return (
    <s-page heading="Pricing Sync">
      <s-section heading="Moonflower Tote">
        <s-paragraph>
          Convert the Product Options quantity prices into native Shopify
          variants so the same totals appear in the cart and checkout.
        </s-paragraph>

        <div style={statusStyle(actionData?.ok)}>
          {actionData?.ok
            ? `${actionData.variantCount} Shopify price variants synced successfully.`
            : actionData?.error ||
              (ready
                ? `Ready to sync from option group: ${groupName}`
                : "No active Moonflower Tote option group was found.")}
        </div>

        <Form method="post">
          <button
            type="submit"
            disabled={!ready || syncing}
            style={buttonStyle}
          >
            {syncing ? "Syncing..." : "Sync Moonflower prices"}
          </button>
        </Form>
      </s-section>
    </s-page>
  );
}

async function loadMoonflowerGroup() {
  return db.optionGroup.findFirst({
    where: {
      AND: [
        { OR: [{ status: "active" }, { status: "Active" }, { status: "ACTIVE" }] },
        { targets: { some: { productId: MOONFLOWER_PRODUCT_ID } } },
      ],
    },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      targets: true,
    },
    orderBy: { id: "desc" },
  });
}

function parseSavedField(field) {
  let saved = {};

  try {
    saved = JSON.parse(field.valuesJson || "{}");
  } catch {
    saved = {};
  }

  return {
    type: field.type,
    label: saved.label || field.label,
    name: saved.name || field.label,
    required: Boolean(field.required),
    config: saved.config || {},
  };
}

function statusStyle(success) {
  return {
    margin: "16px 0",
    padding: "14px 16px",
    borderRadius: 8,
    border: `1px solid ${success ? "#8fc89e" : "#d7d7d7"}`,
    background: success ? "#edf9f0" : "#f7f7f7",
    color: success ? "#174d27" : "#303030",
  };
}

const buttonStyle = {
  appearance: "none",
  border: 0,
  borderRadius: 8,
  padding: "11px 18px",
  background: "#202223",
  color: "#fff",
  fontWeight: 650,
  cursor: "pointer",
};
