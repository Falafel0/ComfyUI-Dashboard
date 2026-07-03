import { app } from "../../scripts/app.js";
import { state, saveSettings, resetSettings } from "./state.js";
import { updateDynamicStyles } from "./styles.js";
import { addGridItem, refreshActiveItem, updateGraphExtra, applyGridState, refreshContainerList, initGrid, renderGlobalPanel, renderRightPanel, renderGridItemContent, openGroupSettings } from "./grid.js";
import { LayoutTemplateManager, UIPreferencesManager, validateSettings, migrateSettings } from "./settingsManager.js";
import { DOMManager } from "./widgets/CustomDOMInterpreter.js";
import { openPresetManagerModal } from "./widgets/PresetManagerUI.js";

let _canvasStateBeforeDashboard = null;
let _rrMove = null;
let _rrUp = null;

function lockCanvas() {
    if (!app.canvas) return;
    _canvasStateBeforeDashboard = {
        allow_dragcanvas: app.canvas.allow_dragcanvas,
        allow_dragnodes: app.canvas.allow_dragnodes,
        allow_interaction: app.canvas.allow_interaction,
        dsEnabled: app.canvas.ds ? app.canvas.ds.enabled : true
    };
    app.canvas.allow_dragcanvas = false;
    app.canvas.allow_dragnodes = false;
    app.canvas.allow_interaction = false;
    if (app.canvas.ds) app.canvas.ds.enabled = false;
}

function unlockCanvas() {
    if (!app.canvas || !_canvasStateBeforeDashboard) return;
    app.canvas.allow_dragcanvas = _canvasStateBeforeDashboard.allow_dragcanvas;
    app.canvas.allow_dragnodes = _canvasStateBeforeDashboard.allow_dragnodes;
    app.canvas.allow_interaction = _canvasStateBeforeDashboard.allow_interaction;
    if (app.canvas.ds) app.canvas.ds.enabled = _canvasStateBeforeDashboard.dsEnabled;
    _canvasStateBeforeDashboard = null;
}

export function toggleWebUIStudio() {
    const overlay = document.getElementById("a11-overlay");
    if (!overlay) return;
    if (overlay.classList.contains("visible")) {
        overlay.classList.remove("visible");
        unlockCanvas();
        if (_rrMove) { window.removeEventListener("mousemove", _rrMove); window.removeEventListener("mouseup", _rrUp); _rrMove = _rrUp = null; }
        selectedWidgetData = null;

        // P0: Очистить все "украденные" DOM элементы при закрытии
        DOMManager.cleanup();

        updateGraphExtra(true);
    } else {
        lockCanvas();
        overlay.classList.add("visible");
        setTimeout(() => loadFromGraph(), 50);
    }
}

function setupGlobalShortcuts() {
    document.addEventListener("keydown", (e) => {
        const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.contentEditable === "true";
        if (isInput && e.key !== "Escape") return;

        const checkShortcut = (shortcutStr, event) => {
            if (!shortcutStr) return false;
            const parts = shortcutStr.split('+').map(p => p.trim().toLowerCase());
            const needsShift = parts.includes('shift');
            const needsCtrl = parts.includes('ctrl') || parts.includes('control');
            const needsAlt = parts.includes('alt');
            const needsMeta = parts.includes('meta');
            const key = parts[parts.length - 1];

            let eKey = event.key.toLowerCase();
            if (eKey === " ") eKey = "space";

            return (
                event.shiftKey === needsShift &&
                event.ctrlKey === needsCtrl &&
                event.altKey === needsAlt &&
                event.metaKey === needsMeta &&
                eKey === key
            );
        };

        const overlay = document.getElementById("a11-overlay");
        const fsViewer = document.getElementById("a11-fs-viewer");
        if (!overlay) return;

        const isVisible = overlay.classList.contains("visible");

        const toggleShortcut = state.settings.shortcutToggle || "Shift+A";
        const closeShortcut = state.settings.shortcutClose || "Escape";
        const generateShortcut = state.settings.shortcutGenerate || "Ctrl+Enter";

        if (!isInput && checkShortcut(toggleShortcut, e)) {
            e.preventDefault();
            toggleWebUIStudio();
        }
        else if (isVisible && checkShortcut(closeShortcut, e)) {
            if (fsViewer && fsViewer.classList.contains("open")) {
                e.preventDefault();
                fsViewer.classList.remove("open");
            } else {
                e.preventDefault();
                toggleWebUIStudio();
            }
        }
        else if (isVisible && checkShortcut(generateShortcut, e)) {
            e.preventDefault();
            document.getElementById("btn-generate-main")?.click();
        }
    });
}

export function setupResizers() {
    const rightPanel = document.getElementById("a11-right-panel");
    const rightHandle = document.getElementById("a11-resize-handle");
    const header = document.getElementById("a11-header");
    const headerHandle = document.getElementById("a11-header-resizer");
    const previewWrap = document.getElementById("a11-preview-wrapper");
    const previewHandle = document.getElementById("a11-preview-resizer");
    const rpContainer = document.getElementById("a11-right-panel-container");
    const rpSplitHandle = document.getElementById("a11-right-split-resizer");

    if (state.settings.panelWidth) rightPanel.style.width = state.settings.panelWidth + "px";
    if (state.settings.headerHeight) header.style.height = state.settings.headerHeight + "px";
    if (state.settings.previewHeight) previewWrap.style.height = state.settings.previewHeight + "px";
    if (state.settings.rpContainerHeight) rpContainer.style.height = state.settings.rpContainerHeight + "px";

    const makeYResizer = (handle, target, settingKey, min, max, calcHeightFn) => {
        let isResizing = false;
        handle.addEventListener("mousedown", (e) => {
            if (!state.isEditMode) return;
            isResizing = true;
            handle.classList.add("active");
            document.body.style.cursor = "row-resize";
            e.preventDefault();
        });
        window.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            let newH = calcHeightFn(e, target);
            if (newH >= min && newH <= max) target.style.height = newH + "px";
        });
        window.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove("active");
                document.body.style.cursor = "";
                state.settings[settingKey] = parseInt(target.style.height);
                saveSettings();
                if (state.grid) state.grid.onResize();
            }
        });
    };

    let isRightResizing = false;
    rightHandle.addEventListener("mousedown", (e) => {
        if (!state.isEditMode) return;
        isRightResizing = true; rightHandle.classList.add("active"); document.body.style.cursor = "col-resize"; e.preventDefault();
    });
    _rrMove = function(e) {
        if (!isRightResizing) return;
        let newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < (window.innerWidth - 100)) rightPanel.style.width = newWidth + "px";
    };
    _rrUp = function() {
        if (isRightResizing) {
            isRightResizing = false; rightHandle.classList.remove("active"); document.body.style.cursor = "";
            state.settings.panelWidth = parseInt(rightPanel.style.width);
            saveSettings();
            if (state.grid) state.grid.onResize();
        }
    };
    window.addEventListener("mousemove", _rrMove);
    window.addEventListener("mouseup", _rrUp);

    makeYResizer(headerHandle, header, "headerHeight", 48, 400, (e) => e.clientY);
    makeYResizer(previewHandle, previewWrap, "previewHeight", 100, 800, (e, target) => {
        const rect = target.getBoundingClientRect(); return e.clientY - rect.top;
    });
    makeYResizer(rpSplitHandle, rpContainer, "rpContainerHeight", 80, 600, (e, target) => {
        const rect = target.getBoundingClientRect(); return e.clientY - rect.top;
    });
}

