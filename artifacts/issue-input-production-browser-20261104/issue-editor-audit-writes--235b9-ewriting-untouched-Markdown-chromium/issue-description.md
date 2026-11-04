## Reproduction

The preview keeps an outdated status after switching rooms. Confirmed locally.

## Acceptance criteria

- [ ] Both editors show the selected room
- [x] The document remains editable

## Environment

| Client | Result |
| --- | --- |
| Chrome | Reproduced |
| Firefox | Verified locally |

~~~typescript
switchRoom("planning");
~~~

[host-docs]: https://example.com/docs "Host documentation"
An untouched paragraph with __deliberate source formatting__ and a [link][host-docs].
