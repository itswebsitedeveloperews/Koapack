/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const FIELD_TEMPLATES = {
  quantity: {
    type: "quantity",
    name: "quantity",
    label: "Quantity",
    required: true,
    config: {
      rows: [
        { quantity: 10, discount: 0 },
        { quantity: 50, discount: 0 },
        { quantity: 100, discount: 0 },
        { quantity: 300, discount: 0 },
        { quantity: 500, discount: 50 },
      ],
    },
  },

  size: {
    type: "radio",
    name: "size",
    label: "Select Bag Size",
    required: true,
    config: {
      value: "",
      values: [
        {
          value: "7 in(L) X 3.5 IN(H) X 3.5 IN(W)",
          text: "",
          price: 0,
        },
      ],
    },
  },

  printing: {
    type: "radio",
    name: "Printing",
    label: "Select Your Printing :",
    required: true,
    config: {
      value: "Front Printing",
      values: [
        {
          value: "Front Only Printing",
          text: "",
          price: 0,
        },
        {
          value: "No Printing",
          text: "",
          price: 0,
        },
      ],
    },
  },

  logo_upload: {
    type: "upload",
    name: "Logo",
    label: "Upload Your Design :",
    required: false,
    config: {
      value: "",
      buttonText: "Upload Your File",
      maxFileSize: 10,
      allowedFileTypes: "",
    },
  },

  price: {
    type: "price_group",
    name: "Price",
    label: "Price",
    required: false,
    config: {
      layout: "row",
      options: [
        { name: "price_one", visible: true },
        { name: "price_two", visible: false },
        { name: "price_three", visible: false },
        { name: "price_four", visible: false },
      ],
    },
  },

  pincode: {
    type: "number",
    name: "pincode",
    label: "Enter Pincode",
    required: true,
    config: {
      value: "",
      stepButtons: false,
    },
  },
};

const FIELD_TYPES = [
  ["quantity", "Quantity discount"],
  ["radio", "Radio"],
  ["upload", "Upload"],
  ["price_group", "Price group"],
  ["number", "Number"],
  ["text", "Text input"],
  ["dropdown", "Dropdown"],
  ["checkbox", "Checkbox"],
  ["date", "Date picker"],
];

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);

  const groupId = Number(params.id);

  if (!groupId) {
    throw new Response("Invalid option group ID", { status: 400 });
  }

  const group = await db.optionGroup.findUnique({
    where: { id: groupId },
    include: {
      fields: {
        orderBy: { sortOrder: "asc" },
      },
      targets: true,
    },
  });

  if (!group) {
    throw new Response("Option group not found", { status: 404 });
  }

  return { group };
};

export const action = async ({ request, params }) => {
  await authenticate.admin(request);

  const groupId = Number(params.id);
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    throw new Response("Option group name is required", { status: 400 });
  }

  const fields = parseJsonArray(formData.get("fields"));
  const targets = parseJsonArray(formData.get("targets"));

  await db.optionGroup.update({
    where: { id: groupId },
    data: {
      name,
      status: String(formData.get("status") || "active"),
      fields: {
        deleteMany: {},
        create: fields.map((field, index) => ({
          label: field.label || "Option",
          type: field.type || "text",
          required: Boolean(field.required),
          sortOrder: index,
          valuesJson: JSON.stringify({
            name: field.name || "",
            label: field.label || "",
            config: field.config || {},
          }),
        })),
      },
      targets: {
        deleteMany: {},
        create: targets.map((target) => ({
          productId: target.id || target.handle || target.title,
          productTitle: target.title || target.handle || target.id,
        })),
      },
    },
  });

  return redirect("/app/options");
};

