# Checking a Workday form

ApplyKit's Workday improvements were built from screenshots and a
fictional fixture (`fixtures/workday-style.html`), not from Workday's
markup, which was not available. These two checks show, on a real form,
why a dropdown is or is not one ApplyKit can choose in. Both are local and
read-only: they click nothing, send nothing anywhere and print no answers.

## 1. In ApplyKit

1. Open ApplyKit's options and turn on **Developer diagnostics**.
2. On the Workday page, open ApplyKit, choose **Show all fields** and
   select a dropdown it only guides (for example Degree).
3. The diagnostics line ends with `dropdown not chosen in: …` and the
   rule it failed, for example `aria-expanded is missing or not "false"`.
   A dropdown for a question ApplyKit does not answer (Language) has no
   such line: there is no saved value for it.

## 2. In the browser console (optional)

Open DevTools on the Workday page, Console tab, and paste:

```js
(() => {
  const triggers = [
    ...document.querySelectorAll(
      '[aria-haspopup="listbox"], [role="combobox"]',
    ),
  ].slice(0, 40);
  console.table(
    triggers.map((el) => {
      const id = (el.getAttribute('aria-controls') ?? '').trim();
      const popup = id ? document.getElementById(id) : null;
      return {
        tag: el.localName,
        type: el.getAttribute('type'),
        role: el.getAttribute('role'),
        haspopup: el.getAttribute('aria-haspopup'),
        expanded: el.getAttribute('aria-expanded'),
        controls: id
          ? popup
            ? popup.getAttribute('role')
            : 'not in page'
          : '',
        labelledBy: el.hasAttribute('aria-labelledby'),
        labels: el.labels ? el.labels.length : 0,
        ariaLabelWords: (el.getAttribute('aria-label') ?? '')
          .split(/\s+/)
          .filter(Boolean).length,
        shadowRoot: el.getRootNode() !== document,
      };
    }),
  );
})();
```

Then open one dropdown with the mouse and run it again: the `expanded`
and `controls` columns show whether the open list is named by its
button. The table contains structure only, never what the fields say or
what you chose; copy it, not screenshots of your application.
