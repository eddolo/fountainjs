/** Deliberately noncanonical syntax makes source preservation observable. */
export const issueMarkdown = `## Reproduction

The preview keeps an outdated status after switching rooms.

## Acceptance criteria

- [ ] Both editors show the selected room
- [x] The document remains editable

## Environment

| Client | Result |
| --- | --- |
| Chrome | Reproduced |
| Firefox | Needs checking |

~~~typescript
switchRoom("planning");
~~~

[host-docs]: https://example.com/docs "Host documentation"
An untouched paragraph with __deliberate source formatting__ and a [link][host-docs].
`;
