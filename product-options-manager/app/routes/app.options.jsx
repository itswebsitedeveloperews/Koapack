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
          fields: true,
          targets: true,
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
      fieldsCount: group._count.fields,
      targetsCount: group._count.targets,
      targets: group.targets.map((target) => ({
        id: target.id,
        productId: target.productId,
        productTitle: target.productTitle,
      })),
    })),
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") !== "duplicate") {
    throw new Response("Unsupported action", { status: 400 });
  }

  const id = Number(formData.get("id"));
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
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "720px",
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
