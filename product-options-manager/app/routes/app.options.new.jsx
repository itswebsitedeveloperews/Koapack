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
    key: "quantity",
    required: true,
    helpText: "Let shoppers choose a quantity tier.",
    placeholder: "",
    priceType: "none",
    priceValue: "0",
    valuesText: "10\n25\n50\n100",
    settings: { min: 1, max: 500, step: 1 },
    conditions: [],
  },
  size: {
    type: "size",
    label: "Size",
    key: "size",
    required: true,
    helpText: "Offer sizes as selectable values.",
    placeholder: "",
    priceType: "per_value",
    priceValue: "0",
    valuesText: "Small\nMedium\nLarge\nCustom",
    settings: { display: "buttons" },
    conditions: [],
  },
  printing: {
    type: "printing",
    label: "Printing",
    key: "printing",
    required: false,
    helpText: "Add print methods with optional upcharges.",
    placeholder: "",
    priceType: "per_value",
    priceValue: "0",
    valuesText: "No printing\nSingle color\nFull color",
    settings: { display: "dropdown" },
    conditions: [],
  },
  logo_upload: {
    type: "logo_upload",
    label: "Logo upload",
    key: "logo_upload",
    required: false,
    helpText: "Accept artwork files from customers.",
    placeholder: "",
    priceType: "fixed",
    priceValue: "0",
    valuesText: "",
    settings: { accept: ".png,.jpg,.jpeg,.svg,.pdf", maxSizeMb: 20 },
    conditions: [],
  },
  pincode: {
    type: "pincode",
    label: "Pincode",
    key: "pincode",
    required: false,
    helpText: "Collect delivery or serviceability pincode.",
    placeholder: "Enter pincode",
    priceType: "none",
    priceValue: "0",
    valuesText: "",
    settings: { pattern: "^[0-9]{5,6}$" },
    conditions: [],
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
  ["swatch", "Swatch"],
  ["checkbox", "Checkbox"],
  ["date", "Date picker"],
];

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    throw new Response("Option group name is required", { status: 400 });
  }

  const fields = parseJsonArray(formData.get("fields"));
  const targets = parseJsonArray(formData.get("targets"));
  const targetMode = String(formData.get("targetMode") || "all");

  await db.optionGroup.create({
    data: {
      shop: session.shop,
      name,
      status: String(formData.get("status") || "draft"),
      description: String(formData.get("description") || "").trim() || null,
      settings: {
        previewEnabled: formData.get("previewEnabled") === "on",
        priceFormula: String(formData.get("priceFormula") || "").trim(),
      },
      fields: {
        create: fields.map((field, index) => ({
          type: field.type,
          label: field.label,
          key: field.key,
          required: Boolean(field.required),
          helpText: field.helpText || null,
          placeholder: field.placeholder || null,
          sortOrder: index,
          priceType: field.priceType || "none",
          priceValue: field.priceValue || 0,
          settings: field.settings || {},
          conditions: field.conditions || [],
          values: {
            create: valuesFromText(field.valuesText).map(
              (value, valueIndex) => ({
                label: value,
                value: slugify(value),
                sortOrder: valueIndex,
              }),
            ),
          },
        })),
      },
      targets: {
        create:
          targetMode === "all"
            ? []
            : targets.map((target, index) => ({
                targetType: target.targetType || targetMode,
                shopifyProductId: target.id || null,
                shopifyHandle: target.handle || null,
                title: target.title || null,
                sortOrder: index,
                rule: target.rule || {},
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
  const [description, setDescription] = useState("");
  const [targetMode, setTargetMode] = useState("all");
  const [manualProduct, setManualProduct] = useState("");
  const [targets, setTargets] = useState([]);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [priceFormula, setPriceFormula] = useState("");
  const [fields, setFields] = useState(() =>
    ["quantity", "size", "printing", "logo_upload", "pincode"].map((type) =>
      createField(type),
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
        field.id === id ? normalizeField({ ...field, ...updates }) : field,
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
      multiple: targetMode !== "single_product",
    });

    if (!selected) return;

    setTargetMode(targetMode === "all" ? "multiple_products" : targetMode);
    setTargets(
      selected.map((product) => ({
        targetType: "product",
        id: product.id,
        title: product.title,
        handle: product.handle,
      })),
    );
  };

  const addManualProduct = () => {
    const value = manualProduct.trim();
    if (!value) return;

    setTargetMode(targetMode === "all" ? "single_product" : targetMode);
    setTargets((current) => [
      ...current,
      {
        targetType: "product",
        id: value.startsWith("gid://") ? value : null,
        title: value,
        handle: value.startsWith("gid://") ? null : value,
      },
    ]);
    setManualProduct("");
  };

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
      =======
      <Form method="post">
        <input type="hidden" name="fields" value={fieldsJson} />
        <input type="hidden" name="targets" value={targetsJson} />
        <input type="hidden" name="targetMode" value={targetMode} />

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

            <Field label="Description" htmlFor="description">
              <textarea
                id="description"
                name="description"
                style={textareaStyle}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Internal notes for this option group"
              />
            </Field>
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
              <Field label="Show on" htmlFor="target-mode">
                <select
                  id="target-mode"
                  style={inputStyle}
                  value={targetMode}
                  onChange={(event) => {
                    setTargetMode(event.target.value);
                    if (event.target.value === "all") setTargets([]);
                  }}
                >
                  <option value="all">All products</option>
                  <option value="single_product">Single product</option>
                  <option value="multiple_products">Multiple products</option>
                  <option value="collection">Collection rule</option>
                  <option value="tag_rule">Product tag rule</option>
                </select>
              </Field>

              <Field
                label="Manual product handle or GID"
                htmlFor="manual-product"
              >
                <div style={inlineControlStyle}>
                  <input
                    id="manual-product"
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

          <s-section heading="Pricing and preview">
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                name="previewEnabled"
                checked={previewEnabled}
                onChange={(event) => setPreviewEnabled(event.target.checked)}
              />
              Enable live preview settings for this group
            </label>

            <Field label="Price formula" htmlFor="price-formula">
              <textarea
                id="price-formula"
                name="priceFormula"
                style={textareaStyle}
                value={priceFormula}
                onChange={(event) => setPriceFormula(event.target.value)}
                placeholder="base + options + setup_fee"
              />
            </Field>
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
  const hasValues = [
    "size",
    "printing",
    "dropdown",
    "swatch",
    "checkbox",
  ].includes(field.type);

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

        <Field label="Key" htmlFor={`${field.id}-key`}>
          <input
            id={`${field.id}-key`}
            style={inputStyle}
            value={field.key}
            onChange={(event) => onChange({ key: slugify(event.target.value) })}
          />
        </Field>

        <Field label="Price type" htmlFor={`${field.id}-price-type`}>
          <select
            id={`${field.id}-price-type`}
            style={inputStyle}
            value={field.priceType}
            onChange={(event) => onChange({ priceType: event.target.value })}
          >
            <option value="none">No price change</option>
            <option value="fixed">Fixed add-on</option>
            <option value="per_value">Value-based add-on</option>
            <option value="formula">Formula</option>
          </select>
        </Field>

        <Field label="Base price add-on" htmlFor={`${field.id}-price-value`}>
          <input
            id={`${field.id}-price-value`}
            type="number"
            min="0"
            step="0.01"
            style={inputStyle}
            value={field.priceValue}
            onChange={(event) => onChange({ priceValue: event.target.value })}
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

      <div style={gridStyle}>
        <Field label="Help text" htmlFor={`${field.id}-help`}>
          <input
            id={`${field.id}-help`}
            style={inputStyle}
            value={field.helpText}
            onChange={(event) => onChange({ helpText: event.target.value })}
          />
        </Field>

        <Field label="Placeholder" htmlFor={`${field.id}-placeholder`}>
          <input
            id={`${field.id}-placeholder`}
            style={inputStyle}
            value={field.placeholder}
            onChange={(event) => onChange({ placeholder: event.target.value })}
          />
        </Field>
      </div>

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

      <Field label="Conditional logic" htmlFor={`${field.id}-conditions`}>
        <input
          id={`${field.id}-conditions`}
          style={inputStyle}
          value={field.conditionsText || ""}
          onChange={(event) =>
            onChange({
              conditionsText: event.target.value,
              conditions: event.target.value
                ? [{ rule: event.target.value }]
                : [],
            })
          }
          placeholder="Example: show when Printing is Full color"
        />
      </Field>
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
  return normalizeField({
    id: `${type}-${Date.now()}-${index}`,
    ...(FIELD_TEMPLATES[type] || {
      type,
      label: "Custom option",
      key: "custom_option",
      required: false,
      helpText: "",
      placeholder: "",
      priceType: "none",
      priceValue: "0",
      valuesText: "",
      settings: {},
      conditions: [],
    }),
  });
}

function normalizeField(field) {
  const label = field.label || "Custom option";
  return {
    ...field,
    key: field.key || slugify(label),
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

function valuesFromText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  maxWidth: "520px",
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
