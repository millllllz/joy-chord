use chrome-devtools mcp sparingly. only use to verify problem reemergence, or when asked explicitly.

# MVP Mode (current)
when the user asks for a change to be made/pushed, push directly to `master` without asking for confirmation first — this is a standing authorization, not a one-off. `master` is the production branch and deploys to GitHub Pages on push.

## Build version SHA
before every push, update both to the short SHA of the commit about to be made:
- `#build-version` text in index.html
- `?v=` query param on the `src/index.js` script tag in index.html

# System Behavior
Keep system prompts/instructions to minimum; bullets or numbers only.