export function injectUI() {
    setupGlobalShortcuts();

    const overlay = document.createElement("div");
    overlay.id = "a11-overlay";
    overlay.className = "view-mode";
    overlay.innerHTML = `
        <div class="a11-header" id="a11-header">
            <div class="a11-logo">Dashboard <span style="color:var(--a11-accent)">Mode</span></div>
            <div id="a11-global-panel"></div>
            <button class="a11-btn" id="a11-preset-manager" style="margin-right:10px;">🎨 Presets</button>
            <button class="a11-btn" id="a11-global-settings" style="margin-right:10px;">⚙ Settings</button>
            <button class="a11-close-btn" id="a11-close">Exit</button>
        </div>
        <div id="a11-header-resizer" class="a11-header-resizer"></div>
        <div class="a11-main">
            <div class="a11-left-panel" id="a11-left-panel">
                <div class="a11-tabs-bar" id="a11-tabs-bar"><div class="a11-tab-add" id="a11-tab-add">+</div></div>
                <div id="view-grid-container">
                    <div class="a11-toolbar">
                        <button id="a11-edit-toggle" class="a11-btn">✐ Edit Layout</button>
                        <div class="edit-only" style="width:1px; height:20px; background:var(--a11-border); margin:0 5px;"></div>
                        <button id="a11-add-new" class="a11-btn edit-only">+ Container</button>
                        <div class="a11-node-search-wrapper edit-only">
                            <input type="text" id="a11-node-search" placeholder="Search Node & Add..." />
                            <div id="a11-search-results" class="a11-search-results"></div>
                        </div>
                        <div class="edit-only" style="width:1px; height:20px; background:var(--a11-border); margin:0 5px;"></div>
                        <div class="a11-input-group edit-only">
                            <select id="sel-target-container" class="a11-toolbar-select"><option value="">Select Target...</option></select>
                            <div style="position: relative;">
                                <input type="text" id="a11-widget-search" class="a11-toolbar-input" placeholder="Node Name > Widget Name" autocomplete="off">
                                <div id="a11-widget-results" class="a11-search-results"></div>
                            </div>
                            <button id="a11-btn-add-widget" class="a11-btn active">Add</button>
                        </div>
                        <div style="flex-grow:1"></div>

                        <button id="a11-tab-settings" class="a11-btn edit-only">⚙ Tab Settings</button>
                        <button id="a11-tab-groups" class="a11-btn edit-only">⚙ Groups</button>
                        <button id="a11-clear" class="a11-btn danger edit-only">Clear</button>
                        <span id="a11-multi-actions" style="display:none; align-items:center; gap:6px; margin-left:8px;">
                            <span id="a11-multi-count" style="font-size:11px; color:var(--a11-accent); font-weight:600;"></span>
                            <button id="a11-multi-duplicate" class="a11-btn" style="font-size:10px; padding:2px 6px;">📋 Dup</button>
                            <button id="a11-multi-delete" class="a11-btn danger" style="font-size:10px; padding:2px 6px;">🗑 Del</button>
                        </span>
                    </div>
                    <div class="grid-stack" id="a11-grid"></div>
                </div>
            </div>

            <div id="a11-resize-handle" class="a11-resize-handle"></div>

            <div class="a11-right-panel" id="a11-right-panel">
                <div class="rp-generate-area">
                    <div id="a11-status-bar" style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                        <span style="width:8px; height:8px; border-radius:50%; background:var(--a11-success); flex-shrink:0;" id="a11-status-dot"></span>
                        <div id="a11-status" style="color:var(--a11-text); font-weight:600; font-size:12px;">Idle</div>
                        <div style="display:flex; align-items:center; gap:3px; margin-left:auto; background:var(--a11-input); border:1px solid var(--a11-border); border-radius:var(--a11-radius); padding:2px 6px; flex-shrink:0;">
                            <span style="font-size:9px; color:var(--a11-text-muted);">Batch</span>
                            <input id="a11-batch-count" type="number" min="1" max="99" value="1" style="width:36px; min-width:36px; background:transparent; border:none; color:var(--a11-text); font-size:13px; font-weight:600; text-align:center; padding:0; outline:none; -moz-appearance:textfield;" title="Batch count">
                        </div>
                    </div>
                    <div id="btn-container">
                        <div id="a11-generate-row">
                            <button id="btn-generate-main" class="a11-btn-generate">Generate</button>
                        </div>
                        <div id="btn-running-group" style="display:none; width:100%; gap:5px;">
                            <button id="btn-queue-more" class="action-btn">Queue More</button>
                            <button id="btn-interrupt" class="action-btn" style="background:var(--a11-error); color:white;">Interrupt</button>
                            <button id="btn-clear" class="action-btn">Clear Q</button>
                        </div>
                    </div>
                </div>

                <div class="a11-preview-wrapper" id="a11-preview-wrapper">
                    <div class="a11-preview-box empty" id="a11-preview-box">
                        <button id="a11-expand-btn" class="a11-btn-expand" title="Fullscreen">⛶</button>
                        <div class="a11-progress" id="a11-progress"></div>
                        <img id="a11-preview-img" class="a11-preview-img" />
                        <div id="a11-placeholder" class="a11-placeholder">Preview Area</div>
                        <button id="a11-resume-live" class="a11-resume-live-btn">▶ Live</button>
                    </div>
                </div>

                <div id="a11-preview-resizer" class="a11-preview-resizer"></div>

                <div id="a11-params-info" class="a11-params-info" style="display:none;"></div>

                <div class="a11-send-bar">
                    <select id="a11-send-target" class="a11-send-select">
                        <option value="">Send to...</option>
                    </select>
                    <button id="a11-send-btn" class="a11-btn a11-btn-sm" style="flex-shrink:0;">➜</button>
                    <button id="a11-manual-save-btn" class="a11-btn a11-btn-sm" title="Save">💾</button>
                </div>

                <div class="a11-gallery-header" id="a11-gallery-header" style="display:none;">
                    <span>Gallery</span>
                    <button id="a11-clear-gallery" class="a11-btn a11-btn-sm">Clear</button>
                </div>
                <div class="a11-gallery" id="a11-gallery"></div>

                <div id="a11-queue-panel" class="a11-queue-panel" style="display:none;">
                    <div class="a11-queue-header">
                        <span>Queue</span>
                        <span id="a11-queue-count"></span>
                    </div>
                    <div id="a11-queue-list" class="a11-queue-list"></div>
                </div>

                <div id="a11-right-split-resizer" class="a11-right-split-resizer"></div>

                <div id="a11-right-panel-container" class="grid-stack-item-content a11-special-container"></div>
            </div>
        </div>

        <div id="a11-fs-viewer" class="a11-modal">
            <div id="a11-fs-container">
                <button id="a11-fs-close" class="a11-fs-close">✖</button>
                <div class="a11-fs-controls">
                    <button class="a11-btn" id="a11-fs-zoom-out" style="padding: 6px 12px; font-size:16px;">➖</button>
                    <button class="a11-btn" id="a11-fs-zoom-reset" style="padding: 6px 12px; font-size:14px; font-weight:bold;">🔍 1:1</button>
                    <button class="a11-btn" id="a11-fs-zoom-in" style="padding: 6px 12px; font-size:16px;">➕</button>
                </div>
                <img id="a11-fs-img" src="" draggable="false"/>
            </div>
        </div>

        <div class="a11-modal" id="a11-save-modal">
            <div class="a11-modal-content" style="width:380px;">
                <div class="a11-modal-title">💾 Save Image</div>
                <div class="a11-modal-body">
                    <div class="a11-settings-block">
                        <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom: none;">
                            <label>Folder (Select existing or root)</label>
                            <select id="sm-folder-sel" style="width:100%;"><option value="">-- Root (ComfyUI Output) --</option></select>
                        </div>
                        <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom: none;">
                            <label>Or Create New Folder</label>
                            <input type="text" id="sm-folder-new" placeholder="my_custom_folder" style="width:100%;">
                        </div>
                        <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom: none;">
                            <label>File Name</label>
                            <input type="text" id="sm-filename" placeholder="Leave empty for Auto Date name" style="width:100%;">
                        </div>
                    </div>
                </div>
                <div class="a11-modal-footer">
                    <button class="a11-btn" id="sm-cancel">Cancel</button>
                    <button class="a11-btn active" id="sm-confirm-save">Save Image</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function openGlobalSettings() {
    const s = state.settings;
    const pref = (k, d) => UIPreferencesManager.getPreference(k, d);
    const chk = (v) => v ? "checked" : "";

    const modal = document.createElement("div");
    modal.className = "a11-modal open";
    modal.innerHTML = `
        <div class="a11-modal-content" style="width:720px; max-height:88vh; overflow:hidden; display:flex; flex-direction:column;">
            <div class="a11-modal-title">⚙ Global Settings</div>
            <div class="a11-modal-layout" style="flex:1; overflow:hidden;">
                <div class="a11-modal-sidebar">
                    <div class="a11-modal-tab active" data-target="gs-appearance">🎨 Appearance</div>
                    <div class="a11-modal-tab" data-target="gs-layout">📐 Layout</div>
                    <div class="a11-modal-tab" data-target="gs-effects">✨ Effects</div>
                    <div class="a11-modal-tab" data-target="gs-system">⚙ System</div>
                    <div class="a11-modal-tab" data-target="gs-shortcuts">⌨️ Shortcuts</div>
                </div>
                <div class="a11-modal-content-area" style="overflow-y:auto; padding:15px;">

                    <!-- ═══ APPEARANCE ═══ -->
                    <div class="a11-modal-panel active" id="gs-appearance">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">🎨 Theme</div>
                            <div class="a11-setting-row"><label>Accent Color</label><input type="color" id="gs-accent" value="${s.themeColor}" style="width:50px;"></div>
                            <div class="a11-setting-row"><label>Sync with ComfyUI Theme</label><input type="checkbox" id="gs-comfy-sync" ${chk(s.comfyThemeSync !== false)}></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Background Colors <span style="color:var(--a11-desc); font-weight:400;">(empty = ComfyUI default)</span></div>
                            <div class="a11-setting-row"><label>App Background</label><input type="text" id="gs-bg" value="${s.bgColor||''}" placeholder="#1a1a1a"></div>
                            <div class="a11-setting-row"><label>Elevated Surface</label><input type="text" id="gs-bg-elevated" value="${s.bgElevated||''}" placeholder="#242424"></div>
                            <div class="a11-setting-row"><label>Panels</label><input type="text" id="gs-panel" value="${s.panelBg||''}" placeholder="#2a2a2a"></div>
                            <div class="a11-setting-row"><label>Menus</label><input type="text" id="gs-menu" value="${s.menuBg||''}" placeholder="#2a2a2a"></div>
                            <div class="a11-setting-row"><label>Input Fields</label><input type="text" id="gs-input-bg" value="${s.inputBg||''}" placeholder="#222222"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Text Colors</div>
                            <div class="a11-setting-row"><label>Primary Text</label><input type="text" id="gs-text" value="${s.textColor||''}" placeholder="#ffffff"></div>
                            <div class="a11-setting-row"><label>Muted / Description</label><input type="text" id="gs-text-muted" value="${s.textMuted||''}" placeholder="#999999"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Borders & Radius</div>
                            <div class="a11-setting-row"><label>Border Color</label><input type="text" id="gs-border" value="${s.borderColor||''}" placeholder="#454545"></div>
                            <div class="a11-setting-row"><label>Border Radius (px)</label><input type="number" id="gs-radius" value="${s.borderRadius||6}" min="0" max="24"></div>
                            <div class="a11-setting-row"><label>Button Radius (px)</label><input type="number" id="gs-btn-radius" value="${s.buttonRadius||6}" min="0" max="24"></div>
                            <div class="a11-setting-row"><label>Input Radius (px)</label><input type="number" id="gs-inp-radius" value="${s.inputRadius||4}" min="0" max="16"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">🔤 Typography</div>
                            <div class="a11-setting-row"><label>Font Family</label><input type="text" id="gs-font" value="${s.fontFamily||''}" placeholder="Inter, Segoe UI, sans-serif"></div>
                            <div class="a11-setting-row"><label>Base Font Size (px)</label><input type="number" id="gs-font-size" value="${s.fontSizeBase||12}" min="9" max="18"></div>
                            <div class="a11-setting-row"><label>Size Scale Factor</label><input type="number" id="gs-font-scale" value="${s.fontSizeScale||1.1}" min="0.8" max="1.5" step="0.05"></div>
                            <div class="a11-setting-row"><label>Base Weight</label>
                                <select id="gs-font-weight">
                                    <option value="300" ${s.fontWeightBase==300?'selected':''}>300 Light</option>
                                    <option value="400" ${(s.fontWeightBase||400)==400?'selected':''}>400 Normal</option>
                                    <option value="500" ${s.fontWeightBase==500?'selected':''}>500 Medium</option>
                                    <option value="600" ${s.fontWeightBase==600?'selected':''}>600 Semibold</option>
                                    <option value="700" ${s.fontWeightBase==700?'selected':''}>700 Bold</option>
                                </select>
                            </div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">State Colors</div>
                            <div class="a11-setting-row"><label>Success</label><input type="color" id="gs-success" value="${s.successColor||'#10b981'}" style="width:50px;"></div>
                            <div class="a11-setting-row"><label>Warning</label><input type="color" id="gs-warning" value="${s.warningColor||'#f59e0b'}" style="width:50px;"></div>
                            <div class="a11-setting-row"><label>Error</label><input type="color" id="gs-error" value="${s.errorColor||'#ff4444'}" style="width:50px;"></div>
                            <div class="a11-setting-row"><label>Info</label><input type="color" id="gs-info" value="${s.infoColor||'#3b82f6'}" style="width:50px;"></div>
                        </div>
                    </div>

                    <!-- ═══ LAYOUT ═══ -->
                    <div class="a11-modal-panel" id="gs-layout">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Grid</div>
                            <div class="a11-setting-row"><label>Cell Height (px)</label><input type="number" id="gs-density" value="${s.gridCellHeight}" min="30" max="200"></div>
                            <div class="a11-setting-row"><label>Margin / Gap (px)</label><input type="number" id="gs-margin" value="${s.gridMargin!==undefined?s.gridMargin:5}" min="0" max="50"></div>
                            <div class="a11-setting-row"><label>Borderless Grid (no gaps/borders)</label><input type="checkbox" id="gs-borderless" ${chk(s.gridBorderless)}></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Spacing</div>
                            <div class="a11-setting-row"><label>Global Spacing Scale</label><input type="number" id="gs-spacing" value="${s.spacingScale||1.0}" min="0.5" max="2.0" step="0.1"></div>
                            <div class="a11-setting-row"><label>Container Padding (px)</label><input type="number" id="gs-cont-pad" value="${s.containerPadding||8}" min="0" max="32"></div>
                            <div class="a11-setting-row"><label>Widget Gap (px)</label><input type="number" id="gs-widget-gap" value="${s.widgetGap||8}" min="0" max="24"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Panel Dimensions</div>
                            <div class="a11-setting-row"><label>Right Panel Width (px)</label><input type="number" id="ui-rightpanel" value="${pref('rightPanelWidth',320)}" min="250" max="600"></div>
                            <div class="a11-setting-row"><label>Sidebar Width (px)</label><input type="number" id="ui-sidebar" value="${pref('sidebarWidth',280)}" min="200" max="500"></div>
                        </div>
                    </div>

                    <!-- ═══ EFFECTS ═══ -->
                    <div class="a11-modal-panel" id="gs-effects">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Shadows</div>
                            <div class="a11-setting-row"><label>Enable Shadows</label><input type="checkbox" id="gs-shadows" ${chk(s.enableShadows!==false)}></div>
                            <div class="a11-setting-row"><label>Shadow Intensity</label><input type="range" id="gs-shadow-intensity" value="${s.shadowIntensity||1.0}" min="0" max="2" step="0.1" style="width:120px;"><span style="font-size:11px;margin-left:4px;" id="gs-shadow-val">${s.shadowIntensity||1.0}</span></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Glassmorphism</div>
                            <div class="a11-setting-row"><label>Enable Glassmorphism</label><input type="checkbox" id="gs-glass" ${chk(s.enableGlassmorphism)}></div>
                            <div class="a11-setting-row"><label>Blur Amount (px)</label><input type="number" id="gs-glass-blur" value="${s.glassBlurAmount||12}" min="0" max="40"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Hover Behavior</div>
                            <div class="a11-setting-row"><label>Hover Effect</label>
                                <select id="gs-hover">
                                    <option value="lift" ${(s.hoverEffect||'lift')==='lift'?'selected':''}>Lift (translate up)</option>
                                    <option value="scale" ${s.hoverEffect==='scale'?'selected':''}>Scale (grow)</option>
                                    <option value="glow" ${s.hoverEffect==='glow'?'selected':''}>Glow (accent shadow)</option>
                                    <option value="none" ${s.hoverEffect==='none'?'selected':''}>None</option>
                                </select>
                            </div>
                            <div class="a11-setting-row"><label>Hover Scale</label><input type="number" id="gs-hover-scale" value="${s.hoverScale||1.02}" min="1.0" max="1.15" step="0.01"></div>
                            <div class="a11-setting-row"><label>Button Opacity</label><input type="range" id="gs-btn-opacity" value="${s.buttonOpacity||1.0}" min="0.5" max="1" step="0.05" style="width:120px;"><span style="font-size:11px;margin-left:4px;" id="gs-btn-op-val">${s.buttonOpacity||1.0}</span></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Animations</div>
                            <div class="a11-setting-row"><label>Enable Animations</label><input type="checkbox" id="gs-animations" ${chk(s.enableAnimations!==false)}></div>
                            <div class="a11-setting-row"><label>Animation Speed (ms)</label><input type="number" id="gs-anim-speed" value="${s.animationSpeed||200}" min="0" max="1000"></div>
                            <div class="a11-setting-row"><label>Enable Transitions</label><input type="checkbox" id="gs-transitions" ${chk(s.enableTransitions!==false)}></div>
                            <div class="a11-setting-row"><label>Transition Easing</label><input type="text" id="gs-easing" value="${s.transitionEasing||'cubic-bezier(0.4, 0, 0.2, 1)'}" placeholder="cubic-bezier(0.4, 0, 0.2, 1)"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Advanced Visual</div>
                            <div class="a11-setting-row"><label>Saturation Modifier</label><input type="range" id="gs-sat" value="${s.saturationModifier||0}" min="-100" max="100" style="width:120px;"><span style="font-size:11px;margin-left:4px;" id="gs-sat-val">${s.saturationModifier||0}</span></div>
                            <div class="a11-setting-row"><label>Brightness Modifier</label><input type="range" id="gs-bright" value="${s.brightnessModifier||0}" min="-100" max="100" style="width:120px;"><span style="font-size:11px;margin-left:4px;" id="gs-bright-val">${s.brightnessModifier||0}</span></div>
                            <div class="a11-setting-row"><label>Contrast Modifier</label><input type="range" id="gs-contrast" value="${s.contrastModifier||0}" min="-100" max="100" style="width:120px;"><span style="font-size:11px;margin-left:4px;" id="gs-contrast-val">${s.contrastModifier||0}</span></div>
                            <div class="a11-setting-row"><label>Blur Background</label><input type="checkbox" id="gs-blur-bg" ${chk(s.blurBackground)}></div>
                            <div class="a11-setting-row"><label>Background Blur (px)</label><input type="number" id="gs-blur-amount" value="${s.blurAmount||0}" min="0" max="40"></div>
                        </div>
                    </div>

                    <!-- ═══ SYSTEM ═══ -->
                    <div class="a11-modal-panel" id="gs-system">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Gallery & Presets</div>
                            <div class="a11-setting-row"><label>Generate Button Color</label><input type="text" id="gs-btn-color" value="${s.generateBtnColor||''}" placeholder="#ea580c"></div>
                            <div class="a11-setting-row"><label>Gallery Limit (images)</label><input type="number" id="gs-limit" value="${s.galleryLimit}" min="5" max="500"></div>
                            <div class="a11-setting-row"><label>Confirm Deletions</label><input type="checkbox" id="gs-confirm" ${chk(s.confirmActions)}></div>
                            <div class="a11-setting-row"><label>Show Widget Preset Buttons (🔖)</label><input type="checkbox" id="gs-widget-presets" ${chk(s.showWidgetPresets!==false)}></div>
                            <div class="a11-setting-row"><label>Show Container Quick-Select</label><input type="checkbox" id="gs-container-quickselect" ${chk(s.showContainerQuickSelect!==false)}></div>
                            <div class="a11-setting-row"><label>Preset Sort Order</label>
                                <select id="gs-preset-sort">
                                    <option value="name_asc" ${(s.presetSortOrder||'name_asc')==='name_asc'?'selected':''}>Name (A→Z)</option>
                                    <option value="name_desc" ${s.presetSortOrder==='name_desc'?'selected':''}>Name (Z→A)</option>
                                    <option value="category_asc" ${s.presetSortOrder==='category_asc'?'selected':''}>Category (A→Z)</option>
                                    <option value="category_desc" ${s.presetSortOrder==='category_desc'?'selected':''}>Category (Z→A)</option>
                                    <option value="date_created" ${s.presetSortOrder==='date_created'?'selected':''}>Date Created (new→old)</option>
                                    <option value="date_modified" ${s.presetSortOrder==='date_modified'?'selected':''}>Date Modified (new→old)</option>
                                </select>
                            </div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Interface</div>
                            <div class="a11-setting-row"><label>Show Tooltips</label><input type="checkbox" id="ui-tooltips" ${chk(pref('showTooltips',true))}></div>
                            <div class="a11-setting-row"><label>Compact Mode</label><input type="checkbox" id="ui-compact" ${chk(pref('compactMode',false))}></div>
                            <div class="a11-setting-row"><label>Show Edit Toggle Button (✐)</label><input type="checkbox" id="gs-show-edit-toggle" ${chk(s.showEditToggle!==false)}></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Right Panel Visibility</div>
                            <div class="a11-setting-row"><label>Show Preview</label><input type="checkbox" id="gs-rp-preview" ${chk(s.rpShowPreview !== false)}></div>
                            <div class="a11-setting-row"><label>Show Gallery</label><input type="checkbox" id="gs-rp-gallery" ${chk(s.rpShowGallery !== false)}></div>
                            <div class="a11-setting-row"><label>Show Send Bar</label><input type="checkbox" id="gs-rp-sendbar" ${chk(s.rpShowSendBar !== false)}></div>
                        </div>
                    </div>

                    <!-- ═══ SHORTCUTS ═══ -->
                    <div class="a11-modal-panel" id="gs-shortcuts">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Keyboard Shortcuts</div>
                            <div class="a11-setting-row"><label>Toggle Dashboard</label><input type="text" id="gs-shortcut-toggle" value="${s.shortcutToggle}" readonly style="cursor:pointer;text-align:center;"></div>
                            <div class="a11-setting-row"><label>Close / Exit</label><input type="text" id="gs-shortcut-close" value="${s.shortcutClose}" readonly style="cursor:pointer;text-align:center;"></div>
                            <div class="a11-setting-row"><label>Generate (when open)</label><input type="text" id="gs-shortcut-generate" value="${s.shortcutGenerate}" readonly style="cursor:pointer;text-align:center;"></div>
                            <small style="color:var(--a11-desc);display:block;margin-top:10px;">Click a field then press your key combination. Backspace to clear.</small>
                        </div>
                    </div>

                </div>
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn danger" id="gs-reset" style="margin-right:auto;">Reset All</button>
                <button class="a11-btn" id="gs-validate">Validate</button>
                <button class="a11-btn" id="gs-cancel">Cancel</button>
                <button class="a11-btn active" id="gs-save">Save & Apply</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // ═══ Tab switching ═══
    modal.querySelectorAll('.a11-modal-tab').forEach(tab => {
        tab.onclick = () => {
            modal.querySelectorAll('.a11-modal-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.a11-modal-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            modal.querySelector('#' + tab.dataset.target).classList.add('active');
        };
    });

    // ═══ Range sliders → value display ═══
    const bindRange = (id, spanId) => {
        const inp = modal.querySelector(id);
        const span = modal.querySelector(spanId);
        if (inp && span) inp.addEventListener('input', () => { span.textContent = inp.value; });
    };
    bindRange('#gs-shadow-intensity', '#gs-shadow-val');
    bindRange('#gs-btn-opacity', '#gs-btn-op-val');
    bindRange('#gs-sat', '#gs-sat-val');
    bindRange('#gs-bright', '#gs-bright-val');
    bindRange('#gs-contrast', '#gs-contrast-val');

    // ═══ Shortcut inputs ═══
    const setupShortcutInput = (id) => {
        const input = modal.querySelector(id);
        input.addEventListener("keydown", (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === "Backspace" || e.key === "Delete") { input.value = ""; input.blur(); return; }
            let keys = [];
            if (e.ctrlKey) keys.push("Ctrl"); if (e.altKey) keys.push("Alt");
            if (e.shiftKey) keys.push("Shift"); if (e.metaKey) keys.push("Meta");
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
            let key = e.key; if (key === " ") key = "Space"; if (key.length === 1) key = key.toUpperCase();
            keys.push(key); input.value = keys.join("+"); input.blur();
        });
        input.addEventListener("focus", () => { input.dataset.old = input.value; input.value = "Press key..."; input.style.borderColor = "var(--a11-accent)"; });
        input.addEventListener("blur", () => { if (input.value === "Press key...") input.value = input.dataset.old; input.style.borderColor = "var(--a11-border)"; });
    };
    setupShortcutInput("#gs-shortcut-toggle"); setupShortcutInput("#gs-shortcut-close"); setupShortcutInput("#gs-shortcut-generate");

    // ═══ Reset ═══
    modal.querySelector("#gs-reset").onclick = () => {
        if (confirm("Reset ALL settings to defaults? This cannot be undone.")) {
            resetSettings(); updateDynamicStyles();
            if (state.grid) { state.grid.destroy(false); initGrid(); var ct = state.appData.tabs[state.appData.activeIdx]; state.grid.removeAll(); if (ct.layout) ct.layout.forEach(function(item) { addGridItem(item.config, { x: item.x, y: item.y, w: item.w, h: item.h }); }); }
            modal.remove();
        }
    };

    // ═══ Validate ═══
    modal.querySelector("#gs-validate").onclick = () => {
        const testSettings = {
            gridCellHeight: parseInt(modal.querySelector("#gs-density").value),
            gridMargin: parseInt(modal.querySelector("#gs-margin").value),
            themeColor: modal.querySelector("#gs-accent").value,
            bgColor: modal.querySelector("#gs-bg").value.trim(),
            panelBg: modal.querySelector("#gs-panel").value.trim(),
            textColor: modal.querySelector("#gs-text").value.trim(),
            shortcutToggle: modal.querySelector("#gs-shortcut-toggle").value,
            shortcutClose: modal.querySelector("#gs-shortcut-close").value,
            shortcutGenerate: modal.querySelector("#gs-shortcut-generate").value
        };
        const result = validateSettings(testSettings);
        let msg = result.valid ? "✓ All settings are valid!" : "✗ Errors found:\n" + result.errors.join("\n");
        if (result.warnings.length > 0) msg += "\n\n⚠ Warnings:\n" + result.warnings.join("\n");
        alert(msg);
    };

    // ═══ Cancel ═══
    modal.querySelector("#gs-cancel").onclick = () => modal.remove();

    // ═══ Save ═══
    modal.querySelector("#gs-save").onclick = () => {
        const g = (id) => modal.querySelector(id);
        const gv = (id) => g(id).value.trim();

        const newDensity = parseInt(g("#gs-density").value);
        const newMargin = parseInt(g("#gs-margin").value);
        const densityChanged = newDensity !== s.gridCellHeight;
        const marginChanged = newMargin !== (s.gridMargin !== undefined ? s.gridMargin : 5);
        const borderlessChanged = g("#gs-borderless").checked !== s.gridBorderless;

        // Grid
        s.gridCellHeight = newDensity;
        s.gridMargin = newMargin;
        s.gridBorderless = g("#gs-borderless").checked;

        // Appearance — theme
        s.themeColor = g("#gs-accent").value;
        s.comfyThemeSync = g("#gs-comfy-sync").checked;

        // Appearance — backgrounds
        s.bgColor = gv("#gs-bg");
        s.bgElevated = gv("#gs-bg-elevated");
        s.panelBg = gv("#gs-panel");
        s.menuBg = gv("#gs-menu");
        s.inputBg = gv("#gs-input-bg");

        // Appearance — text
        s.textColor = gv("#gs-text");
        s.textMuted = gv("#gs-text-muted");

        // Appearance — borders
        s.borderColor = gv("#gs-border");
        s.borderRadius = String(parseInt(g("#gs-radius").value) || 6);
        s.buttonRadius = String(parseInt(g("#gs-btn-radius").value) || 6);
        s.inputRadius = String(parseInt(g("#gs-inp-radius").value) || 4);

        // Appearance — typography
        s.fontFamily = gv("#gs-font");
        s.fontSizeBase = String(parseInt(g("#gs-font-size").value) || 12);
        s.fontSizeScale = String(parseFloat(g("#gs-font-scale").value) || 1.1);
        s.fontWeightBase = String(parseInt(g("#gs-font-weight").value) || 400);

        // Appearance — state colors
        s.successColor = g("#gs-success").value;
        s.warningColor = g("#gs-warning").value;
        s.errorColor = g("#gs-error").value;
        s.infoColor = g("#gs-info").value;

        // Layout — spacing
        s.spacingScale = String(parseFloat(g("#gs-spacing").value) || 1.0);
        s.containerPadding = String(parseInt(g("#gs-cont-pad").value) || 8);
        s.widgetGap = String(parseInt(g("#gs-widget-gap").value) || 8);

        // Effects — shadows
        s.enableShadows = g("#gs-shadows").checked;
        s.shadowIntensity = String(parseFloat(g("#gs-shadow-intensity").value) || 1.0);

        // Effects — glass
        s.enableGlassmorphism = g("#gs-glass").checked;
        s.glassBlurAmount = String(parseInt(g("#gs-glass-blur").value) || 12);

        // Effects — hover
        s.hoverEffect = g("#gs-hover").value;
        s.hoverScale = String(parseFloat(g("#gs-hover-scale").value) || 1.02);
        s.buttonOpacity = String(parseFloat(g("#gs-btn-opacity").value) || 1.0);

        // Effects — animations
        s.enableAnimations = g("#gs-animations").checked;
        s.animationSpeed = String(parseInt(g("#gs-anim-speed").value) || 200);
        s.enableTransitions = g("#gs-transitions").checked;
        s.transitionEasing = gv("#gs-easing") || 'cubic-bezier(0.4, 0, 0.2, 1)';

        // Effects — advanced
        s.saturationModifier = String(parseInt(g("#gs-sat").value) || 0);
        s.brightnessModifier = String(parseInt(g("#gs-bright").value) || 0);
        s.contrastModifier = String(parseInt(g("#gs-contrast").value) || 0);
        s.blurBackground = g("#gs-blur-bg").checked;
        s.blurAmount = String(parseInt(g("#gs-blur-amount").value) || 0);

        // System
        s.generateBtnColor = gv("#gs-btn-color");
        s.galleryLimit = parseInt(g("#gs-limit").value);
        s.confirmActions = g("#gs-confirm").checked;
        s.showWidgetPresets = g("#gs-widget-presets").checked;
        s.showContainerQuickSelect = g("#gs-container-quickselect").checked;
        s.presetSortOrder = g("#gs-preset-sort").value;
        s.showEditToggle = g("#gs-show-edit-toggle").checked;
        document.getElementById("a11-edit-toggle").style.display = s.showEditToggle !== false ? "" : "none";

        // Right Panel visibility
        s.rpShowPreview = g("#gs-rp-preview").checked;
        s.rpShowGallery = g("#gs-rp-gallery").checked;
        s.rpShowSendBar = g("#gs-rp-sendbar").checked;

        // Shortcuts
        s.shortcutToggle = g("#gs-shortcut-toggle").value;
        s.shortcutClose = g("#gs-shortcut-close").value;
        s.shortcutGenerate = g("#gs-shortcut-generate").value;

        // UI Preferences
        UIPreferencesManager.setPreference('showTooltips', g("#ui-tooltips").checked);
        UIPreferencesManager.setPreference('compactMode', g("#ui-compact").checked);
        UIPreferencesManager.setPreference('animationsEnabled', g("#gs-animations").checked);
        UIPreferencesManager.setPreference('sidebarWidth', parseInt(g("#ui-sidebar").value));
        UIPreferencesManager.setPreference('rightPanelWidth', parseInt(g("#ui-rightpanel").value));

        saveSettings(); updateDynamicStyles();

        if ((densityChanged || marginChanged || borderlessChanged) && state.grid) {
            state.grid.destroy(false); initGrid();
            const currentTab = state.appData.tabs[state.appData.activeIdx];
            state.grid.removeAll();
            if (currentTab && currentTab.layout) currentTab.layout.forEach(item => addGridItem(item.config, { x: item.x, y: item.y, w: item.w, h: item.h }));
        }
        modal.remove();
    };
}

