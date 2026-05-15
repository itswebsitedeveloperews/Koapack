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

  function getAdvancedHelp(field) {
    return (
      field?.advancedHelp ||
      field?.advanced_help ||
      field?.["advanced-help"] ||
      field?.helpText ||
      field?.help_text ||
      field?.help ||
      field?.config?.advancedHelp ||
      field?.config?.advanced_help ||
      field?.config?.["advanced-help"] ||
      field?.config?.helpText ||
      field?.config?.help_text ||
      field?.config?.help ||
      ""
    );
  }

  function appendAdvancedHelp(parent, field) {
    const helpTextRaw = getAdvancedHelp(field);
    const helpText = String(helpTextRaw || "").trim();

    if (!helpText) return;

    const help = document.createElement("div");
    help.className = "pom-advanced-help";
    help.innerHTML = helpText;

    parent.appendChild(help);
  }

  function getProductMediaImage() {
    const activeImage = document.querySelector(
      "media-gallery .product__media-item.is-active .product__media img",
    );

    if (activeImage) return activeImage;

    return document.querySelector(
      "media-gallery .product__media-item .product__media img, .product__media img, .product__media-list img",
    );
  }

  function rememberOriginalProductImage(image) {
    if (!image || image.dataset.pomOriginalSrc) return;

    image.dataset.pomOriginalSrc = image.getAttribute("src") || "";
    image.dataset.pomOriginalSrcset = image.getAttribute("srcset") || "";
    image.dataset.pomOriginalSizes = image.getAttribute("sizes") || "";
  }

  function setProductMediaImage(imageUrl) {
    const image = getProductMediaImage();

    if (!image || !imageUrl) return;

    rememberOriginalProductImage(image);

    image.removeAttribute("srcset");
    image.src = imageUrl;

    const modalOpener = image.closest(".product__modal-opener");
    const zoomButton = modalOpener?.querySelector(".product__media-toggle");

    if (zoomButton) {
      zoomButton.dataset.pomSwatchImage = imageUrl;
    }
  }

  function restoreProductMediaImage() {
    const image = getProductMediaImage();

    if (!image?.dataset.pomOriginalSrc) return;

    image.src = image.dataset.pomOriginalSrc;

    if (image.dataset.pomOriginalSrcset) {
      image.setAttribute("srcset", image.dataset.pomOriginalSrcset);
    }

    if (image.dataset.pomOriginalSizes) {
      image.setAttribute("sizes", image.dataset.pomOriginalSizes);
    }
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
        ? `<span>for ${qty} Qty (${money(total / qty)} / piece)</span>`
        : `<span>for 1 Qty (${money(total / qty)} / piece)</span>`;

    totalBox.innerHTML = `
      <div class="pom-price-box">
        <div class="price">${money(total)}</div>
        <span class="tax-text"> Inc. of All Taxes</span>
        ${perPieceText}
        <span class="bulk-text">Buy in bulk and save</span>
      </div>
    `;
  }

  function getFieldKey(field) {
    return field.label || field.name || "Option";
  }

  function findAddToCartButtons() {
    return document.querySelectorAll(
      "[data-add-to-cart-button], form[action*='/cart/add'] button[type='submit'], form[action*='/cart/add'] input[type='submit']",
    );
  }

  function setFieldInvalid(fieldEl, isInvalid) {
    fieldEl.classList.toggle("pom-field--invalid", isInvalid);

    let error = fieldEl.querySelector(".pom-field-error");

    if (!isInvalid) {
      if (error) error.remove();
      return;
    }

    if (!error) {
      error = document.createElement("div");
      error.className = "pom-field-error";
      error.textContent = "This field is required.";
      fieldEl.appendChild(error);
    }
  }

  function getRequiredFieldValue(fieldEl) {
    const fileInput = fieldEl.querySelector("input[type='file']");

    if (fileInput) {
      return fileInput.files?.length ? "selected" : "";
    }

    const checkedInput = fieldEl.querySelector(
      "input[type='checkbox']:checked, input[type='radio']:checked",
    );

    if (checkedInput) return checkedInput.value;

    const input = fieldEl.querySelector("select, textarea, input");

    return input?.value || "";
  }

  function validateRequiredFields({ showErrors = false } = {}) {
    const requiredFields = root.querySelectorAll(
      ".pom-field[data-pom-required='true']",
    );
    let firstInvalid = null;
    let allFilled = true;

    requiredFields.forEach((fieldEl) => {
      const value = String(getRequiredFieldValue(fieldEl) || "").trim();
      const isInvalid = !value || value === "Required";

      if (isInvalid) {
        allFilled = false;
        if (!firstInvalid) firstInvalid = fieldEl;
      }

      setFieldInvalid(fieldEl, showErrors && isInvalid);
    });

    findAddToCartButtons().forEach((button) => {
      button.disabled = !allFilled;
      button.setAttribute("aria-disabled", String(!allFilled));
    });

    if (showErrors && firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid.querySelector("input, select, textarea, button")?.focus();
    }

    return allFilled;
  }

  function saveSelection(field, value) {
    const key = getFieldKey(field);

    selectedOptions[key] = value;
    selectedPrices[key] = getOptionPrice(field, value);

    updatePrice();
    validateRequiredFields();
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

        validateRequiredFields();
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
    wrap.dataset.pomRequired = String(Boolean(field.required));

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || field.name || "Option";

    wrap.appendChild(label);

    if (type === "dropdown" || type === "select" || type === "font_select") {
      const selectWrap = document.createElement("div");
      selectWrap.className = "pom-buttons";

      const select = document.createElement("select");

      select.className = "pom-select";
      select.name = `properties[${getFieldKey(field)}]`;
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

      selectWrap.appendChild(select);
      appendAdvancedHelp(selectWrap, field);

      wrap.appendChild(selectWrap);

      return wrap;
    }

    const buttons = document.createElement("div");
    buttons.className = "pom-buttons";

    const selectedInput = document.createElement("input");

    selectedInput.type = "hidden";
    selectedInput.name = `properties[${getFieldKey(field)}]`;
    selectedInput.value = "";

    wrap.appendChild(selectedInput);

    const isColorField = ["button_swatches", "color_swatches"].includes(type);
    const isColorImageSwatchField = [
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

      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {
        return s;
      }

      if (/^(rgb|hsl)a?\(/i.test(s)) {
        return s;
      }

      return s || null;
    }

    function isBlobUrl(url) {
      return typeof url === "string" && url.startsWith("blob:");
    }

    values.forEach((item) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "pom-option-button";

      const swatchBg = isColorField ? resolveSwatchBackground(item) : null;

      let swatchImage = null;

      if (isColorImageSwatchField) {
        swatchImage =
          item?.image ||
          item?.src ||
          item?.url ||
          item?.thumbnail ||
          item?.preview ||
          null;
      }

      if (swatchImage && !isBlobUrl(swatchImage)) {
        button.dataset.pomSwatchImage = swatchImage;
      }

      if (swatchBg) {
        button.style.setProperty("--pom-swatch--background", swatchBg);
        button.classList.add("color-swatche");
      }

      const labelText =
        Number(item.price || 0) > 0
          ? `${item.text || item.value} (+${money(item.price)})`
          : item.text || item.value || "Option";

      if (swatchBg) {
        const swatch = document.createElement("span");
        swatch.className = "pom-swatch-preview";
        swatch.style.background = swatchBg;

        const text = document.createElement("span");
        text.className = "pom-swatch-preview-text";
        text.textContent = labelText;
        swatch.dataset.tooltip = labelText;

        button.innerHTML = "";
        button.appendChild(swatch);
        button.appendChild(text);
      } else if (swatchImage) {
        const swatch = document.createElement("span");
        swatch.className = "pom-swatch-preview";
        swatch.style.background = "transparent";
        button.classList.add("color-swatche");

        const img = document.createElement("img");
        img.src = swatchImage;
        img.alt = labelText;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        swatch.appendChild(img);

        const text = document.createElement("span");
        text.className = "pom-swatch-preview-text";
        text.textContent = labelText;
        swatch.dataset.tooltip = labelText;

        button.innerHTML = "";
        button.appendChild(swatch);
        button.appendChild(text);
      } else {
        button.textContent = labelText;
      }

      button.addEventListener("click", () => {
        buttons
          .querySelectorAll(".pom-option-button")
          .forEach((btn) => btn.classList.remove("is-active"));

        button.classList.add("is-active");

        if (swatchBg) {
          button.style.setProperty("--pom-swatch--background", swatchBg);
        }

        if (swatchImage) {
          setProductMediaImage(swatchImage);
        } else if (isColorImageSwatchField) {
          restoreProductMediaImage();
        }

        saveSelection(field, item.value || item.text);

        selectedInput.value = item.value || item.text || "";
        validateRequiredFields();
      });

      buttons.appendChild(button);
    });

    appendAdvancedHelp(buttons, field);

    wrap.appendChild(buttons);

    return wrap;
  }

  function renderQuantityDiscount(field) {
    const rows = field.config?.rows || field.config?.discounts || [];

    const wrap = document.createElement("div");
    wrap.className = "pom-field";
    wrap.dataset.pomRequired = String(Boolean(field.required));

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || "Order Quantity";

    wrap.appendChild(label);

    const buttons = document.createElement("div");
    buttons.className = "pom-buttons";

    const selectedInput = document.createElement("input");

    selectedInput.type = "hidden";
    selectedInput.name = `properties[${getFieldKey(field)}]`;
    selectedInput.value = "";

    wrap.appendChild(selectedInput);

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
        selectedInput.value = `${qty}+`;

        if (discount > 0) {
          selectedOptions["Quantity discount"] = `${discount}%`;
        } else {
          delete selectedOptions["Quantity discount"];
        }

        updatePrice();
        validateRequiredFields();
      });

      buttons.appendChild(button);
    });

    appendAdvancedHelp(buttons, field);

    wrap.appendChild(buttons);

    return wrap;
  }

  function renderUpload(field) {
    const wrap = document.createElement("div");
    wrap.className = "pom-field pom-upload-field";
    wrap.dataset.pomRequired = String(Boolean(field.required));

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || "Upload Your Design";

    wrap.appendChild(label);

    const uploadBox = document.createElement("div");
    uploadBox.className = "pom-upload-box";

    uploadBox.innerHTML = `
      <div class="pom-upload">
        <span class="pom-upload-button-text">
          ${field.config?.buttonText || "Upload Your File"}
        </span>
        <span class="pom-upload-file-name"></span>
      </div>
    `;

    const input = document.createElement("input");
    input.type = "file";
    input.className = "pom-file-hidden";
    input.name = `properties[${getFieldKey(field)}]`;
    input.accept = "image/*";
    input.required = Boolean(field.required);

    uploadBox.appendChild(input);
    wrap.appendChild(uploadBox);

    appendAdvancedHelp(uploadBox, field);

    const buttonTextEl = uploadBox.querySelector(".pom-upload-button-text");
    const fileNameEl = uploadBox.querySelector(".pom-upload-file-name");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "pom-upload-remove";
    removeButton.setAttribute("aria-label", "Remove file");
    removeButton.textContent = "×";

    uploadBox.addEventListener("click", () => {
      input.click();
    });

    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      input.value = "";
      fileNameEl.textContent = "";
      buttonTextEl.style.opacity = "";

      removeButton.remove();

      removeProductDesignOverlay();
      validateRequiredFields();
    });

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];

      if (!file) {
        fileNameEl.textContent = "";
        buttonTextEl.style.opacity = "";
        removeButton.remove();

        removeProductDesignOverlay();
        validateRequiredFields();
        return;
      }

      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file.");

        input.value = "";
        fileNameEl.textContent = "";
        buttonTextEl.style.opacity = "";
        removeButton.remove();

        removeProductDesignOverlay();
        validateRequiredFields();
        return;
      }

      const imageUrl = URL.createObjectURL(file);

      buttonTextEl.style.opacity = "0";
      fileNameEl.textContent = file.name;
      fileNameEl.appendChild(removeButton);

      showProductDesignOverlay(imageUrl, file.name);
      validateRequiredFields();
    });

    return wrap;
  }

  function renderInput(field, inputType) {
    const wrap = document.createElement("div");
    wrap.className = "pom-field";
    wrap.dataset.pomRequired = String(Boolean(field.required));

    const label = document.createElement("label");
    label.className = "pom-label";
    label.textContent = field.label || field.name || "Option";

    wrap.appendChild(label);

    const inputWrap = document.createElement("div");
    inputWrap.className = "pom-buttons";

    const input = document.createElement("input");
    input.type = inputType;
    input.className = "pom-input";
    input.name = `properties[${getFieldKey(field)}]`;
    input.placeholder = field.label || "";
    input.required = Boolean(field.required);

    input.addEventListener("input", () => validateRequiredFields());
    input.addEventListener("change", () => validateRequiredFields());

    inputWrap.appendChild(input);

    appendAdvancedHelp(inputWrap, field);

    wrap.appendChild(inputWrap);

    return wrap;
  }

  function renderField(field) {
    const type = normalizeType(field.type);

    const addToCartButton = document.querySelector("[data-add-to-cart-button]");

    if (addToCartButton) {
      const allFields = document.querySelectorAll(".pom-field");

      if (allFields.length === 0) {
        addToCartButton.disabled = true;
      } else {
        addToCartButton.disabled = false;
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
        if (!validateRequiredFields({ showErrors: true })) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }

        const overlay = document.querySelector(".pom-design-overlay");

        Object.entries(selectedOptions).forEach(([key, value]) => {
          let input = form.querySelector(`[name="properties[${key}]"]`);

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
    validateRequiredFields();
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
