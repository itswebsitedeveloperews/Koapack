/* eslint-disable react/prop-types */
import { Form, redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const groups = await db.optionGroup.findMany({
    where: { shop: session.shop },
    include: {
      _count: {
        select: {
          fields: true,
          targets: true,
        },
      },
      targets: {
        orderBy: { sortOrder: "asc" },
        take: 3,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      status: group.status,
      description: group.description,
      fieldsCount: group._count.fields,
      targetsCount: group._count.targets,
      targets: group.targets.map((target) => ({
        id: target.id,
        targetType: target.targetType,
        title: target.title,
        shopifyHandle: target.shopifyHandle,
      })),
    })),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") !== "duplicate") {
    throw new Response("Unsupported action", { status: 400 });
  }

  const id = String(formData.get("id") || "");
  const source = await db.optionGroup.findFirst({
    where: { id, shop: session.shop },
    include: {
      fields: {
        include: { values: true },
        orderBy: { sortOrder: "asc" },
      },
      targets: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!source) {
    throw new Response("Option group not found", { status: 404 });
  }

  await db.optionGroup.create({
    data: {
      shop: session.shop,
      name: `${source.name} copy`,
      status: "draft",
      description: source.description,
      sortOrder: source.sortOrder,
      settings: source.settings,
      fields: {
        create: source.fields.map((field) => ({
          type: field.type,
          label: field.label,
          key: field.key,
          required: field.required,
          helpText: field.helpText,
          placeholder: field.placeholder,
          sortOrder: field.sortOrder,
          priceType: field.priceType,
          priceValue: field.priceValue,
          settings: field.settings,
          conditions: field.conditions,
          values: {
            create: field.values.map((value) => ({
              label: value.label,
              value: value.value,
              priceValue: value.priceValue,
              sortOrder: value.sortOrder,
              metadata: value.metadata,
            })),
          },
        })),
      },
      targets: {
        create: source.targets.map((target) => ({
          targetType: target.targetType,
          shopifyProductId: target.shopifyProductId,
          shopifyVariantId: target.shopifyVariantId,
          shopifyHandle: target.shopifyHandle,
          title: target.title,
          rule: target.rule,
          sortOrder: target.sortOrder,
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

      <s-section>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Group name</th>
              <th style={headerCellStyle}>Options</th>
              <th style={headerCellStyle}>Status</th>
              <th style={headerCellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td style={bodyCellStyle}>
                  <strong>{group.name}</strong>
                </td>
                <td style={bodyCellStyle}>{group.options}</td>
                <td style={bodyCellStyle}>
                  <span style={badgeStyle}>{group.status}</span>
                </td>
                <td style={bodyCellStyle}>
                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/options/${group.id}`}>Edit</s-button>
                    <s-button>Duplicate</s-button>
                    <s-button tone="critical">Delete</s-button>
                  </s-stack>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </s-section>
      {groups.length === 0 ? (
        <s-section heading="Create your first option group">
          <s-paragraph>
            Build reusable option groups with quantity, size, printing, file
            upload, pincode, pricing, and product targeting rules.
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
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td style={bodyCellStyle}>
                      <strong>{group.name}</strong>
                      {group.description ? (
                        <div style={mutedStyle}>{group.description}</div>
                      ) : null}
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
  const labels = group.targets.map((target) => {
    if (target.title) return target.title;
    if (target.shopifyHandle) return target.shopifyHandle;
    return capitalize(target.targetType);
  });

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
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "760px",
};

const headerCellStyle = {
  padding: "12px",
  borderBottom: "1px solid #dfe3e8",
  textAlign: "left",
};

const bodyCellStyle = {
  padding: "12px",
  borderBottom: "1px solid #eef0f2",
  verticalAlign: "middle",
};

const badgeStyle = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "999px",
  background: "#aee9d1",
  color: "#202223",
  fontSize: "12px",
  fontWeight: 600,
};
const mutedStyle = {
  color: "#6d7175",
  fontSize: "13px",
};

const statusBadgeStyle = (status) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "999px",
  background: status === "active" ? "#aee9d1" : "#e4e5e7",
  color: "#202223",
  fontSize: "12px",
  fontWeight: 600,
});
