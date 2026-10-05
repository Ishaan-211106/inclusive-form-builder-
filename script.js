/* ============================================================================
   INCLUSIVE SMART FORM BUILDER
   Pure vanilla JavaScript (ES6+). No frameworks, no libraries.

   ARCHITECTURE OVERVIEW
   ----------------------------------------------------------------------------
   `fields` (an array of plain objects) is the single source of truth.
   Every time the array changes, we re-run:
     - renderConfiguration()  -> rebuilds the field cards in the left panel
     - renderForm()           -> rebuilds the actual <form> in the preview panel
     - updateAccessibilityStatus() -> refreshes the live field/required counts

   This "state array -> re-render" pattern is the same idea used by modern
   UI frameworks, but done here by hand with document.createElement(),
   so the DOM manipulation is fully visible and explainable.
   ============================================================================ */

/* ------------------------------------------------------------------------ */
/* 1. APPLICATION STATE                                                      */
/* ------------------------------------------------------------------------ */

/** @type {Array<Object>} The single source of truth for all form fields. */
let fields = [];

/** Counter used to generate unique, ever-increasing field IDs. */
let nextFieldId = 1;

/** The current title typed into the "Form title" input. */
let formTitle = "Student Registration Form";

/** Tracks the id of a field currently being edited inline (or null). */
let editingFieldId = null;

/**
 * Returns a brand-new copy of the default field configuration.
 * Used both on first load and when the user clicks "Reset form builder".
 */
function getDefaultFields() {
  return [
    { id: 1, type: "text", label: "Full Name", required: true, placeholder: "Enter your full name" },
    { id: 2, type: "email", label: "Email Address", required: true, placeholder: "Enter your email" },
    { id: 3, type: "phone", label: "Phone Number", required: false, placeholder: "10-digit mobile number" },
    {
      id: 4,
      type: "select",
      label: "Department",
      required: true,
      options: ["Computer Science", "Electronics", "Mechanical", "Civil", "Electrical"],
    },
    { id: 5, type: "checkbox", label: "Accept Terms and Conditions", required: true },
  ];
}

/* ------------------------------------------------------------------------ */
/* 2. DOM REFERENCES                                                         */
/* ------------------------------------------------------------------------ */

const formTitleInput = document.getElementById("form-title-input");
const addFieldForm = document.getElementById("add-field-form");
const fieldTypeSelect = document.getElementById("field-type-select");
const fieldLabelInput = document.getElementById("field-label-input");
const fieldPlaceholderInput = document.getElementById("field-placeholder-input");
const fieldOptionsInput = document.getElementById("field-options-input");
const fieldRequiredInput = document.getElementById("field-required-input");
const placeholderBlock = document.getElementById("placeholder-block");
const optionsBlock = document.getElementById("options-block");
const addFieldError = document.getElementById("add-field-error");

const fieldListEl = document.getElementById("field-list");
const formPreviewMount = document.getElementById("form-preview-mount");

const statTotalFields = document.getElementById("stat-total-fields");
const statRequiredFields = document.getElementById("stat-required-fields");

const resetBuilderBtn = document.getElementById("reset-builder-btn");
const exportJsonBtn = document.getElementById("export-json-btn");
const importJsonInput = document.getElementById("import-json-input");
const configIoMessage = document.getElementById("config-io-message");

const toggleContrastBtn = document.getElementById("toggle-contrast");
const toggleLargeTextBtn = document.getElementById("toggle-large-text");
const contrastStateLabel = document.getElementById("contrast-state");
const largeTextStateLabel = document.getElementById("large-text-state");

const configLiveStatus = document.getElementById("config-live-status");

/**
 * Where to send keyboard focus the next time renderConfiguration() runs.
 * Set by addField/removeField/moveFieldUp/moveFieldDown/editField just
 * before they re-render, then consumed and cleared by applyPendingFocus().
 * This exists because every render wipes and rebuilds the field-card DOM —
 * without this, the button the user just pressed would be destroyed and
 * keyboard/screen-reader focus would silently fall back to <body>.
 * @type {{ fieldId?: number, action?: "up"|"down"|"edit" } | null}
 */
let pendingFocus = null;

/**
 * Writes a short message into the visually-hidden ARIA live region so
 * screen-reader users hear a confirmation of what just happened (added,
 * deleted, reordered, edited), even though their keyboard focus stays on a
 * button rather than moving to the changed content itself.
 */
