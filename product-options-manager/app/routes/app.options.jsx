/* eslint-disable react/prop-types */
import { Form, redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const groups = await db.optionGroup.findMany({
    include: {
      _count: {
        select: {
          targets: true,
        },
      },
      fields: {
        select: {
          type: true,
          valuesJson: true,
        },
      },
      targets: {
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      status: group.status,
      fieldsCount: group.fields.filter(
        (field) => !isHiddenVariationField(field),
      ).length,
      targetsCount: group._count.targets,
      targets: group.targets.map((target) => ({
        id: target.id,
        productId: target.productId,
        productTitle: target.productTitle,
      })),
    })),
  };
};

const VARIATION_PRICE_FIELD_TYPE = "__variation_prices";
const LEGACY_VARIATION_PRICE_TYPE = "variation_price";

function normalizeFieldType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
}

function parseFieldValues(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function isHiddenVariationField(field) {
  const saved = parseFieldValues(field.valuesJson);

  return (
    normalizeFieldType(field.type) === VARIATION_PRICE_FIELD_TYPE ||
    normalizeFieldType(field.type) === LEGACY_VARIATION_PRICE_TYPE ||
    normalizeFieldType(saved.name) === VARIATION_PRICE_FIELD_TYPE ||
    normalizeFieldType(saved.config?.storageType) === VARIATION_PRICE_FIELD_TYPE
  );
}

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();

  const intent = String(formData.get("intent") || "");
  const id = Number(formData.get("id"));

  if (!id) {
    throw new Response("Option group ID is required", { status: 400 });
  }

  if (intent === "delete") {
    await db.optionGroup.delete({
      where: { id },
    });

    return redirect("/app/options");
  }

  if (intent !== "duplicate") {
    throw new Response("Unsupported action", { status: 400 });
  }

  const source = await db.optionGroup.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      targets: true,
    },
  });

  if (!source) {
    throw new Response("Option group not found", { status: 404 });
  }

  await db.optionGroup.create({
    data: {
      name: `${source.name} copy`,
      status: "draft",
      fields: {
        create: source.fields.map((field) => ({
          label: field.label,
          type: field.type,
          required: field.required,
          sortOrder: field.sortOrder,
          valuesJson: field.valuesJson,
        })),
      },
      targets: {
        create: source.targets.map((target) => ({
          productId: target.productId,
          productTitle: target.productTitle,
        })),
      },
    },
  });

  return redirect("/app/options");
};

export default function ProductOptionsPage() {
  const { groups } = useLoaderData();

  return (
    <s-page heading="Product Options">
      <s-button slot="primary-action" href="/app/options/new" variant="primary">
        Add group
      </s-button>
      <s-button slot="secondary-actions" href="/app/options/assets">
        Assets
      </s-button>

      {groups.length === 0 ? (
        <s-section heading="Create your first option group">
          <s-paragraph>
            Build reusable option groups with quantity, size, printing, logo
            upload, pincode, and product targeting.
          </s-paragraph>
          <s-button href="/app/options/new" variant="primary">
            Add option group
          </s-button>
        </s-section>
      ) : (
        <s-section>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Group</th>
                  <th style={headerCellStyle}>Fields</th>
                  <th style={headerCellStyle}>Targets</th>
                  <th style={headerCellStyle}>Status</th>
                  <th style={headerCellStyle}>Actions</th>
                  {/* <s-button href={`/app/options/${group.id}`}>Edit</s-button> */}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td style={bodyCellStyle}>
                      <strong>{group.name}</strong>
                    </td>
                    <td style={bodyCellStyle}>{group.fieldsCount}</td>
                    <td style={bodyCellStyle}>
                      {group.targetsCount === 0 ? (
                        <span style={mutedStyle}>All products</span>
                      ) : (
                        <TargetSummary group={group} />
                      )}
                    </td>
                    <td style={bodyCellStyle}>
                      <span style={statusBadgeStyle(group.status)}>
                        {capitalize(group.status)}
                      </span>
                    </td>
                    <td style={bodyCellStyle}>
                      <s-stack direction="inline" gap="small">
                        <s-button href={`/app/options/${group.id}`}>
                          Edit
                        </s-button>

                        <Form method="post">
                          <input
                            type="hidden"
                            name="intent"
                            value="duplicate"
                          />
                          <input type="hidden" name="id" value={group.id} />
                          <s-button submit>Duplicate</s-button>
                        </Form>

                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={group.id} />
                          <button
                            type="submit"
                            style={deleteButtonStyle}
                            onClick={(event) => {
                              if (!confirm(`Delete "${group.name}"?`)) {
                                event.preventDefault();
                              }
                            }}
                          >
                            Delete
                          </button>
                        </Form>
                      </s-stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </s-section>
      )}
    </s-page>
  );
}

function TargetSummary({ group }) {
  const labels = group.targets.map((target) => target.productTitle);

  return (
    <span>
      {labels.join(", ")}
      {group.targetsCount > labels.length
        ? ` +${group.targetsCount - labels.length}`
        : ""}
    </span>
  );
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

const tableWrapStyle = {
  overflowX: "auto",
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  background: "#ffffff",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "720px",
};

const headerCellStyle = {
  padding: "12px 14px",
  borderBottom: "1px solid #dfe3e8",
  background: "#f7f7f8",
  color: "#303030",
  fontSize: "13px",
  fontWeight: 700,
  textAlign: "left",
};

const bodyCellStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef0f2",
  verticalAlign: "middle",
};

const mutedStyle = {
  color: "#6d7175",
  fontSize: "13px",
};

const statusBadgeStyle = (status) => ({
  display: "inline-block",
  padding: "3px 9px",
  borderRadius: "999px",
  background: status === "active" ? "#d1fadf" : "#e4e5e7",
  color: status === "active" ? "#0c5132" : "#303030",
  fontSize: "12px",
  fontWeight: 600,
});

const deleteButtonStyle = {
  border: "1px solid #d72c0d",
  borderRadius: "6px",
  minHeight: "36px",
  padding: "7px 12px",
  background: "#ffffff",
  color: "#d72c0d",
  cursor: "pointer",
  font: "inherit",
  lineHeight: "1",
};
