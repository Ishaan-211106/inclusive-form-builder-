# Inclusive Smart Form Builder

### An Accessibility-First Dynamic Form Builder Using Pure JavaScript

A BTech CSE PBL project demonstrating DOM manipulation, event-driven
programming, and accessible web form design — built entirely with HTML5,
CSS3, and vanilla JavaScript (no frameworks, no libraries).

---

## 1. Problem Statement

Most "form builder" demos focus only on generating inputs quickly, and treat
accessibility as an afterthought — a color scheme, not a structural
requirement. This project builds a **client-side, accessibility-first**
dynamic form tool: a user configures a list of fields (text, email, phone,
dropdown, checkbox), and the application generates a real, working HTML form
from that configuration using pure DOM manipulation. Every generated field is
properly labeled, validated in real time, and wired up with ARIA attributes
so that the form is just as usable with a screen reader and a keyboard as it
is with a mouse.

## 2. Why Accessibility Matters

Roughly 1 in 6 people live with some form of disability, and many forms on
the web are unusable for them — inputs without labels, error messages that
only show up as a red border, or interactive elements that can't be reached
without a mouse. Accessibility isn't a visual theme; it is part of a form's
*structure*. This project treats `label`/`for` pairing, `aria-required`,
`aria-invalid`, `aria-describedby`, and keyboard operability as core
functional requirements — the same priority as "does the button work."

## 3. Technologies Used

| Layer      | Technology                     |
|------------|---------------------------------|
| Structure  | HTML5 (semantic elements)       |
| Styling    | CSS3 (custom properties, Grid, Flexbox) |
| Behavior   | Vanilla JavaScript (ES6+)       |
| Backend    | None — fully client-side        |

No React/Angular/Vue, no Bootstrap/Tailwind, no jQuery, no TypeScript, no
build tools. Everything runs by opening `index.html` in a browser.

## 4. Features

- **Form Configuration Panel** — set a form title, add/edit/delete/reorder
  fields (Text, Email, Phone, Dropdown, Checkbox).
- **Live Form Preview** — the real, working form, regenerated from the
  configuration array every time it changes.
- **Real-time, accessible validation** — required fields, email format,
  10-digit Indian phone numbers, dropdown selection, required checkboxes.
- **Accessibility Status panel** — live counts of configured/required fields
  and a plain-language list of implemented accessibility features.
- **High Contrast Mode** and **Large Text Mode** — toggled instantly via
  `classList.toggle()`.
- **JSON Export / Import** — download the current configuration as
  `form-config.json`, or reload a previously exported file.
- **Reset to defaults** — restores a 5-field sample configuration.

## 5. Data Structure

The entire application is driven by one array of plain objects:

```js
let fields = [
  { id: 1, type: "text",     label: "Full Name",     required: true,  placeholder: "Enter your full name" },
  { id: 2, type: "email",    label: "Email Address",  required: true,  placeholder: "Enter your email" },
  { id: 3, type: "phone",    label: "Phone Number",   required: false, placeholder: "10-digit mobile number" },
  { id: 4, type: "select",   label: "Department",     required: true,  options: ["Computer Science", "Electronics", "Mechanical", "Civil", "Electrical"] },
  { id: 5, type: "checkbox", label: "Accept Terms and Conditions", required: true },
];
```

This array is the **single source of truth**. The configuration panel and
the live preview are both just different renderings of it — nothing is
duplicated by hand, so the two views can never drift out of sync. Adding a
sixth field type later (e.g. "date") only requires teaching
`createFieldElement()` and `validateField()` one more `case`, not rewriting
the rest of the app.

## 6. DOM Manipulation

Nothing in the generated form or field-card list is hard-coded in
`index.html`. Everything is built with:

- `document.createElement()` — to create every label, input, button, and
  error paragraph
- `appendChild()` / `append()` — to assemble elements into the page
- `setAttribute()` — to wire up `id`, `for`, `aria-*`, `pattern`, etc.
- `classList` — to toggle styling states (e.g. `high-contrast`, invalid
  borders)
- `textContent` — to safely set visible text without an XSS-prone
  `innerHTML`

The render functions (`renderConfiguration()`, `renderForm()`) always clear
the relevant container first (`element.textContent = ""`) and rebuild it
from the current `fields` array, which keeps the DOM and the state array
consistent at all times.

## 7. Event Handling

The project uses `addEventListener()` throughout, for example:

