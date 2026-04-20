# Figma/Vite Redesign Prompt Archive (2026-04-12)

## User request summary
- Implement the Figma redesign exactly for the marketing site and internal app UI.
- Use the Vite export as the canonical UI reference.
- Preserve all existing logic (Ask, upload/OCR/indexing, Supabase, Vercel).
- Keep current routes; update visual layout, navigation, and placement to match Figma.
- Ensure owner/mechanic persona flows match Figma precisely.

## Figma links
- https://www.figma.com/make/XrKaJlnDLgS2mVsJRPfTMX/My-Aircraft?t=6vMzKiItpKKHIwhC-1
- https://www.figma.com/make/XrKaJlnDLgS2mVsJRPfTMX/My-Aircraft?p=f&t=6vMzKiItpKKHIwhC-0
- https://air0.figma.site
- https://www.figma.com/make/XrKaJlnDLgS2mVsJRPfTMX/My-Aircraft?t=6vMzKiItpKKHIwhC-20&fullscreen=1

## Local assets
- /Users/andy/Downloads/src-2.zip
- /Users/andy/Downloads/guidelines-2.zip
- /Users/andy/Downloads/SCREENS_MANIFEST.md
- /Users/andy/Downloads/DEVELOPER_HANDOUT.md
- /Users/andy/Downloads/APP_README.md
- /Users/andy/Downloads/ATTRIBUTIONS.md
- /Users/andy/Downloads/package.json
- /Users/andy/Downloads/vite.config.ts
- /Users/andy/Downloads/postcss.config.mjs

## Implementation plan (verbatim summary)
1. Port Vite design tokens + fonts into Next global styles.
2. Copy all Vite assets to public and update image references.
3. Replace marketing pages with Vite layout and route mapping.
4. Replace app shell + nav with Vite AppLayout design, keep routes.
5. Port each app page UI to Vite design while preserving logic.