function announce(message) {
  configLiveStatus.textContent = "";
  // Re-set on the next tick: an identical message set twice in a row would
  // otherwise not be noticed as a "change" by assistive tech.
  window.setTimeout(() => {
    configLiveStatus.textContent = message;
  }, 50);
}

/**
 * Moves keyboard focus to wherever `pendingFocus` points, now that
 * renderConfiguration() has finished rebuilding the field cards. Falls back
 * to the field list container itself (e.g. after a delete, where the
 * target button no longer exists).
 */
function applyPendingFocus() {
  if (!pendingFocus) return;
  const { fieldId, action } = pendingFocus;
  pendingFocus = null;

  if (fieldId != null && action) {
    const target = fieldListEl.querySelector(`[data-field-id="${fieldId}"][data-action="${action}"]`);
    if (target && !target.disabled) {
      target.focus();
      return;
    }
  }
  // Fallback: focus the list container so screen-reader users land
  // somewhere sensible instead of losing focus entirely.
  fieldListEl.focus();
}

/* ------------------------------------------------------------------------ */
/* 3. INITIALIZATION                                                         */
/* ------------------------------------------------------------------------ */

function initializeApp() {
  fields = getDefaultFields();
  nextFieldId = fields.length + 1;
  formTitle = "Student Registration Form";
  formTitleInput.value = formTitle;

  attachStaticEventListeners();
  updateAddFieldFormVisibility();

  renderConfiguration();
  renderForm();
  updateAccessibilityStatus();
}

/* ------------------------------------------------------------------------ */
/* 4. FIELD MANAGEMENT (add / remove / reorder / edit)                      */
/* ------------------------------------------------------------------------ */

/**
 * Adds a new field object to the `fields` array and re-renders everything.
 * Uses Array.push() as required by the project brief.
 */
function addField(fieldConfig) {
  fields.push(fieldConfig);
  renderConfiguration();
  renderForm();
  updateAccessibilityStatus();
  announce(`Field added: ${fieldConfig.label}.`);
}

/**
 * Removes a field by id using Array.filter(), then re-renders.
 * Focus is deliberately sent to the field list afterwards (see
 * applyPendingFocus) because the Delete button the user just pressed no
 * longer exists once the list re-renders.
 */
function removeField(id) {
  const removedField = fields.find((field) => field.id === id);
  fields = fields.filter((field) => field.id !== id);
  if (editingFieldId === id) editingFieldId = null;

  pendingFocus = null; // no matching button to return to — applyPendingFocus() will fall back to the list
  renderConfiguration();
  renderForm();
  updateAccessibilityStatus();
  if (removedField) announce(`Field deleted: ${removedField.label}.`);
}

/**
 * Moves a field one position earlier in the array (towards index 0).
 * Uses Array.findIndex() + splice()-style swap.
 */
function moveFieldUp(id) {
  const index = fields.findIndex((field) => field.id === id);
  if (index <= 0) return; // already first, or not found
  const newIndex = index - 1;
  // If the field is about to land in position 0, its "Move up" button will
  // be disabled next render, so send focus to "Move down" instead.
  pendingFocus = { fieldId: id, action: newIndex === 0 ? "down" : "up" };
  swapFields(index, newIndex);
  announce(`${fields[newIndex].label} moved up to position ${newIndex + 1} of ${fields.length}.`);
}

/**
 * Moves a field one position later in the array.
 */
function moveFieldDown(id) {
  const index = fields.findIndex((field) => field.id === id);
  if (index === -1 || index >= fields.length - 1) return; // already last
  const newIndex = index + 1;
  // If the field is about to land in the last position, its "Move down"
  // button will be disabled next render, so send focus to "Move up" instead.
  pendingFocus = { fieldId: id, action: newIndex === fields.length - 1 ? "up" : "down" };
  swapFields(index, newIndex);
  announce(`${fields[newIndex].label} moved down to position ${newIndex + 1} of ${fields.length}.`);
}

function swapFields(indexA, indexB) {
  const temp = fields[indexA];
  fields[indexA] = fields[indexB];
  fields[indexB] = temp;
  renderConfiguration();
  renderForm();
}

/**
 * Applies an edited set of properties to an existing field object
 * (found using Array.find()), then re-renders. Focus returns to that
 * field's "Edit" button so the user lands back where they started.
 */
