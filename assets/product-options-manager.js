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

    totalBox.innerHTML = `
      <div class="pom-price-box">
        <span>Total:</span>
        <strong>${money(total)}</strong>
      </div>
    `;
  }

  function saveSelection(field, value) {
    const key = field.label || field.name || "Option";

    selectedOptions[key] = value;
    selectedPrices[key] = getOptionPrice(field, value);

    updatePrice();
  }

  function removeProductDesignOverlay() {
    document.querySelectorAll(".pom-design-overlay").forEach((el) => {
      el.remove();
    });
  }

  function findMainProductImageWrapper() {
    return (
      document
        .querySelector(".product__media img")
        ?.closest(".product__media") ||
      document
        .querySelector(".product__media-item img")
        ?.closest(".product__media-item") ||
      document
        .querySelector(".product-media-container img")
        ?.closest(".product-media-container") ||
      document.querySelector("media-gallery img")?.closest("media-gallery") ||
      document.querySelector(".product__media-wrapper")
    );
  }

  function showProductDesignOverlay(imageUrl, fileName) {
    removeProductDesignOverlay();

    const wrapper = findMainProductImageWrapper();

    if (!wrapper) {
      console.warn("Product image wrapper not found.");
      return;
    }

    wrapper.classList.add("pom-overlay-parent");

    const overlay = document.createElement("div");
    overlay.className = "pom-design-overlay";

    overlay.innerHTML = `
      <button
        type="button"
        class="pom-design-overlay-remove"
        aria-label="Remove preview"
      >
        ×
      </button>

      <img
        src="${imageUrl}"
        alt="${fileName || "Uploaded design"}"
      >
    `;

    overlay
      .querySelector(".pom-design-overlay-remove")
      .addEventListener("click", () => {
        removeProductDesignOverlay();

        const fileInput = document.querySelector(".pom-file-hidden");

        if (fileInput) {
          fileInput.value = "";
        }

        const fileNameEl = document.querySelector(".pom-upload-file-name");

        if (fileNameEl) {
          fileNameEl.textContent = "";
        }
      });

    wrapper.appendChild(overlay);
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

      select.addEventListener("change", () => {
        saveSelection(field, select.value);
      });

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

        if (qtyInput) {
          qtyInput.value = qty;
        }

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
      <button
        type="button"
        class="pom-upload-remove"
        aria-label="Remove file"
      >
        ×
      </button>

      <span class="pom-upload-icon">⇧</span>

      <strong>
        ${field.config?.buttonText || "Upload Your File"}
      </strong>

      <small>
        Upload or drag your file here
      </small>

      <span class="pom-upload-file-name"></span>
    `;

    const input = document.createElement("input");

    input.type = "file";
    input.className = "pom-file-hidden";
    input.name = `properties[${field.label || field.name || "Upload Your Design"}]`;
    input.accept = "image/*";

    uploadBox.appendChild(input);

    wrap.appendChild(uploadBox);

    const removeButton = uploadBox.querySelector(".pom-upload-remove");
    const fileNameEl = uploadBox.querySelector(".pom-upload-file-name");

    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      input.value = "";
      fileNameEl.textContent = "";

      removeProductDesignOverlay();
    });

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];

      if (!file) {
        fileNameEl.textContent = "";
        removeProductDesignOverlay();
        return;
      }

      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file.");

        input.value = "";
        fileNameEl.textContent = "";

        removeProductDesignOverlay();

        return;
      }

      const imageUrl = URL.createObjectURL(file);

      fileNameEl.textContent = file.name;

      showProductDesignOverlay(imageUrl, file.name);
    });

    return wrap;
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

    if (type === "quantity" || type === "quantity_discount") {
      return renderQuantityDiscount(field);
    }

    if (type === "upload" || type === "upload_lift") {
      return renderUpload(field);
    }

    if (type === "number") {
      return renderInput(field, "number");
    }

    if (type === "date") {
      return renderInput(field, "date");
    }

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

      group.fields.forEach((field) => {
        groupEl.appendChild(renderField(field));
      });

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