function renderTabs() {
    const bar = document.getElementById("a11-tabs-bar");
    const addBtn = document.getElementById("a11-tab-add");
    Array.from(bar.children).forEach(c => { if (c !== addBtn) c.remove(); });
    state.appData.tabs.forEach((tab, idx) => {
        const el = document.createElement("div");
        el.className = `a11-tab ${idx === state.appData.activeIdx ? 'active' : ''}`;
        el.innerHTML = `<span>${tab.name}</span><span class="a11-tab-close">✖</span>`;
        el.onclick = (e) => { if (e.target.classList.contains('a11-tab-close')) return; switchTab(idx); };
        el.querySelector(".a11-tab-close").onclick = (e) => {
            e.stopPropagation();
            if (state.appData.tabs.length <= 1) { alert("Cannot delete last tab."); return; }
            if (state.settings.confirmActions && !confirm(`Delete tab "${tab.name}"?`)) return;
            state.appData.tabs.splice(idx, 1);
            if (state.appData.activeIdx >= state.appData.tabs.length) state.appData.activeIdx = state.appData.tabs.length - 1;
            else if (idx < state.appData.activeIdx) state.appData.activeIdx--;
            switchTab(state.appData.activeIdx, false);
        };
        el.ondblclick = () => {
            if (!state.isEditMode) return;
            const n = prompt("Rename Tab:", tab.name);
            if (n) { tab.name = n; updateGraphExtra(true); renderTabs(); }
        };
        bar.insertBefore(el, addBtn);
    });
}