function editField(id, changes) {
  const field = fields.find((f) => f.id === id);
  if (!field) return;
  Object.assign(field, changes);
  editingFieldId = null;

  pendingFocus = { fieldId: id, action: "edit" };
  renderConfiguration();
  renderForm();
  updateAccessibilityStatus();
  announce(`Field updated: ${field.label}.`);
}

/* ------------------------------------------------------------------------ */
/* 5. RENDER: CONFIGURATION PANEL (field cards)                             */
/* ------------------------------------------------------------------------ */

const FIELD_TYPE_LABELS = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  select: "Dropdown",
  checkbox: "Checkbox",
};

/**
 * Rebuilds the list of field cards in the configuration panel from the
 * `fields` array. This function demonstrates dynamic element creation:
 * every card, badge and button below is built with document.createElement(),
 * never hard-coded in index.html.
 */
function renderConfiguration() {
  fieldListEl.textContent = ""; // clear previous contents

  if (fields.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "empty-state";
    emptyState.textContent = "No fields configured yet. Add one above.";
    fieldListEl.appendChild(emptyState);
    return;
  }

  fields.forEach((field, index) => {
    const card = document.createElement("li");
    card.className = "field-card";

    if (editingFieldId === field.id) {
      card.appendChild(buildEditCard(field));
    } else {
      card.appendChild(buildDisplayCard(field, index));
    }

    fieldListEl.appendChild(card);
  });

  applyPendingFocus();
}

/** Builds the normal (non-editing) view of a field card. */
function buildDisplayCard(field, index) {
  const wrapper = document.createDocumentFragment();

  const row = document.createElement("div");
  row.className = "field-card__row";

  // --- Meta (label, type, required badge) ---
  const meta = document.createElement("div");
  meta.className = "field-card__meta";

  const labelEl = document.createElement("p");
  labelEl.className = "field-card__label";
  labelEl.textContent = field.label || "(untitled field)";
  meta.appendChild(labelEl);

  const typeEl = document.createElement("p");
  typeEl.className = "field-card__type";
  typeEl.textContent = FIELD_TYPE_LABELS[field.type] || field.type;
  meta.appendChild(typeEl);

  const badge = document.createElement("span");
  badge.className = field.required
    ? "field-card__badge field-card__badge--required"
    : "field-card__badge field-card__badge--optional";
  badge.textContent = field.required ? "Required" : "Optional";
  meta.appendChild(badge);

  row.appendChild(meta);

  // --- Actions (move up/down, edit, delete) ---
  const actions = document.createElement("div");
  actions.className = "field-card__actions";

  const upBtn = createIconButton("\u2191", `Move "${field.label}" up`, () => moveFieldUp(field.id));
  upBtn.disabled = index === 0;
  upBtn.dataset.fieldId = field.id;
  upBtn.dataset.action = "up";

  const downBtn = createIconButton("\u2193", `Move "${field.label}" down`, () => moveFieldDown(field.id));
  downBtn.disabled = index === fields.length - 1;
  downBtn.dataset.fieldId = field.id;
  downBtn.dataset.action = "down";

  const editBtn = createIconButton("Edit", `Edit "${field.label}"`, () => {
    editingFieldId = field.id;
    renderConfiguration();
    // Move focus into the edit form itself rather than leaving it on a
    // button that just disappeared from the DOM.
    const labelInput = fieldListEl.querySelector(`#edit-label-${field.id}`);
    if (labelInput) labelInput.focus();
  });
  editBtn.dataset.fieldId = field.id;
  editBtn.dataset.action = "edit";

  const deleteBtn = createIconButton("Delete", `Delete "${field.label}"`, () => removeField(field.id));
  deleteBtn.classList.add("btn--danger");
  deleteBtn.dataset.fieldId = field.id;
  deleteBtn.dataset.action = "delete";

  actions.append(upBtn, downBtn, editBtn, deleteBtn);
  row.appendChild(actions);

  wrapper.appendChild(row);
  return wrapper;
}

/** Creates a small button used for card actions (real <button>, keyboard accessible). */
function createIconButton(text, ariaLabel, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--secondary btn--icon";
  btn.textContent = text;
  btn.setAttribute("aria-label", ariaLabel);
  btn.addEventListener("click", onClick);
  return btn;
}

