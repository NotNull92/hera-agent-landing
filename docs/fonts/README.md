# Fonts

Self-hosted webfonts used by the landing page. All three families ship under the SIL Open Font License 1.1.

| File | Family | Upstream | License |
|------|--------|----------|---------|
| `cormorant.woff2`, `cormorant-italic.woff2` | Cormorant Garamond | https://github.com/CatharsisFonts/Cormorant | [OFL-Cormorant.txt](OFL-Cormorant.txt) |
| `inter.woff2` | Inter | https://github.com/rsms/inter | [OFL-Inter.txt](OFL-Inter.txt) |
| `jetbrains-mono.woff2` | JetBrains Mono | https://github.com/JetBrains/JetBrainsMono | [OFL-JetBrainsMono.txt](OFL-JetBrainsMono.txt) |

The woff2 files are the Latin subset Google Fonts serves at `fonts.gstatic.com` — extracted to remove the third-party request (privacy / GDPR) and to drop the runtime CDN dependency. Each is a variable font, so a single file covers the full weight range declared in `@font-face`.
