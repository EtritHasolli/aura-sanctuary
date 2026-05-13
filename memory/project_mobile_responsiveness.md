---
name: project-mobile-responsiveness
description: Mobile responsiveness pass — what was changed and the design contract
metadata:
  type: project
---

Mobile responsiveness was added in May 2026. The key contract is:

**Desktop (≥ md / 768px) is UNCHANGED.** All responsive changes use `md:` (or larger) breakpoints as the "desktop-normal" guard, and smaller breakpoints as the mobile override.

## What changed

- **HUD** ([src/components/aura/HUD.tsx](src/components/aura/HUD.tsx)): Two separate layouts — `md:hidden` compact row (avatar + bars + gold + bell + theme), `hidden md:flex` full desktop HUD. Stats (STR/INT/CON/DEX), moonshards, achievements, HabiticaChip are desktop-only.

- **SideNav** ([src/components/aura/SideNav.tsx](src/components/aura/SideNav.tsx)): Desktop sidebar is `hidden md:flex`. Mobile gets a fixed bottom tab bar (`z-200`, h-14) showing 4 primary routes (Sanctuary, Quests, Tavern, Friends) plus a "More" button that opens a drawer with the remaining routes + logout.

- **AppGate main** ([src/routes/__root.tsx](src/routes/__root.tsx)): `main` has `pb-14 md:pb-0` to clear the 56px bottom tab bar on mobile.

- **YouTube float iframe** ([src/routes/__root.tsx](src/routes/__root.tsx)): On mobile the floating iframe is `bottom-16` (clears tab bar) and width/height capped to `min(420px, 100vw-1rem)`.

- **AI Assistant** ([src/components/aura/AiAssistant.tsx](src/components/aura/AiAssistant.tsx)): Panel width capped to `min(320px, 100vw-1rem)`. Default bottom offset is 72px on mobile (clears tab bar) vs 24px on desktop.

- **All route pages**: Outer wrapper padding changed from `p-6` to `p-3 md:p-6` across quests, archives, challenges, forge, equipment, shop, friends, tavern, subscription, minigames, index.

- **Sanctuary sprites**: Character sprite height is `h-22.5 md:h-35` (90px mobile, 140px desktop).

**Why:** Desktop users see the app exactly as before. Mobile users get a usable layout with the bottom tab nav pattern.
