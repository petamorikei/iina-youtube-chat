# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an IINA plugin for displaying YouTube chat, built with React, TypeScript, and Vite. The project uses Panda CSS for styling and Biome for code formatting/linting.

## Build and Development Commands

### Development
```bash
pnpm dev
```
Starts the Vite development server with hot module replacement (HMR).

### Build
```bash
pnpm build
```
Compiles TypeScript (`tsc -b`) and builds the production bundle with Vite.

### Code Quality
```bash
pnpm check
```
Runs Biome to check and auto-fix formatting and linting issues across the codebase.

### Preview
```bash
pnpm preview
```
Serves the production build locally for testing.

### Styling
```bash
pnpm prepare
```
Generates Panda CSS style system code. This runs automatically after `pnpm install`.

## Architecture

### Tech Stack
- **React 19.2.0**: UI framework with StrictMode enabled
- **TypeScript 5.9.3**: Type-safe development with strict mode
- **Vite (rolldown-vite 7.2.5)**: Build tool using Rolldown bundler
- **Panda CSS**: Utility-first CSS-in-JS with generated `styled-system/`
- **Biome**: Fast formatter and linter (replaces ESLint/Prettier)
- **SWC**: Fast TypeScript/React transformation via `@vitejs/plugin-react-swc`

### Project Structure
```
src/
  ├── main.tsx        # React app entry point
  ├── App.tsx         # Main App component
  ├── App.css         # Component styles
  ├── index.css       # Global styles
  └── assets/         # Static assets (images, etc.)

styled-system/        # Auto-generated Panda CSS files (do not edit manually)
```

### TypeScript Configuration
- **tsconfig.json**: Root config with project references
- **tsconfig.app.json**: Main app config (target: ES2022, strict mode, bundler resolution)
- **tsconfig.node.json**: Config for build tools (target: ES2023)

Key compiler options:
- `strict: true` - All strict type checking enabled
- `noUnusedLocals: true` - Flag unused local variables
- `noUnusedParameters: true` - Flag unused parameters
- `erasableSyntaxOnly: true` - Only use type-only imports/exports
- `verbatimModuleSyntax: true` - Preserve exact import/export syntax

### Biome Configuration
Biome handles both formatting and linting with:
- Line width: 120 characters
- Import organization enabled
- Strict style rules (no parameter assignment, use const assertions, etc.)
- Console logging allowed (`noConsole: off`)

### Panda CSS
- Configuration: `panda.config.ts`
- Output directory: `styled-system/`
- Includes: `src/**/*.{js,jsx,ts,tsx}`
- CSS reset enabled (`preflight: true`)
- Run `pnpm prepare` to regenerate after config changes

## Development Workflow

1. **Install dependencies**: `pnpm install` (enforced by preinstall hook)
2. **Start dev server**: `pnpm dev`
3. **Make changes**: Edit files in `src/`
4. **Format/lint**: `pnpm check` (auto-fixes most issues)
5. **Build**: `pnpm build` (TypeScript check + Vite build)

## Code Style Guidelines

- Use functional components with hooks (React 19)
- Prefer `const` assertions for literal types
- No parameter reassignment
- Use self-closing elements where applicable
- Single variable declarators per statement
- Avoid inferrable types in TypeScript
- No unused template literals
- Use Number namespace methods over global functions

## IINA Plugin Development

This project is an IINA plugin that displays YouTube live chat synchronized with video playback. The plugin will show chat messages from YouTube live streams and archived livestreams at the appropriate playback position.

### Plugin Structure

IINA plugins require:
- **Info.json**: Plugin metadata (name, identifier, version, entry point, etc.)
- **Entry file**: JavaScript file executed in the player's context
- **.iinaplugin folder**: Contains all plugin resources

### Key IINA Plugin APIs

The plugin will primarily use these IINA APIs (accessed via the global `iina` object):