/** Builds the inline edit form shown when the user clicks "Edit" on a card. */
function buildEditCard(field) {
  const wrapper = document.createElement("div");

  const labelWrap = document.createElement("div");
  labelWrap.className = "config-block";
  const labelLabel = document.createElement("label");
  const labelInputId = `edit-label-${field.id}`;
  labelLabel.setAttribute("for", labelInputId);
  labelLabel.textContent = "Field label";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.id = labelInputId;
  labelInput.className = "text-input";
  labelInput.value = field.label;
  labelWrap.append(labelLabel, labelInput);
  wrapper.appendChild(labelWrap);

  let placeholderInput = null;
  if (field.type === "text" || field.type === "email" || field.type === "phone") {
    const placeholderWrap = document.createElement("div");
    placeholderWrap.className = "config-block";
    const placeholderLabelId = `edit-placeholder-${field.id}`;
    const placeholderLabel = document.createElement("label");
    placeholderLabel.setAttribute("for", placeholderLabelId);
    placeholderLabel.textContent = "Placeholder";
    placeholderInput = document.createElement("input");
    placeholderInput.type = "text";
    placeholderInput.id = placeholderLabelId;
    placeholderInput.className = "text-input";
    placeholderInput.value = field.placeholder || "";
    placeholderWrap.append(placeholderLabel, placeholderInput);
    wrapper.appendChild(placeholderWrap);
  }

  let optionsInput = null;
  if (field.type === "select") {
    const optionsWrap = document.createElement("div");
    optionsWrap.className = "config-block";
    const optionsLabelId = `edit-options-${field.id}`;
    const optionsLabel = document.createElement("label");
    optionsLabel.setAttribute("for", optionsLabelId);
    optionsLabel.textContent = "Options (comma-separated)";
    optionsInput = document.createElement("input");
    optionsInput.type = "text";
    optionsInput.id = optionsLabelId;
    optionsInput.className = "text-input";
    optionsInput.value = (field.options || []).join(", ");
    optionsWrap.append(optionsLabel, optionsInput);
    wrapper.appendChild(optionsWrap);
  }

  const requiredWrap = document.createElement("div");
  requiredWrap.className = "config-block config-block--checkbox";
  const requiredInput = document.createElement("input");
  requiredInput.type = "checkbox";
  const requiredId = `edit-required-${field.id}`;
  requiredInput.id = requiredId;
  requiredInput.checked = !!field.required;
  const requiredLabel = document.createElement("label");
  requiredLabel.setAttribute("for", requiredId);
  requiredLabel.textContent = "This field is required";
  requiredWrap.append(requiredInput, requiredLabel);
  wrapper.appendChild(requiredWrap);

  const editErrorMsg = document.createElement("p");
  editErrorMsg.className = "form-message form-message--error";
  editErrorMsg.setAttribute("role", "alert");
  wrapper.appendChild(editErrorMsg);

  const actionsRow = document.createElement("div");
  actionsRow.className = "field-card__actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary btn--icon";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const newLabel = labelInput.value.trim();
    if (!newLabel) {
      editErrorMsg.textContent = "Field label cannot be empty.";
      return;
    }

    const changes = { label: newLabel, required: requiredInput.checked };

    if (placeholderInput) {
      changes.placeholder = placeholderInput.value.trim();
    }

    if (optionsInput) {
      const parsedOptions = parseOptionsString(optionsInput.value);
      if (parsedOptions.length === 0) {
        editErrorMsg.textContent = "A dropdown needs at least one option.";
        return;
      }
      changes.options = parsedOptions;
    }

    editField(field.id, changes);
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--secondary btn--icon";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    editingFieldId = null;
    pendingFocus = { fieldId: field.id, action: "edit" }; // return focus to this card's Edit button
    renderConfiguration();
  });

  actionsRow.append(saveBtn, cancelBtn);
  wrapper.appendChild(actionsRow);

  return wrapper;
}

function parseOptionsString(rawValue) {
  return rawValue
    .split(",")
    .map((opt) => opt.trim())
    .filter((opt) => opt.length > 0);
}

/* ------------------------------------------------------------------------ */
/* 6. RENDER: DYNAMIC FORM (live preview)                                    */
/* ------------------------------------------------------------------------ */

/**
 * The core rendering engine. Reads the `fields` configuration array and
 * builds the actual, real <form> element entirely with DOM APIs:
 * document.createElement(), appendChild(), setAttribute(), classList,
 * and textContent. Nothing here is hard-coded HTML.
 */
