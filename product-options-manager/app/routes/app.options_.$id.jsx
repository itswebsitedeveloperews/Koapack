import { useMemo, useState } from "react";
import { Form, redirect, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ResourcePicker } from "@shopify/app-bridge/actions";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const shopifyMediaImages = await loadShopifyMediaImages(admin);

  if (params.id === "new") {
    return { group: null, isNew: true, shopifyMediaImages };
  }

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

  return { group, isNew: false, shopifyMediaImages };
};

export const action = async ({ request, params }) => {
  await authenticate.admin(request);

  const isNew = params.id === "new";
  const groupId = Number(params.id);
  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    throw new Response("Option group name is required", { status: 400 });
  }

  const fields = parseJsonArray(formData.get("fields"));
  const targets = parseJsonArray(formData.get("targets"));

  const data = {
    name,
    status: String(formData.get("status") || "active"),
    fields: {
      ...(isNew ? {} : { deleteMany: {} }),
      create: fields.map(serializeFieldForDb),
    },
    targets: {
      ...(isNew ? {} : { deleteMany: {} }),
      create: targets.map((target) => ({
        productId: target.id || target.handle || target.title,
        productTitle: target.title || target.handle || target.id,
      })),
    },
  };

  if (isNew) {
    await db.optionGroup.create({ data });
  } else {
    if (!groupId) {
      throw new Response("Invalid option group ID", { status: 400 });
    }

    await db.optionGroup.update({
      where: { id: groupId },
      data,
    });
  }

  return redirect("/app/options");
};

async function loadShopifyMediaImages(admin) {
  try {
    const response = await admin.graphql(`#graphql
      query ProductOptionMediaImages {
        files(first: 50, query: "media_type:IMAGE", sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            alt
            createdAt
            ... on MediaImage {
              image {
                url
                altText
                width
                height
              }
            }
          }
        }
      }
    `);
    const payload = await response.json();

    return (payload.data?.files?.nodes || [])
      .map((file) => ({
        id: file.id,
        url: file.image?.url,
        alt: file.image?.altText || file.alt || "",
        width: file.image?.width,
        height: file.image?.height,
      }))
      .filter((image) => image.url);
  } catch (error) {
    console.error("Unable to load Shopify media images", error);
    return [];
  }
}

export default function EditOptionGroupPage() {
  const { group, isNew, shopifyMediaImages = [] } = useLoaderData();
  const shopify = useAppBridge();
  const navigation = useNavigation();

  const [groupName, setGroupName] = useState(isNew ? "" : group.name);
  const [status, setStatus] = useState(
    isNew ? "active" : group.status || "active",
  );
  const [manualProduct, setManualProduct] = useState("");

  const [targets, setTargets] = useState(() =>
    isNew
      ? []
      : group.targets.map((target) => ({
          id: target.productId,
          title: target.productTitle,
          handle: target.productId,
        })),
  );

  const [fields, setFields] = useState(() =>
    isNew
      ? ["quantity", "radio", "upload", "price", "pincode"].map(createField)
      : group.fields.map((field, index) =>
          createFieldFromSavedField(field, index),
        ),
  );

  return (
    <ProductOptionGroupForm
      heading={isNew ? "Add option group" : "Edit option group"}
      submitLabel={isNew ? "Save group" : "Save changes"}
      groupName={groupName}
      setGroupName={setGroupName}
      status={status}
      setStatus={setStatus}
      fields={fields}
      setFields={setFields}
      targets={targets}
      setTargets={setTargets}
      manualProduct={manualProduct}
      setManualProduct={setManualProduct}
      isSubmitting={navigation.state === "submitting"}
      shopify={shopify}
      shopifyMediaImages={shopifyMediaImages}
    />
  );
}

/* eslint-disable react/prop-types */
const FIELD_TEMPLATES = {
  text: {
    type: "text",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      placeholder: "",
      advanced: {},
      prices: [],
    },
  },
  multi_line: {
    type: "multi_line",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      rows: 4,
      maxRows: "",
      fontOption: "",
      showTextUsage: false,
      usageText: "<b>{used}/{max}</b> only {left} left",
      advanced: {},
      prices: [],
    },
  },
  number: {
    type: "number",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      stepButtons: false,
      advanced: {},
    },
  },
  select: {
    type: "select",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "", text: "", price: 0 }],
      advanced: {},
    },
  },
  dropdown: {
    type: "dropdown",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "", text: "", price: 0, image: "" }],
      advanced: {},
    },
  },
  font_select: {
    type: "font_select",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      fontFamilies: "",
      sortFonts: false,
      values: [],
      advanced: {},
    },
  },
  image_swatches: {
    type: "image_swatches",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "", text: "", price: 0, image: "" }],
      advanced: {},
    },
  },
  button_swatches: {
    type: "button_swatches",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "", text: "", price: 0 }],
      advanced: {},
    },
  },
  color_swatches: {
    type: "color_swatches",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "", text: "", price: 0, color: "#000000" }],
      advanced: {},
    },
  },
  color_image_swatches: {
    type: "color_image_swatches",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "", text: "", price: 0, color: "#000000", image: "" }],
      advanced: {},
    },
  },
  checkbox: {
    type: "checkbox",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "yes", text: "", price: 0 }],
      advanced: {},
    },
  },
  radio: {
    type: "radio",
    name: "size",
    label: "Select Bag Size",
    required: true,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      values: [{ value: "12 in (L) X 14 in (H)", text: "", price: 0 }],
      advanced: {},
    },
  },
  color: {
    type: "color",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "#000000",
      advanced: {},
    },
  },
  date: {
    type: "date",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      dateFormat: "yyyy-mm-dd",
      dateFormatPreset: "",
      minDate: "",
      maxDate: "",
      advanced: {},
    },
  },
  dimension: {
    type: "dimension",
    name: "option_1",
    label: "Option 1",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      labelX: "Width:",
      labelY: "Height:",
      addonX: "",
      addonY: "",
      valueX: "",
      valueY: "",
      rounding: "",
      stepButtons: false,
      advanced: {},
    },
  },
  upload: {
    type: "upload",
    name: "Logo",
    label: "Upload Your Design :",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      buttonText: "Upload Your File",
      maxFileSize: 10,
      allowedFileTypes: "",
      advanced: {},
    },
  },
  upload_lift: {
    type: "upload_lift",
    name: "option_1",
    label: "Upload-Lift",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      buttonText: "Upload file",
      maxFileSize: 10,
      allowedFileTypes: "",
      advanced: {},
    },
  },
  image_library: {
    type: "image_library",
    name: "option_1",
    label: "Image library",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      popupWindow: false,
      categoryGrid: false,
      columns: 4,
      columnsMobile: 2,
      imageHeight: 150,
      imagesPerPage: 20,
      categories: [{ value: "", text: "", image: "", list: "" }],
      values: [{ value: "", text: "", image: "", list: "" }],
      advanced: {},
    },
  },
  dynamic_options: {
    type: "dynamic_options",
    name: "option_1",
    label: "Dynamic Options",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      source: "",
      values: [],
      advanced: {},
    },
  },
  personalize: {
    type: "personalize",
    name: "option_1",
    label: "Personalize",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      value: "no",
      backgroundColor: "#000000",
      textColor: "#ffffff",
      popupWindow: false,
      values: [
        { value: "yes", text: "Add Personalization", price: 0 },
        { value: "no", text: "Remove Personalization", price: 0 },
      ],
      advanced: {
        showPriceOnOption: true,
        swatchGrow: true,
      },
    },
  },
  tabs: {
    type: "tabs",
    name: "option_1",
    label: "Tabs",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      layout: "tabs",
      advanced: {
        tabsNavigation: false,
        tabsValidation: false,
      },
    },
  },
  quantity: {
    type: "quantity",
    name: "quantity",
    label: "Quantity",
    required: true,
    open: true,
    activeTab: "config",
    config: {
      value: "1",
      min: "",
      max: "",
      advanced: {
        step: "",
      },
    },
  },
  quantity_discount: {
    type: "quantity_discount",
    name: "option_1",
    label: "Quantity discount",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      rows: [{ quantity: 10, discount: 0 }],
      discountGroup: "",
      advanced: {},
    },
  },
  bundle: {
    type: "bundle",
    name: "option_1",
    label: "Bundle",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      products: [],
      discount: 0,
      advanced: {},
    },
  },
  ai: {
    type: "ai",
    name: "option_1",
    label: "AI",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      prompt: "",
      enabled: false,
      advanced: {},
    },
  },
  price_summary: {
    type: "price_summary",
    name: "option_1",
    label: "Price Summary",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      showSubtotal: true,
      showDiscount: true,
      showTotal: true,
      advanced: {},
    },
  },
  html: {
    type: "html",
    name: "option_1",
    label: "HTML",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      html: "",
      advanced: {},
    },
  },
  price: {
    type: "price_group",
    name: "Price",
    label: "Price",
    required: false,
    open: true,
    activeTab: "config",
    config: {
      layout: "row",
      options: [
        {
          name: "price_one",
          label: "Price",
          type: "quantity_discount",
          visible: true,
          open: true,
          discountGroup: "price",
          rows: [{ quantity: 10, discount: 0 }],
          conditionsOpen: false,
        },
        {
          name: "price_two",
          label: "Price",
          type: "quantity_discount",
          visible: false,
          open: false,
          discountGroup: "price",
          rows: [{ quantity: 10, discount: 0 }],
          conditionsOpen: false,
        },
      ],
      advanced: {},
    },
  },
  pincode: {
    type: "number",
    name: "pincode",
    label: "Enter Pincode",
    required: true,
    open: true,
    activeTab: "config",
    config: {
      value: "",
      stepButtons: false,
      advanced: {},
    },
  },
};

const FIELD_TYPES = [
  ["text", "Text"],
  ["multi_line", "Multi line"],
  ["number", "Number"],
  ["select", "Select"],
  ["dropdown", "Dropdown"],
  ["font_select", "Font select"],
  ["image_swatches", "Image swatches"],
  ["button_swatches", "Button swatches"],
  ["color_swatches", "Color swatches"],
  ["color_image_swatches", "Color image swatches"],
  ["checkbox", "Checkbox"],
  ["radio", "Radio"],
  ["color", "Color"],
  ["date", "Date"],
  ["dimension", "Dimension"],
  ["upload", "Upload"],
  ["upload_lift", "Upload-Lift"],
  ["image_library", "Image library"],
  ["dynamic_options", "Dynamic Options"],
  ["personalize", "Personalize"],
  ["tabs", "Tabs"],
  ["quantity", "Quantity"],
  ["quantity_discount", "Quantity discount"],
  ["bundle", "Bundle"],
  ["ai", "AI"],
  ["price_summary", "Price Summary"],
  ["html", "HTML"],
  ["price_group", "Price group"],
];