function switchTab(idx, savePrev = true) {
    if (savePrev) updateGraphExtra(true);
    state.appData.activeIdx = idx;
    const currentTab = state.appData.tabs[idx];
    renderTabs();

    const btnGenMain = document.getElementById("btn-generate-main");
    if (btnGenMain) {
        btnGenMain.innerText = currentTab.generateBtnText || "Generate";
    }

    if (state.grid) {
        state.grid.removeAll();
        if (currentTab.layout) currentTab.layout.forEach(item => addGridItem(item.config, { x: item.x, y: item.y, w: item.w, h: item.h }));
        setTimeout(() => { applyGridState(); refreshContainerList(); }, 50);
    }
}

export function loadFromGraph() {
    if (app.graph.extra?.a1111_webui_tabs_data) {
        state.appData = JSON.parse(JSON.stringify(app.graph.extra.a1111_webui_tabs_data));
    } else if (app.graph.extra?.a1111_webui_layout) {
        state.appData = { tabs: [{ name: "Main", generateBtnText: "Generate", presetCategory: "", gallerySources: [], layout: app.graph.extra.a1111_webui_layout, activeGroups: [] }], activeIdx: 0, rightPanelConfig: { title: "Control Panel", widgets: [] } };
    } else {
        state.appData = { tabs: [{ name: "Main", generateBtnText: "Generate", presetCategory: "", gallerySources: [], layout: [], activeGroups: [] }], activeIdx: 0 };
    }

    if (!state.appData.rightPanelConfig) state.appData.rightPanelConfig = { title: "Control Panel", widgets: [], layoutMode: "list", containerView: "clean", collapsed: false };
    if (!state.appData.rightPanelConfig.widgets) state.appData.rightPanelConfig.widgets = [];
    if (!state.appData.globalWidgets) state.appData.globalWidgets = [];

    switchTab(state.appData.activeIdx, false);
    renderGlobalPanel();
    renderRightPanel();
}