#### Display Options
1. **iina.overlay**: Display content on top of video
   - `overlay.loadFile(path)`: Load HTML file into overlay
   - `overlay.simpleMode()`: Simple mode for direct HTML/CSS setting
   - `overlay.show()` / `overlay.hide()`: Control visibility
   - `overlay.postMessage(name, data)`: Send data to overlay webview
   - `overlay.onMessage(name, callback)`: Receive data from overlay webview

2. **iina.sidebar**: Display content in sidebar (alternative to overlay)
   - Requires `sidebarTab` field in Info.json
   - `sidebar.loadFile(path)`: Load HTML file
   - Similar messaging API to overlay

#### Event Handling
**iina.event**: Listen to playback and window events
- `event.on("iina.file-loaded", callback)`: New file loaded
- `event.on("iina.file-started", callback)`: Playback started
- `event.on("mpv.time-pos.changed", callback)`: Playback position changed
- `event.on("mpv.pause.changed", callback)`: Pause state changed
- All mpv events available with `mpv.` prefix
- Property changes use `.changed` suffix (e.g., `mpv.volume.changed`)

#### Player Control
**iina.core**: Access player status and control
- `core.status.position`: Current playback position
- `core.status.duration`: Video duration
- `core.status.url`: Current file URL
- `core.status.paused`: Pause state
- `core.osd(message)`: Display on-screen message

#### Network Access
**iina.http**: Make HTTP requests for fetching YouTube chat data

### WebView Communication

The overlay/sidebar runs in a separate WebView context and cannot directly access IINA APIs. Communication between plugin script and webview uses:

**Plugin script → WebView:**
```javascript
overlay.postMessage("message-name", { data: "value" });
```

**WebView → Plugin script:**
```javascript
// In webview (HTML file)
iina.postMessage("message-name", { data: "value" });
```

**Receiving messages:**
```javascript
// Plugin script
overlay.onMessage("message-name", (data) => { /* handle */ });

// WebView
iina.onMessage("message-name", (data) => { /* handle */ });
```

### Development Tools

**iina-plugin CLI** (located at `/Applications/IINA.app/Contents/MacOS/iina-plugin`):
- `iina-plugin new <name>`: Create new plugin
- `iina-plugin pack <dir>`: Package plugin as `.iinaplgz`
- `iina-plugin link <dir>`: Symlink for development
- `iina-plugin unlink <dir>`: Remove development symlink

### Plugin Installation

Plugins are installed to: `~/Library/Application Support/com.colliderli.iina/plugins`

### TypeScript Support

Install `iina-plugin-definition` for TypeScript types:
```bash
npm i iina-plugin-definition
```

Add to `tsconfig.json`:
```json
{
  "typeRoots": [
    "./node_modules/@types",
    "./node_modules/iina-plugin-definition"
  ]
}
```

### Implementation Strategy for YouTube Chat

1. **Entry Point**: JavaScript file that:
   - Listens to `iina.file-loaded` to detect YouTube URLs
   - Fetches chat data from YouTube (live or archived)
   - Sends chat messages to overlay/sidebar based on playback position

2. **UI Layer**: React app (built with this repo) that:
   - Runs in overlay/sidebar webview
   - Receives chat messages via `iina.onMessage()`
   - Displays chat synchronized with video position
   - Handles light/dark mode via `prefers-color-scheme`

3. **Sync Mechanism**:
   - Listen to `mpv.time-pos.changed` events
   - Filter chat messages by timestamp
   - Update UI via `postMessage()` when position changes

### IINA Plugin Documentation Sitemap

Base URL: https://docs.iina.io/

**Guides:**
- Getting Started: `/pages/getting-started.html`
- Creating Plugins: `/pages/creating-plugins.html`
- Development Guide: `/pages/dev-guide.html`
- Global Entry Point: `/pages/global-entry.html`
- Web Views: `/pages/webviews.html`
- Subtitle Providers: `/pages/subtitle-providers.html`
- Plugin Preferences: `/pages/plugin-preferences.html`

