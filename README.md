# Dashboard Mode for ComfyUI

A grid-based dashboard extension for ComfyUI that lets you organize workflow widgets into resizable containers, apply value presets, and control generation — all from a modern, theme-synced UI.

![Dashboard Mode](https://img.shields.io/badge/ComfyUI-custom__node-blue)

## Features

- **📐 Grid Dashboard** — Drag-and-drop containers for node widgets, powered by GridStack.js
- **🎨 Theme Sync** — Automatically inherits ComfyUI's color scheme (CSS variables)
- **💾 Value Presets** — Save/load widget values with undo support and CSV import
- **⚡ Quick Generate** — Run workflows directly from the dashboard with batch support
- **🔍 Node Search** — Find and add any node widget via search
- **📂 Multi-tab** — Organize containers across multiple tabs
- **🖼️ Preview & Gallery** — Live preview area with fullscreen viewer and image gallery
- **⌨️ Shortcuts** — Configurable keyboard shortcuts for toggle, close, and generate
- **🎯 Partial Execution** — Run workflow up to a specific node
- **💎 Glassmorphism** — Optional frosted-glass visual effects

## Installation

1. Navigate to ComfyUI's `custom_nodes` directory:
   ```bash
   cd ComfyUI/custom_nodes
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/Falafel0/ComfyUI-dashboard-mode.git
   ```

3. Restart ComfyUI.

## Usage

1. **Open Dashboard** — Press `Tab` (default) or click the extension button in ComfyUI's toolbar
2. **Edit Layout** — Click **✐ Edit Layout** to enter edit mode
3. **Add Container** — Click **+ Container** or search for a node/widget to add
4. **Arrange** — Drag to reposition, resize from corners
5. **Generate** — Hit **Generate** to run your workflow
6. **Save Presets** — Use the **🎨 Presets** manager to save current widget values

### Default Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Dashboard | `Tab` |
| Close / Back | `Escape` |
| Generate | `Ctrl+Enter` |

All shortcuts are configurable in **⚙ Settings → Shortcuts**.

## Settings

All settings are accessible via the **⚙ Settings** button in the dashboard header, organized into 5 tabs:

- **🎨 Appearance** — Colors, fonts, borders, radius
- **📐 Layout** — Grid dimensions, spacing, panel sizes
- **✨ Effects** — Shadows, glassmorphism, hover effects, animations
- **⚙ System** — Confirmations, gallery limit, presets, sort order
- **⌨️ Shortcuts** — Keyboard shortcut bindings

## File Structure

```
ComfyUI-dashboard-mode/
├── __init__.py          # Python API (routes for settings, presets, image save)
├── css/
│   └── a11-studio.css   # All dashboard styles
└── js/
    ├── index.js          # Entry point, extension registration
    ├── grid.js           # GridStack integration, container rendering
    ├── execution.js      # Generation, queue, gallery
    ├── state.js          # Settings, presets, widget sync registry
    ├── ui.js             # UI construction, resizers, global settings modal
    ├── styles.js         # Dynamic CSS variable generation
    ├── contextMenu.js    # Right-click context menus
    ├── presetManager.js  # Preset CRUD, sorting, migration
    ├── settingsManager.js # Settings validation, migration, UI prefs
    ├── widgets.js        # Widget interpreter registry
    └── widgets/          # 19 widget interpreters
        ├── NumberInterpreter.js
        ├── TextInterpreter.js
        ├── ToggleInterpreter.js
        ├── ComboInterpreter.js
        ├── ButtonInterpreter.js
        ├── ColorInterpreter.js
        ├── ImageInterpreter.js
        ├── LoadImageInterpreter.js
        ├── PreviewImageInterpreter.js
        ├── MultiSelectInterpreter.js
        ├── SyncableWidgetInterpreter.js
        ├── WorkflowControlInterpreter.js
        ├── PresetManagerUI.js
        ├── PresetUndoManager.js
        ├── WidgetInterpreter.js
        ├── WidgetInterpreterManager.js
        ├── CentralSyncManager.js
        ├── CustomDOMInterpreter.js
        ├── VueBridgeInterpreter.js
        └── index.js
```

## API Endpoints

The extension exposes the following server routes (all under `/a11_studio/`):

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/css/{filename}` | Serve CSS files |
| GET | `/settings` | Load saved settings |
| POST | `/settings` | Save settings |
| GET | `/presets` | Load value presets |
| POST | `/presets` | Save value presets |
| GET | `/get_output_folders` | List output folders |
| POST | `/save_image` | Manually save an image |
| POST | `/import_csv_presets` | Import presets from CSV |

## Dependencies

- [GridStack.js](https://gridstackjs.com/) v7.2.3 (loaded via CDN)
- ComfyUI (tested with latest)

## License

MIT