function renderForm() {
  formPreviewMount.textContent = ""; // clear previous form

  const form = document.createElement("form");
  form.id = "generated-form";
  form.setAttribute("novalidate", ""); // we handle validation ourselves

  const heading = document.createElement("h3");
  heading.className = "generated-form__title";
  heading.textContent = formTitle || "Untitled Form";
  form.appendChild(heading);

  fields.forEach((field) => {
    form.appendChild(createFieldElement(field));
  });

  // Live region announcing overall submit success/failure.
  const statusRegion = document.createElement("div");
  statusRegion.id = "form-status";
  statusRegion.className = "form-status-region";
  statusRegion.setAttribute("role", "status");
  statusRegion.setAttribute("aria-live", "polite");

  const actionsRow = document.createElement("div");
  actionsRow.className = "generated-form__actions";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn btn--primary";
  submitBtn.textContent = "Submit form";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn btn--secondary";
  clearBtn.textContent = "Clear form";
  clearBtn.addEventListener("click", () => {
    form.reset();
    fields.forEach((field) => clearFieldError(field.id));
    statusRegion.textContent = "";
    statusRegion.className = "form-status-region";
  });

  actionsRow.append(submitBtn, clearBtn);
  form.appendChild(actionsRow);
  form.appendChild(statusRegion);

  form.addEventListener("submit", (event) => {
    event.preventDefault(); // MANDATORY: never let the browser reload the page
    const isFormValid = validateForm(form);

    if (isFormValid) {
      statusRegion.textContent = "Form submitted successfully.";
      statusRegion.className = "form-status-region form-status-region--success";
    } else {
      statusRegion.textContent = "The form has errors. Please review the highlighted fields.";
      statusRegion.className = "form-status-region form-status-region--error";
      // Move focus to the first invalid control for keyboard/screen-reader users.
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
    }
  });

  formPreviewMount.appendChild(form);
}

/**
 * Creates one fully accessible form-field block (label + control + error
 * paragraph) for a single field configuration object, and wires up
 * real-time validation events (blur / input / change).
 */
function createFieldElement(field) {
  const container = document.createElement("div");
  container.className = field.type === "checkbox" ? "form-field form-field--checkbox" : "form-field";

  const controlId = `field-${field.id}`;
  const errorId = `field-${field.id}-error`;

  const label = document.createElement("label");
  label.setAttribute("for", controlId);
  label.textContent = field.label;
  if (field.required) {
    const marker = document.createElement("span");
    marker.className = "required-marker";
    marker.setAttribute("aria-hidden", "true"); // "required" is announced via aria-required instead
    marker.textContent = "*";
    label.appendChild(marker);
  }

  let control;

  if (field.type === "select") {
    control = document.createElement("select");
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "-- Select an option --";
    control.appendChild(placeholderOption);

    (field.options || []).forEach((optionText) => {
      const option = document.createElement("option");
      option.value = optionText;
      option.textContent = optionText;
      control.appendChild(option);
    });
  } else if (field.type === "checkbox") {
    control = document.createElement("input");
    control.type = "checkbox";
  } else {
    control = document.createElement("input");
    control.type = field.type === "phone" ? "tel" : field.type; // "text" | "email" | "tel"
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.type === "phone") {
      control.setAttribute("pattern", "[6-9][0-9]{9}");
      control.setAttribute("inputmode", "numeric");
    }
  }

  control.id = controlId;
  if (field.type !== "checkbox") {
    control.classList.add("form-field__control"); // checkboxes keep their native size/styling
  }

  // --- Core accessibility wiring -----------------------------------------
  if (field.required) {
    control.setAttribute("required", "");
    control.setAttribute("aria-required", "true");
  } else {
    control.setAttribute("aria-required", "false");
  }
  control.setAttribute("aria-invalid", "false");
  control.setAttribute("aria-describedby", errorId);

  const errorEl = document.createElement("p");
  errorEl.id = errorId;
  errorEl.className = "error-message";
  errorEl.setAttribute("role", "alert"); // announces new error text immediately

  // --- Real-time validation events ----------------------------------------
  control.addEventListener("blur", () => {
    validateField(field, control);
  });

  const revalidateIfNeeded = () => {
    if (control.getAttribute("aria-invalid") === "true") {
      validateField(field, control);
    }
  };
  control.addEventListener("input", revalidateIfNeeded);
  control.addEventListener("change", revalidateIfNeeded);

  // --- Assemble ------------------------------------------------------------
  if (field.type === "checkbox") {
    container.append(control, label, errorEl);
  } else {
    container.append(label, control, errorEl);
  }

  return container;
}

