(function () {
  const root = document.getElementById("product-options-manager");
  if (!root) return;

  const productGid = root.dataset.productGid;
  const productHandle = root.dataset.productHandle;
  const basePrice = Number(root.dataset.basePrice || 0) / 100;

  const selectedOptions = {};
  const selectedPrices = {};

  function money(amount) {
    return (
      "Rs. " +
      Number(amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function normalizeType(type) {
    return String(type || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");
  }

  function getValues(field) {
    return field.config?.values || field.config?.options || [];
  }

  function getOptionPrice(field, value) {
    const item = getValues(field).find(
      (x) => String(x.value) === String(value),
    );
    return item ? Number(item.price || 0) : 0;
  }

  function updatePrice() {
    const addonTotal = Object.values(selectedPrices).reduce(
      (sum, price) => sum + Number(price || 0),
      0,
    );
    const total = basePrice + addonTotal;

    document
      .querySelectorAll(
        ".price-item--regular, .price-item--sale, .product__price, [data-product-price]",
      )
      .forEach((el) => {
        el.textContent = money(total);
      });

    let totalBox = root.querySelector(".pom-total-price");
    if (!totalBox) {
      totalBox = document.createElement("div");
      totalBox.className = "pom-total-price";
      root.appendChild(totalBox);
    }

    totalBox.innerHTML = `<div class="pom-price-box"><span>Total:</span><strong>${money(total)}</strong></div>`;
  }

  function saveSelection(field, value) {
    const key = field.label || field.name || "Option";
    selectedOptions[key] = value;
    selectedPrices[key] = getOptionPrice(field, value);
    updatePrice();
  }

  function renderChoice(field) {
    const type = normalizeType(field.type);
    const values = getValues(field);

    const wrap = document.createElement("div");
    wrap.className = "pom-field";

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || field.name || "Option";
    wrap.appendChild(label);

    if (type === "dropdown" || type === "select" || type === "font_select") {
      const select = document.createElement("select");
      select.className = "pom-select";
      select.name = `properties[${field.label || field.name}]`;
      select.required = Boolean(field.required);

      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Select option";
      select.appendChild(empty);

      values.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value || "";
        option.textContent =
          Number(item.price || 0) > 0
            ? `${item.value} (+${money(item.price)})`
            : item.value || item.text || "Option";
        select.appendChild(option);
      });

      select.addEventListener("change", () =>
        saveSelection(field, select.value),
      );
      wrap.appendChild(select);
      return wrap;
    }

    const buttons = document.createElement("div");
    buttons.className = "pom-buttons";

    values.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pom-option-button";
      button.textContent =
        Number(item.price || 0) > 0
          ? `${item.text || item.value} (+${money(item.price)})`
          : item.text || item.value || "Option";

      button.addEventListener("click", () => {
        buttons
          .querySelectorAll(".pom-option-button")
          .forEach((btn) => btn.classList.remove("is-active"));
        button.classList.add("is-active");
        saveSelection(field, item.value || item.text);

        let input = wrap.querySelector("input[type='hidden']");
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = `properties[${field.label || field.name}]`;
          wrap.appendChild(input);
        }
        input.value = item.value || item.text || "";
      });

      buttons.appendChild(button);
    });

    wrap.appendChild(buttons);
    return wrap;
  }

  function renderQuantityDiscount(field) {
    const rows = field.config?.rows || field.config?.discounts || [];

    const wrap = document.createElement("div");
    wrap.className = "pom-field";

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || "Order Quantity";
    wrap.appendChild(label);

    const buttons = document.createElement("div");
    buttons.className = "pom-buttons";

    rows.forEach((row) => {
      const qty = Number(row.quantity || 0);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pom-option-button";
      button.textContent = `${qty}+`;

      button.addEventListener("click", () => {
        buttons
          .querySelectorAll(".pom-option-button")
          .forEach((btn) => btn.classList.remove("is-active"));
        button.classList.add("is-active");

        const qtyInput = document.querySelector("input[name='quantity']");
        if (qtyInput) qtyInput.value = qty;

        selectedOptions[field.label || field.name || "Quantity"] = `${qty}+`;
        selectedPrices[field.label || field.name || "Quantity"] = 0;
        updatePrice();
      });

      buttons.appendChild(button);
    });

    wrap.appendChild(buttons);
    return wrap;
  }

  function renderUpload(field) {
    const wrap = document.createElement("div");
    wrap.className = "pom-field pom-upload-field";

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || "Upload Your Design";
    wrap.appendChild(label);

    const uploadBox = document.createElement("label");
    uploadBox.className = "pom-upload-box";

    uploadBox.innerHTML = `
    <span class="pom-upload-icon">⇧</span>
    <strong>${field.config?.buttonText || "Upload Your File"}</strong>
    <small>Upload or drag your file here</small>
  `;

    const input = document.createElement("input");
    input.type = "file";
    input.className = "pom-file-hidden";
    input.name = `properties[${field.label || field.name || "Upload"}]`;
    input.accept = "image/*";

    uploadBox.appendChild(input);
    wrap.appendChild(uploadBox);

    const preview = document.createElement("div");
    preview.className = "pom-upload-preview";
    wrap.appendChild(preview);

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];

      if (!file) {
        preview.innerHTML = "";
        removeProductMediaPreview();
        return;
      }

      if (!file.type.startsWith("image/")) {
        preview.innerHTML = `<p class="pom-error">Please upload an image file.</p>`;
        removeProductMediaPreview();
        return;
      }

      const imageUrl = URL.createObjectURL(file);

      preview.innerHTML = `
      <div class="pom-preview-card">
        <img src="${imageUrl}" alt="Uploaded design preview">
        <span>${file.name}</span>
      </div>
    `;

      showProductMediaPreview(imageUrl, file.name);
    });

    return wrap;
  }

  function removeProductMediaPreview() {
    document.querySelectorAll(".pom-product-media-preview").forEach((el) => {
      el.remove();
    });
  }

  function findProductMediaContainer() {
    return (
      document.querySelector(".product__media-list") ||
      document.querySelector("media-gallery ul") ||
      document.querySelector("media-gallery") ||
      document.querySelector(".product__media-wrapper") ||
      document.querySelector(".product__media") ||
      document.querySelector(".product-media-container")
    );
  }

  function showProductMediaPreview(imageUrl, fileName) {
    removeProductMediaPreview();

    const mediaContainer = findProductMediaContainer();

    if (!mediaContainer) {
      return;
    }

    const previewItem = document.createElement("div");
    previewItem.className = "pom-product-media-preview";

    previewItem.innerHTML = `
    <div class="pom-media-preview-inner">
      <img src="${imageUrl}" alt="${fileName || "Uploaded design"}">
      <span class="pom-media-preview-badge">Your uploaded design</span>
    </div>
  `;

    mediaContainer.prepend(previewItem);
  }

  function renderInput(field, inputType) {
    const wrap = document.createElement("div");
    wrap.className = "pom-field";

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || field.name || "Option";
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = inputType;
    input.className = "pom-input";
    input.name = `properties[${field.label || field.name}]`;
    input.placeholder = field.label || "";
    wrap.appendChild(input);

    return wrap;
  }

  function renderField(field) {
    const type = normalizeType(field.type);

    if (
      [
        "radio",
        "checkbox",
        "button_swatches",
        "color_swatches",
        "color_image_swatches",
        "image_swatches",
        "dropdown",
        "select",
        "font_select",
        "personalize",
      ].includes(type)
    ) {
      return renderChoice(field);
    }

    if (type === "quantity" || type === "quantity_discount")
      return renderQuantityDiscount(field);
    if (type === "upload" || type === "upload_lift") return renderUpload(field);
    if (type === "number") return renderInput(field, "number");
    if (type === "date") return renderInput(field, "date");
    return renderInput(field, "text");
  }

  function attachToCartForm() {
    document.querySelectorAll("form[action*='/cart/add']").forEach((form) => {
      form.addEventListener("submit", () => {
        Object.entries(selectedOptions).forEach(([key, value]) => {
          let input = form.querySelector(`input[name="properties[${key}]"]`);
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = `properties[${key}]`;
            form.appendChild(input);
          }
          input.value = value;
        });
      });
    });
  }

  async function init() {
    const response = await fetch(
      `/apps/product-options?productId=${encodeURIComponent(productGid)}&handle=${encodeURIComponent(productHandle)}`,
    );

    const data = await response.json();
    root.innerHTML = "";

    if (!data.groups || data.groups.length === 0) {
      root.style.display = "none";
      return;
    }

    data.groups.forEach((group) => {
      const groupEl = document.createElement("div");
      groupEl.className = "pom-group";
      group.fields.forEach((field) => groupEl.appendChild(renderField(field)));
      root.appendChild(groupEl);
    });

    attachToCartForm();
    updatePrice();
  }

  init().catch((error) => {
    console.error("Product options error:", error);
    root.innerHTML = "";
  });
})();
