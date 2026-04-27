import { app } from "../../scripts/app.js";
import { state, saveSettings, resetSettings } from "./state.js";
import { updateDynamicStyles } from "./styles.js";
import { addGridItem, refreshActiveItem, updateGraphExtra, applyGridState, refreshContainerList, initGrid, renderGlobalPanel, renderRightPanel, renderGridItemContent, openGroupSettings } from "./grid.js";
import { LayoutTemplateManager, UIPreferencesManager, validateSettings, migrateSettings } from "./settingsManager.js";
import { DOMManager } from "./widgets/CustomDOMInterpreter.js";
import { openPresetManagerModal } from "./widgets/PresetManagerUI.js";

export function toggleWebUIStudio() {
    const overlay = document.getElementById("a11-overlay");
    if (!overlay) return;
    if (overlay.classList.contains("visible")) {
        overlay.classList.remove("visible");
        
        // P0: Очистить все "украденные" DOM элементы при закрытии
        DOMManager.cleanup();
        
        updateGraphExtra(true);
    } else {
        overlay.classList.add("visible");
        setTimeout(() => loadFromGraph(), 50);
    }
}

function setupFloatingButton() {
    const btn = document.createElement("div");
    btn.id = "a11-floating-btn";
    btn.innerHTML = "🎨";
    btn.title = "Toggle WebUI Studio";
    document.body.appendChild(btn);

    if (state.settings.btnPos) {
        const { top, left } = state.settings.btnPos;
        const safeTop = Math.min(Math.max(0, top), window.innerHeight - 60);
        const safeLeft = Math.min(Math.max(0, left), window.innerWidth - 60);
        btn.style.top = safeTop + "px";
        btn.style.left = safeLeft + "px";
    } else {
        btn.style.top = "20px";
        btn.style.left = "20px";
    }

    let isDragging = false; let hasMoved = false; let offsetX, offsetY;
    btn.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDragging = true; hasMoved = false;
        offsetX = e.clientX - btn.getBoundingClientRect().left;
        offsetY = e.clientY - btn.getBoundingClientRect().top;
        btn.style.cursor = "grabbing";
        e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        hasMoved = true;
        btn.style.top = (e.clientY - offsetY) + "px";
        btn.style.left = (e.clientX - offsetX) + "px";
    });
    window.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            btn.style.cursor = "move";
            const rect = btn.getBoundingClientRect();
            state.settings.btnPos = { top: rect.top, left: rect.left };
            saveSettings();
        }
    });
    btn.addEventListener("click", () => { if (!hasMoved) toggleWebUIStudio(); });
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
                overlay.classList.remove("visible");
                updateGraphExtra(true);
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
    const previewHandle = document.getElementById("a11-right-split-resizer");

    if (state.settings.panelWidth) rightPanel.style.width = state.settings.panelWidth + "px";
    if (state.settings.headerHeight) header.style.height = state.settings.headerHeight + "px";
    if (state.settings.previewHeight) previewWrap.style.height = state.settings.previewHeight + "px";

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
        isRightResizing = true; rightHandle.classList.add("active"); document.body.style.cursor = "col-resize"; e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
        if (!isRightResizing) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < (window.innerWidth - 100)) rightPanel.style.width = newWidth + "px";
    });
    window.addEventListener("mouseup", () => {
        if (isRightResizing) {
            isRightResizing = false; rightHandle.classList.remove("active"); document.body.style.cursor = "";
            state.settings.panelWidth = parseInt(rightPanel.style.width);
            saveSettings();
            if (state.grid) state.grid.onResize();
        }
    });

    makeYResizer(headerHandle, header, "headerHeight", 48, 400, (e) => e.clientY);
    makeYResizer(previewHandle, previewWrap, "previewHeight", 100, 800, (e, target) => {
        const rect = target.getBoundingClientRect(); return e.clientY - rect.top;
    });
}

