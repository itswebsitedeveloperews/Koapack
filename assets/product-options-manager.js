(function () {
  const root = document.getElementById("product-options-manager");

  if (!root) return;

  if (root.dataset.pomLoaded === "true") return;
  root.dataset.pomLoaded = "true";

  const productGid = root.dataset.productGid;
  const productHandle = root.dataset.productHandle;
  const basePrice = Number(root.dataset.basePrice || 0) / 100;

  const selectedOptions = {};
  const selectedPrices = {};

  let selectedQuantity = 1;
  let selectedQuantityDiscount = 0;
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

    const unitPrice = basePrice + addonTotal;
    const qty = Math.max(1, Number(selectedQuantity || 1));

    const subtotal = unitPrice * qty;
    const discountAmount =
      subtotal * (Number(selectedQuantityDiscount || 0) / 100);
    const total = subtotal - discountAmount;

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

    const perPieceText =
      qty > 1
        ? `<small>for ${qty} Qty (${money(total / qty)} / piece)</small>`
        : `<small>for 1 Qty</small>`;

    const discountText =
      selectedQuantityDiscount > 0
        ? `<small class="pom-discount-text">${selectedQuantityDiscount}% discount applied</small>`
        : "";

    totalBox.innerHTML = `
    <div class="pom-price-box">
      <span>Total:</span>
      <strong>${money(total)}</strong>
      ${perPieceText}
      ${discountText}
    </div>
  `;
  }

  function checkIfAllRequiredFieldsAreFilled() {
    const requiredFields = document.querySelectorAll(
      ".pom-field input[required], .pom-field select[required]",
    );

    let allFilled = true;

    requiredFields.forEach((input) => {
      if (!input.value || input.value === "Required") {
        allFilled = false;
      }
    });

    const addToCartButton = document.querySelector("[data-add-to-cart-button]");

    if (addToCartButton) {
      if (allFilled) {
        addToCartButton.disabled = false;
      } else {
        addToCartButton.disabled = true;
      }
    }
  }

  function saveSelection(field, value) {
    const key = field.label || field.name || "Option";

    selectedOptions[key] = value;
    selectedPrices[key] = getOptionPrice(field, value);

    // Check if the field is required
    if (field.required && !value) {
      // If value is empty for a required field, set a flag to block adding to cart
      selectedOptions[key] = "Required";
    } else {
      // If the field is filled, make sure it's valid
      delete selectedOptions[key];
    }

    updatePrice();
    checkIfAllRequiredFieldsAreFilled();
  }

  function removeProductDesignOverlay() {
    document.querySelectorAll(".pom-design-overlay").forEach((el) => {
      el.remove();
    });

    document.querySelectorAll(".pom-preview-position-input").forEach((el) => {
      el.remove();
    });

    document.querySelectorAll(".pom-merged-preview-file").forEach((el) => {
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

  function getMainProductImageElement() {
    return (
      document.querySelector(".product__media img") ||
      document.querySelector(".product__media-item img") ||
      document.querySelector(".product-media-container img") ||
      document.querySelector("media-gallery img")
    );
  }

  function saveOverlayPositionToCart(overlay) {
    const form = document.querySelector("form[action*='/cart/add']");
    const wrapper = overlay?.parentElement;

    if (!form || !overlay || !wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();

    const x = ((overlayRect.left - wrapperRect.left) / wrapperRect.width) * 100;
    const y = ((overlayRect.top - wrapperRect.top) / wrapperRect.height) * 100;
    const width = (overlayRect.width / wrapperRect.width) * 100;
    const height = (overlayRect.height / wrapperRect.height) * 100;

    const positionData = {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
    };

    function setHiddenInput(name, value) {
      let input = form.querySelector(`input[name="properties[${name}]"]`);

      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.className = "pom-preview-position-input";
        input.name = `properties[${name}]`;
        form.appendChild(input);
      }

      input.value = value;
    }

    // ONLY hidden internal values
    // NOT visible in cart

    setHiddenInput("_Preview X", positionData.x);
    setHiddenInput("_Preview Y", positionData.y);
    setHiddenInput("_Preview Width", positionData.width);
    setHiddenInput("_Preview Height", positionData.height);

    setHiddenInput(
      "_Upload preview position JSON",
      JSON.stringify(positionData),
    );
  }

  function loadImageForCanvas(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.crossOrigin = "anonymous";

      img.onload = () => resolve(img);
      img.onerror = reject;

      img.src = src;
    });
  }

  async function createMergedPreviewFile() {
    const productImageEl = getMainProductImageElement();
    const overlay = document.querySelector(".pom-design-overlay");
    const overlayImageEl = overlay?.querySelector("img");

    if (!productImageEl || !overlay || !overlayImageEl) {
      return null;
    }

    const productImageSrc =
      productImageEl.currentSrc ||
      productImageEl.src ||
      productImageEl.getAttribute("src");

    const overlayImageSrc = overlayImageEl.src;

    if (!productImageSrc || !overlayImageSrc) {
      return null;
    }

    const productImage = await loadImageForCanvas(productImageSrc);
    const uploadedImage = await loadImageForCanvas(overlayImageSrc);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    const canvasWidth = productImage.naturalWidth || productImage.width;
    const canvasHeight = productImage.naturalHeight || productImage.height;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.drawImage(productImage, 0, 0, canvasWidth, canvasHeight);

    const wrapper = overlay.parentElement;
    const wrapperRect = wrapper.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();

    const xPercent =
      ((overlayRect.left - wrapperRect.left) / wrapperRect.width) * 100;
    const yPercent =
      ((overlayRect.top - wrapperRect.top) / wrapperRect.height) * 100;
    const widthPercent = (overlayRect.width / wrapperRect.width) * 100;
    const heightPercent = (overlayRect.height / wrapperRect.height) * 100;

    const drawX = (xPercent / 100) * canvasWidth;
    const drawY = (yPercent / 100) * canvasHeight;
    const drawWidth = (widthPercent / 100) * canvasWidth;
    const drawHeight = (heightPercent / 100) * canvasHeight;

    ctx.drawImage(uploadedImage, drawX, drawY, drawWidth, drawHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png", 0.95);
    });

    if (!blob) return null;

    return new File([blob], "product-preview.png", {
      type: "image/png",
    });
  }

  function setFileInputFile(input, file) {
    const dataTransfer = new DataTransfer();

    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
  }

  async function attachMergedPreviewImageToForm(form) {
    const mergedFile = await createMergedPreviewFile();

    if (!mergedFile) return;

    let previewInput = form.querySelector(
      'input[name="properties[Preview image]"]',
    );

    if (!previewInput) {
      previewInput = document.createElement("input");
      previewInput.type = "file";
      previewInput.name = "properties[Preview image]";
      previewInput.className = "pom-merged-preview-file";
      previewInput.style.display = "none";
      form.appendChild(previewInput);
    }

    setFileInputFile(previewInput, mergedFile);
  }

  function makeOverlayMoveableAndResizable(overlay) {
    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;
    let activeHandle = null;

    const wrapper = overlay.parentElement;

    function getClientPosition(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0];

      return {
        x: touch ? touch.clientX : event.clientX,
        y: touch ? touch.clientY : event.clientY,
      };
    }

    function startDrag(event) {
      if (event.target.closest(".pom-design-resize-handle")) return;
      if (event.target.closest(".pom-design-overlay-remove")) return;

      event.preventDefault();

      const pos = getClientPosition(event);
      const rect = overlay.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();

      isDragging = true;
      startX = pos.x;
      startY = pos.y;
      startLeft = rect.left - wrapperRect.left;
      startTop = rect.top - wrapperRect.top;

      overlay.classList.add("is-moving");
    }

    function startResize(event) {
      event.preventDefault();
      event.stopPropagation();

      const pos = getClientPosition(event);
      const rect = overlay.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();

      isResizing = true;
      activeHandle = event.target.dataset.handle;

      startX = pos.x;
      startY = pos.y;
      startLeft = rect.left - wrapperRect.left;
      startTop = rect.top - wrapperRect.top;
      startWidth = rect.width;
      startHeight = rect.height;

      overlay.classList.add("is-moving");
    }

    function onMove(event) {
      if (!isDragging && !isResizing) return;

      event.preventDefault();

      const pos = getClientPosition(event);
      const wrapperRect = wrapper.getBoundingClientRect();

      const dx = pos.x - startX;
      const dy = pos.y - startY;

      if (isDragging) {
        let nextLeft = startLeft + dx;
        let nextTop = startTop + dy;

        nextLeft = Math.max(
          0,
          Math.min(nextLeft, wrapperRect.width - overlay.offsetWidth),
        );

        nextTop = Math.max(
          0,
          Math.min(nextTop, wrapperRect.height - overlay.offsetHeight),
        );

        overlay.style.left = `${(nextLeft / wrapperRect.width) * 100}%`;
        overlay.style.top = `${(nextTop / wrapperRect.height) * 100}%`;
      }

      if (isResizing) {
        let nextLeft = startLeft;
        let nextTop = startTop;
        let nextWidth = startWidth;
        let nextHeight = startHeight;

        if (activeHandle.includes("right")) {
          nextWidth = startWidth + dx;
        }

        if (activeHandle.includes("left")) {
          nextWidth = startWidth - dx;
          nextLeft = startLeft + dx;
        }

        if (activeHandle.includes("bottom")) {
          nextHeight = startHeight + dy;
        }

        if (activeHandle.includes("top")) {
          nextHeight = startHeight - dy;
          nextTop = startTop + dy;
        }

        nextWidth = Math.max(60, nextWidth);
        nextHeight = Math.max(60, nextHeight);

        if (nextLeft < 0) {
          nextWidth += nextLeft;
          nextLeft = 0;
        }

        if (nextTop < 0) {
          nextHeight += nextTop;
          nextTop = 0;
        }

        if (nextLeft + nextWidth > wrapperRect.width) {
          nextWidth = wrapperRect.width - nextLeft;
        }

        if (nextTop + nextHeight > wrapperRect.height) {
          nextHeight = wrapperRect.height - nextTop;
        }

        overlay.style.left = `${(nextLeft / wrapperRect.width) * 100}%`;
        overlay.style.top = `${(nextTop / wrapperRect.height) * 100}%`;
        overlay.style.width = `${(nextWidth / wrapperRect.width) * 100}%`;
        overlay.style.height = `${(nextHeight / wrapperRect.height) * 100}%`;
      }

      saveOverlayPositionToCart(overlay);
    }

    function stopAction() {
      if (!isDragging && !isResizing) return;

      isDragging = false;
      isResizing = false;
      activeHandle = null;

      overlay.classList.remove("is-moving");
      saveOverlayPositionToCart(overlay);
    }

    overlay.addEventListener("mousedown", startDrag);
    overlay.addEventListener("touchstart", startDrag, { passive: false });

    overlay.querySelectorAll(".pom-design-resize-handle").forEach((handle) => {
      handle.addEventListener("mousedown", startResize);
      handle.addEventListener("touchstart", startResize, { passive: false });
    });

    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", stopAction);
    document.addEventListener("touchend", stopAction);
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

    overlay.style.left = "34%";
    overlay.style.top = "22%";
    overlay.style.width = "28%";
    overlay.style.height = "28%";

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
        draggable="false"
      >

      <span class="pom-design-resize-handle pom-handle-top-left" data-handle="top-left"></span>
      <span class="pom-design-resize-handle pom-handle-top-right" data-handle="top-right"></span>
      <span class="pom-design-resize-handle pom-handle-bottom-left" data-handle="bottom-left"></span>
      <span class="pom-design-resize-handle pom-handle-bottom-right" data-handle="bottom-right"></span>
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

    makeOverlayMoveableAndResizable(overlay);
    saveOverlayPositionToCart(overlay);
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

    const isColorField = [
      "button_swatches",
      "color_swatches",
      "color_image_swatches",
      "image_swatches",
    ].includes(type);

    function resolveSwatchBackground(item) {
      const candidates = [
        item?.color,
        item?.hex,
        item?.value,
        item?.text,
        item?.swatch,
      ].filter(Boolean);

      const first = candidates[0];
      if (!first) return null;

      const s = String(first).trim();

      // If backend already provides a valid CSS color string, use it.
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {
        return s;
      }
      if (/^(rgb|hsl)a?\(/i.test(s)) {
        return s;
      }

      // Sometimes value/text might be an existing HTML color name or already usable.
      // Fallback: return raw string so CSS can try to interpret it.
      return s || null;
    }

    values.forEach((item) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "pom-option-button";

      const swatchBg = isColorField ? resolveSwatchBackground(item) : null;
      if (swatchBg) {
        button.style.setProperty("--pom-swatch--background", swatchBg);
      }

      button.textContent =
        Number(item.price || 0) > 0
          ? `${item.text || item.value} (+${money(item.price)})`
          : item.text || item.value || "Option";

      button.addEventListener("click", () => {
        buttons
          .querySelectorAll(".pom-option-button")
          .forEach((btn) => btn.classList.remove("is-active"));

        button.classList.add("is-active");

        // Ensure active state uses the chosen swatch color (when available)
        if (swatchBg) {
          button.style.setProperty("--pom-swatch--background", swatchBg);
        }

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
      const qty = Number(row.quantity || row.qty || 0);
      const discount = Number(row.discount || row.discountPercent || 0);

      if (!qty) return;

      const button = document.createElement("button");

      button.type = "button";
      button.className = "pom-option-button";
      button.textContent = `${qty}+`;

      button.addEventListener("click", () => {
        buttons
          .querySelectorAll(".pom-option-button")
          .forEach((btn) => btn.classList.remove("is-active"));

        button.classList.add("is-active");

        selectedQuantity = qty;
        selectedQuantityDiscount = discount;

        const qtyInput =
          document.querySelector("input[name='quantity']") ||
          document.querySelector("quantity-input input");

        if (qtyInput) {
          qtyInput.value = qty;
          qtyInput.dispatchEvent(new Event("change", { bubbles: true }));
          qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        selectedOptions[field.label || field.name || "Quantity"] = `${qty}+`;

        if (discount > 0) {
          selectedOptions["Quantity discount"] = `${discount}%`;
        } else {
          delete selectedOptions["Quantity discount"];
        }

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

    // Disable "Add to Cart" button if no fields/options are available
    const addToCartButton = document.querySelector("[data-add-to-cart-button]");
    if (addToCartButton) {
      const allFields = document.querySelectorAll(".pom-field");
      if (allFields.length === 0) {
        addToCartButton.disabled = true; // Disable if no options exist
      } else {
        addToCartButton.disabled = false; // Enable if options are present
      }
    }

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
      if (form.dataset.pomSubmitAttached === "true") return;
      form.dataset.pomSubmitAttached = "true";

      form.addEventListener("submit", async (event) => {
        const overlay = document.querySelector(".pom-design-overlay");

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

        if (overlay) {
          event.preventDefault();

          saveOverlayPositionToCart(overlay);

          try {
            await attachMergedPreviewImageToForm(form);
          } catch (error) {
            console.error("Preview image merge failed:", error);
          }

          form.submit();
        }
      });
    });
  }

  async function init() {
    root.innerHTML = `<div class="pom-loading">Loading options...</div>`;

    const response = await fetch(
      `/apps/product-options?productId=${encodeURIComponent(
        productGid,
      )}&handle=${encodeURIComponent(productHandle)}`,
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

    root.innerHTML = `
      <div class="pom-error">
        Product options could not be loaded.
      </div>
    `;
  });
})();
