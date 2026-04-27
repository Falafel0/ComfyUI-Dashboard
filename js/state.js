import {
    migrateOldPresets,
    sortPresets,
    PRESET_SORT_OPTIONS,
    DEFAULT_SORT_ORDER,
    getUniqueCategories,
    validateContainerPreset,
    validatePresetValues
} from "./presetManager.js";
import { presetUndoManager } from "./widgets/PresetUndoManager.js";

export const defaultSettings = {
    gridCellHeight: 50,
    gridMargin: 5,
    themeColor: "#ea580c",
    btnOpacity: 1.0,
    galleryLimit: 50,
    confirmActions: true,
    
    // Enhanced Appearance Settings - Background & Surface Colors
    bgColor: "",
    bgElevated: "",
    panelBg: "",
    menuBg: "",
    inputBg: "",
    textColor: "",
    textMuted: "",
    
    // Border & Outline Settings
    borderColor: "",
    borderLightColor: "",
    borderRadius: "6",
    
    // Shadow & Depth Settings
    shadowIntensity: "1.0",
    enableShadows: true,
    enableGlassmorphism: false,
    glassBlurAmount: "12",
    
    // Typography Settings
    fontFamily: "",
    fontSizeBase: "12",
    fontSizeScale: "1.1",
    fontWeightBase: "400",
    
    // Spacing & Layout Settings
    spacingScale: "1.0",
    containerPadding: "8",
    widgetGap: "8",
    
    // Animation Settings
    animationSpeed: "200",
    enableAnimations: true,
    enableTransitions: true,
    transitionEasing: "cubic-bezier(0.4, 0, 0.2, 1)",
    
    // Accent & State Colors
    accentHover: "",
    accentActive: "",
    successColor: "#10b981",
    warningColor: "#f59e0b",
    errorColor: "#ff4444",
    infoColor: "#3b82f6",
    
    // Interactive Element Settings
    buttonOpacity: "1.0",
    buttonRadius: "6",
    inputRadius: "4",
    hoverEffect: "lift", // 'lift', 'glow', 'scale', 'none'
    hoverScale: "1.02",
    
    // ComfyUI Integration Settings
    comfyThemeSync: true,
    comfyMenuBg: "",
    comfyInputBg: "",
    comfyFgColor: "",
    comfyBorderColor: "",
    
    // Advanced Visual Settings
    saturationModifier: "0",
    brightnessModifier: "0",
    contrastModifier: "0",
    blurBackground: false,
    blurAmount: "0",
    
    // Legacy/Compatibility
    shortcutToggle: "Shift+A",
    shortcutClose: "Escape",
    shortcutGenerate: "Ctrl+Enter",
    tabPresets: [],
    valuePresets: { containers: [] },
    presetSortOrder: DEFAULT_SORT_ORDER,
    layoutTemplates: [],
    uiPreferences: {
        showTooltips: true,
        compactMode: false,
        animationsEnabled: true,
        sidebarWidth: 280,
        rightPanelWidth: 320
    },

    btnPos: null,
    panelWidth: null,
    headerHeight: null,
    previewHeight: null
};

export const state = {
    grid: null,
    isEditMode: false,
    activeContainerEl: null,
    settings: { ...defaultSettings },
    appData: {
        globalWidgets: [],
        rightPanelConfig: { title: "Control Panel", widgets: [], layoutMode: "list", containerView: "clean", collapsed: false },
        tabs: [{ name: "Main", generateBtnText: "Generate", presetCategory: "", gallerySources: [], layout: [], activeGroups: [] }],
        activeIdx: 0
    },
    widgetSyncRegistry: new Map()
};