function ProductOptionGroupForm({
  heading,
  submitLabel,
  groupName,
  setGroupName,
  status,
  setStatus,
  fields,
  setFields,
  targets,
  setTargets,
  manualProduct,
  setManualProduct,
  isSubmitting,
  shopify,
  shopifyMediaImages,
}) {
  const fieldsJson = useMemo(() => JSON.stringify(fields), [fields]);
  const targetsJson = useMemo(() => JSON.stringify(targets), [targets]);
  const [draggedFieldId, setDraggedFieldId] = useState(null);
  const [dragOverFieldId, setDragOverFieldId] = useState(null);

  const addField = (type) => {
    setFields((current) => [...current, createField(type, current.length)]);
  };

  const updateField = (id, updates) => {
    if (updates.duplicate) {
      setFields((current) => {
        const fieldIndex = current.findIndex((field) => field.id === id);
        if (fieldIndex === -1) return current;
        const nextFields = [...current];
        nextFields.splice(fieldIndex + 1, 0, updates.duplicate);
        return nextFields;
      });
      return;
    }

    setFields((current) =>
      current.map((field) =>
        field.id === id ? { ...field, ...updates } : field,
      ),
    );
  };

  const removeField = (id) => {
    setFields((current) => current.filter((field) => field.id !== id));
  };

  const moveFieldByDrag = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;

    setFields((current) => {
      const fromIndex = current.findIndex((field) => field.id === fromId);
      const toIndex = current.findIndex((field) => field.id === toId);

      if (fromIndex === -1 || toIndex === -1) return current;

      const nextFields = [...current];
      const [movedField] = nextFields.splice(fromIndex, 1);

      nextFields.splice(toIndex, 0, movedField);

      return nextFields.map((field, index) => ({
        ...field,
        sortOrder: index,
      }));
    });
  };

  const handleFieldDragStart = (event, fieldId) => {
    setDraggedFieldId(fieldId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", fieldId);
  };

  const handleFieldDragOver = (event, fieldId) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (draggedFieldId && draggedFieldId !== fieldId) {
      setDragOverFieldId(fieldId);
    }
  };

  const handleFieldDrop = (event, fieldId) => {
    event.preventDefault();

    const fromId = event.dataTransfer.getData("text/plain") || draggedFieldId;

    moveFieldByDrag(fromId, fieldId);
    setDraggedFieldId(null);
    setDragOverFieldId(null);
  };

  const handleFieldDragEnd = () => {
    setDraggedFieldId(null);
    setDragOverFieldId(null);
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
      { id: value, title: value, handle: value },
    ]);
    setManualProduct("");
  };

  return (
    <s-page heading={heading}>
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
            <div style={fieldListStyle}>
              {fields.map((field, index) => (
                <OptionFieldEditor
                  key={field.id}
                  field={field}
                  index={index}
                  isDragOver={dragOverFieldId === field.id}
                  onDragStart={(event) => handleFieldDragStart(event, field.id)}
                  onDragOver={(event) => handleFieldDragOver(event, field.id)}
                  onDrop={(event) => handleFieldDrop(event, field.id)}
                  onDragEnd={handleFieldDragEnd}
                  onChange={(updates) => updateField(field.id, updates)}
                  onRemove={() => removeField(field.id)}
                  shopify={shopify}
                  shopifyMediaImages={shopifyMediaImages}
                />
              ))}
            </div>

            <AddOptionControl onAdd={addField} />
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
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
          </s-stack>
        </s-stack>
      </Form>
    </s-page>
  );
}

function AddOptionControl({ onAdd }) {
  const selectId = "add-option-type";

  return (
    <div style={addOptionBoxStyle}>
      <select style={addOptionSelectStyle} defaultValue="text" id={selectId}>
        {FIELD_TYPES.map(([type, label]) => (
          <option key={type} value={type}>
            {label}
          </option>
        ))}
      </select>

      <button
        type="button"
        style={darkFullAddButtonStyle}
        onClick={() => {
          const select = document.getElementById(selectId);
          onAdd(select.value);
        }}
      >
        + Add option
      </button>
    </div>
  );
}