export function setupUIListeners() {
    document.getElementById("a11-global-settings").onclick = openGlobalSettings;
    
    // Preset Manager button
    document.getElementById("a11-preset-manager").onclick = () => {
        openPresetManagerModal();
    };
    
    const editBtn = document.getElementById("a11-edit-toggle");
    editBtn.style.display = state.settings.showEditToggle !== false ? "" : "none";
    const overlay = document.getElementById("a11-overlay");

    // Right-click context menu on overlay (empty space)
    overlay.addEventListener("contextmenu", (e) => {
        // Only if clicking directly on overlay or grid-stack (not on items)
        const target = e.target;
        if (target.closest(".grid-stack-item") || target.closest(".gw-bar") ||
            target.closest(".gw-body") || target.closest(".gw-widget-wrapper") ||
            target.closest(".a11-tabs-bar") || target.closest(".a11-header") ||
            target.closest(".a11-btn")) {
            return; // Let container/widget context menus handle it
        }
        e.preventDefault();
        e.stopPropagation();
        import("./contextMenu.js").then(m => m.showEmptyContextMenu(e));
    });

    editBtn.onclick = () => {
        state.isEditMode = !state.isEditMode;
        if (state.isEditMode) {
            editBtn.innerText = "✓ Save"; editBtn.classList.add("active");
            overlay.classList.add("edit-mode"); overlay.classList.remove("view-mode");

            if (state.grid) {
                state.grid.setStatic(false);
                state.grid.engine.nodes.forEach(n => {
                    const content = n.el.querySelector('.grid-stack-item-content');
                    if (content && content.dataset.config) renderGridItemContent(content, JSON.parse(content.dataset.config));
                });
            }
            refreshContainerList(); renderGlobalPanel(); renderRightPanel();
        } else {
            editBtn.innerText = "✐ Edit Layout"; editBtn.classList.remove("active");
            overlay.classList.remove("edit-mode"); overlay.classList.add("view-mode");

            if (state.grid) {
                state.grid.setStatic(true);
                state.grid.engine.nodes.forEach(n => {
                    const content = n.el.querySelector('.grid-stack-item-content');
                    if (content && content.dataset.config) renderGridItemContent(content, JSON.parse(content.dataset.config));
                });
            }
            updateGraphExtra(true); state.activeContainerEl = null; renderGlobalPanel(); renderRightPanel();
            // Hide floating panel + clear multi-select
            const floating = document.getElementById("a11-floating-appearance");
            if (floating) floating.classList.remove("visible");
            import("./grid.js").then(m => m.clearMultiSelection());
        }
    };

    document.getElementById("a11-tab-add").onclick = () => {
        if (!state.isEditMode) return;
        const modal = document.createElement("div");
        modal.className = "a11-modal open";

        let presetOptions = `<option value="">-- Empty Tab --</option>`;
        if (state.settings.tabPresets && state.settings.tabPresets.length > 0) {
            state.settings.tabPresets.forEach((p, i) => {
                presetOptions += `<option value="${i}">${p.name}</option>`;
            });
        }

        modal.innerHTML = `
            <div class="a11-modal-content" style="width: 350px;">
                <div class="a11-modal-title">Add New Tab</div>
                <div class="a11-modal-body">
                    <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom: none;">
                        <label>Tab Name</label>
                        <input type="text" id="new-tab-name" value="New Tab" style="width:100%;">
                    </div>
                    <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom: none;">
                        <label>Layout Template</label>
                        <select id="new-tab-preset" style="width:100%;">${presetOptions}</select>
                    </div>
                </div>
                <div class="a11-modal-footer">
                    <button class="a11-btn" id="nt-cancel">Cancel</button>
                    <button class="a11-btn active" id="nt-create">Create</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector("#nt-cancel").onclick = () => modal.remove();
        modal.querySelector("#nt-create").onclick = () => {
            const name = modal.querySelector("#new-tab-name").value || "Unnamed Tab";
            const presetIdx = modal.querySelector("#new-tab-preset").value;

            let newLayout = [];
            let generateBtnText = "Generate";
            let gallerySources = [];

            if (presetIdx !== "") {
                const preset = state.settings.tabPresets[parseInt(presetIdx)];
                if (preset) {
                    generateBtnText = preset.generateBtnText || "Generate";
                    newLayout = JSON.parse(JSON.stringify(preset.layout));
                    newLayout.forEach(item => {
                        if (item.config && item.config.widgets) {
                            item.config.widgets.forEach(w => {
                                if (w.nodeTitle && w.nodeType) {
                                    const matchedNode = app.graph._nodes.find(n => n.title === w.nodeTitle && n.type === w.nodeType);
                                    if (matchedNode) w.nodeId = matchedNode.id;
                                }
                            });
                        }
                    });
                }
            }

            state.appData.tabs.push({ name, generateBtnText, presetCategory: "", gallerySources, layout: newLayout, activeGroups: [] });
            updateGraphExtra(true);
            switchTab(state.appData.tabs.length - 1);
            modal.remove();
        };
    };

    document.getElementById("a11-close").onclick = () => { toggleWebUIStudio(); };

    document.getElementById("a11-clear").onclick = () => {
        if (!state.isEditMode) return;
        if (confirm("Are you sure you want to remove ALL containers from this tab?")) {
            if (state.grid) {
                state.grid.removeAll();
                updateGraphExtra(true);
                refreshContainerList();
            }
        }
    };

    // Multi-select actions
    const multiDelete = document.getElementById("a11-multi-delete");
    const multiDup = document.getElementById("a11-multi-duplicate");
    if (multiDelete) {
        multiDelete.onclick = () => {
            import("./grid.js").then(m => m.deleteMultiSelected());
        };
    }
    if (multiDup) {
        multiDup.onclick = () => {
            import("./grid.js").then(m => m.duplicateMultiSelected());
        };
    }

    // Keyboard: Delete key for selected containers
    document.addEventListener("keydown", (e) => {
        if (e.key === "Delete" && state.isEditMode) {
            const overlay = document.getElementById("a11-overlay");
            if (!overlay || !overlay.classList.contains("visible")) return;
            // Don't intercept if focusing an input
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable) return;
            import("./grid.js").then(m => {
                if (m.getMultiSelectedConfigs().length > 0) {
                    m.deleteMultiSelected();
                } else {
                    // Delete the active target container
                    const sel = document.getElementById("sel-target-container");
                    if (sel && sel.value && sel.value !== "__global__" && sel.value !== "__right_panel__") {
                        const gridItem = document.querySelector(`.grid-stack-item[gs-id="${sel.value}"]`);
                        if (gridItem) {
                            const content = gridItem.querySelector(".grid-stack-item-content");
                            if (content) {
                                try {
                                    const config = JSON.parse(content.dataset.config || "{}");
                                    const tab = state.appData.tabs[state.appData.activeIdx];
                                    const idx = tab.layout.findIndex(li => li.config === config);
                                    if (idx > -1) tab.layout.splice(idx, 1);
                                } catch (ex) { }
                                m.clearMultiSelection();
                                state.grid.removeWidget(gridItem);
                                m.updateGraphExtra(true);
                                m.refreshContainerList();
                            }
                        }
                    }
                }
            });
        }
    });

    document.getElementById("a11-add-new").onclick = () => {
        if (!state.isEditMode) return;
        addGridItem({ title: "Container", widgets: [] }, { w: 12, h: 2 });
        setTimeout(refreshContainerList, 100);
    };

    document.getElementById("a11-tab-settings").onclick = () => {
        if (!state.isEditMode) return;
        const currentTab = state.appData.tabs[state.appData.activeIdx];
        const modal = document.createElement("div");
        modal.className = "a11-modal open";

        let nodeOptions = "";
        const sources = currentTab.gallerySources || [];
        app.graph._nodes.forEach(n => {
            const isImageNode = n.type && (n.type.toLowerCase().includes("save") || n.type.toLowerCase().includes("preview") || n.type.toLowerCase().includes("image"));
            if (isImageNode) {
                const checked = sources.includes(n.id.toString()) || sources.includes(parseInt(n.id)) ? "checked" : "";
                nodeOptions += `
                    <label class="a11-group-item" style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" class="ts-source" value="${n.id}" ${checked}>
                        <span style="flex-grow:1; font-weight:bold;">${n.title}</span>
                        <span style="opacity:0.5; font-size:10px;">(${n.type})</span>
                    </label>`;
            }
        });
        if (!nodeOptions) nodeOptions = "<div style='color:var(--a11-desc); padding:10px;'>No image output nodes found.</div>";

        // Get existing templates for dropdown
        const allTemplates = LayoutTemplateManager.getAllTemplates();
        let templateOptions = `<option value="">-- Select Template to Apply --</option>`;
        allTemplates.forEach(tpl => {
            templateOptions += `<option value="${tpl.id}">${tpl.name} ${tpl.metadata?.isFavorite ? '⭐' : ''}</option>`;
        });

        modal.innerHTML = `
            <div class="a11-modal-content" style="width:750px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
                <div class="a11-modal-title">⚙ Tab Settings: <span style="color:var(--a11-accent)">${currentTab.name}</span></div>
                <div class="a11-modal-layout" style="flex:1; overflow:hidden;">
                    <div class="a11-modal-sidebar">
                        <div class="a11-modal-tab active" data-target="ts-general">📋 General</div>
                        <div class="a11-modal-tab" data-target="ts-gallery">🖼️ Gallery Sources</div>
                        <div class="a11-modal-tab" data-target="ts-templates">💾 Layout Templates</div>
                    </div>
                    <div class="a11-modal-content-area" style="overflow-y:auto; padding:15px;">
                        
                        <div class="a11-modal-panel active" id="ts-general">
                            <div class="a11-settings-block">
                                <div class="a11-settings-title">Tab Configuration</div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom:none;">
                                    <label>Tab Name</label>
                                    <input type="text" id="ts-name" value="${currentTab.name}" style="width:100%">
                                </div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:5px; border-bottom:none; margin-top:10px;">
                                    <label>Generate Button Text</label>
                                    <input type="text" id="ts-gen-text" value="${currentTab.generateBtnText || 'Generate'}" style="width:100%">
                                </div>
                            </div>
                        </div>
                        
                        <div class="a11-modal-panel" id="ts-gallery">
                            <div class="a11-settings-block">
                                <div class="a11-settings-title">Gallery Output Sources</div>
                                <small style="color:var(--a11-desc); display:block; margin-bottom:10px;">Select which nodes provide images to the gallery. Leave empty to allow all.</small>
                                <div style="max-height:300px; overflow-y:auto; border:1px solid var(--a11-border); border-radius:6px; padding:10px;">
                                    ${nodeOptions}
                                </div>
                            </div>
                        </div>
                        
                        <div class="a11-modal-panel" id="ts-templates">
                            <div class="a11-settings-block">
                                <div class="a11-settings-title">Apply Existing Template</div>
                                <div class="a11-setting-row" style="display:flex; gap:8px; width:100%;">
                                    <select id="ts-template-select" style="flex-grow:1;">${templateOptions}</select>
                                    <button id="ts-template-apply" class="a11-btn active">Apply</button>
                                    <button id="ts-template-preview" class="a11-btn">Preview</button>
                                </div>
                                <small style="color:var(--a11-desc); display:block; margin-top:8px;">Applying a template will replace the current tab layout.</small>
                            </div>
                            
                            <div class="a11-settings-block" style="margin-top:15px;">
                                <div class="a11-settings-title">💾 Save Current Layout as Template</div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                                    <label>Template Name</label>
                                    <input type="text" id="ts-tpl-name" placeholder="e.g., My SDXL Workflow" style="width:100%;" value="${currentTab.name + ' Layout'}">
                                </div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:8px;">
                                    <label>Description (Optional)</label>
                                    <textarea id="ts-tpl-desc" placeholder="Describe this layout template..." style="width:100%; min-height:60px; resize:vertical;"></textarea>
                                </div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:8px;">
                                    <label>Tags (comma-separated)</label>
                                    <input type="text" id="ts-tpl-tags" placeholder="e.g., sdxl, portrait, fast" style="width:100%;">
                                </div>
                                <div class="a11-setting-row" style="margin-top:12px;">
                                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                        <input type="checkbox" id="ts-tpl-favorite">
                                        <span>Mark as Favorite ⭐</span>
                                    </label>
                                </div>
                                <button id="ts-tpl-save" class="a11-btn active" style="margin-top:12px; width:100%; background:var(--a11-accent); color:white;">
                                    💾 Save as Template
                                </button>
                            </div>
                            
                            <div class="a11-settings-block" style="margin-top:15px;">
                                <div class="a11-settings-title">Manage Templates</div>
                                <div style="max-height:200px; overflow-y:auto;" id="ts-tpl-list"></div>
                                <div style="margin-top:10px; display:flex; gap:8px;">
                                    <button id="ts-tpl-export" class="a11-btn" title="Export selected template">📤 Export</button>
                                    <button id="ts-tpl-import" class="a11-btn" title="Import template from JSON">📥 Import</button>
                                    <input type="file" id="ts-tpl-import-file" accept=".json" style="display:none;">
                                </div>
                            </div>
                        </div>
                        
                    </div>
                </div>
                <div class="a11-modal-footer">
                    <button class="a11-btn" id="ts-cancel">Cancel</button>
                    <button class="a11-btn active" id="ts-save">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Tab switching
        modal.querySelectorAll('.a11-modal-tab').forEach(tab => {
            tab.onclick = () => {
                modal.querySelectorAll('.a11-modal-tab').forEach(t => t.classList.remove('active'));
                modal.querySelectorAll('.a11-modal-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                modal.querySelector('#' + tab.dataset.target).classList.add('active');
                if (tab.dataset.target === 'ts-templates') renderTemplateList();
            };
        });

        // Render template list
        const renderTemplateList = () => {
            const listEl = modal.querySelector('#ts-tpl-list');
            const templates = LayoutTemplateManager.getAllTemplates();
            if (templates.length === 0) {
                listEl.innerHTML = '<div style="color:var(--a11-desc); padding:10px;">No templates saved yet.</div>';
                return;
            }
            listEl.innerHTML = templates.map(tpl => `
                <div class="a11-group-item" style="padding:8px; border-bottom:1px solid var(--a11-border);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${tpl.name}</strong> ${tpl.metadata?.isFavorite ? '⭐' : ''}
                            <div style="font-size:11px; color:var(--a11-desc);">${new Date(tpl.createdAt).toLocaleDateString()} • Used ${tpl.metadata?.usageCount || 0} times</div>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="a11-btn ts-tpl-apply" data-id="${tpl.id}" style="padding:4px 8px; font-size:11px;">Apply</button>
                            <button class="a11-btn ts-tpl-delete" data-id="${tpl.id}" style="padding:4px 8px; font-size:11px; background:var(--a11-error); color:white;">🗑️</button>
                        </div>
                    </div>
                </div>
            `).join('');
            
            listEl.querySelectorAll('.ts-tpl-apply').forEach(btn => {
                btn.onclick = () => {
                    if (confirm(`Apply template "${LayoutTemplateManager.getTemplate(btn.dataset.id).name}"? This will replace current layout.`)) {
                        LayoutTemplateManager.applyTemplate(btn.dataset.id);
                        alert('Template applied! Click "Save Changes" to persist.');
                    }
                };
            });
            
            listEl.querySelectorAll('.ts-tpl-delete').forEach(btn => {
                btn.onclick = () => {
                    const tpl = LayoutTemplateManager.getTemplate(btn.dataset.id);
                    if (confirm(`Delete template "${tpl.name}"?`)) {
                        LayoutTemplateManager.deleteTemplate(btn.dataset.id);
                        renderTemplateList();
                    }
                };
            });
        };

        // Apply template
        modal.querySelector("#ts-template-apply").onclick = () => {
            const tplId = modal.querySelector("#ts-template-select").value;
            if (!tplId) return alert("Please select a template.");
            if (confirm("Applying a template will replace the current tab layout. Continue?")) {
                LayoutTemplateManager.applyTemplate(tplId);
                alert("Template applied! Click 'Save Changes' to persist.");
            }
        };

        // Preview template
        modal.querySelector("#ts-template-preview").onclick = () => {
            const tplId = modal.querySelector("#ts-template-select").value;
            if (!tplId) return alert("Please select a template.");
            const tpl = LayoutTemplateManager.getTemplate(tplId);
            alert(`Template: ${tpl.name}\nCreated: ${new Date(tpl.createdAt).toLocaleString()}\nUsed: ${tpl.metadata?.usageCount || 0} times\nDescription: ${tpl.metadata?.description || 'None'}`);
        };

        // Save as template
        modal.querySelector("#ts-tpl-save").onclick = () => {
            const name = modal.querySelector("#ts-tpl-name").value.trim();
            if (!name) return alert("Please enter a template name.");
            
            const description = modal.querySelector("#ts-tpl-desc").value.trim();
            const tagsStr = modal.querySelector("#ts-tpl-tags").value.trim();
            const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
            const isFavorite = modal.querySelector("#ts-tpl-favorite").checked;
            
            const enrichedLayout = JSON.parse(JSON.stringify(currentTab.layout));
            enrichedLayout.forEach(item => {
                if (item.config && item.config.widgets) {
                    item.config.widgets.forEach(w => {
                        const node = app.graph.getNodeById(w.nodeId);
                        if (node) { w.nodeTitle = node.title; w.nodeType = node.type; }
                    });
                }
            });
            
            const template = LayoutTemplateManager.saveTemplate(name, {
                name: currentTab.name,
                generateBtnText: currentTab.generateBtnText,
                presetCategory: currentTab.presetCategory,
                gallerySources: currentTab.gallerySources,
                layout: enrichedLayout,
                activeGroups: currentTab.activeGroups
            }, {
                description,
                tags,
                isFavorite
            });
            
            alert(`Template "${name}" saved successfully!`);
            renderTemplateList();
        };

        // Export template
        modal.querySelector("#ts-tpl-export").onclick = () => {
            const tplId = modal.querySelector("#ts-template-select").value;
            if (!tplId) return alert("Please select a template to export.");
            const json = LayoutTemplateManager.exportTemplate(tplId);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `a11-template-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        // Import template
        modal.querySelector("#ts-tpl-import").onclick = () => {
            modal.querySelector("#ts-tpl-import-file").click();
        };
        
        modal.querySelector("#ts-tpl-import-file").onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const tpl = LayoutTemplateManager.importTemplate(evt.target.result);
                    if (tpl) {
                        alert(`Template "${tpl.name}" imported successfully!`);
                        renderTemplateList();
                    } else {
                        alert("Failed to import template. Invalid format.");
                    }
                } catch (err) {
                    alert("Error importing template: " + err.message);
                }
            };
            reader.readAsText(file);
        };

        modal.querySelector("#ts-cancel").onclick = () => modal.remove();
        modal.querySelector("#ts-save").onclick = () => {
            currentTab.name = modal.querySelector("#ts-name").value || "Unnamed Tab";
            currentTab.generateBtnText = modal.querySelector("#ts-gen-text").value || "Generate";
            const selectedSources = Array.from(modal.querySelectorAll(".ts-source:checked")).map(cb => parseInt(cb.value));
            currentTab.gallerySources = selectedSources;
            updateGraphExtra(true); renderTabs();
            const btnGenMain = document.getElementById("btn-generate-main");
            if (btnGenMain) btnGenMain.innerText = currentTab.generateBtnText;
            modal.remove();
        };
    };

    let selectedWidgetData = null;
    const widgetSearchInput = document.getElementById("a11-widget-search");
    const widgetResults = document.getElementById("a11-widget-results");
    const btnAddWidget = document.getElementById("a11-btn-add-widget");

    widgetSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        widgetResults.innerHTML = "";
        if (query.length < 2) { widgetResults.classList.remove("visible"); return; }
        const matches = [];
        app.graph._nodes.forEach(node => {
            const nodeTitle = node.title || node.type || "Unknown Node";
            const isLoadImage = node.type && node.type.toLowerCase().includes("load");

            if (node.widgets) {
                node.widgets.forEach((w, i) => {
                    const wName = w.name || w.type || `CustomWidget_${i}`;
                    if (String(wName).toLowerCase().includes(query) || String(nodeTitle).toLowerCase().includes(query)) {
                        matches.push({ node: node, widgetIndex: i, name: wName, displayName: `${nodeTitle} > ${wName}` });
                    }
                });
            }
            if (!isLoadImage && (node.type === "PreviewImage" || node.type === "SaveImage" || node.type.toLowerCase().includes("preview") || node.type.toLowerCase().includes("save"))) {
                if ("output preview".includes(query) || String(nodeTitle).toLowerCase().includes(query)) {
                    matches.push({ node: node, widgetIndex: "__preview__", displayName: `${nodeTitle} > Output Preview` });
                }
            }
        });
        const limit = matches.slice(0, 50);
        if (limit.length > 0) {
            widgetResults.classList.add("visible");
            limit.forEach(match => {
                const item = document.createElement("div"); item.className = "a11-search-item";
                item.innerText = match.displayName;
                item.onclick = () => {
                    selectedWidgetData = { nodeId: match.node.id, widgetIndex: match.widgetIndex, name: match.name };
                    widgetSearchInput.value = match.displayName;
                    widgetResults.classList.remove("visible");
                };
                widgetResults.appendChild(item);
            });
        } else { widgetResults.classList.remove("visible"); }
    });

    btnAddWidget.onclick = () => {
        if (!state.isEditMode) return;
        const targetId = document.getElementById("sel-target-container").value;
        if (!targetId) { alert("Please select a Target Container."); return; }
        if (!selectedWidgetData) { alert("Please search and select a Widget first."); return; }

        const wCopy = JSON.parse(JSON.stringify(selectedWidgetData));

        if (targetId === "__global__") {
            if (!state.appData.globalWidgets) state.appData.globalWidgets = [];
            state.appData.globalWidgets.push(wCopy);
            renderGlobalPanel(); updateGraphExtra(true);
        } else if (targetId === "__right_panel__") {
            if (!state.appData.rightPanelConfig.widgets) state.appData.rightPanelConfig.widgets = [];
            state.appData.rightPanelConfig.widgets.push(wCopy);
            renderRightPanel(); updateGraphExtra(true);
        } else {
            const gridItem = document.querySelector(`.grid-stack-item[gs-id="${targetId}"]`);
            if (!gridItem) { alert("Target container not found."); refreshContainerList(); return; }
            const content = gridItem.querySelector(".grid-stack-item-content");
            const config = JSON.parse(content.dataset.config);
            config.widgets.push(wCopy);
            content.dataset.config = JSON.stringify(config);
            refreshActiveItem(); updateGraphExtra(true);
        }
        widgetSearchInput.value = ""; selectedWidgetData = null;
    };

    const nodeSearchInput = document.getElementById("a11-node-search");
    const nodeSearchResults = document.getElementById("a11-search-results");

    nodeSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        nodeSearchResults.innerHTML = "";
        if (query.length < 2) { nodeSearchResults.classList.remove("visible"); return; }
        const nodes = app.graph._nodes.filter(n => (n.title && n.title.toLowerCase().includes(query)) || (n.type && n.type.toLowerCase().includes(query)));
        if (nodes.length > 0) {
            nodeSearchResults.classList.add("visible");
            nodes.forEach(node => {
                const item = document.createElement("div"); item.className = "a11-search-item";
                item.innerHTML = `<span>${node.title || node.type}</span><span class="a11-search-item-type" style="float:right; opacity:0.5;">${node.type}</span>`;
                item.onclick = () => {
                    const wList = []
                    const isLoadImage = node.type && node.type.toLowerCase().includes("load");

                    if (node.widgets) {
                        node.widgets.forEach((w, i) => {
                            if (w.type !== 'converted-widget') {
                                const wName = w.name || w.type || `CustomWidget_${i}`;
                                wList.push({ nodeId: node.id, widgetIndex: i, name: wName });
                            }
                        });
                    }

                    if (!isLoadImage && (node.type === "PreviewImage" || node.type === "SaveImage" || node.type.toLowerCase().includes("preview") || node.type.toLowerCase().includes("save"))) {
                        wList.push({ nodeId: node.id, widgetIndex: "__preview__" });
                    }

                    if (wList.length > 0) {
                        const safeTitle = node.title || node.type || "Unnamed Node";
                        addGridItem({ title: safeTitle, widgets: wList }, { w: 4, h: wList.length > 2 ? wList.length : 4 });
                        setTimeout(refreshContainerList, 100);
                    }
                    nodeSearchInput.value = ""; nodeSearchResults.classList.remove("visible");
                };
                nodeSearchResults.appendChild(item);
            });
        } else { nodeSearchResults.classList.remove("visible"); }
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".a11-node-search-wrapper") && !e.target.closest(".a11-input-group")) {
            nodeSearchResults.classList.remove("visible"); widgetResults.classList.remove("visible");
        }
    });

    document.getElementById("a11-tab-groups").onclick = () => { if (state.isEditMode) openGroupSettings(); };
}
