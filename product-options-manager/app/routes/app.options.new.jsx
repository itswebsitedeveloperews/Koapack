/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const FIELD_TEMPLATES = {
  quantity: {
    type: "quantity",
    label: "Quantity",
    required: true,
    valuesText: "10\n25\n50\n100",
  },
  size: {
    type: "size",
    label: "Size",
    required: true,
    valuesText: "Small\nMedium\nLarge\nCustom",
  },
  printing: {
    type: "printing",
    label: "Printing",
    required: false,
    valuesText: "No printing\nSingle color\nFull color",
  },
  logo_upload: {
    type: "logo_upload",
    label: "Logo upload",
    required: false,
    valuesText: "",
  },
  pincode: {
    type: "pincode",
    label: "Pincode",
    required: false,
    valuesText: "",
  },
};

const FIELD_TYPES = [
  ["quantity", "Quantity"],
  ["size", "Size"],
  ["printing", "Printing"],
  ["logo_upload", "Logo upload"],
  ["pincode", "Pincode"],
  ["text", "Text input"],
  ["dropdown", "Dropdown"],
  ["checkbox", "Checkbox"],
  ["date", "Date picker"],
];

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    throw new Response("Option group name is required", { status: 400 });
  }

  const fields = parseJsonArray(formData.get("fields"));
  const targets = parseJsonArray(formData.get("targets"));

  await db.optionGroup.create({
    data: {
      name,
      status: String(formData.get("status") || "active"),
      fields: {
        create: fields.map((field, index) => ({
          label: field.label || "Option",
          type: field.type || "text",
          required: Boolean(field.required),
          sortOrder: index,
          valuesJson: field.valuesText || null,
        })),
      },
      targets: {
        create: targets.map((target) => ({
          productId: target.id || target.handle || target.title,
          productTitle: target.title || target.handle || target.id,
        })),
      },
    },
  });

  return redirect("/app/options");
};

