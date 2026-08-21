# CodeTogether


### ✅ New Features Added
| Feature | Description |
|---------|-------------|
| 🎨 **Whiteboard** | Excalidraw-style canvas — pen, line, shapes, text, eraser, undo/redo, download PNG |
| 🤖 **AI Code Assistant** | Claude-powered in-room AI — debug, explain, optimize, type-check your code |
| 📝 **Teacher Notes** | Create, pin, publish, and download Markdown notes. Students see published notes |
| ⏱️ **Session Timer** | Countdown timer with presets (15–120 min), warning alerts, start/pause/end lifecycle |
| 🧩 **Code Editor Layout** | Activity bar with all 7 panels: Explorer, Debug, Chat, Whiteboard, AI, Notes, Timer |

---

## How to Run

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com
SMTP_USER=your_gmail_address
SMTP_PASS=your_gmail_app_password
NEXT_PUBLIC_ANTHROPIC_API_KEY=your_anthropic_api_key  # For AI Assistant
```

> **AI Assistant**: Get your API key at https://console.anthropic.com

### 3. Start the dev server
```bash
npm run dev
```

Open http://localhost:3000

---

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── dashboard/page.tsx    # Dashboard (create/manage rooms)
│   ├── room/[id]/page.tsx    # Main room (VS Code layout)
│   ├── login/page.tsx        # Auth
│   ├── signup/page.tsx
│   └── api/
│       ├── create-room/      # Create Supabase room
│       └── run-code/         # Execute code server-side
└── components/
    ├── Editor.tsx             # Monaco multi-file editor
    ├── ActivityBar.tsx        # ← VS Code activity bar (7 panels)
    ├── LeftSidebar.tsx        # ← Sidebar + fullscreen panel host
    ├── Whiteboard.tsx         # ← NEW: Canvas drawing tool
    ├── AIAssistant.tsx        # ← NEW: Claude AI panel
    ├── TeacherNotes.tsx       # ← NEW: Notes with publish/download
    ├── SessionTimer.tsx       # ← NEW: Session lifecycle timer
    ├── ParticipantsCallPanel.tsx # Native WebRTC meeting panel
    ├── TerminalPanel.tsx      # xterm.js terminal
    ├── Chat.tsx               # Real-time chat
    └── DebugPanel.tsx         # Breakpoints panel
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file |
| `Ctrl+N` | New file |
| `Ctrl+W` | Close tab |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+\`` | Toggle terminal |
| `Esc` | Close sidebar/terminal |

---

## Stack
- **Next.js 14** — App Router, Server Components
- **Supabase** — Auth, Postgres, Realtime presence
- **Monaco Editor** — VS Code editor component
- **Socket.IO + WebRTC** — Project-owned video/audio/screen sharing
- **xterm.js** — Terminal emulator
- **Socket.io** — Real-time terminal streaming
- **Groq API** — AI code assistant
- **Tailwind CSS** — Utility styling