/* ------------------------------------------------------------------------ */
/* 7. VALIDATION                                                             */
/* ------------------------------------------------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INDIAN_PHONE_PATTERN = /^[6-9][0-9]{9}$/;

/**
 * Validates a single field against its configuration and reports the
 * result both visually (border) and through text (error paragraph +
 * aria-invalid), never through color alone.
 *
 * @param {Object} fieldConfig - the field's entry from the `fields` array
 * @param {HTMLElement} inputElement - the actual <input>/<select> in the DOM
 * @returns {boolean} true if the field is valid
 */
function validateField(fieldConfig, inputElement) {
  let message = "";

  if (fieldConfig.type === "checkbox") {
    if (fieldConfig.required && !inputElement.checked) {
      message = "You must accept this option.";
    }
  } else if (fieldConfig.type === "select") {
    if (fieldConfig.required && !inputElement.value) {
      message = "Please select an option.";
    }
  } else {
    const value = inputElement.value.trim();

    if (fieldConfig.required && value === "") {
      message = `${fieldConfig.label} is required.`;
    } else if (value !== "" && fieldConfig.type === "email" && !EMAIL_PATTERN.test(value)) {
      message = "Please enter a valid email address.";
    } else if (value !== "" && fieldConfig.type === "phone" && !INDIAN_PHONE_PATTERN.test(value)) {
      message = "Please enter a valid 10-digit Indian phone number.";
    }
  }

  if (message) {
    showFieldError(fieldConfig.id, message, inputElement);
    return false;
  }

  clearFieldError(fieldConfig.id, inputElement);
  return true;
}

/**
 * Validates every field currently in the live preview form.
 * Used on submit. Returns true only if every field is valid.
 */
function validateForm(formElement) {
  let allValid = true;

  fields.forEach((field) => {
    const control = formElement.querySelector(`#field-${field.id}`);
    if (!control) return;
    const isValid = validateField(field, control);
    if (!isValid) allValid = false;
  });

  return allValid;
}

/** Marks a control invalid and writes a screen-reader-friendly error message. */
function showFieldError(fieldId, message, inputElement) {
  const control = inputElement || document.getElementById(`field-${fieldId}`);
  const errorEl = document.getElementById(`field-${fieldId}-error`);
  if (!control || !errorEl) return;

  control.setAttribute("aria-invalid", "true");
  errorEl.textContent = message;
}

/** Clears a control's error state and restores aria-invalid="false". */
function clearFieldError(fieldId, inputElement) {
  const control = inputElement || document.getElementById(`field-${fieldId}`);
  const errorEl = document.getElementById(`field-${fieldId}-error`);
  if (!control || !errorEl) return;

  control.setAttribute("aria-invalid", "false");
  errorEl.textContent = "";
}

/* ------------------------------------------------------------------------ */
/* 8. ACCESSIBILITY STATUS PANEL                                             */
/* ------------------------------------------------------------------------ */

function updateAccessibilityStatus() {
  statTotalFields.textContent = String(fields.length);
  statRequiredFields.textContent = String(fields.filter((f) => f.required).length);
}

/* ------------------------------------------------------------------------ */
/* 9. JSON EXPORT / IMPORT                                                   */
/* ------------------------------------------------------------------------ */

function exportJSON() {
  const payload = {
    formTitle,
    fields,
  };
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = "form-config.json";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);

  configIoMessage.textContent = "Configuration exported as form-config.json.";
  configIoMessage.className = "form-message form-message--success";
}