- `submit` on the "Add field" mini-form and the generated form
  (`event.preventDefault()` in both, so the page never reloads)
- `blur` on every generated input, to validate once the user leaves a field
- `input` / `change`, to re-validate immediately once a field already has an
  error (so the message disappears the moment it's fixed)
- `click` on every button (move up/down, edit, save, cancel, delete, export,
  reset, toggle contrast/large text)

## 8. Validation

`validateField(fieldConfig, inputElement)` is a single reusable function
that checks one field against its configuration and returns `true`/`false`:

- **Required check** — any empty required field
- **Email** — a standard `name@domain.tld` pattern
- **Phone** — a 10-digit Indian mobile number, `[6-9][0-9]{9}`
- **Dropdown** — must have a selected value
- **Checkbox** — must be checked if required

`validateForm()` loops over every field on submit and reports overall
success/failure through the live status region.

## 9. ARIA Implementation

Every generated control includes:

- `id` on the control + matching `<label for="...">`
- `aria-required="true"` / `"false"` depending on the field's required flag
- `aria-invalid="true"` / `"false"`, updated live during validation
- `aria-describedby` pointing at a dedicated `<p id="field-N-error">`
  element, so assistive technology announces the *specific* error text
  together with the field
- `role="alert"` on error paragraphs, and a `role="status" aria-live="polite"`
  region for the overall submit result — so errors and success messages are
  announced without moving focus unexpectedly

Color is never the only signal: invalid fields get a thicker, differently
colored border **and** a text error message with a warning glyph.

**Dynamic-change announcements.** Adding, deleting, reordering, and editing a
field all happen in the configuration panel, where a screen-reader user's
focus usually stays on the button they just pressed — not on the part of
the page that changed. A hidden `<p role="status" aria-live="polite">`
(`#config-live-status`) announces a short confirmation for every one of
these actions (e.g. *"Field deleted: Phone Number."*), so the user hears
what happened even though they never looked away from the button.

**Focus management.** Because every render wipes and rebuilds the field
cards, a button a user just pressed can disappear from the DOM. The app
tracks where focus should land next (`pendingFocus` in `script.js`) and
restores it after each render — back onto the same Move/Edit button when it
still exists at a new position, or onto the field list itself after a
delete — so keyboard and screen-reader users never silently lose their
place.

**Color contrast.** Every text/background color pair used in the interface
was checked against the WCAG AA contrast thresholds (4.5:1 for normal text,
3:1 for large/bold text) using the standard relative-luminance formula.
Two colors from an earlier pass fell short and were darkened:
the amber "required" marker (now `--color-accent-text: #9c6418`, used only
for text, kept separate from the lighter `--color-accent` used for
decorative badges/borders) and the success message color
(`--color-success: #256048`). High Contrast Mode's palette was checked the
same way and clears AA by a wide margin everywhere it's used.

## 10. Keyboard Accessibility

- Every interactive control is a real `<button>`, `<input>`, `<select>`, or
  `<a>` — never a clickable `<div>`.
- A "Skip to main content" link is the first focusable element on the page.
- `:focus-visible` has a strong, high-contrast outline everywhere, and is
  never suppressed.
- Move Up / Move Down / Edit / Delete / Save / Cancel are all standard
  buttons reachable by Tab and activated with Enter/Space.
- Focus order follows the visual/logical order of the page.

## 11. JSON Export

"Export configuration" serializes `{ formTitle, fields }` with
`JSON.stringify(fields, null, 2)`, wraps it in a `Blob`, and triggers a
download named `form-config.json` — entirely client-side, using
`URL.createObjectURL()` and a temporary `<a download>` link.

## 12. JSON Import

"Import configuration" reads a user-selected `.json` file with the
`FileReader` API, `JSON.parse()`s it, validates its shape (must contain a
`fields` array of objects with at least a `type` and `label`), and replaces
the current configuration. Malformed files show a friendly error message
instead of breaking the UI.

## 13. High Contrast Mode

`toggleHighContrast()` calls `document.body.classList.toggle("high-contrast")`.
All colors in `style.css` are defined as CSS custom properties on `:root`;
the `.high-contrast` class simply overrides those variables with a
black-background, high-contrast palette, so every component updates
automatically without touching JavaScript layout logic. "Large Text Mode"
works the same way with a `.large-text` class that increases the base font
size.

## 14. How to Run the Project

1. Download/clone the three files: `index.html`, `style.css`, `script.js`
   (keep them in the same folder).
2. Double-click `index.html`, or open it from your browser with
   `File → Open`.
3. No server, build step, or internet connection is required.

## 15. How to Test It

**Keyboard test**
1. Press Tab repeatedly and confirm every interactive element receives a
   visible focus outline, in a logical order.
2. Use Enter/Space to activate buttons.
3. Complete and submit the form using only the keyboard.

**Validation test** — try each of these and confirm the correct message
appears, then correct the value and confirm the message clears:
- Leave a required field empty
- Type an invalid email (e.g. `abc@`)
- Type an invalid phone number (e.g. `12345`)
- Leave the dropdown on "-- Select an option --"
- Leave "Accept Terms and Conditions" unchecked
- Fill in valid values for everything and submit

**Configuration test**
- Add a field, delete a field, reorder fields, edit a field's label — the
  live preview should update instantly, with no page reload.
- Export the configuration, then import it back and confirm the form is
  identical.

## 16. Lighthouse Accessibility Testing

Open the page in Chrome, then **DevTools → Lighthouse → Accessibility →
Analyze page load**. Also inspect **DevTools → Elements → Accessibility**
for any individual control to see its computed accessible name, role, and
ARIA properties. This project is *designed* to score well under Lighthouse's
accessibility checks, but no score is hard-coded anywhere in the app —
run the audit yourself to get a real, current result.

## 17. Future Improvements

- Additional field types (date picker, number, radio-button group, textarea)
- Per-field custom validation rules (e.g. min/max length)
- Drag-and-drop reordering as an alternative to the Up/Down buttons
- Multi-page/multi-step form support
- Saving multiple named configurations (would require `localStorage` or a
  backend, which was intentionally out of scope for this project)

---

## VIVA QUESTIONS AND ANSWERS

**1. What is DOM manipulation?**
Using JavaScript to read and change the structure, content, or attributes of
a web page after it has loaded — for example, creating a new `<input>` and
inserting it into the page with `appendChild()`.

**2. Why did you use an array of objects to store the fields?**
It's a natural fit for a list of similarly-shaped items. Each object holds
one field's configuration (type, label, required, etc.), and array methods
like `push`, `filter`, `find`, and `map` make adding, removing, searching,
and rendering fields straightforward and keep one single source of truth.

**3. How does dynamic rendering work in this project?**
`renderForm()` clears the preview container, then loops over the `fields`
array and calls `createFieldElement()` for each one, which builds a label,
an input/select, and an error paragraph using `document.createElement()`
and appends them to the form. Nothing about the generated fields is written
directly in `index.html`.

**4. What is `aria-label`?**
An attribute that provides an accessible name for an element when there is
no visible text to serve as its label — for example, an icon-only button.
This project mostly uses visible `<label>` elements, but uses
`aria-label` on compact action buttons like "Move up".

**5. What is `aria-describedby`?**
An attribute that links an element to another element (usually elsewhere in
the DOM) whose text describes it further — here, it connects each input to
its own error message paragraph so a screen reader announces the specific
error along with the field.

**6. What is `aria-invalid`?**
A boolean-ish attribute (`"true"`/`"false"`) that tells assistive technology
whether a form control currently has a validation error. This project
toggles it every time a field is validated.

**7. What is `aria-required`?**
An attribute that explicitly tells assistive technology whether a field must
be filled in. It's used *alongside* the native `required` attribute, not
instead of it.

**8. Why do we use `<label>` elements?**
Labels give every form control an accessible name, allow screen readers to
announce what a field is for, and let sighted mouse users click the label
text to focus the input. The `for`/`id` pairing is what programmatically
connects a label to its control.

**9. What is event handling?**
Writing code that runs in response to something happening on the page — a
click, a key press, a form submission — rather than running top-to-bottom
once. `addEventListener()` is the standard modern way to register these
responses.

**10. Why use `addEventListener()` instead of inline `onclick`?**
It keeps JavaScript separate from HTML, allows multiple listeners on the
same element, and is easier to add/remove dynamically — important here
because field cards and inputs are created and destroyed at runtime.

**11. What does `preventDefault()` do?**
It stops the browser's default behavior for an event — here, it stops a
form submission from reloading the page, so the app can handle validation
and success messages entirely in JavaScript.

**12. How does real-time validation work in this project?**
Each generated field listens for `blur` (validate once the user leaves the
field) and `input`/`change` (re-validate immediately, but only if the field
already has an error) — so an error appears as soon as you leave a bad
field, and disappears the moment you fix it, without waiting for submit.

**13. Why is keyboard accessibility important?**
Many users — including people with motor disabilities, screen-reader users,
and power users — cannot or do not use a mouse. If a feature is
mouse-only, it is effectively broken for them.

**14. What is a live region?**
An element marked with `aria-live` (or the `role="status"`/`role="alert"`
shortcuts) whose content changes are automatically announced by screen
readers, even if the user's focus is somewhere else on the page. This
project uses one for the overall submit result and one per field for error
messages.

**15. Why use `role="alert"`?**
It tells assistive technology to announce the element's content
*immediately and assertively* as soon as it changes — appropriate for
validation errors, which the user needs to know about right away.

**16. How does the form avoid a page reload?**
Every `<form>`'s `submit` event handler calls `event.preventDefault()`
before doing anything else, so the browser never performs its default
full-page submission/navigation.

**17. How does the reorder (move up/down) functionality work?**
`moveFieldUp`/`moveFieldDown` find the field's current index with
`findIndex()`, then swap it with its neighbor in the `fields` array. Because
rendering always reflects the current array order, re-rendering after the
swap visually reorders the fields.

**18. How is the dropdown generated dynamically?**
`createFieldElement()` creates a `<select>`, then loops over the field's
`options` array and creates one `<option>` element per entry with
`document.createElement("option")`, setting its `value` and `textContent`
from the array item.

**19. Why is semantic HTML important?**
Elements like `<header>`, `<main>`, `<fieldset>`, `<legend>`, and `<label>`
carry built-in meaning that browsers and assistive technology already
understand, giving accessibility "for free" — a `<button>` is keyboard
operable by default, but a styled `<div>` is not.

**20. What is the difference between `required` and `aria-required`?**
`required` is a native HTML attribute that also triggers the browser's
built-in constraint validation (and is what actually blocks native form
submission behavior). `aria-required` is purely an accessibility signal for
assistive technology and has no effect on browser validation by itself —
this project uses both together for maximum compatibility.

**21. Why does this project use `event.target` inside some handlers?**
To know exactly which element triggered the event, which matters when the
same handler pattern (e.g. `revalidateIfNeeded`) is attached to multiple
dynamically generated inputs.

**22. What happens if the user submits the form with several invalid
fields?**
`validateForm()` loops over every field and validates each one (not just
the first), so all invalid fields get their error messages at once. Focus
is then moved to the first invalid field so keyboard/screen-reader users
can fix issues in order.

**23. Why is the `fields` array described as the "single source of truth"?**
Because both the configuration panel and the live preview are pure
renderings *derived from* that one array — neither view stores its own
separate copy of the data, so they can never disagree with each other.

**24a. What is an ARIA live region, and where did you use one?**
A live region is a part of the page that screen readers automatically
monitor for changes and announce out loud, even if the user's keyboard
focus is somewhere else. I used two kinds: `role="alert"` on each field's
error paragraph (announces immediately, for urgent validation errors), and
`role="status" aria-live="polite"` for the overall submit result and for
confirming configuration changes like "Field added" or "Field deleted"
(announces without interrupting, since those aren't urgent).

**24b. Why do you manage focus manually after deleting or reordering a
field?**
Every render clears and rebuilds the field-card list from scratch, so the
exact button a user just clicked (e.g. "Move up") may no longer exist at
the same position afterwards. If I did nothing, keyboard/screen-reader
focus would silently fall back to the very top of the page, which is
disorienting. Instead, I track where focus should go next and restore it
after each render — back onto the same action button at its new position,
or onto the field list itself after a delete.

**24c. How did you verify your color choices pass accessibility
contrast rules, rather than just "looking fine"?**
I computed the WCAG relative-luminance contrast ratio for every
text/background pair used in the app and checked it against the 4.5:1
(normal text) / 3:1 (large or bold text) AA thresholds, the same check
Lighthouse performs. Two colors fell slightly short on that check and I
darkened them until they passed, rather than relying on them looking
acceptable by eye.

**25. What would you need to change to add a new field type, like "Date"?**
Add a `case` for it in `createFieldElement()` (to create an `<input
type="date">`), add any specific validation logic to `validateField()`, and
add it as an option in the "Field type" `<select>` in the configuration
panel. The rest of the app (rendering loop, add/remove/reorder, JSON
export/import) needs no changes.

---
