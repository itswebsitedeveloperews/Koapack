function removeProductDesignOverlay() {
  document.querySelectorAll(".pom-design-overlay").forEach((el) => {
    el.remove();
  });

  document.querySelectorAll(".pom-preview-position-input").forEach((el) => {
    el.remove();
  });
}

function findMainProductImageWrapper() {
  return (
    document.querySelector(".product__media img")?.closest(".product__media") ||
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

  let input = form.querySelector(
    'input[name="properties[_Upload preview position]"]',
  );

  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.className = "pom-preview-position-input";
    input.name = "properties[_Upload preview position]";
    form.appendChild(input);
  }

  input.value = JSON.stringify(positionData);

  let readableInput = form.querySelector(
    'input[name="properties[Upload preview position]"]',
  );

  if (!readableInput) {
    readableInput = document.createElement("input");
    readableInput.type = "hidden";
    readableInput.className = "pom-preview-position-input";
    readableInput.name = "properties[Upload preview position]";
    form.appendChild(readableInput);
  }

  readableInput.value = `X: ${positionData.x}%, Y: ${positionData.y}%, Width: ${positionData.width}%, Height: ${positionData.height}%`;
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