**API Modules - Player Control:**
- `iina.core`: `/interfaces/IINA.API.Core.html`
- `iina.event`: `/interfaces/IINA.API.Event.html`
- `iina.mpv`: `/interfaces/IINA.API.MPV.html`

**API Modules - Extended Functionality:**
- `iina.menu`: `/interfaces/IINA.API.Menu.html`
- `iina.subtitle`: `/interfaces/IINA.API.Subtitle.html`
- `iina.playlist`: `/interfaces/IINA.API.Playlist.html`
- `iina.input`: `/interfaces/IINA.API.Input.html`

**API Modules - User Interfaces:**
- `iina.overlay`: `/interfaces/IINA.API.Overlay.html`
- `iina.standaloneWindow`: `/interfaces/IINA.API.StandaloneWindow.html`
- `iina.sidebar`: `/interfaces/IINA.API.SidebarView.html`

**API Modules - System & Network:**
- `iina.file`: `/interfaces/IINA.API.File.html`
- `iina.utils`: `/interfaces/IINA.API.Utils.html`
- `iina.http`: `/interfaces/IINA.API.HTTP.html`
- `iina.ws`: `/interfaces/IINA.API.WebSocket.html`

**API Modules - Utilities:**
- `iina.global`: `/interfaces/IINA.API.Global.html`
- `iina.console`: `/interfaces/IINA.API.Console.html`
- `iina.preferences`: `/interfaces/IINA.API.Preferences.html`

### Info.json Structure

**Required Fields:**
- `name`: Plugin display name
- `version`: Semantic versioning (major.minor.patch)
- `identifier`: Reverse domain format (e.g., com.example.myplugin)
- `author`: Object with `name`, optional `email` and `url`
- `entry`: Main entry file path

**Optional Fields:**
- `description`: Short plugin summary
- `globalEntry`: Global entry file path
- `preferencesPage`: HTML preferences interface path
- `preferenceDefaults`: Default preference values object
- `helpPage`: Help documentation (HTML file or external URL)
- `subProviders`: Subtitle provider array
- `sidebarTab`: Object with `name` for sidebar tab
- `permissions`: Array of required permissions
- `allowedDomains`: Array of accessible domains (use `["*"]` for all)
- `ghRepo`: GitHub repository for auto-updates (username/repo format)
- `ghVersion`: Integer incremented per release for update checking

### Plugin Permissions

Five permission types:
1. **show-osd**: Display OSD messages via `iina.core.osd()`
2. **show-alert**: Native alert dialogs through `iina.utils`
3. **video-overlay**: Draw on video using `iina.overlay` module
4. **network-request**: Network access via `iina.http` module
5. **file-system**: File system access or external program execution via `iina.utils.exec()`

### WebView Communication

Webviews run in separate processes and cannot directly access IINA APIs. Communication uses message passing:

**Plugin → WebView:**
```javascript
sidebar.postMessage("message-name", { data: "value" });
```

**WebView → Plugin:**
```javascript
iina.postMessage("message-name", { data: "value" });
```

**Receiving:**
```javascript
// Plugin side
sidebar.onMessage("message-name", (data) => { });

// WebView side
iina.onMessage("message-name", (data) => { });
```

**Data Constraints:** Only JSON-serializable objects can be transmitted (no Date, RegExp, Map, Set, Function, Symbol, BigInt, ArrayBuffer, or circular references).

### HTTP API

Requires `network-request` permission in Info.json.

```javascript
// GET request
const response = await http.get(url, { headers: { "User-Agent": "IINA" } });

// POST request
const response = await http.post(url, { headers: {...}, data: {...} });

// Response object
response.text;       // Response body as string
response.data;       // Parsed JSON data (if applicable)
response.statusCode; // HTTP status code
response.reason;     // Status reason (e.g., "ok" for 200)
```

