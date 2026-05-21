# ABC P3rman3nt brand font

Drop the brand font files in this directory. Expected filenames (referenced
from `app/globals.css` via `@font-face`):

- `ABCP3rman3nt-Regular.woff2`  (weight 400)
- `ABCP3rman3nt-Medium.woff2`   (weight 500)
- `ABCP3rman3nt-Bold.woff2`     (weight 700)

If you have different weights or filenames, either rename the files to match
or update the `@font-face` blocks in `app/globals.css` accordingly.

Until these files are present, the UI falls back to Inter (loaded from Google
Fonts in the same stylesheet).

Note: these files are licensed assets — do not redistribute outside this repo.