export async function loadSettings() {
    try {
        const resp = await fetch("/a11_studio/settings");
        if (resp.ok) {
            const data = await resp.json();

            if (Object.keys(data).length > 0) {
                state.settings = { ...state.settings, ...data };
            } else {
                const local = localStorage.getItem("a11_ui_settings");
                if (local) {
                    state.settings = { ...state.settings, ...JSON.parse(local) };

                    const btnPos = localStorage.getItem("a11_btn_pos");
                    if (btnPos) state.settings.btnPos = JSON.parse(btnPos);
                    const pw = localStorage.getItem("a11_panel_width");
                    if (pw) state.settings.panelWidth = parseInt(pw);
                    const hh = localStorage.getItem("a11_header_height");
                    if (hh) state.settings.headerHeight = parseInt(hh);
                    const ph = localStorage.getItem("a11_preview_height");
                    if (ph) state.settings.previewHeight = parseInt(ph);

                    console.log("A11WebUI: Migrated old settings to server.");
                    saveSettings();
                }
            }
        }
    } catch (e) {
        console.error("A11WebUI: Error loading settings from server", e);
    }
}

export async function saveSettings() {
    try {
        const dataToSave = { ...state.settings };
        delete dataToSave.valuePresets;

        await fetch("/a11_studio/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataToSave)
        });
    } catch (e) {
        console.error("A11WebUI: Error saving settings to server", e);
    }
}

export function resetSettings() {
    state.settings = { ...defaultSettings };
    saveSettings();
}

export async function loadValuePresets() {
    try {
        const resp = await fetch("/a11_studio/presets");
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.containers) {
                const migrated = migrateOldPresets(data.containers);
                const sortOrder = state.settings.presetSortOrder || DEFAULT_SORT_ORDER;
                const sorted = sortPresets(migrated.containers, sortOrder);
                state.settings.valuePresets = { containers: sorted };
            }
        }
    } catch (e) {
        console.error("A11WebUI: Failed to load presets from server", e);
    }
}

export async function saveValuePresets() {
    try {
        await fetch("/a11_studio/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.settings.valuePresets)
        });
    } catch (e) {
        console.error("A11WebUI: Failed to save presets to server", e);
    }
}

export function registerWidgetDOM(nodeId, widgetIndex, domElement) {
    const key = `${nodeId}_${widgetIndex}`;
    if (!state.widgetSyncRegistry.has(key)) state.widgetSyncRegistry.set(key, new Set());
    state.widgetSyncRegistry.get(key).add(domElement);
}

export function broadcastWidgetUpdate(nodeId, widgetIndex, newValue, sourceElement = null) {
    const key = `${nodeId}_${widgetIndex}`;
    if (!state.widgetSyncRegistry.has(key)) return;

    const elements = state.widgetSyncRegistry.get(key);
    elements.forEach(el => {
        if (!document.body.contains(el)) { elements.delete(el); return; }
        if (el === sourceElement) return;

        if (typeof el.updateValue === 'function') {
            el.updateValue(newValue);
        } else if (el.type === "checkbox") {
            el.checked = !!newValue;
        } else {
            el.value = newValue;
        }
    });
}

/**
 * Применить пресет значений с инкрементальным обновлением и undo
 * P0: Только изменившиеся значения, undo система, валидация
 */
