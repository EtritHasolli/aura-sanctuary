Project: Aura: The Desktop Sanctuary (V1 Foundation)Stack: React, Vite, Tailwind, Supabase, Framer Motion.
Core Concept:
A Productivity RPG for desktop. A mix of Habitica (RPG mechanics) and Zen/Focus apps.
1. UI & Layout:

Main View (The Sanctuary): A central room with a virtual pet. The room's "vibe" (lighting/fog) is controlled by the user's HP and task completion.
HUD: Top-left shows Character Avatar, Pet Sprite, HP Bar (Red), and XP Bar (Green). Top-right shows Gold and Stats (Strength, Intelligence, Constitution).
Navigation (Tabs):
Home: Pet, Pomodoro Timer (25/5), and Lo-fi music controls.
Quests: Three columns: Habits (+/-), Dailies, and To-Dos.
Archives (Notes): A Markdown-based notebook.
The Tavern: Party view with shared Boss HP, Leaderboard, and Real-time Chat.
2. The "Bridge" Feature (Notes & Tasks):

From Note: Add an option in the "Archives" to "Create Task from Note." This generates a To-Do using the Note's title.
From Task: In the To-Do details, add a "Convert to Note" button that moves the task's description into a new entry in the "Archives."
3. Mechanics & Logic:

Stats: Strength (Habits), Intelligence (Focus/Pomodoro), Constitution (Dailies).
The Death Loop: If a Daily is missed, lose HP. At 0 HP, lose 1 Level and 20% Gold.
Pet States: 'Idle', 'Working', 'Sleeping' triggered by the Pomodoro timer or inactivity.
4. Technical Specifics:

Use Supabase for Auth, Profile, Tasks, Notes, and Real-time Chat/Boss updates.
Use HashRouter for Electron compatibility.
Design: Pixel-Art / Retro-Modern. Palette: Lively Greens & Deep Blues (No Purple/Gold).
Use framer-motion for subtle animations (Pet jiggle, UI transitions).
5. Initial Task:
Build the Dashboard layout with the HUD and Sidebar. Create the "Quests" and "Archives" tabs first, ensuring the "Note-to-Task" bridge logic is implemented. Use placeholder pixel assets.
Specific Technical Instructions for V1:

Real-time Engine: Use supabase_realtime for the Tavern Chat and Boss HP bar so updates are instant across the party.
Note Formatting: Use react-markdown for the Archives. Ensure the "Convert to Task" button is visible in the editor toolbar.
The Pomodoro Pet Sync: When the timer starts, the Pet Sprite must change to 'Working' mode and the room lighting should shift to a "Focused" hue (soft blue glow).
Responsiveness: Optimize the layout for a 1280x720 window (standard Electron size).