export default function EditOptionGroupPage() {
  const { group } = useLoaderData();
  const shopify = useAppBridge();
  const navigation = useNavigation();

  const [groupName, setGroupName] = useState(group.name);
  const [status, setStatus] = useState(group.status || "active");
  const [manualProduct, setManualProduct] = useState("");

  const [targets, setTargets] = useState(() =>
    group.targets.map((target) => ({
      id: target.productId,
      title: target.productTitle,
      handle: target.productId,
    })),
  );

  const [fields, setFields] = useState(() =>
    group.fields.map((field, index) => createFieldFromSavedField(field, index)),
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
    <s-page heading="Edit option group">
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
              {fields.length > 0 ? (
                fields.map((field, index) => (
                  <OptionFieldEditor
                    key={field.id}
                    field={field}
                    index={index}
                    onChange={(updates) => updateField(field.id, updates)}
                    onRemove={() => removeField(field.id)}
                  />
                ))
              ) : (
                <p style={mutedStyle}>No option fields added yet.</p>
              )}
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
              {isSubmitting ? "Saving..." : "Save changes"}
            </button>
          </s-stack>
        </s-stack>
      </Form>
    </s-page>
  );
}

function OptionFieldEditor({ field, index, onChange, onRemove }) {
  const updateConfig = (updates) => {
    onChange({
      config: {
        ...(field.config || {}),
        ...updates,
      },
    });
  };

  return (
    <div style={editorStyle}>
      <div style={editorHeaderStyle}>
        <strong>
          {index + 1}. {field.name || field.label || "Untitled field"}
        </strong>

        <button type="button" style={plainButtonStyle} onClick={onRemove}>
          Remove
        </button>
      </div>

      <Field label="Type" htmlFor={`${field.id}-type`}>
        <select
          id={`${field.id}-type`}
          style={inputStyle}
          value={field.type}
          onChange={(event) => {
            const nextType = event.target.value;
            const templateEntry = Object.values(FIELD_TEMPLATES).find(
              (template) => template.type === nextType,
            );

            if (templateEntry) {
              onChange({
                type: templateEntry.type,
                name: templateEntry.name,
                label: templateEntry.label,
                required: templateEntry.required,
                config: cloneConfig(templateEntry.config),
              });
            } else {
              onChange({
                type: nextType,
                config: {},
              });
            }
          }}
        >
          {FIELD_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div style={tabsStyle}>
        <button type="button" style={activeTabStyle}>
          Config
        </button>
        <button type="button" style={tabStyle}>
          Advanced
        </button>
      </div>

      {field.type === "quantity" && (
        <QuantityDiscountEditor
          rows={field.config?.rows || []}
          onUpdate={(rows) => updateConfig({ rows })}
        />
      )}

      {field.type === "radio" && (
        <RadioOptionEditor
          field={field}
          onChange={onChange}
          updateConfig={updateConfig}
        />
      )}

      {field.type === "upload" && (
        <UploadOptionEditor
          field={field}
          onChange={onChange}
          updateConfig={updateConfig}
        />
      )}

      {field.type === "price_group" && (
        <PriceGroupEditor
          field={field}
          onChange={onChange}
          updateConfig={updateConfig}
        />
      )}

      {field.type === "number" && (
        <NumberOptionEditor
          field={field}
          onChange={onChange}
          updateConfig={updateConfig}
        />
      )}

      {["text", "dropdown", "checkbox", "date"].includes(field.type) && (
        <BasicOptionEditor
          field={field}
          onChange={onChange}
          updateConfig={updateConfig}
        />
      )}
    </div>
  );
}

function RadioOptionEditor({ field, onChange, updateConfig }) {
  const values = field.config?.values || [];

  const updateValue = (index, key, value) => {
    const nextValues = [...values];

    nextValues[index] = {
      ...nextValues[index],
      [key]: value,
    };

    updateConfig({ values: nextValues });
  };

  const addValue = () => {
    updateConfig({
      values: [...values, { value: "", text: "", price: 0 }],
    });
  };

  const removeValue = (index) => {
    updateConfig({
      values: values.filter((_, valueIndex) => valueIndex !== index),
    });
  };

  return (
    <>
      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${field.id}-name`}>
          <input
            id={`${field.id}-name`}
            style={inputStyle}
            value={field.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <p style={helpTextStyle}>
            Name of the form field where the option is stored (required)
          </p>
        </Field>

        <Field label="Label" htmlFor={`${field.id}-label`}>
          <input
            id={`${field.id}-label`}
            style={inputStyle}
            value={field.label || ""}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <p style={helpTextStyle}>Label above the form field (optional)</p>
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

      <Field label="Value" htmlFor={`${field.id}-default-value`}>
        <input
          id={`${field.id}-default-value`}
          style={inputStyle}
          value={field.config?.value || ""}
          onChange={(event) => updateConfig({ value: event.target.value })}
        />
        <p style={helpTextStyle}>Initial value of the option</p>
      </Field>

      <p style={sectionLabelStyle}>Values</p>

      <div style={valueTableHeaderStyle}>
        <div>Value</div>
        <div>Text</div>
        <div>Price</div>
        <div />
      </div>

      {values.map((item, index) => (
        <div key={index} style={valueRowStyle}>
          <input
            style={inputStyle}
            value={item.value || ""}
            onChange={(event) =>
              updateValue(index, "value", event.target.value)
            }
          />

          <input
            style={inputStyle}
            placeholder="text (optional)"
            value={item.text || ""}
            onChange={(event) => updateValue(index, "text", event.target.value)}
          />

          <div style={priceInputWrapStyle}>
            <span style={plusStyle}>+</span>
            <input
              type="number"
              style={priceInputStyle}
              value={item.price || 0}
              onChange={(event) =>
                updateValue(index, "price", Number(event.target.value))
              }
            />
            <span style={currencyStyle}>Rs.</span>
          </div>

          <button
            type="button"
            style={deleteButtonStyle}
            onClick={() => removeValue(index)}
          >
            ×
          </button>
        </div>
      ))}

      <button type="button" style={addDiscountButtonStyle} onClick={addValue}>
        + Add value
      </button>
    </>
  );
}

function UploadOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${field.id}-name`}>
          <input
            id={`${field.id}-name`}
            style={inputStyle}
            value={field.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <p style={helpTextStyle}>
            Name of the form field where the option is stored (required)
          </p>
        </Field>

        <Field label="Label" htmlFor={`${field.id}-label`}>
          <input
            id={`${field.id}-label`}
            style={inputStyle}
            value={field.label || ""}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <p style={helpTextStyle}>Label above the form field (optional)</p>
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

      <Field label="Value" htmlFor={`${field.id}-value`}>
        <input
          id={`${field.id}-value`}
          style={inputStyle}
          value={field.config?.value || ""}
          onChange={(event) => updateConfig({ value: event.target.value })}
        />
        <p style={helpTextStyle}>Initial value of the option</p>
      </Field>

      <Field label="Button text" htmlFor={`${field.id}-button-text`}>
        <input
          id={`${field.id}-button-text`}
          style={inputStyle}
          value={field.config?.buttonText || ""}
          onChange={(event) => updateConfig({ buttonText: event.target.value })}
        />
      </Field>

      <div style={gridStyle}>
        <Field label="Max allowed file size" htmlFor={`${field.id}-max-size`}>
          <input
            id={`${field.id}-max-size`}
            type="number"
            style={inputStyle}
            value={field.config?.maxFileSize || 10}
            onChange={(event) =>
              updateConfig({ maxFileSize: Number(event.target.value) })
            }
          />
        </Field>

        <Field label="Allowed file types" htmlFor={`${field.id}-file-types`}>
          <select
            id={`${field.id}-file-types`}
            style={inputStyle}
            value={field.config?.allowedFileTypes || ""}
            onChange={(event) =>
              updateConfig({ allowedFileTypes: event.target.value })
            }
          >
            <option value="">Any</option>
            <option value="image/*">Images</option>
            <option value=".pdf">PDF</option>
            <option value=".ai,.eps,.svg,.pdf">Design files</option>
          </select>
        </Field>
      </div>
    </>
  );
}

function PriceGroupEditor({ field, onChange, updateConfig }) {
  const options = field.config?.options || [];

  const updatePriceOption = (index, updates) => {
    const nextOptions = [...options];

    nextOptions[index] = {
      ...nextOptions[index],
      ...updates,
    };

    updateConfig({ options: nextOptions });
  };

  const addPriceOption = () => {
    updateConfig({
      options: [
        ...options,
        {
          name: `price_${options.length + 1}`,
          visible: true,
        },
      ],
    });
  };

  const removePriceOption = (index) => {
    updateConfig({
      options: options.filter((_, optionIndex) => optionIndex !== index),
    });
  };

  return (
    <>
      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${field.id}-name`}>
          <input
            id={`${field.id}-name`}
            style={inputStyle}
            value={field.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <p style={helpTextStyle}>Name of the group of options</p>
        </Field>

        <Field label="Layout" htmlFor={`${field.id}-layout`}>
          <select
            id={`${field.id}-layout`}
            style={inputStyle}
            value={field.config?.layout || "row"}
            onChange={(event) => updateConfig({ layout: event.target.value })}
          >
            <option value="row">row</option>
            <option value="column">column</option>
          </select>
          <p style={helpTextStyle}>Layout of the options in the group</p>
        </Field>
      </div>

      <div style={priceGroupHeaderStyle}>
        <div>Option</div>
        <div>Visible</div>
        <div>Sort</div>
        <div />
      </div>

      {options.map((item, index) => (
        <div key={index} style={priceGroupRowStyle}>
          <input
            style={inputStyle}
            value={item.name}
            onChange={(event) =>
              updatePriceOption(index, { name: event.target.value })
            }
          />

          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={item.visible}
              onChange={(event) =>
                updatePriceOption(index, { visible: event.target.checked })
              }
            />
            Show
          </label>

          <span>↕</span>

          <button
            type="button"
            style={deleteButtonStyle}
            onClick={() => removePriceOption(index)}
          >
            ×
          </button>
        </div>
      ))}

      <button type="button" style={darkAddButtonStyle} onClick={addPriceOption}>
        + Add option
      </button>
    </>
  );
}

function NumberOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${field.id}-name`}>
          <input
            id={`${field.id}-name`}
            style={inputStyle}
            value={field.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <p style={helpTextStyle}>
            Name of the form field where the option is stored (required)
          </p>
        </Field>

        <Field label="Label" htmlFor={`${field.id}-label`}>
          <input
            id={`${field.id}-label`}
            style={inputStyle}
            value={field.label || ""}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <p style={helpTextStyle}>Label above the form field (optional)</p>
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

      <Field label="Value" htmlFor={`${field.id}-value`}>
        <input
          id={`${field.id}-value`}
          type="number"
          style={inputStyle}
          value={field.config?.value || ""}
          onChange={(event) => updateConfig({ value: event.target.value })}
        />
        <p style={helpTextStyle}>Initial value of the option</p>
      </Field>

      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={field.config?.stepButtons || false}
          onChange={(event) =>
            updateConfig({ stepButtons: event.target.checked })
          }
        />
        Step buttons (-/+)
      </label>

      <p style={helpTextStyle}>
        Show custom buttons to increase/decrease the number
      </p>
    </>
  );
}

function BasicOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${field.id}-name`}>
          <input
            id={`${field.id}-name`}
            style={inputStyle}
            value={field.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        <Field label="Label" htmlFor={`${field.id}-label`}>
          <input
            id={`${field.id}-label`}
            style={inputStyle}
            value={field.label || ""}
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

      <Field label="Value" htmlFor={`${field.id}-value`}>
        <input
          id={`${field.id}-value`}
          style={inputStyle}
          value={field.config?.value || ""}
          onChange={(event) => updateConfig({ value: event.target.value })}
        />
      </Field>
    </>
  );
}

function QuantityDiscountEditor({ rows, onUpdate }) {
  const updateRow = (index, key, value) => {
    const nextRows = [...rows];

    nextRows[index] = {
      ...nextRows[index],
      [key]: value,
    };

    onUpdate(nextRows);
  };

  const addRow = () => {
    onUpdate([...rows, { quantity: "", discount: 0 }]);
  };

  const removeRow = (index) => {
    onUpdate(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <div style={quantityBoxStyle}>
      <div style={quantityHeaderStyle}>
        <div>Quantity</div>
        <div>Discount</div>
        <div />
      </div>

      <div style={quantityRowsStyle}>
        {rows.map((row, index) => (
          <div key={index} style={quantityRowStyle}>
            <input
              type="number"
              min="0"
              style={quantityInputStyle}
              value={row.quantity}
              onChange={(event) =>
                updateRow(index, "quantity", Number(event.target.value))
              }
            />

            <div style={discountInputWrapStyle}>
              <input
                type="number"
                min="0"
                max="100"
                style={discountInputStyle}
                value={row.discount}
                onChange={(event) =>
                  updateRow(index, "discount", Number(event.target.value))
                }
              />
              <span style={percentStyle}>%</span>
            </div>

            <button
              type="button"
              style={deleteButtonStyle}
              onClick={() => removeRow(index)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" style={addDiscountButtonStyle} onClick={addRow}>
        + Add discount
      </button>
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
    config: cloneConfig(FIELD_TEMPLATES[type].config || {}),
  };
}

function createFieldFromSavedField(field, index = 0) {
  const saved = parseSavedValues(field.valuesJson);
  const fallbackTemplate = Object.values(FIELD_TEMPLATES).find(
    (template) => template.type === field.type,
  );

  return {
    id: `${field.type}-${field.id}-${index}`,
    type: field.type,
    name: saved.name || fallbackTemplate?.name || field.label,
    label: saved.label || field.label,
    required: field.required,
    config: saved.config || cloneConfig(fallbackTemplate?.config || {}),
  };
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || {}));
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSavedValues(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
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
  background: "#ffffff",
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

const tabsStyle = {
  display: "flex",
  gap: "16px",
  borderBottom: "1px solid #dfe3e8",
  marginBottom: "16px",
};

const activeTabStyle = {
  border: 0,
  borderBottom: "2px solid #202223",
  background: "transparent",
  padding: "10px 0",
  cursor: "pointer",
  font: "inherit",
};

const tabStyle = {
  border: 0,
  background: "transparent",
  padding: "10px 0",
  cursor: "pointer",
  font: "inherit",
  color: "#6d7175",
};

const helpTextStyle = {
  margin: "4px 0 0",
  color: "#6d7175",
  fontSize: "13px",
};

const sectionLabelStyle = {
  margin: "16px 0 8px",
  fontWeight: 600,
  color: "#6d7175",
};

const valueTableHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr 150px 40px",
  gap: "12px",
  borderBottom: "1px solid #dfe3e8",
  paddingBottom: "8px",
  marginBottom: "8px",
  textAlign: "center",
  fontWeight: 600,
};

const valueRowStyle = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr 150px 40px",
  gap: "12px",
  alignItems: "center",
  marginBottom: "8px",
};

const priceInputWrapStyle = {
  position: "relative",
};

const plusStyle = {
  position: "absolute",
  left: "10px",
  top: "50%",
  transform: "translateY(-50%)",
};

const priceInputStyle = {
  ...inputStyle,
  paddingLeft: "28px",
  paddingRight: "34px",
  textAlign: "right",
};

const currencyStyle = {
  position: "absolute",
  right: "10px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "#6d7175",
};

const priceGroupHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 120px 80px 40px",
  gap: "12px",
  borderBottom: "1px solid #dfe3e8",
  paddingBottom: "8px",
  marginBottom: "8px",
  fontWeight: 600,
};

const priceGroupRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 120px 80px 40px",
  gap: "12px",
  alignItems: "center",
  marginBottom: "8px",
};

const darkAddButtonStyle = {
  width: "240px",
  marginTop: "12px",
  border: 0,
  borderRadius: "8px",
  padding: "10px 12px",
  background: "#202223",
  color: "white",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
};

const quantityBoxStyle = {
  borderTop: "1px solid #dfe3e8",
  paddingTop: "16px",
  marginBottom: "16px",
};

const quantityHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 40px",
  gap: "16px",
  paddingBottom: "8px",
  borderBottom: "1px solid #dfe3e8",
  textAlign: "center",
  fontWeight: 600,
};

const quantityRowsStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "8px",
};

const quantityRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 40px",
  gap: "16px",
  alignItems: "center",
};

const quantityInputStyle = {
  ...inputStyle,
  textAlign: "center",
};

const discountInputWrapStyle = {
  position: "relative",
};

const discountInputStyle = {
  ...inputStyle,
  paddingRight: "34px",
  textAlign: "right",
};

const percentStyle = {
  position: "absolute",
  right: "12px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "#6d7175",
};

const deleteButtonStyle = {
  width: "36px",
  height: "36px",
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#d72c0d",
  cursor: "pointer",
  fontSize: "20px",
  lineHeight: "1",
};

const addDiscountButtonStyle = {
  width: "100%",
  marginTop: "12px",
  border: 0,
  borderRadius: "8px",
  padding: "10px 12px",
  background: "#e4e5e7",
  color: "#202223",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
};