## Plugin Specifications

This section defines the finalized specifications for the YouTube chat plugin implementation.

### 1. Data Acquisition

**Method**: yt-dlp
**Target**: Archived livestream chat data
**Behavior**: Fetch complete chat history in a single request to JSON file
**Command**: `yt-dlp --write-subs --sub-langs live_chat --skip-download [URL]`
**Output**: `[VIDEO_ID].live_chat.json` containing all messages with timestamps

**Future Phase 2**:
- Live streaming support (during broadcast)
- YouTube official API integration

### 2. Supported Video Types

**Initial Implementation**: Archived livestreams only
**Future**: Live broadcasts, YouTube official API approach

### 3. Chat Display UI

**Display Position**: Sidebar (primary), Overlay (future Phase 2)
**Display Format**: List with configurable scroll direction
**Display Information**: All available data including:
- User icons and avatars
- User badges (verified, moderator, member, etc.)
- Super Chat / Super Stickers
- Emojis and custom emotes
- Message text and timestamps

### 4. Synchronization and Playback Control

**Seek Behavior**: Immediate switch to messages at new position
**Display Timing**: Complete timestamp-based synchronization
**Display Mode**: Count-based (show latest N messages)
**Playback Speed**: Chat synchronizes with video speed (follows timestamps)
**Pause Behavior**: Chat also pauses

**Configuration Settings**:
- `maxMessages`: Number of messages to display (0 = unlimited, default: 50)
- `scrollDirection`: `bottom-to-top` or `top-to-bottom` (default: `bottom-to-top`)

### 5. Performance and Data Management

**Data Fetch Timing**: Automatically on video load
**Cache Strategy**: No cache initially (future feature)
**Memory Management**: Hold all chat data in memory (acceptable for normal streams)
**Virtual Scrolling**: TanStack Virtual (research https://tanstack.com/virtual/latest before implementation)
**Optimization Techniques**:
- React memoization for message components
- Event throttling for position updates

### 6. User Settings

Implementation via IINA standard UI (`Info.json` preferences):

```json
"preferences": [
  {
    "key": "maxMessages",
    "type": "number",
    "title": "Maximum messages",
    "description": "Number of chat messages to display (0 = unlimited)",
    "default": 50,
    "min": 0
  },
  {
    "key": "scrollDirection",
    "type": "menu",
    "title": "Scroll direction",
    "options": [
      {"title": "Bottom to top", "value": "bottom-to-top"},
      {"title": "Top to bottom", "value": "top-to-bottom"}
    ],
    "default": "bottom-to-top"
  }
]
```

**Future Phase 2 Settings**: Font size, message density, filtering, custom colors

### 7. Error Handling and User Feedback

**Core Principles**:
- Predictable errors: Display clear error messages to user
- Plugin errors: Must never block video playback

**Display Method**: Sidebar only (no OSD)
**Message Language**: English only
**Logging**: Errors only to console

**Error Scenarios and Behavior**:

1. **Non-YouTube URL**
   - Display: "This is not a YouTube video"
   - Type: Informational message (not error)

2. **yt-dlp Not Installed**
   - Display: Error message explaining yt-dlp is required
   - Detection: On first chat fetch attempt
   - Retry: Not applicable

3. **No Chat Data Available**
   - Display: "No chat data available for this video"
   - Type: Informational message (not error)
   - Causes: Non-livestream video, chat disabled, empty chat

4. **Network Error / Timeout**
   - Display: Error message with details
   - Retry: Manual retry button provided
   - User action: Click "Retry" to attempt fetch again

5. **Parse Error**
   - Display: User-friendly message + technical details
   - Example: "Failed to parse chat data" + raw error message
   - Retry: Not applicable

6. **Unexpected Errors**
   - Display: "Unexpected error occurred"
   - Technical details: Shown if available
   - Logging: Full error to console