function OptionFieldEditor({
  field,
  index,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onChange,
  onRemove,
  shopify,
  shopifyMediaImages,
}) {
  const updateConfig = (updates) => {
    onChange({ config: { ...(field.config || {}), ...updates } });
  };

  const toggleOpen = () => onChange({ open: !field.open });

  const duplicateField = () => {
    onChange({
      duplicate: {
        ...field,
        id: `${field.type}-${Date.now()}-${index}`,
        open: true,
        config: cloneConfig(field.config || {}),
      },
    });
  };

  const changeType = (nextType) => {
    const normalizedType = normalizeType(nextType);
    const templateEntry =
      Object.values(FIELD_TEMPLATES).find(
        (template) => normalizeType(template.type) === normalizedType,
      ) || FIELD_TEMPLATES[normalizedType];

    if (templateEntry) {
      onChange({
        type: templateEntry.type,
        name: `option_${index + 1}`,
        label: `Option ${index + 1}`,
        required: templateEntry.required,
        config: cloneConfig(templateEntry.config),
        activeTab: "config",
        open: true,
      });
    } else {
      onChange({
        type: normalizedType,
        config: {},
        activeTab: "config",
        open: true,
      });
    }
  };

  return (
    <div
      style={{
        ...editorStyle,
        ...(isDragOver ? dragOverEditorStyle : {}),
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div style={toggleHeaderStyle}>
        <button type="button" style={toggleTitleStyle} onClick={toggleOpen}>
          <span style={optionIconStyle}>{getOptionIcon(field.type)}</span>
          <strong>{field.name || field.label || "Untitled field"}</strong>
        </button>

        <div style={headerActionsStyle}>
          <button type="button" style={iconButtonStyle} title="Visible">
            ◉
          </button>
          <button
            type="button"
            style={iconButtonStyle}
            title="Duplicate"
            onClick={duplicateField}
          >
            ⧉
          </button>
          <button
            type="button"
            style={dragHandleButtonStyle}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            ☰
          </button>
          <button
            type="button"
            style={deleteHeaderButtonStyle}
            title="Remove"
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </div>

      {field.open ? (
        <div style={editorBodyStyle}>
          <Field label="Type" htmlFor={`${field.id}-type`}>
            <select
              id={`${field.id}-type`}
              style={inputStyle}
              value={normalizeType(field.type)}
              onChange={(event) => changeType(event.target.value)}
            >
              {FIELD_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <div style={tabsStyle}>
            <button
              type="button"
              style={field.activeTab !== "advanced" ? activeTabStyle : tabStyle}
              onClick={() => onChange({ activeTab: "config" })}
            >
              Config
            </button>
            <button
              type="button"
              style={field.activeTab === "advanced" ? activeTabStyle : tabStyle}
              onClick={() => onChange({ activeTab: "advanced" })}
            >
              Advanced
            </button>
          </div>

          {field.activeTab === "advanced" ? (
            <AdvancedOptionEditor field={field} updateConfig={updateConfig} />
          ) : (
            <ConfigEditor
              field={field}
              onChange={onChange}
              updateConfig={updateConfig}
              shopify={shopify}
              shopifyMediaImages={shopifyMediaImages}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function normalizeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
}

function ConfigEditor({
  field,
  onChange,
  updateConfig,
  shopify,
  shopifyMediaImages,
}) {
  const type = normalizeType(field.type);

  if (type === "personalize") {
    return (
      <PersonalizeOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "tabs") {
    return (
      <TabsOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "quantity") {
    return (
      <QuantityOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "quantity_discount") {
    return (
      <QuantityDiscountOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (
    ["radio", "select", "font_select", "button_swatches", "checkbox"].includes(
      type,
    )
  ) {
    return (
      <ChoiceOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
        mode="basic"
      />
    );
  }

  if (["dropdown", "image_swatches"].includes(type)) {
    return (
      <ChoiceOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
        mode="image"
      />
    );
  }

  if (type === "color_swatches") {
    return (
      <ChoiceOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
        mode="color"
      />
    );
  }

  if (type === "color_image_swatches") {
    return (
      <ChoiceOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
        mode="color_image"
        shopify={shopify}
        shopifyMediaImages={shopifyMediaImages}
      />
    );
  }

  if (["upload", "upload_lift"].includes(type)) {
    return (
      <UploadOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "image_library") {
    return (
      <ImageLibraryOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "date") {
    return (
      <DateOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "dimension") {
    return (
      <DimensionOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "price_group") {
    return (
      <PriceGroupEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  if (type === "number") {
    return (
      <NumberOptionEditor
        field={{ ...field, type }}
        onChange={onChange}
        updateConfig={updateConfig}
      />
    );
  }

  return (
    <BasicOptionEditor
      field={{ ...field, type }}
      onChange={onChange}
      updateConfig={updateConfig}
    />
  );
}

function CommonNameLabel({ field, onChange, includeRequired = true }) {
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

      {includeRequired ? (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          Required
        </label>
      ) : null}
    </>
  );
}

function BasicOptionEditor({ field, onChange, updateConfig }) {
  const type = field.type;

  return (
    <>
      <CommonNameLabel
        field={field}
        onChange={onChange}
        includeRequired={!["html", "price_summary"].includes(type)}
      />

      {type === "text" ? (
        <>
          <Field label="Value" htmlFor={`${field.id}-value`}>
            <input
              id={`${field.id}-value`}
              style={inputStyle}
              value={field.config?.value || ""}
              onChange={(event) => updateConfig({ value: event.target.value })}
            />
            <p style={helpTextStyle}>Initial value of the option</p>
          </Field>
        </>
      ) : null}

      {type === "multi_line" ? (
        <Field label="Value" htmlFor={`${field.id}-value`}>
          <textarea
            id={`${field.id}-value`}
            style={textareaStyle}
            value={field.config?.value || ""}
            onChange={(event) => updateConfig({ value: event.target.value })}
          />
          <p style={helpTextStyle}>Initial value of the option</p>
        </Field>
      ) : null}

      {type === "color" ? (
        <Field label="Color value" htmlFor={`${field.id}-color`}>
          <input
            id={`${field.id}-color`}
            type="color"
            style={colorInputStyle}
            value={field.config?.value || "#000000"}
            onChange={(event) => updateConfig({ value: event.target.value })}
          />
        </Field>
      ) : null}

      {type === "date" ? (
        <div style={gridStyle}>
          <Field label="Default date" htmlFor={`${field.id}-date`}>
            <input
              id={`${field.id}-date`}
              type="date"
              style={inputStyle}
              value={field.config?.value || ""}
              onChange={(event) => updateConfig({ value: event.target.value })}
            />
          </Field>
          <Field label="Min date" htmlFor={`${field.id}-min`}>
            <input
              id={`${field.id}-min`}
              type="date"
              style={inputStyle}
              value={field.config?.min || ""}
              onChange={(event) => updateConfig({ min: event.target.value })}
            />
          </Field>
          <Field label="Max date" htmlFor={`${field.id}-max`}>
            <input
              id={`${field.id}-max`}
              type="date"
              style={inputStyle}
              value={field.config?.max || ""}
              onChange={(event) => updateConfig({ max: event.target.value })}
            />
          </Field>
        </div>
      ) : null}

      {type === "dimension" ? (
        <div style={gridStyle}>
          <Field label="Width" htmlFor={`${field.id}-width`}>
            <input
              id={`${field.id}-width`}
              style={inputStyle}
              value={field.config?.width || ""}
              onChange={(event) => updateConfig({ width: event.target.value })}
            />
          </Field>
          <Field label="Height" htmlFor={`${field.id}-height`}>
            <input
              id={`${field.id}-height`}
              style={inputStyle}
              value={field.config?.height || ""}
              onChange={(event) => updateConfig({ height: event.target.value })}
            />
          </Field>
          <Field label="Unit" htmlFor={`${field.id}-unit`}>
            <select
              id={`${field.id}-unit`}
              style={inputStyle}
              value={field.config?.unit || "cm"}
              onChange={(event) => updateConfig({ unit: event.target.value })}
            >
              <option value="cm">cm</option>
              <option value="mm">mm</option>
              <option value="in">inch</option>
              <option value="px">px</option>
            </select>
          </Field>
        </div>
      ) : null}

      {type === "html" ? (
        <Field label="HTML" htmlFor={`${field.id}-html`}>
          <textarea
            id={`${field.id}-html`}
            style={textareaStyle}
            value={field.config?.html || ""}
            onChange={(event) => updateConfig({ html: event.target.value })}
          />
        </Field>
      ) : null}

      {type === "price_summary" ? (
        <>
          <Check
            label="Show subtotal"
            checked={field.config?.showSubtotal ?? true}
            onChange={(checked) => updateConfig({ showSubtotal: checked })}
          />
          <Check
            label="Show discount"
            checked={field.config?.showDiscount ?? true}
            onChange={(checked) => updateConfig({ showDiscount: checked })}
          />
          <Check
            label="Show total"
            checked={field.config?.showTotal ?? true}
            onChange={(checked) => updateConfig({ showTotal: checked })}
          />
        </>
      ) : null}

      {["dynamic_options", "bundle", "ai", "tabs", "personalize"].includes(
        type,
      ) ? (
        <Field label="JSON config" htmlFor={`${field.id}-json`}>
          <textarea
            id={`${field.id}-json`}
            style={textareaStyle}
            value={JSON.stringify(field.config || {}, null, 2)}
            onChange={(event) => {
              try {
                updateConfig(JSON.parse(event.target.value));
              } catch {
                updateConfig({ raw: event.target.value });
              }
            }}
          />
        </Field>
      ) : null}
    </>
  );
}

function ChoiceOptionEditor({
  field,
  onChange,
  updateConfig,
  mode,
  shopify,
  shopifyMediaImages = [],
}) {
  const values = field.config?.values || [];
  const [blobUrls, setBlobUrls] = useState({}); // track blob URLs for cleanup

  const updateValue = (index, key, value) => {
    const nextValues = [...values];
    nextValues[index] = { ...nextValues[index], [key]: value };
    updateConfig({ values: nextValues });
  };

  const addValue = () => {
    updateConfig({
      values: [
        ...values,
        {
          value: "",
          text: "",
          price: 0,
          ...(mode.includes("image") ? { image: "" } : {}),
          ...(mode.includes("color") ? { color: "#000000" } : {}),
        },
      ],
    });
  };

  const removeValue = (index) => {
    updateConfig({
      values: values.filter((_, valueIndex) => valueIndex !== index),
    });
    // Clean up blob URL if any
    const imageUrl = values[index]?.image;
    if (imageUrl && imageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }
  };

  // Upload from local file system
  const handleUploadClick = (index) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      // Revoke previous blob URL if any
      const oldUrl = values[index]?.image;
      if (oldUrl && oldUrl.startsWith("blob:")) {
        URL.revokeObjectURL(oldUrl);
      }
      const newUrl = URL.createObjectURL(file);
      updateValue(index, "image", newUrl);
    });
    input.click();
  };

  // Open Shopify media picker using the official ResourcePicker action
  const openMediaPicker = async (index) => {
    if (!shopify) {
      console.error("Shopify App Bridge not available");
      return;
    }

    try {
      // Create a ResourcePicker instance
      const resourcePicker = ResourcePicker.create(shopify, {
        resourceType: ResourcePicker.ResourceType.File,
        multiple: false,
        selectMultiple: false,
        showHidden: false,
        // Optionally restrict to images
        options: {
          accept: "image/*",
        },
      });

      // Subscribe to the selection event
      resourcePicker.subscribe(ResourcePicker.Action.SELECT, (payload) => {
        if (payload.selection && payload.selection.length > 0) {
          const selected = payload.selection[0];
          // Extract the image URL
          const imageUrl = selected.preview?.image?.url || selected.url;
          if (imageUrl) {
            updateValue(index, "image", imageUrl);
          } else {
            console.warn("Selected item has no image URL", selected);
          }
        }
        resourcePicker.unsubscribe(); // Clean up
      });

      resourcePicker.subscribe(ResourcePicker.Action.CANCEL, () => {
        resourcePicker.unsubscribe();
      });

      // Open the picker
      resourcePicker.dispatch(ResourcePicker.Action.OPEN);
    } catch (error) {
      console.error("Failed to open Shopify media picker", error);
      alert("Unable to open media picker. Check console for details.");
    }
  };

  const handleMediaClick = (index) => {
    openMediaPicker(index);
  };

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      Object.values(blobUrls).forEach((url) => {
        if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Update blobUrls when values change (to track for cleanup)
  useEffect(() => {
    const newBlobUrls = {};
    values.forEach((val, idx) => {
      if (val.image && val.image.startsWith("blob:")) {
        newBlobUrls[idx] = val.image;
      }
    });
    setBlobUrls(newBlobUrls);
  }, [values]);

  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />

      <Field label="Value" htmlFor={`${field.id}-default-value`}>
        <input
          id={`${field.id}-default-value`}
          style={inputStyle}
          value={field.config?.value || ""}
          onChange={(event) => updateConfig({ value: event.target.value })}
        />
        <p style={helpTextStyle}>Initial value of the option</p>
      </Field>

      <div style={valuesToolbarStyle}>
        <p style={sectionLabelStyle}>Values</p>
        <div style={valuesToolbarRightStyle}>
          <span>Save as ☷</span>
          <span>Sort ↕</span>
        </div>
      </div>

      <div style={choiceHeaderStyle(mode)}>
        {mode.includes("image") ? <div>Image</div> : null}
        {mode.includes("color") ? <div>Color</div> : null}
        <div>Value</div>
        <div>Text</div>
        <div>Price</div>
        <div />
      </div>

      {values.map((item, index) => (
        <div key={index} style={choiceRowStyle(mode)}>
          {mode.includes("image") ? (
            <div style={imageCellStyle}>
              <div style={imagePreviewStyle}>
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.text || item.value || "Selected swatch"}
                    style={imagePreviewImgStyle}
                    onError={(e) => {
                      // If blob URL fails, show placeholder
                      if (item.image.startsWith("blob:")) {
                        e.target.style.display = "none";
                      }
                    }}
                  />
                ) : null}
                {!item.image ? <span>Image</span> : null}
              </div>
              <div style={imageActionsStyle}>
                <button
                  type="button"
                  style={smallDarkButtonStyle}
                  onClick={() => handleUploadClick(index)}
                >
                  Upload
                </button>
                {mode === "color_image" ? (
                  <button
                    type="button"
                    style={smallLightButtonStyle}
                    onClick={() => handleMediaClick(index)}
                  >
                    Media
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode.includes("color") ? (
            <input
              type="color"
              style={colorInputSmallStyle}
              value={item.color || "#000000"}
              onChange={(event) =>
                updateValue(index, "color", event.target.value)
              }
            />
          ) : null}

          <input
            style={inputStyle}
            placeholder="value (required)"
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

function PersonalizeOptionEditor({ field, onChange, updateConfig }) {
  const values = field.config?.values || [
    { value: "yes", text: "Add Personalization", price: 0 },
    { value: "no", text: "Remove Personalization", price: 0 },
  ];

  const updateValue = (index, key, value) => {
    const nextValues = [...values];
    nextValues[index] = { ...nextValues[index], [key]: value };
    updateConfig({ values: nextValues });
  };

  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />

      <div style={gridStyle}>
        <Field
          label="Personalize background color"
          htmlFor={`${field.id}-personalize-bg`}
        >
          <input
            id={`${field.id}-personalize-bg`}
            type="text"
            style={inputStyle}
            value={field.config?.backgroundColor || "#000000"}
            onChange={(event) =>
              updateConfig({ backgroundColor: event.target.value })
            }
          />
        </Field>

        <Field
          label="Personalize text color"
          htmlFor={`${field.id}-personalize-color`}
        >
          <input
            id={`${field.id}-personalize-color`}
            type="text"
            style={inputStyle}
            value={field.config?.textColor || "#ffffff"}
            onChange={(event) =>
              updateConfig({ textColor: event.target.value })
            }
          />
        </Field>
      </div>

      <Check
        label="Popup window"
        checked={field.config?.popupWindow || false}
        onChange={(checked) => updateConfig({ popupWindow: checked })}
      />
      <p style={helpTextStyle}>
        Open all options in a popup window (only active on the store)
      </p>

      <Field label="Value" htmlFor={`${field.id}-value`}>
        <select
          id={`${field.id}-value`}
          style={inputStyle}
          value={field.config?.value || "no"}
          onChange={(event) => updateConfig({ value: event.target.value })}
        >
          <option value="yes">yes</option>
          <option value="no">no</option>
        </select>
        <p style={helpTextStyle}>Initial value of the option</p>
      </Field>

      <p style={sectionLabelStyle}>Values</p>
      <div style={choiceHeaderStyle("basic")}>
        <div>Value</div>
        <div>Text</div>
        <div>Price</div>
        <div />
      </div>

      {values.map((item, index) => (
        <div key={index} style={choiceRowStyle("basic")}>
          <input
            style={inputStyle}
            value={item.value || ""}
            onChange={(event) =>
              updateValue(index, "value", event.target.value)
            }
          />
          <input
            style={inputStyle}
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
          <button type="button" style={deleteButtonStyle} disabled>
            ×
          </button>
        </div>
      ))}
    </>
  );
}

function TabsOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <div style={infoBoxStyle}>
        <strong>ⓘ</strong>
        <span>
          Tabs converts each top level option into a tab. To add multiple
          options inside a tab, group them using an{" "}
          <strong>Option Group.</strong>
        </span>
        <span>×</span>
      </div>

      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${field.id}-name`}>
          <input
            id={`${field.id}-name`}
            style={inputStyle}
            value={field.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <p style={helpTextStyle}>Name of the tabs</p>
        </Field>

        <Field label="Tabs layout" htmlFor={`${field.id}-layout`}>
          <select
            id={`${field.id}-layout`}
            style={inputStyle}
            value={field.config?.layout || "tabs"}
            onChange={(event) => updateConfig({ layout: event.target.value })}
          >
            <option value="tabs">tabs</option>
            <option value="accordion">accordion</option>
            <option value="buttons">buttons</option>
          </select>
          <p style={helpTextStyle}>Display layout of the tabs</p>
        </Field>
      </div>
    </>
  );
}

function QuantityOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <CommonNameLabel
        field={field}
        onChange={onChange}
        includeRequired={false}
      />

      <Field label="Value" htmlFor={`${field.id}-value`}>
        <input
          id={`${field.id}-value`}
          style={inputStyle}
          value={field.config?.value || ""}
          onChange={(event) => updateConfig({ value: event.target.value })}
        />
        <p style={helpTextStyle}>Initial quantity</p>
      </Field>

      <div style={gridStyle}>
        <Field label="Min" htmlFor={`${field.id}-min`}>
          <input
            id={`${field.id}-min`}
            type="number"
            style={inputStyle}
            value={field.config?.min || ""}
            onChange={(event) => updateConfig({ min: event.target.value })}
            placeholder="–"
          />
          <p style={helpTextStyle}>Minimum quantity</p>
        </Field>

        <Field label="Max" htmlFor={`${field.id}-max`}>
          <input
            id={`${field.id}-max`}
            type="number"
            style={inputStyle}
            value={field.config?.max || ""}
            onChange={(event) => updateConfig({ max: event.target.value })}
            placeholder="–"
          />
          <p style={helpTextStyle}>Maximum quantity</p>
        </Field>
      </div>
    </>
  );
}

function QuantityDiscountOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <CommonNameLabel
        field={field}
        onChange={onChange}
        includeRequired={false}
      />

      <div style={valuesToolbarStyle}>
        <p style={sectionLabelStyle}>Discounts</p>
        <div style={valuesToolbarRightStyle}>
          <span>Sort ↕</span>
        </div>
      </div>

      <QuantityDiscountEditor
        rows={field.config?.rows || []}
        onUpdate={(rows) => updateConfig({ rows })}
      />

      <Field label="Discount group" htmlFor={`${field.id}-discount-group`}>
        <input
          id={`${field.id}-discount-group`}
          style={inputStyle}
          value={field.config?.discountGroup || ""}
          onChange={(event) =>
            updateConfig({ discountGroup: event.target.value })
          }
          placeholder="Config name"
        />
        <p style={helpTextStyle}>
          Name that is used to calculate the total discount quantity for all
          products in the cart with the same group (optional)
        </p>
      </Field>
    </>
  );
}

function UploadOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />

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
          value={field.config?.buttonText || "Choose file"}
          onChange={(event) => updateConfig({ buttonText: event.target.value })}
        />
      </Field>

      <div style={gridStyle}>
        <Field label="Max allowed file size" htmlFor={`${field.id}-max-size`}>
          <div style={unitInputWrapStyle}>
            <span style={unitSideStyle}>−</span>
            <input
              id={`${field.id}-max-size`}
              type="number"
              style={unitInputStyle}
              value={field.config?.maxFileSize ?? 10}
              onChange={(event) =>
                updateConfig({ maxFileSize: Number(event.target.value) })
              }
            />
            <span style={unitSideStyle}>MB +</span>
          </div>
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
            <option value=".jpg,.jpeg,.png,.webp,.svg">
              JPG, PNG, WEBP, SVG
            </option>
          </select>
        </Field>
      </div>

      <div style={blueNoticeStyle}>
        <span>ⓘ</span>
        <span>
          For large file uploads with support for multiple files and image
          editing you can use the <strong>Upload-Lift</strong> option type.
        </span>
        <button type="button" style={noticeCloseStyle}>
          ×
        </button>
      </div>
    </>
  );
}

function DateOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />

      <Field label="Date format" htmlFor={`${field.id}-date-format`}>
        <div style={dateFormatWrapStyle}>
          <input
            id={`${field.id}-date-format`}
            style={dateFormatInputStyle}
            value={field.config?.dateFormat || "yyyy-mm-dd"}
            onChange={(event) =>
              updateConfig({ dateFormat: event.target.value })
            }
            placeholder="yyyy-mm-dd"
          />
          <select
            style={dateFormatSelectStyle}
            value={field.config?.dateFormatPreset || ""}
            onChange={(event) => {
              const value = event.target.value;
              updateConfig({
                dateFormatPreset: value,
                dateFormat: value || field.config?.dateFormat || "yyyy-mm-dd",
              });
            }}
          >
            <option value="">Select format</option>
            <option value="yyyy-mm-dd">yyyy-mm-dd</option>
            <option value="mm/dd/yyyy">mm/dd/yyyy</option>
            <option value="dd/mm/yyyy">dd/mm/yyyy</option>
          </select>
        </div>
        <p style={helpTextStyle}>
          Date format in which the value will be stored on the order.
        </p>
      </Field>

      <div style={gridStyle}>
        <Field label="Min date" htmlFor={`${field.id}-min-date`}>
          <div style={calendarInputWrapStyle}>
            <input
              id={`${field.id}-min-date`}
              type="text"
              style={calendarInputStyle}
              value={field.config?.minDate || ""}
              onChange={(event) =>
                updateConfig({ minDate: event.target.value })
              }
            />
            <span style={calendarIconStyle}>▦</span>
          </div>
          <p style={helpTextStyle}>Minimum valid date</p>
        </Field>

        <Field label="Max date" htmlFor={`${field.id}-max-date`}>
          <div style={calendarInputWrapStyle}>
            <input
              id={`${field.id}-max-date`}
              type="text"
              style={calendarInputStyle}
              value={field.config?.maxDate || ""}
              onChange={(event) =>
                updateConfig({ maxDate: event.target.value })
              }
            />
            <span style={calendarIconStyle}>▦</span>
          </div>
          <p style={helpTextStyle}>Maximum valid date</p>
        </Field>
      </div>
    </>
  );
}

function DimensionOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />

      <div style={gridStyle}>
        <Field label="Label X" htmlFor={`${field.id}-label-x`}>
          <input
            id={`${field.id}-label-x`}
            style={inputStyle}
            value={field.config?.labelX || "Width:"}
            onChange={(event) => updateConfig({ labelX: event.target.value })}
          />
          <p style={helpTextStyle}>Label above X dimension</p>
        </Field>
        <Field label="Label Y" htmlFor={`${field.id}-label-y`}>
          <input
            id={`${field.id}-label-y`}
            style={inputStyle}
            value={field.config?.labelY || "Height:"}
            onChange={(event) => updateConfig({ labelY: event.target.value })}
          />
          <p style={helpTextStyle}>Label above Y dimension</p>
        </Field>
        <Field label="Addon X" htmlFor={`${field.id}-addon-x`}>
          <input
            id={`${field.id}-addon-x`}
            style={inputStyle}
            value={field.config?.addonX || ""}
            onChange={(event) => updateConfig({ addonX: event.target.value })}
          />
          <p style={helpTextStyle}>Addon text on X input</p>
        </Field>
        <Field label="Addon Y" htmlFor={`${field.id}-addon-y`}>
          <input
            id={`${field.id}-addon-y`}
            style={inputStyle}
            value={field.config?.addonY || ""}
            onChange={(event) => updateConfig({ addonY: event.target.value })}
          />
          <p style={helpTextStyle}>Addon text on Y input</p>
        </Field>
        <Field label="Value X" htmlFor={`${field.id}-value-x`}>
          <input
            id={`${field.id}-value-x`}
            style={inputStyle}
            value={field.config?.valueX || ""}
            onChange={(event) => updateConfig({ valueX: event.target.value })}
          />
          <p style={helpTextStyle}>Initial value of X</p>
        </Field>
        <Field label="Value Y" htmlFor={`${field.id}-value-y`}>
          <input
            id={`${field.id}-value-y`}
            style={inputStyle}
            value={field.config?.valueY || ""}
            onChange={(event) => updateConfig({ valueY: event.target.value })}
          />
          <p style={helpTextStyle}>Initial value of Y</p>
        </Field>
      </div>

      <Field label="Rounding" htmlFor={`${field.id}-rounding`}>
        <div style={unitInputWrapStyle}>
          <span style={unitSideStyle}>−</span>
          <input
            id={`${field.id}-rounding`}
            type="number"
            style={unitInputStyle}
            value={field.config?.rounding || ""}
            onChange={(event) => updateConfig({ rounding: event.target.value })}
          />
          <span style={unitSideStyle}>+</span>
        </div>
        <p style={helpTextStyle}>Optional rounding to number of decimals</p>
      </Field>

      <Check
        label="Step buttons (-/+)"
        checked={field.config?.stepButtons || false}
        onChange={(checked) => updateConfig({ stepButtons: checked })}
      />
      <p style={helpTextStyle}>
        Show custom buttons to increase/decrease the number
      </p>

      <div style={greenNoticeStyle}>
        <span>✓</span>
        <span>
          To calculate the price based on the dimension size you can use a{" "}
          <strong>Price formula</strong> or a <strong>Price List</strong>.
        </span>
        <button type="button" style={noticeCloseStyle}>
          ×
        </button>
      </div>
    </>
  );
}

function ImageLibraryOptionEditor({ field, onChange, updateConfig }) {
  const categories = field.config?.categories ||
    field.config?.values || [{ value: "", text: "", image: "", list: "" }];

  const updateCategory = (index, key, value) => {
    const nextCategories = [...categories];
    nextCategories[index] = { ...nextCategories[index], [key]: value };
    updateConfig({ categories: nextCategories, values: nextCategories });
  };

  const addCategory = () => {
    const nextCategories = [
      ...categories,
      { value: "", text: "", image: "", list: "" },
    ];
    updateConfig({ categories: nextCategories, values: nextCategories });
  };

  const removeCategory = (index) => {
    const nextCategories = categories.filter(
      (_, categoryIndex) => categoryIndex !== index,
    );
    updateConfig({ categories: nextCategories, values: nextCategories });
  };

  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />

      <div style={gridStyle}>
        <Check
          label="Popup window"
          checked={field.config?.popupWindow || false}
          onChange={(checked) => updateConfig({ popupWindow: checked })}
        />
        <Check
          label="Category grid"
          checked={field.config?.categoryGrid || false}
          onChange={(checked) => updateConfig({ categoryGrid: checked })}
        />
      </div>

      <div style={gridStyle}>
        <Field label="Library Columns" htmlFor={`${field.id}-columns`}>
          <div style={unitInputWrapStyle}>
            <span style={unitSideStyle}>−</span>
            <input
              id={`${field.id}-columns`}
              type="number"
              style={unitInputStyle}
              value={field.config?.columns ?? 4}
              onChange={(event) =>
                updateConfig({ columns: Number(event.target.value) })
              }
            />
            <span style={unitSideStyle}>+</span>
          </div>
        </Field>
        <Field
          label="Library Columns (Mobile)"
          htmlFor={`${field.id}-columns-mobile`}
        >
          <div style={unitInputWrapStyle}>
            <span style={unitSideStyle}>−</span>
            <input
              id={`${field.id}-columns-mobile`}
              type="number"
              style={unitInputStyle}
              value={field.config?.columnsMobile ?? 2}
              onChange={(event) =>
                updateConfig({ columnsMobile: Number(event.target.value) })
              }
            />
            <span style={unitSideStyle}>+</span>
          </div>
        </Field>
        <Field label="Images height" htmlFor={`${field.id}-image-height`}>
          <div style={unitInputWrapStyle}>
            <input
              id={`${field.id}-image-height`}
              type="number"
              style={unitInputStyle}
              value={field.config?.imageHeight ?? 150}
              onChange={(event) =>
                updateConfig({ imageHeight: Number(event.target.value) })
              }
            />
            <span style={unitSideStyle}>px</span>
          </div>
        </Field>
        <Field label="Images per page" htmlFor={`${field.id}-images-page`}>
          <div style={unitInputWrapStyle}>
            <input
              id={`${field.id}-images-page`}
              type="number"
              style={unitInputStyle}
              value={field.config?.imagesPerPage ?? 20}
              onChange={(event) =>
                updateConfig({ imagesPerPage: Number(event.target.value) })
              }
            />
            <span style={unitSideStyle}>+</span>
          </div>
        </Field>
      </div>

      <p style={sectionLabelStyle}>Categories</p>
      <div style={imageLibraryHeaderStyle}>
        <div>Image</div>
        <div>Value</div>
        <div>Text</div>
        <div>List</div>
        <div />
      </div>
      {categories.map((item, index) => (
        <div key={index} style={imageLibraryRowStyle}>
          <div style={imageCellStyle}>
            <span>▧</span>
            <button type="button" style={smallDarkButtonStyle}>
              Upload
            </button>
          </div>
          <input
            style={inputStyle}
            placeholder="value (required)"
            value={item.value || ""}
            onChange={(event) =>
              updateCategory(index, "value", event.target.value)
            }
          />
          <input
            style={inputStyle}
            placeholder="text (optional)"
            value={item.text || ""}
            onChange={(event) =>
              updateCategory(index, "text", event.target.value)
            }
          />
          <button type="button" style={listButtonStyle}>
            ☷ Link list
          </button>
          <button
            type="button"
            style={deleteButtonStyle}
            onClick={() => removeCategory(index)}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        style={addDiscountButtonStyle}
        onClick={addCategory}
      >
        + Add category
      </button>

      <div style={blueNoticeStyle}>
        <span>ⓘ</span>
        <span>
          For a live preview of the selected image, link to layer of type{" "}
          <strong>Upload</strong>. Learn more
        </span>
        <button type="button" style={noticeCloseStyle}>
          ×
        </button>
      </div>
    </>
  );
}

function PriceGroupEditor({ field, onChange, updateConfig }) {
  const options = field.config?.options || [];

  const updatePriceOption = (index, updates) => {
    const nextOptions = [...options];
    nextOptions[index] = { ...nextOptions[index], ...updates };
    updateConfig({ options: nextOptions });
  };

  const addPriceOption = () => {
    updateConfig({
      options: [
        ...options,
        {
          name: `price_${options.length + 1}`,
          label: "Price",
          type: "quantity_discount",
          visible: true,
          open: true,
          discountGroup: "price",
          rows: [{ quantity: 10, discount: 0 }],
          conditionsOpen: false,
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
        <div>Sort</div>
        <div />
      </div>

      {options.map((item, index) => (
        <div key={`${item.name}-${index}`} style={priceOptionWrapStyle}>
          <div style={priceOptionHeaderStyle}>
            <button
              type="button"
              style={priceOptionTitleStyle}
              onClick={() => updatePriceOption(index, { open: !item.open })}
            >
              <span style={radioIconStyle}>◉</span>
              <span style={percentIconStyle}>%</span>
              <strong>{item.name}</strong>
            </button>

            <div style={priceOptionActionsStyle}>
              <button
                type="button"
                style={iconButtonStyle}
                onClick={() =>
                  updatePriceOption(index, { visible: !item.visible })
                }
              >
                {item.visible ? "◉" : "◌"}
              </button>
              <button
                type="button"
                style={iconButtonStyle}
                onClick={() => {
                  const nextOptions = [...options];
                  nextOptions.splice(index + 1, 0, {
                    ...item,
                    name: `${item.name}_copy`,
                    open: true,
                    rows: cloneConfig(item.rows || []),
                  });
                  updateConfig({ options: nextOptions });
                }}
              >
                ⧉
              </button>
              <button
                type="button"
                style={deleteHeaderButtonStyle}
                onClick={() => removePriceOption(index)}
              >
                ×
              </button>
            </div>
          </div>

          {item.open ? (
            <PriceQuantityDiscountOption
              option={item}
              onChange={(updates) => updatePriceOption(index, updates)}
            />
          ) : null}
        </div>
      ))}

      <button type="button" style={darkAddButtonStyle} onClick={addPriceOption}>
        + Add option
      </button>
    </>
  );
}

function PriceQuantityDiscountOption({ option, onChange }) {
  return (
    <div style={priceOptionBodyStyle}>
      <Field label="Type" htmlFor={`${option.name}-type`}>
        <select
          id={`${option.name}-type`}
          style={inputStyle}
          value={option.type || "quantity_discount"}
          onChange={(event) => onChange({ type: event.target.value })}
        >
          <option value="quantity_discount">Quantity discount</option>
          <option value="fixed_price">Fixed price</option>
          <option value="percentage_discount">Percentage discount</option>
        </select>
      </Field>

      <div style={gridStyle}>
        <Field label="Name" htmlFor={`${option.name}-name`}>
          <input
            id={`${option.name}-name`}
            style={inputStyle}
            value={option.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

        <Field label="Label" htmlFor={`${option.name}-label`}>
          <input
            id={`${option.name}-label`}
            style={inputStyle}
            value={option.label || ""}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Field>
      </div>

      <p style={sectionLabelStyle}>Discounts</p>
      <QuantityDiscountEditor
        rows={option.rows || []}
        onUpdate={(rows) => onChange({ rows })}
      />

      <Field label="Discount group" htmlFor={`${option.name}-discount-group`}>
        <input
          id={`${option.name}-discount-group`}
          style={inputStyle}
          value={option.discountGroup || "price"}
          onChange={(event) => onChange({ discountGroup: event.target.value })}
        />
      </Field>
    </div>
  );
}

function NumberOptionEditor({ field, onChange, updateConfig }) {
  return (
    <>
      <CommonNameLabel field={field} onChange={onChange} />
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
      <Check
        label="Step buttons (-/+)"
        checked={field.config?.stepButtons || false}
        onChange={(checked) => updateConfig({ stepButtons: checked })}
      />
      <p style={helpTextStyle}>
        Show custom buttons to increase/decrease the number
      </p>
    </>
  );
}

function QuantityDiscountEditor({ rows, onUpdate }) {
  const updateRow = (index, key, value) => {
    const nextRows = [...rows];
    nextRows[index] = { ...nextRows[index], [key]: value };
    onUpdate(nextRows);
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
              onClick={() =>
                onUpdate(rows.filter((_, rowIndex) => rowIndex !== index))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        style={addDiscountButtonStyle}
        onClick={() => onUpdate([...rows, { quantity: 10, discount: 0 }])}
      >
        + Add discount
      </button>
    </div>
  );
}

function AdvancedOptionEditor({ field, updateConfig }) {
  const type = normalizeType(field.type);
  const advanced = field.config?.advanced || {};
  const updateAdvanced = (updates) =>
    updateConfig({ advanced: { ...advanced, ...updates } });

  if (type === "tabs") {
    return (
      <>
        <Check
          label="Tabs navigation"
          checked={advanced.tabsNavigation || false}
          onChange={(checked) => updateAdvanced({ tabsNavigation: checked })}
        />
        <p style={helpTextStyle}>
          Adds previous/next buttons to navigate between tabs
        </p>

        <Check
          label="Tabs validation"
          checked={advanced.tabsValidation || false}
          onChange={(checked) => updateAdvanced({ tabsValidation: checked })}
        />
        <p style={helpTextStyle}>
          Validate each tab before allowing to proceed to the next tab
        </p>
      </>
    );
  }

  if (type === "quantity") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />

        <Field label="Step" htmlFor={`${field.id}-step`}>
          <input
            id={`${field.id}-step`}
            type="number"
            style={inputStyle}
            value={advanced.step || ""}
            onChange={(event) => updateAdvanced({ step: event.target.value })}
            placeholder="–"
          />
          <p style={helpTextStyle}>Increment/decrement step</p>
        </Field>
      </>
    );
  }

  if (type === "quantity_discount") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />

        <div style={gridStyle}>
          <Field label="Buy text" htmlFor={`${field.id}-buy-text`}>
            <input
              id={`${field.id}-buy-text`}
              style={inputStyle}
              value={advanced.buyText || "Buy:"}
              onChange={(event) =>
                updateAdvanced({ buyText: event.target.value })
              }
            />
          </Field>

          <Field label="Save text" htmlFor={`${field.id}-save-text`}>
            <input
              id={`${field.id}-save-text`}
              style={inputStyle}
              value={advanced.saveText || "Save:"}
              onChange={(event) =>
                updateAdvanced({ saveText: event.target.value })
              }
            />
          </Field>
        </div>

        <Field
          label="Discount template"
          htmlFor={`${field.id}-discount-template`}
        >
          <input
            id={`${field.id}-discount-template`}
            style={inputStyle}
            value={advanced.discountTemplate || "{price} {compare} {discount}"}
            onChange={(event) =>
              updateAdvanced({ discountTemplate: event.target.value })
            }
          />
          <p style={helpTextStyle}>
            Template for the shown text on the option. Available placeholders:
            {" {price} {priceP} {compare} {compareP} {discount} {discountP}"}
          </p>
        </Field>

        <Field label="Discount Text" htmlFor={`${field.id}-discount-text`}>
          <input
            id={`${field.id}-discount-text`}
            style={inputStyle}
            value={advanced.discountText || "QUANTITY_"}
            onChange={(event) =>
              updateAdvanced({ discountText: event.target.value })
            }
          />
          <p style={helpTextStyle}>Discount text displayed on the checkout</p>
        </Field>

        <Field label="Initial quantity" htmlFor={`${field.id}-initial-qty`}>
          <input
            id={`${field.id}-initial-qty`}
            type="number"
            style={inputStyle}
            value={advanced.initialQuantity || ""}
            onChange={(event) =>
              updateAdvanced({ initialQuantity: event.target.value })
            }
            placeholder="–"
          />
          <p style={helpTextStyle}>
            Pre-select a quantity. Note: If not working on your theme, remove
            the quantity selector from the theme.
          </p>
        </Field>

        <Field label="Quantity option" htmlFor={`${field.id}-quantity-option`}>
          <select
            id={`${field.id}-quantity-option`}
            style={inputStyle}
            value={advanced.quantityOption || ""}
            onChange={(event) =>
              updateAdvanced({ quantityOption: event.target.value })
            }
          >
            <option value="">Select quantity option</option>
            <option value="quantity">quantity</option>
          </select>
          <p style={helpTextStyle}>
            Connect to another product option to multiply with quantity
          </p>
        </Field>

        <Field label="Quantity Unit" htmlFor={`${field.id}-quantity-unit`}>
          <input
            id={`${field.id}-quantity-unit`}
            style={inputStyle}
            value={advanced.quantityUnit || ""}
            onChange={(event) =>
              updateAdvanced({ quantityUnit: event.target.value })
            }
          />
          <p style={helpTextStyle}>The unit of the quantity (e.g m2, kg, m).</p>
        </Field>
      </>
    );
  }

  if (type === "html") {
    return (
      <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />
    );
  }

  if (type === "personalize") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />
        <ChoiceAdvancedSettings
          advanced={advanced}
          updateAdvanced={updateAdvanced}
          showSwatches
        />
      </>
    );
  }

  if (type === "date") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />

        <div style={gridStyle}>
          <Field label="Min days" htmlFor={`${field.id}-min-days`}>
            <input
              id={`${field.id}-min-days`}
              type="number"
              style={inputStyle}
              value={advanced.minDays || ""}
              onChange={(event) =>
                updateAdvanced({ minDays: event.target.value })
              }
              placeholder="–"
            />
            <p style={helpTextStyle}>
              Set min date X days from today (0=today)
            </p>
          </Field>

          <Field label="Max days" htmlFor={`${field.id}-max-days`}>
            <input
              id={`${field.id}-max-days`}
              type="number"
              style={inputStyle}
              value={advanced.maxDays || ""}
              onChange={(event) =>
                updateAdvanced({ maxDays: event.target.value })
              }
              placeholder="–"
            />
            <p style={helpTextStyle}>
              Set max date X days from today (0=today)
            </p>
          </Field>
        </div>

        <Field label="Connect date option" htmlFor={`${field.id}-connect-date`}>
          <select
            id={`${field.id}-connect-date`}
            style={inputStyle}
            value={advanced.connectDateOption || ""}
            onChange={(event) =>
              updateAdvanced({ connectDateOption: event.target.value })
            }
          >
            <option value="">Select option</option>
          </select>
          <p style={helpTextStyle}>
            Update min/max days based on this option instead of today
          </p>
        </Field>
      </>
    );
  }

  if (type === "dimension") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />

        <div style={gridStyle}>
          <Field label="Min X" htmlFor={`${field.id}-min-x`}>
            <input
              id={`${field.id}-min-x`}
              style={inputStyle}
              value={advanced.minX || ""}
              onChange={(event) => updateAdvanced({ minX: event.target.value })}
            />
            <p style={helpTextStyle}>Minimum valid value of X</p>
          </Field>

          <Field label="Min Y" htmlFor={`${field.id}-min-y`}>
            <input
              id={`${field.id}-min-y`}
              style={inputStyle}
              value={advanced.minY || ""}
              onChange={(event) => updateAdvanced({ minY: event.target.value })}
            />
            <p style={helpTextStyle}>Minimum valid value of Y</p>
          </Field>

          <Field
            label="Min X validation message"
            htmlFor={`${field.id}-min-x-message`}
          >
            <input
              id={`${field.id}-min-x-message`}
              style={inputStyle}
              value={
                advanced.minXMessage || "{label} must be at least {min} {addon}"
              }
              onChange={(event) =>
                updateAdvanced({ minXMessage: event.target.value })
              }
            />
          </Field>

          <Field
            label="Min Y validation message"
            htmlFor={`${field.id}-min-y-message`}
          >
            <input
              id={`${field.id}-min-y-message`}
              style={inputStyle}
              value={
                advanced.minYMessage || "{label} must be at least {min} {addon}"
              }
              onChange={(event) =>
                updateAdvanced({ minYMessage: event.target.value })
              }
            />
          </Field>

          <Field label="Max X" htmlFor={`${field.id}-max-x`}>
            <input
              id={`${field.id}-max-x`}
              style={inputStyle}
              value={advanced.maxX || ""}
              onChange={(event) => updateAdvanced({ maxX: event.target.value })}
            />
            <p style={helpTextStyle}>Maximum valid value of X</p>
          </Field>

          <Field label="Max Y" htmlFor={`${field.id}-max-y`}>
            <input
              id={`${field.id}-max-y`}
              style={inputStyle}
              value={advanced.maxY || ""}
              onChange={(event) => updateAdvanced({ maxY: event.target.value })}
            />
            <p style={helpTextStyle}>Maximum valid value of Y</p>
          </Field>

          <Field
            label="Max X validation message"
            htmlFor={`${field.id}-max-x-message`}
          >
            <input
              id={`${field.id}-max-x-message`}
              style={inputStyle}
              value={
                advanced.maxXMessage || "{label} must be at most {max} {addon}"
              }
              onChange={(event) =>
                updateAdvanced({ maxXMessage: event.target.value })
              }
            />
          </Field>

          <Field
            label="Max Y validation message"
            htmlFor={`${field.id}-max-y-message`}
          >
            <input
              id={`${field.id}-max-y-message`}
              style={inputStyle}
              value={
                advanced.maxYMessage || "{label} must be at most {max} {addon}"
              }
              onChange={(event) =>
                updateAdvanced({ maxYMessage: event.target.value })
              }
            />
          </Field>
        </div>

        <div style={gridStyle}>
          <Check
            label="X always bigger"
            checked={advanced.xAlwaysBigger || false}
            onChange={(checked) => updateAdvanced({ xAlwaysBigger: checked })}
          />
          <Check
            label="X single input"
            checked={advanced.xSingleInput || false}
            onChange={(checked) => updateAdvanced({ xSingleInput: checked })}
          />
        </div>

        <Field label="Aspect Ratio" htmlFor={`${field.id}-aspect-ratio`}>
          <input
            id={`${field.id}-aspect-ratio`}
            style={inputStyle}
            value={advanced.aspectRatio || ""}
            onChange={(event) =>
              updateAdvanced({ aspectRatio: event.target.value })
            }
          />
          <p style={helpTextStyle}>Lock the aspect ratio of the dimension.</p>
        </Field>

        <Field label="Text template" htmlFor={`${field.id}-text-template`}>
          <input
            id={`${field.id}-text-template`}
            style={inputStyle}
            value={advanced.textTemplate || "{x}x{y}"}
            onChange={(event) =>
              updateAdvanced({ textTemplate: event.target.value })
            }
          />
          <p style={helpTextStyle}>
            Template for the saved text on the option. Available placeholders:
            {" {x} {y} {area}"}
          </p>
        </Field>

        <Field label="Area calculation" htmlFor={`${field.id}-area-calc`}>
          <input
            id={`${field.id}-area-calc`}
            style={inputStyle}
            value={advanced.areaCalculation || "x*y"}
            onChange={(event) =>
              updateAdvanced({ areaCalculation: event.target.value })
            }
          />
          <p style={helpTextStyle}>Calculation used for the area value.</p>
        </Field>

        <Check
          label="Show selection on label"
          checked={advanced.showSelectionOnLabel || false}
          onChange={(checked) =>
            updateAdvanced({ showSelectionOnLabel: checked })
          }
        />

        <div style={successInfoBoxStyle}>
          ✓ To calculate the price based on the dimension size you can use a
          Price formula or a Price List.
        </div>
      </>
    );
  }

  if (type === "upload" || type === "upload_lift") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />

        <div style={gridStyle}>
          <Field label="Upload price" htmlFor={`${field.id}-upload-price-type`}>
            <select
              id={`${field.id}-upload-price-type`}
              style={inputStyle}
              value={advanced.uploadPriceType || "per_upload"}
              onChange={(event) =>
                updateAdvanced({ uploadPriceType: event.target.value })
              }
            >
              <option value="per_upload">Per upload</option>
              <option value="one_time">One time</option>
            </select>
          </Field>

          <Field label="Price" htmlFor={`${field.id}-upload-price`}>
            <input
              id={`${field.id}-upload-price`}
              type="number"
              style={inputStyle}
              value={advanced.uploadPrice || 0}
              onChange={(event) =>
                updateAdvanced({ uploadPrice: Number(event.target.value) })
              }
            />
          </Field>
        </div>

        <div style={gridStyle}>
          <Check
            label="Show price on label"
            checked={advanced.showPriceOnLabel || false}
            onChange={(checked) =>
              updateAdvanced({ showPriceOnLabel: checked })
            }
          />

          <Field label="Price add-on text" htmlFor={`${field.id}-price-text`}>
            <input
              id={`${field.id}-price-text`}
              style={inputStyle}
              value={advanced.priceText || "+({price})"}
              onChange={(event) =>
                updateAdvanced({ priceText: event.target.value })
              }
            />
          </Field>
        </div>

        <Field
          label="Connect dimension option"
          htmlFor={`${field.id}-connect-dimension`}
        >
          <select
            id={`${field.id}-connect-dimension`}
            style={inputStyle}
            value={advanced.connectDimensionOption || ""}
            onChange={(event) =>
              updateAdvanced({ connectDimensionOption: event.target.value })
            }
          >
            <option value="">Select dimension option</option>
          </select>
          <p style={helpTextStyle}>
            Connect to product option of type "Dimension"
          </p>
        </Field>

        <Check
          label="Dimension update"
          checked={advanced.dimensionUpdate || false}
          onChange={(checked) => updateAdvanced({ dimensionUpdate: checked })}
        />
        <p style={helpTextStyle}>
          Update dimension based on upload image dimensions
        </p>

        <Check
          label="Dimension crop"
          checked={advanced.dimensionCrop || false}
          onChange={(checked) => updateAdvanced({ dimensionCrop: checked })}
        />
        <p style={helpTextStyle}>Update crop box based on entered dimensions</p>

        <div style={infoBoxStyle}>
          ⓘ For large file uploads with support for multiple files and image
          editing you can use the <strong>Upload-Lift</strong> option type.
        </div>
      </>
    );
  }

  if (type === "image_library") {
    return (
      <>
        <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />
        <ChoiceAdvancedSettings
          advanced={advanced}
          updateAdvanced={updateAdvanced}
        />

        <Field
          label="Connect Upload-Lift option"
          htmlFor={`${field.id}-connect-upload-lift`}
        >
          <select
            id={`${field.id}-connect-upload-lift`}
            style={inputStyle}
            value={advanced.connectUploadLift || ""}
            onChange={(event) =>
              updateAdvanced({ connectUploadLift: event.target.value })
            }
          >
            <option value="">Select Upload-Lift option</option>
          </select>
          <p style={helpTextStyle}>
            Uploads selected image to the Upload-Lift option (allows for image
            editing)
          </p>
        </Field>

        <div style={infoBoxStyle}>
          ⓘ For a live preview of the selected image, link to layer of type
          <strong> Upload</strong>. Learn more
        </div>
      </>
    );
  }

  const isChoice = [
    "radio",
    "select",
    "dropdown",
    "font_select",
    "image_swatches",
    "button_swatches",
    "color_swatches",
    "color_image_swatches",
    "checkbox",
  ].includes(type);

  const isSwatch = [
    "image_swatches",
    "button_swatches",
    "color_swatches",
    "color_image_swatches",
  ].includes(type);

  const isText = ["text", "multi_line", "number"].includes(type);

  return (
    <>
      <AdvancedInfoHelp advanced={advanced} updateAdvanced={updateAdvanced} />

      {isChoice ? (
        <ChoiceAdvancedSettings
          advanced={advanced}
          updateAdvanced={updateAdvanced}
          showSwatches={isSwatch}
          showMinMax={type === "checkbox"}
          showSearch={type === "dropdown"}
        />
      ) : null}

      {isText ? (
        <TextAdvancedSettings
          type={type}
          advanced={advanced}
          updateAdvanced={updateAdvanced}
          field={field}
        />
      ) : null}

      <div style={gridStyle}>
        <Field label="CSS class" htmlFor={`${field.id}-css-class`}>
          <input
            id={`${field.id}-css-class`}
            style={inputStyle}
            value={advanced.cssClass || ""}
            onChange={(event) =>
              updateAdvanced({ cssClass: event.target.value })
            }
          />
        </Field>
        <Field label="Wrapper CSS class" htmlFor={`${field.id}-wrapper-class`}>
          <input
            id={`${field.id}-wrapper-class`}
            style={inputStyle}
            value={advanced.wrapperClass || ""}
            onChange={(event) =>
              updateAdvanced({ wrapperClass: event.target.value })
            }
          />
        </Field>
      </div>

      <Check
        label="Hidden on storefront"
        checked={advanced.hidden || false}
        onChange={(checked) => updateAdvanced({ hidden: checked })}
      />
      <Check
        label="Disabled"
        checked={advanced.disabled || false}
        onChange={(checked) => updateAdvanced({ disabled: checked })}
      />
    </>
  );
}

function AdvancedInfoHelp({ advanced, updateAdvanced }) {
  return (
    <div style={gridStyle}>
      <Field label="Info" htmlFor="advanced-info">
        <input
          id="advanced-info"
          style={inputStyle}
          value={advanced.info || ""}
          onChange={(event) => updateAdvanced({ info: event.target.value })}
        />
        <p style={helpTextStyle}>Info icon tooltip text (HTML supported)</p>
      </Field>

      <Field label="Help" htmlFor="advanced-help">
        <input
          id="advanced-help"
          style={inputStyle}
          value={advanced.help || ""}
          onChange={(event) => updateAdvanced({ help: event.target.value })}
        />
        <p style={helpTextStyle}>Help text below the option (HTML supported)</p>
      </Field>
    </div>
  );
}

function ChoiceAdvancedSettings({
  advanced,
  updateAdvanced,
  showSwatches = false,
  showMinMax = false,
  showSearch = false,
}) {
  return (
    <>
      <div style={gridStyle}>
        <Check
          label="Show price on option"
          checked={advanced.showPriceOnOption ?? true}
          onChange={(checked) => updateAdvanced({ showPriceOnOption: checked })}
        />
        <Check
          label="Show price on label"
          checked={advanced.showPriceOnLabel || false}
          onChange={(checked) => updateAdvanced({ showPriceOnLabel: checked })}
        />
        <Check
          label="Show selection on label"
          checked={advanced.showSelectionOnLabel || false}
          onChange={(checked) =>
            updateAdvanced({ showSelectionOnLabel: checked })
          }
        />
      </div>

      <Field label="Price add-on text" htmlFor="choice-price-text">
        <input
          id="choice-price-text"
          style={inputStyle}
          value={advanced.priceText || "+({price})"}
          onChange={(event) =>
            updateAdvanced({ priceText: event.target.value })
          }
        />
        <p style={helpTextStyle}>
          Price add-on text. Available placeholders: {"{price}"}
        </p>
      </Field>

      {showMinMax ? (
        <div style={gridStyle}>
          <Field label="Min select" htmlFor="min-select">
            <input
              id="min-select"
              type="number"
              style={inputStyle}
              value={advanced.minSelect || ""}
              onChange={(event) =>
                updateAdvanced({ minSelect: event.target.value })
              }
              placeholder="–"
            />
            <p style={helpTextStyle}>
              Min number of options that have to be selected
            </p>
          </Field>
          <Field label="Max select" htmlFor="max-select">
            <input
              id="max-select"
              type="number"
              style={inputStyle}
              value={advanced.maxSelect || ""}
              onChange={(event) =>
                updateAdvanced({ maxSelect: event.target.value })
              }
              placeholder="–"
            />
            <p style={helpTextStyle}>
              Max number of options that may be selected
            </p>
          </Field>
        </div>
      ) : null}

      {showSwatches ? (
        <>
          <div style={gridStyle}>
            <Field label="Swatch size" htmlFor="swatch-size">
              <select
                id="swatch-size"
                style={inputStyle}
                value={advanced.swatchSize || ""}
                onChange={(event) =>
                  updateAdvanced({ swatchSize: event.target.value })
                }
              >
                <option value="">-</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </Field>
            <Field label="Swatch shape" htmlFor="swatch-shape">
              <select
                id="swatch-shape"
                style={inputStyle}
                value={advanced.swatchShape || ""}
                onChange={(event) =>
                  updateAdvanced({ swatchShape: event.target.value })
                }
              >
                <option value="">-</option>
                <option value="square">Square</option>
                <option value="round">Round</option>
              </select>
            </Field>
            <Field label="Swatch items (per row)" htmlFor="swatch-items">
              <input
                id="swatch-items"
                type="number"
                style={inputStyle}
                value={advanced.swatchItems || ""}
                onChange={(event) =>
                  updateAdvanced({ swatchItems: event.target.value })
                }
              />
            </Field>
            <Check
              label="Swatch grow"
              checked={advanced.swatchGrow || false}
              onChange={(checked) => updateAdvanced({ swatchGrow: checked })}
            />
          </div>

          <div style={gridStyle}>
            <Check
              label="Swatch toggle"
              checked={advanced.swatchToggle || false}
              onChange={(checked) => updateAdvanced({ swatchToggle: checked })}
            />
            <Check
              label="Swatch multi select"
              checked={advanced.swatchMultiSelect || false}
              onChange={(checked) =>
                updateAdvanced({ swatchMultiSelect: checked })
              }
            />
          </div>
        </>
      ) : null}

      <Field label="Text group split" htmlFor="text-group-split">
        <input
          id="text-group-split"
          style={inputStyle}
          value={advanced.textGroupSplit || ""}
          onChange={(event) =>
            updateAdvanced({ textGroupSplit: event.target.value })
          }
        />
        <p style={helpTextStyle}>
          Split each Text field into Group/Text. Enter ":" to split "Color:Red"
          into group "Color" and text "Red"
        </p>
      </Field>

      {showSearch ? (
        <>
          <Check
            label="Search field"
            checked={advanced.searchField || false}
            onChange={(checked) => updateAdvanced({ searchField: checked })}
          />
          <Field label="Search placeholder" htmlFor="search-placeholder">
            <input
              id="search-placeholder"
              style={inputStyle}
              value={advanced.searchPlaceholder || ""}
              onChange={(event) =>
                updateAdvanced({ searchPlaceholder: event.target.value })
              }
            />
          </Field>
        </>
      ) : null}
    </>
  );
}

function TextAdvancedSettings({ type, advanced, updateAdvanced, field }) {
  return (
    <>
      <Field label="Placeholder" htmlFor={`${field.id}-placeholder`}>
        <input
          id={`${field.id}-placeholder`}
          style={inputStyle}
          value={advanced.placeholder || ""}
          onChange={(event) =>
            updateAdvanced({ placeholder: event.target.value })
          }
        />
        <p style={helpTextStyle}>
          Text inside input field can be used to give an example
        </p>
      </Field>

      <div style={gridStyle}>
        <Field
          label={type === "number" ? "Min" : "Min length"}
          htmlFor={`${field.id}-min-length`}
        >
          <input
            id={`${field.id}-min-length`}
            style={inputStyle}
            value={advanced.minLength || ""}
            onChange={(event) =>
              updateAdvanced({ minLength: event.target.value })
            }
          />
        </Field>
        <Field
          label={type === "number" ? "Max" : "Max length"}
          htmlFor={`${field.id}-max-length`}
        >
          <input
            id={`${field.id}-max-length`}
            style={inputStyle}
            value={advanced.maxLength || ""}
            onChange={(event) =>
              updateAdvanced({ maxLength: event.target.value })
            }
          />
        </Field>
      </div>

      {type !== "number" ? (
        <>
          <Field label="Pattern" htmlFor={`${field.id}-pattern`}>
            <input
              id={`${field.id}-pattern`}
              style={inputStyle}
              value={advanced.pattern || ""}
              onChange={(event) =>
                updateAdvanced({ pattern: event.target.value })
              }
            />
          </Field>
          <Field label="Text clean" htmlFor={`${field.id}-text-clean`}>
            <input
              id={`${field.id}-text-clean`}
              style={inputStyle}
              value={advanced.textClean || ""}
              onChange={(event) =>
                updateAdvanced({ textClean: event.target.value })
              }
            />
          </Field>
          <Field
            label="Validation message"
            htmlFor={`${field.id}-validation-message`}
          >
            <input
              id={`${field.id}-validation-message`}
              style={inputStyle}
              value={advanced.validationMessage || ""}
              onChange={(event) =>
                updateAdvanced({ validationMessage: event.target.value })
              }
            />
          </Field>
          <Field label="Text transform" htmlFor={`${field.id}-text-transform`}>
            <select
              id={`${field.id}-text-transform`}
              style={inputStyle}
              value={advanced.textTransform || ""}
              onChange={(event) =>
                updateAdvanced({ textTransform: event.target.value })
              }
            >
              <option value="">None</option>
              <option value="uppercase">Uppercase</option>
              <option value="lowercase">Lowercase</option>
              <option value="capitalize">Capitalize</option>
            </select>
          </Field>
          <Field label="Autocomplete" htmlFor={`${field.id}-autocomplete`}>
            <input
              id={`${field.id}-autocomplete`}
              style={inputStyle}
              value={advanced.autocomplete || "off"}
              onChange={(event) =>
                updateAdvanced({ autocomplete: event.target.value })
              }
            />
          </Field>
        </>
      ) : null}
    </>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label style={checkboxLabelStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function createField(type, index = 0) {
  const normalizedType = normalizeType(type);
  const template =
    FIELD_TEMPLATES[normalizedType] ||
    Object.values(FIELD_TEMPLATES).find(
      (templateEntry) => normalizeType(templateEntry.type) === normalizedType,
    ) ||
    FIELD_TEMPLATES.text;
  return {
    id: `${normalizedType}-${Date.now()}-${index}`,
    ...template,
    type: template.type,
    open: true,
    activeTab: "config",
    name: template.name === "option_1" ? `option_${index + 1}` : template.name,
    label:
      template.label === "Option 1" ? `Option ${index + 1}` : template.label,
    config: cloneConfig(template.config || {}),
  };
}

function createFieldFromSavedField(field, index = 0) {
  const saved = parseSavedValues(field.valuesJson);
  const normalizedType = normalizeType(field.type);
  const fallbackTemplate =
    Object.values(FIELD_TEMPLATES).find(
      (template) => normalizeType(template.type) === normalizedType,
    ) ||
    FIELD_TEMPLATES[normalizedType] ||
    FIELD_TEMPLATES.text;

  return {
    id: `${normalizedType}-${field.id}-${index}`,
    open: false,
    activeTab: "config",
    type: fallbackTemplate.type || normalizedType,
    name: saved.name || fallbackTemplate?.name || field.label,
    label: saved.label || field.label,
    required: field.required,
    config: saved.config || cloneConfig(fallbackTemplate?.config || {}),
  };
}

function serializeFieldForDb(field, index) {
  return {
    label: field.label || "Option",
    type: field.type || "text",
    required: Boolean(field.required),
    sortOrder: index,
    valuesJson: JSON.stringify({
      name: field.name || "",
      label: field.label || "",
      config: field.config || {},
    }),
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

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || {}));
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

function getOptionIcon(type) {
  type = normalizeType(type);
  const icons = {
    text: "Text",
    multi_line: "▤",
    number: "- 1 +",
    select: "▾",
    dropdown: "▾",
    font_select: "Font",
    image_swatches: "▧",
    button_swatches: "B",
    color_swatches: "▰",
    color_image_swatches: "▧",
    checkbox: "☑",
    radio: "◉",
    color: "▰",
    date: "▦",
    dimension: "X Y",
    upload: "☁",
    upload_lift: "☁",
    image_library: "▧",
    dynamic_options: "⊕",
    personalize: "Personalize",
    tabs: "▭",
    quantity: "Qty",
    quantity_discount: "%",
    bundle: "⊕",
    ai: "AI",
    price_summary: "₹",
    html: "<HTML>",
    price_group: "▦",
  };

  return icons[type] || "•";
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
};
const fieldGroupStyle = { display: "grid", gap: "6px", marginBottom: "16px" };
const labelStyle = { fontWeight: 600 };
const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  font: "inherit",
  boxSizing: "border-box",
};
const textareaStyle = { ...inputStyle, minHeight: "90px", resize: "vertical" };
const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "16px",
};
const fieldListStyle = { display: "grid", gap: "16px" };
const editorStyle = {
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  padding: "10px",
  background: "#ffffff",
  transition: "box-shadow 0.15s ease, border-color 0.15s ease",
};
const dragOverEditorStyle = {
  borderColor: "#3b82f6",
  boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.2)",
};
const toggleHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: "12px",
  padding: "10px 12px",
  background: "#eaf4ff",
  borderRadius: "8px",
};
const toggleTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "12px",
  border: 0,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
};
const optionIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "48px",
  height: "24px",
  border: "1px solid #8c9196",
  borderRadius: "4px",
  background: "#ffffff",
  color: "#202223",
  fontSize: "13px",
  fontWeight: 600,
};
const headerActionsStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "16px",
};
const iconButtonStyle = {
  border: 0,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
  fontSize: "18px",
  color: "#202223",
};
const dragHandleButtonStyle = {
  ...iconButtonStyle,
  cursor: "grab",
  fontSize: "24px",
  lineHeight: "1",
  padding: "4px 6px",
};
const deleteHeaderButtonStyle = {
  width: "32px",
  height: "32px",
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#d72c0d",
  cursor: "pointer",
  fontSize: "20px",
  lineHeight: "1",
};
const editorBodyStyle = { paddingTop: "16px" };
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
const pillListStyle = { display: "flex", flexWrap: "wrap", gap: "8px" };
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
const mutedStyle = { color: "#6d7175" };
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
const helpTextStyle = { margin: "4px 0 0", color: "#6d7175", fontSize: "13px" };
const sectionLabelStyle = {
  margin: "16px 0 8px",
  fontWeight: 600,
  color: "#6d7175",
};
const priceInputWrapStyle = { position: "relative" };
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
const colorInputStyle = {
  width: "100%",
  height: "42px",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  padding: "4px",
  boxSizing: "border-box",
};
const colorInputSmallStyle = { ...colorInputStyle, height: "36px" };
const imageCellStyle = {
  display: "grid",
  gridTemplateColumns: "48px 116px",
  gap: "8px",
  alignItems: "center",
};
const imagePreviewStyle = {
  position: "relative",
  display: "grid",
  placeItems: "center",
  width: "48px",
  height: "48px",
  border: "1px solid #dfe3e8",
  borderRadius: "6px",
  background: "#f6f6f7",
  color: "#6d7175",
  fontSize: "11px",
  overflow: "hidden",
};
const imagePreviewImgStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  background: "#ffffff",
};
const imageActionsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "4px",
};
const smallDarkButtonStyle = {
  border: 0,
  borderRadius: "8px",
  padding: "6px 10px",
  background: "#202223",
  color: "white",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
};
const smallLightButtonStyle = {
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  padding: "6px 10px",
  background: "#ffffff",
  color: "#202223",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
};
const priceGroupHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 120px 40px",
  gap: "12px",
  borderBottom: "1px solid #dfe3e8",
  paddingBottom: "8px",
  marginBottom: "8px",
  fontWeight: 600,
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
const quantityRowsStyle = { display: "grid", gap: "8px", marginTop: "8px" };
const quantityRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 40px",
  gap: "16px",
  alignItems: "center",
};
const quantityInputStyle = { ...inputStyle, textAlign: "center" };
const discountInputWrapStyle = { position: "relative" };
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
const addOptionBoxStyle = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: "8px",
  marginTop: "16px",
};
const addOptionSelectStyle = { ...inputStyle };
const darkFullAddButtonStyle = {
  width: "100%",
  border: 0,
  borderRadius: "8px",
  padding: "10px 12px",
  background: "#202223",
  color: "white",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
};
const priceOptionWrapStyle = { borderBottom: "1px solid #dfe3e8" };
const priceOptionHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "12px",
  alignItems: "center",
  padding: "8px 10px",
  background: "#eaf4ff",
};
const priceOptionTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "12px",
  border: 0,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
};
const priceOptionActionsStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "14px",
};
const priceOptionBodyStyle = {
  padding: "14px 10px 16px",
  background: "#ffffff",
};
const radioIconStyle = { fontSize: "16px" };
const percentIconStyle = { fontSize: "20px", color: "#6d7175" };

function choiceHeaderStyle(mode) {
  const columns = [
    mode.includes("image") ? "180px" : null,
    mode.includes("color") ? "160px" : null,
    "1fr",
    "1fr",
    "160px",
    "40px",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    display: "grid",
    gridTemplateColumns: columns,
    gap: "12px",
    borderBottom: "1px solid #dfe3e8",
    paddingBottom: "8px",
    marginBottom: "8px",
    textAlign: "center",
    fontWeight: 600,
  };
}

function choiceRowStyle(mode) {
  const columns = [
    mode.includes("image") ? "180px" : null,
    mode.includes("color") ? "160px" : null,
    "1fr",
    "1fr",
    "160px",
    "40px",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    display: "grid",
    gridTemplateColumns: columns,
    gap: "12px",
    alignItems: "center",
    marginBottom: "8px",
  };
}

const valuesToolbarStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "end",
  gap: "12px",
  marginTop: "16px",
};

const valuesToolbarRightStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "24px",
  color: "#202223",
  fontSize: "13px",
  fontWeight: 600,
};

const unitInputWrapStyle = {
  display: "grid",
  gridTemplateColumns: "36px 1fr 56px",
  alignItems: "center",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  overflow: "hidden",
  background: "#ffffff",
};
const unitSideStyle = {
  padding: "8px 10px",
  color: "#6d7175",
  textAlign: "center",
};
const unitInputStyle = {
  width: "100%",
  border: 0,
  outline: 0,
  padding: "8px 6px",
  textAlign: "center",
  font: "inherit",
  boxSizing: "border-box",
};
const blueNoticeStyle = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  alignItems: "center",
  gap: "10px",
  marginTop: "14px",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "#e5f3ff",
  color: "#00527c",
};
const greenNoticeStyle = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  alignItems: "center",
  gap: "10px",
  marginTop: "14px",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "#d1fadf",
  color: "#0c5132",
};
const noticeCloseStyle = {
  border: 0,
  background: "transparent",
  cursor: "pointer",
  fontSize: "18px",
  color: "inherit",
};
const dateFormatWrapStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 170px",
  border: "1px solid #8c9196",
  borderRadius: "6px",
  overflow: "hidden",
  background: "#ffffff",
};
const dateFormatInputStyle = {
  border: 0,
  outline: 0,
  padding: "8px 12px",
  font: "inherit",
};
const dateFormatSelectStyle = {
  border: 0,
  borderLeft: "1px solid #dfe3e8",
  padding: "8px 12px",
  font: "inherit",
};
const calendarInputWrapStyle = { position: "relative" };
const calendarInputStyle = { ...inputStyle, paddingRight: "34px" };
const calendarIconStyle = {
  position: "absolute",
  right: "12px",
  top: "50%",
  transform: "translateY(-50%)",
  color: "#6d7175",
};
const imageLibraryHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "180px 1fr 1fr 180px 40px",
  gap: "12px",
  borderBottom: "1px solid #dfe3e8",
  paddingBottom: "8px",
  marginBottom: "8px",
  textAlign: "center",
  fontWeight: 600,
};
const imageLibraryRowStyle = {
  display: "grid",
  gridTemplateColumns: "180px 1fr 1fr 180px 40px",
  gap: "12px",
  alignItems: "center",
  marginBottom: "8px",
};
const listButtonStyle = {
  border: "1px solid #dfe3e8",
  borderRadius: "8px",
  background: "#ffffff",
  padding: "8px 10px",
  cursor: "pointer",
  font: "inherit",
};

const infoBoxStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px",
  borderRadius: "8px",
  background: "#eaf4ff",
  color: "#005e8a",
  marginBottom: "16px",
};

const successInfoBoxStyle = {
  padding: "12px",
  borderRadius: "8px",
  background: "#ccf1d6",
  color: "#0c5132",
  marginTop: "16px",
  marginBottom: "16px",
};