export async function applyValuePreset(savedValues, presetName = "Unknown") {
    const { app } = await import("../../scripts/app.js");
    
    // P0-3: Валидация значений перед применением
    const validation = validatePresetValues(savedValues, app);
    if (!validation.valid && validation.errors.length > 0) {
        console.error('[Preset] Validation failed:', validation.errors);
        alert(`Preset validation failed:\n${validation.errors.join('\n')}`);
        return { applied: 0, skipped: validation.errors.length };
    }

    if (validation.warnings.length > 0) {
        console.warn('[Preset] Validation warnings:', validation.warnings);
    }

    let appliedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;

    // Собираем все nodeId из UI
    const uiNodeIds = new Set();
    if (state.appData.globalWidgets) state.appData.globalWidgets.forEach(w => uiNodeIds.add(w.nodeId));
    if (state.appData.rightPanelConfig?.widgets) state.appData.rightPanelConfig.widgets.forEach(w => uiNodeIds.add(w.nodeId));
    state.appData.tabs.forEach(t => t.layout.forEach(l => l.config?.widgets?.forEach(w => uiNodeIds.add(w.nodeId))));

    // P0-1: Сохраняем состояние ДО применения для undo
    const beforeValues = await presetUndoManager.saveBeforeState(savedValues);

    // Применяем значения
    const afterValues = [];

    savedValues.forEach(sv => {
        // Ищем ноду по типу (без привязки к ID или title)
        let targetNode = null;

        // Сначала пробуем по nodeId (для обратной совместимости со старыми пресетами)
        if (sv.nodeId) {
            targetNode = app.graph.getNodeById(sv.nodeId);
        }

        // Если не нашли - ищем по типу ноды среди UI нод
        if (!targetNode && sv.nodeType) {
            const nodes = app.graph._nodes.filter(n =>
                uiNodeIds.has(n.id) &&
                n.type === sv.nodeType
            );
            // Берём первую подходящую ноду
            targetNode = nodes.length > 0 ? nodes[0] : null;
        }

        if (!targetNode?.widgets) {
            skippedCount++;
            console.warn(`[Preset] Node not found: type=${sv.nodeType}, widget=${sv.widgetName}`);
            return;
        }

        const widget = targetNode.widgets.find(w => w.name === sv.widgetName);
        if (!widget) {
            skippedCount++;
            console.warn(`[Preset] Widget not found: ${sv.widgetName} in node type ${sv.nodeType}`);
            return;
        }

        // P0-1: Инкрементальное обновление — только если значение изменилось
        if (widget.value === sv.value) {
            skippedCount++;
            return;
        }

        // P1-9: Проверка конфликтов (если виджет уже был изменён другим пресетом)
        if (widget._lastModifiedByPreset && widget._lastModifiedByPreset !== presetName) {
            conflictCount++;
            console.warn(`[Preset] Conflict: ${sv.widgetName} was modified by "${widget._lastModifiedByPreset}"`);
        }

        // Применяем значение
        const oldValue = widget.value;
        widget.value = sv.value;
        
        // Отмечаем что виджет изменён пресетом
        widget._lastModifiedByPreset = presetName;
        widget._lastModifiedAt = Date.now();

        if (widget.callback) {
            try {
                widget.callback(sv.value);
            } catch (e) {
                console.error(`[Preset] Callback error for ${sv.widgetName}:`, e);
            }
        }

        // Транслируем обновление
        const wIndex = targetNode.widgets.indexOf(widget);
        broadcastWidgetUpdate(targetNode.id, wIndex, sv.value);

        // Сохраняем для undo
        afterValues.push({
            nodeId: targetNode.id,
            nodeTitle: targetNode.title,
            nodeType: targetNode.type,
            widgetName: sv.widgetName,
            oldValue: oldValue,
            newValue: sv.value
        });

        appliedCount++;
    });

    // P0-2: Сохраняем в undo стек
    if (appliedCount > 0) {
        presetUndoManager.pushUndoState(beforeValues, afterValues, presetName);
    }

    // Обновляем canvas
    if (app.canvas && app.canvas.parentNode) {
        app.graph.setDirtyCanvas(true, true);
    }

    const result = { applied: appliedCount, skipped: skippedCount, conflicts: conflictCount };
    console.log(`[Preset] "${presetName}": ✅ ${appliedCount} applied, ⏭️ ${skippedCount} skipped, ⚠️ ${conflictCount} conflicts`);

    return result;
}

/**
 * Отменить последнее применение пресета
 */
export async function undoLastPreset() {
    const success = await presetUndoManager.undo();
    
    if (success) {
        const { app } = await import("../../scripts/app.js");
        if (app.canvas && app.canvas.parentNode) {
            app.graph.setDirtyCanvas(true, true);
        }
        console.log('[Preset] Undo successful');
    } else {
        console.warn('[Preset] Nothing to undo');
    }
    
    return success;
}

/**
 * Получить историю применённых пресетов
 */
export function getPresetHistory() {
    return presetUndoManager.getUndoHistory();
}

/**
 * Проверить можно ли отменить пресет
 */
export function canUndoPreset() {
    return presetUndoManager.canUndo();
}