export default function NewOptionGroupPage() {
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const [groupName, setGroupName] = useState("");
  const [status, setStatus] = useState("active");
  const [manualProduct, setManualProduct] = useState("");
  const [targets, setTargets] = useState([]);
  const [fields, setFields] = useState(() =>
    ["quantity", "size", "printing", "logo_upload", "pincode"].map(
      createField,
    ),
  );

  const isSubmitting = navigation.state === "submitting";
  const fieldsJson = useMemo(() => JSON.stringify(fields), [fields]);
  const targetsJson = useMemo(() => JSON.stringify(targets), [targets]);

  const addField = (type) => {
    setFields((current) => [...current, createField(type, current.length)]);
  };

  const updateField = (id, updates) => {
    setFields((current) =>
      current.map((field) =>
        field.id === id ? { ...field, ...updates } : field,
      ),
    );
  };

  const removeField = (id) => {
    setFields((current) => current.filter((field) => field.id !== id));
  };

  const selectProducts = async () => {
    if (!shopify?.resourcePicker) return;

    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
    });

    if (!selected) return;

    setTargets(
      selected.map((product) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
      })),
    );
  };

  const addManualProduct = () => {
    const value = manualProduct.trim();
    if (!value) return;

    setTargets((current) => [
      ...current,
      {
        id: value,
        title: value,
        handle: value,
      },
    ]);
    setManualProduct("");
  };

  return (
    <s-page heading="Add option group">
      <s-link slot="breadcrumb" href="/app/options">
        Product Options
      </s-link>

      <Form method="post">
        <input type="hidden" name="fields" value={fieldsJson} />
        <input type="hidden" name="targets" value={targetsJson} />

        <s-stack direction="block" gap="base">
          <s-section heading="Group details">
            <div style={gridStyle}>
              <Field label="Group name" htmlFor="group-name">
                <input
                  id="group-name"
                  name="name"
                  style={inputStyle}
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Black Cotton canvas Zipper Box Kit"
                  required
                />
              </Field>

              <Field label="Status" htmlFor="status">
                <select
                  id="status"
                  name="status"
                  style={inputStyle}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </Field>
            </div>
          </s-section>

          <s-section heading="Option fields">
            <div style={toolbarStyle}>
              {Object.keys(FIELD_TEMPLATES).map((type) => (
                <s-button
                  key={type}
                  type="button"
                  onClick={() => addField(type)}
                >
                  + {FIELD_TEMPLATES[type].label}
                </s-button>
              ))}
            </div>

            <div style={fieldListStyle}>
              {fields.map((field, index) => (
                <OptionFieldEditor
                  key={field.id}
                  field={field}
                  index={index}
                  onChange={(updates) => updateField(field.id, updates)}
                  onRemove={() => removeField(field.id)}
                />
              ))}
            </div>
          </s-section>

          <s-section heading="Product targeting">
            <div style={gridStyle}>
              <Field label="Manual product handle or GID" htmlFor="target">
                <div style={inlineControlStyle}>
                  <input
                    id="target"
                    style={inputStyle}
                    value={manualProduct}
                    onChange={(event) => setManualProduct(event.target.value)}
                    placeholder="example-product-handle"
                  />
                  <s-button type="button" onClick={addManualProduct}>
                    Add
                  </s-button>
                </div>
              </Field>
            </div>

            <div style={toolbarStyle}>
              <s-button type="button" onClick={selectProducts}>
                Select products
              </s-button>
            </div>

            {targets.length > 0 ? (
              <div style={pillListStyle}>
                {targets.map((target, index) => (
                  <span
                    key={`${target.id || target.handle}-${index}`}
                    style={pillStyle}
                  >
                    {target.title || target.handle || target.id}
                    <button
                      type="button"
                      style={plainButtonStyle}
                      onClick={() =>
                        setTargets((current) =>
                          current.filter(
                            (_, targetIndex) => targetIndex !== index,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p style={mutedStyle}>No specific targets selected.</p>
            )}
          </s-section>

          <s-stack direction="inline" justifyContent="end" gap="small">
            <s-button href="/app/options">Cancel</s-button>
            <button
              style={primarySubmitStyle}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save group"}
            </button>
          </s-stack>
        </s-stack>
      </Form>
    </s-page>
  );
}

function OptionFieldEditor({ field, index, onChange, onRemove }) {
  const hasValues = ["quantity", "size", "printing", "dropdown", "checkbox"].includes(
    field.type,
  );

  return (
    <div style={editorStyle}>
      <div style={editorHeaderStyle}>
        <strong>
          {index + 1}. {field.label || "Untitled field"}
        </strong>
        <button type="button" style={plainButtonStyle} onClick={onRemove}>
          Remove
        </button>
      </div>

      <div style={gridStyle}>
        <Field label="Type" htmlFor={`${field.id}-type`}>
          <select
            id={`${field.id}-type`}
            style={inputStyle}
            value={field.type}
            onChange={(event) => onChange({ type: event.target.value })}
          >
            {FIELD_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Label" htmlFor={`${field.id}-label`}>
          <input
            id={`${field.id}-label`}
            style={inputStyle}
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Field>
      </div>

      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        Required
      </label>

      {hasValues ? (
        <Field label="Values" htmlFor={`${field.id}-values`}>
          <textarea
            id={`${field.id}-values`}
            style={textareaStyle}
            value={field.valuesText}
            onChange={(event) => onChange({ valuesText: event.target.value })}
            placeholder="One value per line"
          />
        </Field>
      ) : null}
    </div>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div style={fieldGroupStyle}>
      <label style={labelStyle} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function createField(type, index = 0) {
  return {
    id: `${type}-${Date.now()}-${index}`,
    ...FIELD_TEMPLATES[type],
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
};

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
  padding: "8px 12px",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  font: "inherit",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: "88px",
  resize: "vertical",
};

const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "16px",
};

const fieldListStyle = {
  display: "grid",
  gap: "16px",
};

const editorStyle = {
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  padding: "16px",
};

const editorHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "16px",
};

const checkboxLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "16px",
};

const inlineControlStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "8px",
};

const pillListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#f1f2f3",
};

const plainButtonStyle = {
  border: 0,
  padding: 0,
  background: "transparent",
  color: "#005bd3",
  cursor: "pointer",
  font: "inherit",
};

const mutedStyle = {
  color: "#6d7175",
};

const primarySubmitStyle = {
  border: 0,
  borderRadius: "6px",
  padding: "8px 14px",
  background: "#008060",
  color: "white",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
};
