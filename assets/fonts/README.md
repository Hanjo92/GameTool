# Noto Sans KR

Downloaded 2026-10-04 from the official Google Fonts repository:
https://github.com/google/fonts/tree/main/ofl/notosanskr

Source filename: `NotoSansKR[wght].ttf`. Local filename: `NotoSansKR.ttf`.
The font bytes are unmodified. Distributed under SIL Open Font License 1.1; see OFL.txt.
Included in generated examples so Korean text works without remote font services.

# Noto Serif KR

Downloaded 2026-10-04 from https://github.com/google/fonts/tree/main/ofl/notoserifkr .
Source NotoSerifKR[wght].ttf is retained byte-for-byte as NotoSerifKR.ttf. See OFL-Serif.txt.
Used for locally rendered reference-inspired serif cut-ins; no runtime font downloads.

# Reference font catalog

`catalog.json` lists 88 locally cached font families, variants, original filenames, source URLs, SHA-256 hashes and license filenames. Files under `catalog/<id>/` are unmodified Google Fonts files at commit `9710da1eacb3be272583c3224dcb70f9da6eadbb`. Each family retains its OFL license. Font binaries are local cache files excluded from Git. `npm run fonts:cache` restores missing files using only the catalog-pinned commit URLs, checks every SHA-256, and copies the verified Korean fallbacks. Existing mismatched files are preserved and cause an error. It does not rewrite the catalog or require an `output/` directory; normal editing, generation and playback make no font-network requests.

The generator includes only the selected variants and corresponding Hangul fallback families, with licenses. User-imported fonts retain their original bytes; WOFF/WOFF2 are decoded to sfnt for portable rendering. System-font names intentionally reference the target's installed fonts and are not copied without a supplied font file.
