use chrome dev tools sparingly, as it eats tokens. only use it to verify if a problem re-emerges, or when asked explicitly.

when the user asks for a change to be made/pushed, push directly to `master` without asking for confirmation first — this is a standing authorization, not a one-off. `master` is the production branch and deploys to GitHub Pages on push.
