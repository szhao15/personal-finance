# Personal finance marketing site

A from-scratch rebuild of the copilot.money landing page, made by inspecting the live site with
[REA](https://github.com/morluto/rea) (page structure, copy, colors, fonts) and screenshots.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

- `src/data.ts`: all copy and mock data. The brand name is the `BRAND` constant.
- `src/components/`: page sections (`Top`, `Features`, `Bottom`), device mockups (`Devices`), shared bits (`ui`).
- `src/index.css`: design tokens and styles.

Notes:
- Fonts: the original uses licensed Jokker/Matter; this uses Outfit/Figtree from Google Fonts.
- Testimonials are placeholders with fictional names.
- The monthly price ($13) is a placeholder; only the yearly price ($7.92/mo, $95/yr) was visible on the live site.
