import { useState } from "react";

export default function NewOptionGroupPage() {
  const [groupName, setGroupName] = useState("");
  const [targetType, setTargetType] = useState("single");

  return (
    <s-page heading="Add option group">
      <s-link slot="breadcrumb" href="/app/options">
        Product Options
      </s-link>

      <s-stack direction="block" gap="base">
        <s-section>
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="group-name">
              Group name
            </label>
            <input
              id="group-name"
              style={inputStyle}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Black Cotton canvas Zipper Box Kit"
              autoComplete="off"
            />
          </div>

          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="status">
              Status
            </label>
            <select id="status" style={inputStyle} defaultValue="active">
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </s-section>

        <s-section heading="Options">
          <s-stack direction="inline" gap="small">
            <s-button>+ Quantity</s-button>
            <s-button>+ Size</s-button>
            <s-button>+ Printing</s-button>
            <s-button>+ Logo upload</s-button>
            <s-button>+ Pincode</s-button>
          </s-stack>
        </s-section>

        <s-section heading="Product targeting">
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="target-type">
              Show on
            </label>
            <select
              id="target-type"
              style={inputStyle}
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
            >
              <option value="single">Single product</option>
              <option value="multiple">Multiple products</option>
            </select>
          </div>

          <s-button>Select product</s-button>
        </s-section>

        <s-stack direction="inline" justifyContent="end">
          <s-button variant="primary">Save group</s-button>
        </s-stack>
      </s-stack>
    </s-page>
  );
}

const fieldGroupStyle = {
  display: "grid",
  gap: "6px",
  marginBottom: "16px",
};

const labelStyle = {
  fontWeight: 600,
};

const inputStyle = {
  width: "100%",
  maxWidth: "520px",
  padding: "8px 12px",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  font: "inherit",
};