export function injectUI() {
    setupFloatingButton();
    setupGlobalShortcuts();

    const overlay = document.createElement("div");
    overlay.id = "a11-overlay";
    overlay.className = "view-mode";
    overlay.innerHTML = `
        <div class="a11-header" id="a11-header">
            <div class="a11-logo">ComfyUI <span style="color:var(--a11-accent)">Studio</span></div>
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
                    </div>
                    <div class="grid-stack" id="a11-grid"></div>
                </div>
            </div>

            <div id="a11-resize-handle" class="a11-resize-handle"></div>

            <div class="a11-right-panel" id="a11-right-panel">
                <div id="btn-container">
                    <button id="btn-generate-main" class="a11-btn-generate">Generate</button>
                    <div id="btn-running-group" style="display:none; width:100%; gap:5px;">
                        <button id="btn-queue-more" class="action-btn">Queue More</button>
                        <button id="btn-interrupt" class="action-btn" style="background:var(--a11-error); color:white;">Interrupt</button>
                        <button id="btn-clear" class="action-btn">Clear Q</button>
                    </div>
                </div>

                <div class="a11-preview-wrapper" id="a11-preview-wrapper">
                    <div class="a11-preview-box empty" id="a11-preview-box">
                        <button id="a11-expand-btn" class="a11-btn-expand">⛶ Fullscreen</button>

                        <div class="a11-progress" id="a11-progress"></div>
                        <img id="a11-preview-img" class="a11-preview-img" src="" />
                        <div id="a11-placeholder" style="color:var(--a11-desc);">Preview Area</div>
                        <button id="a11-resume-live" class="a11-resume-live-btn">▶ Resume Live Preview</button>
                    </div>

                    <div class="a11-send-bar">
                        <select id="a11-send-target" class="a11-toolbar-select" style="flex-grow:1; max-width:none;">
                            <option value="">Select Load Image Node...</option>
                        </select>
                        <button id="a11-send-btn" class="a11-btn" style="flex-shrink:0;">Send ➜</button>
                        <button id="a11-manual-save-btn" class="a11-btn a11-btn-save" title="Save to ComfyUI output folder">💾 Save</button>
                    </div>

                    <div class="a11-gallery" id="a11-gallery"></div>
                </div>

                <div id="a11-right-split-resizer" class="a11-right-split-resizer"></div>

                <div id="a11-right-panel-container" class="grid-stack-item-content a11-special-container"></div>

                <div style="background:var(--a11-input); padding:8px; border-radius:6px; display:flex; justify-content:space-between; margin-top: auto; flex-shrink: 0;">
                    <div id="a11-status" style="color:var(--a11-text); font-weight:600; font-size:13px;">Idle</div>
                    <button id="a11-clear-gallery" style="background:none; border:none; color:var(--a11-desc); cursor:pointer; font-size:11px; text-decoration:underline;">Clear Gallery</button>
                </div>
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

        <div class="a11-modal" id="a11-group-modal">
            <div class="a11-modal-content">
                <div class="a11-modal-title">Manage Active Groups</div>
                <div class="a11-modal-body" id="a11-group-list"></div>
                <div class="a11-modal-footer">
                    <button class="a11-btn" id="a11-group-cancel">Cancel</button>
                    <button class="a11-btn active" id="a11-group-save">Save</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function openGlobalSettings() {
    const modal = document.createElement("div");
    modal.className = "a11-modal open";
    modal.innerHTML = `
        <div class="a11-modal-content" style="width:700px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
            <div class="a11-modal-title">⚙ Global Settings</div>
            <div class="a11-modal-layout" style="flex:1; overflow:hidden;">
                <div class="a11-modal-sidebar">
                    <div class="a11-modal-tab active" data-target="gs-theme">🎨 Theme & Display</div>
                    <div class="a11-modal-tab" data-target="gs-hotkeys">⌨️ Hotkeys</div>
                    <div class="a11-modal-tab" data-target="gs-system">⚙ System</div>
                    <div class="a11-modal-tab" data-target="gs-ui-prefs">🖥️ UI Preferences</div>
                </div>
                <div class="a11-modal-content-area" style="overflow-y:auto; padding:15px;">
                    
                    <div class="a11-modal-panel active" id="gs-theme">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Theme Colors</div>
                            <div class="a11-setting-row"><label>Theme Accent Color</label><input type="color" id="gs-color" value="${state.settings.themeColor}" style="width:60px;"></div>
                            <div class="a11-setting-row"><label>App BG Color (Empty=Auto)</label><input type="text" id="gs-bg" value="${state.settings.bgColor || ''}" placeholder="e.g. #1e1e1e"></div>
                            <div class="a11-setting-row"><label>Panels BG Color (Empty=Auto)</label><input type="text" id="gs-panel" value="${state.settings.panelBg || ''}" placeholder="e.g. #2a2a2a"></div>
                            <div class="a11-setting-row"><label>Text Color (Empty=Auto)</label><input type="text" id="gs-text" value="${state.settings.textColor || ''}" placeholder="e.g. #ffffff"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Typography</div>
                            <div class="a11-setting-row"><label>Font Family</label><input type="text" id="gs-font" value="${state.settings.fontFamily || ''}" placeholder="Segoe UI, sans-serif"></div>
                        </div>
                    </div>
                    
                    <div class="a11-modal-panel" id="gs-hotkeys">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Keyboard Shortcuts</div>
                            <div class="a11-setting-row"><label>Toggle Studio UI</label><input type="text" id="gs-shortcut-toggle" value="${state.settings.shortcutToggle}" readonly style="cursor:pointer; text-align:center;"></div>
                            <div class="a11-setting-row"><label>Close Studio UI</label><input type="text" id="gs-shortcut-close" value="${state.settings.shortcutClose}" readonly style="cursor:pointer; text-align:center;"></div>
                            <div class="a11-setting-row"><label>Generate (When open)</label><input type="text" id="gs-shortcut-generate" value="${state.settings.shortcutGenerate}" readonly style="cursor:pointer; text-align:center;"></div>
                            <small style="color:var(--a11-desc); display:block; margin-top:10px;">Click on a shortcut field and press your desired key combination. Use Backspace to clear.</small>
                        </div>
                    </div>
                    
                    <div class="a11-modal-panel" id="gs-system">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Grid Configuration</div>
                            <div class="a11-setting-row"><label>Grid Density (Cell Height px)</label><input type="number" id="gs-density" value="${state.settings.gridCellHeight}" min="30" max="200"></div>
                            <div class="a11-setting-row"><label>Grid Margin (Gap px)</label><input type="number" id="gs-margin" value="${state.settings.gridMargin !== undefined ? state.settings.gridMargin : 5}" min="0" max="50"></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Gallery & Performance</div>
                            <div class="a11-setting-row"><label>Floating Button Opacity</label><input type="number" id="gs-opacity" value="${state.settings.btnOpacity}" step="0.1" min="0.1" max="1.0"></div>
                            <div class="a11-setting-row"><label>Gallery Limit (Images)</label><input type="number" id="gs-limit" value="${state.settings.galleryLimit}" min="5" max="500"></div>
                            <div class="a11-setting-row"><label>Confirm Deletions</label><input type="checkbox" id="gs-confirm" ${state.settings.confirmActions ? "checked" : ""}></div>
                        </div>
                    </div>
                    
                    <div class="a11-modal-panel" id="gs-ui-prefs">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Interface Preferences</div>
                            <div class="a11-setting-row"><label>Show Tooltips</label><input type="checkbox" id="ui-tooltips" ${UIPreferencesManager.getPreference('showTooltips', true) ? "checked" : ""}></div>
                            <div class="a11-setting-row"><label>Compact Mode</label><input type="checkbox" id="ui-compact" ${UIPreferencesManager.getPreference('compactMode', false) ? "checked" : ""}></div>
                            <div class="a11-setting-row"><label>Enable Animations</label><input type="checkbox" id="ui-animations" ${UIPreferencesManager.getPreference('animationsEnabled', true) ? "checked" : ""}></div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Panel Dimensions</div>
                            <div class="a11-setting-row"><label>Sidebar Width (px)</label><input type="number" id="ui-sidebar" value="${UIPreferencesManager.getPreference('sidebarWidth', 280)}" min="200" max="500"></div>
                            <div class="a11-setting-row"><label>Right Panel Width (px)</label><input type="number" id="ui-rightpanel" value="${UIPreferencesManager.getPreference('rightPanelWidth', 320)}" min="250" max="600"></div>
                        </div>
                    </div>
                    
                </div>
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn danger" id="gs-reset" style="margin-right:auto;">Reset All Settings</button>
                <button class="a11-btn" id="gs-validate" title="Check for issues">Validate</button>
                <button class="a11-btn" id="gs-cancel">Cancel</button>
                <button class="a11-btn active" id="gs-save">Save & Apply</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Tab switching logic
    modal.querySelectorAll('.a11-modal-tab').forEach(tab => {
        tab.onclick = () => {
            modal.querySelectorAll('.a11-modal-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.a11-modal-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            modal.querySelector('#' + tab.dataset.target).classList.add('active');
        };
    });

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

    modal.querySelector("#gs-reset").onclick = () => {
        if (confirm("Are you sure you want to reset ALL settings to defaults? This cannot be undone.")) {
            resetSettings(); updateDynamicStyles(); modal.remove();
        }
    };
    
    modal.querySelector("#gs-validate").onclick = () => {
        const testSettings = {
            gridCellHeight: parseInt(modal.querySelector("#gs-density").value),
            gridMargin: parseInt(modal.querySelector("#gs-margin").value),
            themeColor: modal.querySelector("#gs-color").value,
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
    
    modal.querySelector("#gs-cancel").onclick = () => modal.remove();
    modal.querySelector("#gs-save").onclick = () => {
        const newDensity = parseInt(modal.querySelector("#gs-density").value);
        const newMargin = parseInt(modal.querySelector("#gs-margin").value);

        const densityChanged = newDensity !== state.settings.gridCellHeight;
        const marginChanged = newMargin !== (state.settings.gridMargin !== undefined ? state.settings.gridMargin : 5);

        state.settings.gridCellHeight = newDensity;
        state.settings.gridMargin = newMargin;

        state.settings.themeColor = modal.querySelector("#gs-color").value;
        state.settings.bgColor = modal.querySelector("#gs-bg").value.trim();
        state.settings.panelBg = modal.querySelector("#gs-panel").value.trim();
        state.settings.textColor = modal.querySelector("#gs-text").value.trim();
        state.settings.fontFamily = modal.querySelector("#gs-font").value.trim();
        state.settings.btnOpacity = parseFloat(modal.querySelector("#gs-opacity").value);
        state.settings.galleryLimit = parseInt(modal.querySelector("#gs-limit").value);
        state.settings.confirmActions = modal.querySelector("#gs-confirm").checked;

        state.settings.shortcutToggle = modal.querySelector("#gs-shortcut-toggle").value;
        state.settings.shortcutClose = modal.querySelector("#gs-shortcut-close").value;
        state.settings.shortcutGenerate = modal.querySelector("#gs-shortcut-generate").value;

        // Save UI preferences
        UIPreferencesManager.setPreference('showTooltips', modal.querySelector("#ui-tooltips").checked);
        UIPreferencesManager.setPreference('compactMode', modal.querySelector("#ui-compact").checked);
        UIPreferencesManager.setPreference('animationsEnabled', modal.querySelector("#ui-animations").checked);
        UIPreferencesManager.setPreference('sidebarWidth', parseInt(modal.querySelector("#ui-sidebar").value));
        UIPreferencesManager.setPreference('rightPanelWidth', parseInt(modal.querySelector("#ui-rightpanel").value));

        saveSettings(); updateDynamicStyles();

        if ((densityChanged || marginChanged) && state.grid) {
            state.grid.destroy(false); initGrid();
            const currentTab = state.appData.tabs[state.appData.activeIdx];
            state.grid.removeAll();
            if (currentTab.layout) currentTab.layout.forEach(item => addGridItem(item.config, { x: item.x, y: item.y, w: item.w, h: item.h }));
        }
        modal.remove();
    };
}

function applyGroupLogic(tab) {
    const groups = tab.activeGroups || [];
    applyGridState(groups);
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
        setTimeout(() => { applyGroupLogic(currentTab); refreshContainerList(); }, 50);
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
    const overlay = document.getElementById("a11-overlay");

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

    document.getElementById("a11-close").onclick = () => { document.getElementById("a11-overlay").classList.remove("visible"); updateGraphExtra(true); };

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
