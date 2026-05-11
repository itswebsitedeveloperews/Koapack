function wrapCustomOptions() {
  document.querySelectorAll(".cl-po--option").forEach(function (optionBlock) {
    const optionName = optionBlock.getAttribute("data-option");

    // ❌ Skip wrapping for "Price" option
    if (optionName === "Price") return;

    const label = optionBlock.querySelector(".cl-po--label");

    // ✅ Wrap SELECT input
    const selectInput = optionBlock.querySelector("select.cl-po--input");
    if (selectInput && !selectInput.parentElement.classList.contains("cl-po--select-group")) {
      const selectWrapper = document.createElement("div");
      selectWrapper.className = "cl-po--select-group";
      selectInput.parentNode.insertBefore(selectWrapper, selectInput);
      selectWrapper.appendChild(selectInput);
    }

    // ✅ Wrap RADIO items
    const radioItems = optionBlock.querySelectorAll("label.cl-po--radio-item");
    if (radioItems.length > 0 && !optionBlock.querySelector(".cl-po--radio-group")) {
      const radioGroup = document.createElement("div");
      radioGroup.className = "cl-po--radio-group";

      radioItems.forEach(function (item) {
        radioGroup.appendChild(item);
      });

      if (label && label.nextSibling) {
        optionBlock.insertBefore(radioGroup, label.nextSibling);
      } else {
        optionBlock.appendChild(radioGroup);
      }
    }
  });
}

// 🟡 Run on initial page load with delay
setTimeout(wrapCustomOptions, 1000);

// 🟡 Also run on swatch click
document.addEventListener("click", function (e) {
  if (e.target.closest(".cl-po--swatch")) {
    setTimeout(wrapCustomOptions, 10); // Give time for DOM update
  }
});
