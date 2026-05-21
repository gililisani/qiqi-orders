# ABC P3rman3nt brand font

Drop the brand font files in this directory. Expected filenames
(referenced from `app/globals.css` via `@font-face`):

- `ABCP3rman3nt-Book.woff2`  →  used for weights 400–600 (body, medium, semibold)
- `ABCP3rman3nt-Bold.woff2`  →  used for weights 700+ (headings, emphasis)

If your files are `.otf` or `.ttf`, convert them to `.woff2` at
[transfonter.org](https://transfonter.org/) (free, runs in the browser, no upload to any server).

If your file naming differs (e.g. `ABC-P3rman3nt-Book.woff2` with hyphens
or spaces), either rename to match the above or update the @font-face
blocks in `app/globals.css`.

Until these files are present, the UI falls back to Inter automatically.

Note: these files are licensed assets — do not redistribute outside this repo.