function importJSON(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const incomingFields = Array.isArray(parsed) ? parsed : parsed.fields;

      if (!Array.isArray(incomingFields)) {
        throw new Error("File does not contain a valid fields array.");
      }

      // Basic shape validation so a malformed file can't break the UI.
      const isValidShape = incomingFields.every(
        (f) => f && typeof f.type === "string" && typeof f.label === "string"
      );
      if (!isValidShape) {
        throw new Error("One or more fields are missing a type or label.");
      }

      fields = incomingFields.map((f, index) => ({
        id: typeof f.id === "number" ? f.id : index + 1,
        type: f.type,
        label: f.label,
        required: !!f.required,
        placeholder: f.placeholder || "",
        options: Array.isArray(f.options) ? f.options : undefined,
      }));
      nextFieldId = Math.max(0, ...fields.map((f) => f.id)) + 1;

      if (!Array.isArray(parsed) && typeof parsed.formTitle === "string") {
        formTitle = parsed.formTitle;
        formTitleInput.value = formTitle;
      }

      editingFieldId = null;
      renderConfiguration();
      renderForm();
      updateAccessibilityStatus();

      configIoMessage.textContent = "Configuration imported successfully.";
      configIoMessage.className = "form-message form-message--success";
    } catch (error) {
      configIoMessage.textContent = `Import failed: ${error.message}`;
      configIoMessage.className = "form-message form-message--error";
    }
  };
  reader.onerror = () => {
    configIoMessage.textContent = "Import failed: could not read the file.";
    configIoMessage.className = "form-message form-message--error";
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------------ */
/* 10. RESET                                                                 */
/* ------------------------------------------------------------------------ */

function resetBuilder() {
  fields = getDefaultFields();
  nextFieldId = fields.length + 1;
  formTitle = "Student Registration Form";
  formTitleInput.value = formTitle;
  editingFieldId = null;

  renderConfiguration();
  renderForm();
  updateAccessibilityStatus();

  configIoMessage.textContent = "Form builder reset to the default configuration.";
  configIoMessage.className = "form-message form-message--success";
}

/* ------------------------------------------------------------------------ */
/* 11. DISPLAY MODES (high contrast / large text)                           */
/* ------------------------------------------------------------------------ */

function toggleHighContrast() {
  const isActive = document.body.classList.toggle("high-contrast");
  toggleContrastBtn.setAttribute("aria-pressed", String(isActive));
  contrastStateLabel.textContent = isActive ? "On" : "Off";
}

function toggleLargeText() {
  const isActive = document.body.classList.toggle("large-text");
  toggleLargeTextBtn.setAttribute("aria-pressed", String(isActive));
  largeTextStateLabel.textContent = isActive ? "On" : "Off";
}

/* ------------------------------------------------------------------------ */
/* 12. STATIC EVENT LISTENERS                                                */
/* ------------------------------------------------------------------------ */

function updateAddFieldFormVisibility() {
  const selectedType = fieldTypeSelect.value;
  optionsBlock.hidden = selectedType !== "select";
  placeholderBlock.hidden = selectedType === "select" || selectedType === "checkbox";
}

function attachStaticEventListeners() {
  formTitleInput.addEventListener("input", () => {
    formTitle = formTitleInput.value;
    renderForm();
  });

  fieldTypeSelect.addEventListener("change", updateAddFieldFormVisibility);

  addFieldForm.addEventListener("submit", (event) => {
    event.preventDefault(); // no page reload when adding a field
    addFieldError.textContent = "";

    const type = fieldTypeSelect.value;
    const label = fieldLabelInput.value.trim();
    const required = fieldRequiredInput.checked;

    if (!label) {
      addFieldError.textContent = "Please enter a field label before adding it.";
      return;
    }

    const newField = {
      id: nextFieldId++,
      type,
      label,
      required,
    };

    if (type === "text" || type === "email" || type === "phone") {
      newField.placeholder = fieldPlaceholderInput.value.trim();
    }

    if (type === "select") {
      const parsedOptions = parseOptionsString(fieldOptionsInput.value);
      if (parsedOptions.length === 0) {
        addFieldError.textContent = "A dropdown field needs at least one option.";
        nextFieldId--; // undo the reservation since we are rejecting this field
        return;
      }
      newField.options = parsedOptions;
    }

    addField(newField);

    // Reset the "add field" mini-form for the next entry.
    addFieldForm.reset();
    fieldTypeSelect.value = "text";
    updateAddFieldFormVisibility();
    fieldLabelInput.focus();
  });

  resetBuilderBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Reset the form builder to its default configuration?");
    if (confirmed) resetBuilder();
  });

  exportJsonBtn.addEventListener("click", exportJSON);

  importJsonInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    importJSON(file);
    importJsonInput.value = ""; // allow re-importing the same filename later
  });

  toggleContrastBtn.addEventListener("click", toggleHighContrast);
  toggleLargeTextBtn.addEventListener("click", toggleLargeText);
}

/* ------------------------------------------------------------------------ */
/* 13. BOOTSTRAP                                                             */
/* ------------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", initializeApp);
