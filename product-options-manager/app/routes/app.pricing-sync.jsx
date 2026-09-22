import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  buildNativeVariantPlan,
  syncProductNativeVariants,
} from "../native-variant-pricing.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const groups = await loadPricingGroups();

  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      products: group.targets.map((target) => target.productTitle),
    })),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const groupId = Number(formData.get("groupId"));

  if (!groupId) {
    return { ok: false, error: "Choose a valid option group." };
  }

  const group = (await loadPricingGroups()).find((item) => item.id === groupId);

  if (!group) {
    return {
      ok: false,
      groupId,
      error: "This active option group has no valid variation prices or products.",
    };
  }

  try {
    const result = await syncProductNativeVariants(
      admin,
      group.fields.map(parseSavedField),
      group.targets,
      { shop: session.shop },
    );

    return {
      ok: result.synced,
      groupId,
      variantCount: result.variantCount || 0,
      productCount: result.productCount || 0,
      error: result.synced ? null : "No products were available to sync.",
    };
  } catch (error) {
    console.error("Native price sync failed", error);
    return {
      ok: false,
      groupId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export default function PricingSyncPage() {
  const { groups } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submittingGroupId = Number(navigation.formData?.get("groupId"));

  return (
    <s-page heading="Pricing Sync">
      <s-section>
        <s-paragraph>
          Convert each option group&apos;s variation prices into native Shopify
          variants so the same totals appear on the product page, cart, and
          checkout.
        </s-paragraph>

        {groups.length ? (
          <div style={groupListStyle}>
            {groups.map((group) => {
              const isSubmitting =
                navigation.state === "submitting" &&
                submittingGroupId === group.id;
              const result =
                actionData?.groupId === group.id ? actionData : null;

              return (
                <div key={group.id} style={groupCardStyle}>
                  <strong>{group.name}</strong>
                  <div style={productStyle}>{group.products.join(", ")}</div>

                  {result ? (
                    <div style={statusStyle(result.ok)}>
                      {result.ok
                        ? `${result.variantCount} Shopify price variants synced across ${result.productCount} product(s).`
                        : result.error}
                    </div>
                  ) : null}

                  <Form method="post">
                    <input type="hidden" name="groupId" value={group.id} />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      style={buttonStyle}
                    >
                      {isSubmitting ? "Syncing..." : `Sync ${group.name} prices`}
                    </button>
                  </Form>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={statusStyle(false)}>
            No active option groups with variation prices and targeted products
            were found.
          </div>
        )}
      </s-section>
    </s-page>
  );
}

async function loadPricingGroups() {
  const groups = await db.optionGroup.findMany({
    where: {
      OR: [{ status: "active" }, { status: "Active" }, { status: "ACTIVE" }],
    },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      targets: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return groups.filter((group) => {
    return (
      group.targets.length > 0 &&
      Boolean(buildNativeVariantPlan(group.fields.map(parseSavedField)))
    );
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
    margin: "12px 0",
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${success ? "#8fc89e" : "#d7d7d7"}`,
    background: success ? "#edf9f0" : "#f7f7f7",
    color: success ? "#174d27" : "#303030",
  };
}

const groupListStyle = {
  display: "grid",
  gap: 16,
  marginTop: 18,
};

const groupCardStyle = {
  padding: 18,
  border: "1px solid #d7d7d7",
  borderRadius: 10,
  background: "#fff",
};

const productStyle = {
  margin: "6px 0 14px",
  color: "#616161",
};

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
