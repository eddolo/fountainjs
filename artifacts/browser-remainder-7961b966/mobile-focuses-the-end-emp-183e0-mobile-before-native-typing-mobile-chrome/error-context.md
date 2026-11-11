# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile.spec.ts >> focuses the end empty text source on mobile before native typing
- Location: tests\browser\mobile.spec.ts:22:47

# Error details

```
Error: page.evaluate: TypeError: Cannot destructure property 'editor' of 'globalThis.fountainBrowserTest' as it is undefined.
    at eval (eval at evaluate (:311:30), <anonymous>:6:9)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Browser contract" [level=1] [ref=e3]
  - status "Document JSON"
  - region "Collaborative browser contract"
  - region "Tracked changes browser contract"
  - region "Page intent browser contract"
  - region "Editable pages browser contract"
```