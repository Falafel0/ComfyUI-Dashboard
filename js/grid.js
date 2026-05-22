import { app } from "../../scripts/app.js";
import { state, applyValuePreset, saveValuePresets, broadcastWidgetUpdate } from "./state.js";
import { createWidgetDOM } from "./widgets.js";
import { openPresetManagerModal } from "./widgets/PresetManagerUI.js";
import { presetUndoManager } from "./widgets/PresetUndoManager.js";
import {
    sortPresets,
    getUniqueCategories,
    filterPresetsBySearch,
    PRESET_CATEGORIES,
    DEFAULT_SORT_ORDER,
    createContainerPreset,
    validateContainerPreset,
    filterValuePresets,
    filterStylePresets,
    parseCategory,
    categoryMatches,
    groupPresetsByCategoryTree,
    categoryDisplayName,
    getAllCategoryPaths
} from "./presetManager.js";

/**
 * Применяет пресет к виджетам конкретного контейнера
 * @param {Object} config - config контейнера (содержит widgets массив с wRef)
 * @param {Array} presetValues - значения из пресета [{nodeType, widgetName, value}]
 * @param {string} presetName - имя пресета для логирования
 */
export async function applyPresetToContainer(config, presetValues, presetName = "Unknown") {
    if (!config?.widgets || !presetValues?.length) return;

    const { app } = await import("../../scripts/app.js");
    let applied = 0;
    let skipped = 0;
    let conflictCount = 0;

    // Сохраняем состояние ДО для undo
    const beforeValues = [];
    const afterValues = [];

    presetValues.forEach(sv => {
        config.widgets.forEach(wRef => {
            const node = app.graph.getNodeById(wRef.nodeId);
            if (!node?.widgets) return;

            const widget = node.widgets.find(w => w.name === sv.widgetName);
            if (!widget) return;

            // Проверяем что тип ноды совпадает
            if (node.type !== sv.nodeType) return;

            // Инкрементально — только если изменилось
            if (widget.value === sv.value) {
                skipped++;
                return;
            }

            // Конфликт-трекинг
            if (widget._lastModifiedByPreset && widget._lastModifiedByPreset !== presetName) {
                conflictCount++;
                console.warn(`[Preset Container] Conflict: ${sv.widgetName} was modified by "${widget._lastModifiedByPreset}"`);
            }

            // Сохраняем до
            beforeValues.push({
                nodeId: node.id,
                nodeTitle: node.title,
                nodeType: node.type,
                widgetName: sv.widgetName,
                value: widget.value
            });

            // Применяем
            const oldValue = widget.value;
            widget.value = sv.value;
            widget._lastModifiedByPreset = presetName;
            widget._lastModifiedAt = Date.now();

            if (widget.callback) {
                try { widget.callback(sv.value); } catch (e) {
                    console.error(`[Preset Container] Callback error:`, e);
                }
            }

            const wIndex = node.widgets.indexOf(widget);
            broadcastWidgetUpdate(node.id, wIndex, sv.value);

            afterValues.push({
                nodeId: node.id,
                nodeTitle: node.title,
                nodeType: node.type,
                widgetName: sv.widgetName,
                oldValue: oldValue,
                newValue: sv.value
            });

            applied++;
        });
    });

    // Сохраняем в undo стек
    if (applied > 0) {
        presetUndoManager.pushUndoState(beforeValues, afterValues, presetName);
    }

    console.log(`[Preset Container] "${presetName}": ✅ ${applied} applied, ⏭️ ${skipped} skipped${conflictCount ? ', ⚠️ ' + conflictCount + ' conflicts' : ''}`);

    if (app.canvas && app.canvas.parentNode) {
        app.graph.setDirtyCanvas(true, true);
    }
}

/**
 * Применяет одно значение пресета к конкретному виджету
 */
export async function applySingleValueToWidget(wRef, presetValue, presetName = "Unknown") {
    const { app } = await import("../../scripts/app.js");
    const node = app.graph.getNodeById(wRef.nodeId);
    if (!node?.widgets) return false;

    const widget = node.widgets[wRef.widgetIndex];
    if (!widget || widget.name !== presetValue.widgetName) return false;
    if (node.type !== presetValue.nodeType) return false;
    if (widget.value === presetValue.value) return false;

    const beforeValues = [{
        nodeId: node.id,
        nodeTitle: node.title,
        nodeType: node.type,
        widgetName: presetValue.widgetName,
        value: widget.value
    }];

    const oldValue = widget.value;
    widget.value = presetValue.value;
    widget._lastModifiedByPreset = presetName;
    widget._lastModifiedAt = Date.now();

    if (widget.callback) {
        try { widget.callback(presetValue.value); } catch (e) {
            console.error(`[Preset Widget] Callback error:`, e);
        }
    }

    broadcastWidgetUpdate(node.id, wRef.widgetIndex, presetValue.value);

    const afterValues = [{
        nodeId: node.id,
        nodeTitle: node.title,
        nodeType: node.type,
        widgetName: presetValue.widgetName,
        oldValue: oldValue,
        newValue: presetValue.value
    }];

    presetUndoManager.pushUndoState(beforeValues, afterValues, presetName);

    if (app.canvas && app.canvas.parentNode) {
        app.graph.setDirtyCanvas(true, true);
    }

    console.log(`[Preset Widget] "${presetName}" → ${presetValue.widgetName}=${presetValue.value}`);
    return true;
}

/**
 * Добавляет кнопку пресета на конкретный виджет (edit mode)
 */
function addWidgetPresetButton(wrapper, wRef, config, domElement) {
    // Пропускаем если отключено глобально
    if (state.settings.showWidgetPresets === false) return;
    // Пропускаем если нет presetCategory или явно выключено
    if (!wRef.presetCategory || wRef.showPresetBtn === false) return;

    // Если кнопка уже есть — не пересоздаём
    const existing = wrapper.querySelector('.gw-widget-preset-btn');
    if (existing) return;

    const node = app.graph.getNodeById(wRef.nodeId);
    if (!node?.widgets) return;
    const widget = node.widgets[wRef.widgetIndex];
    if (!widget) return;

    // Есть ли пресеты с подходящими значениями для этого виджета?
    const allPresets = filterValuePresets(state.settings.valuePresets?.containers || []);
    let matchingPresets = allPresets.filter(p =>
        p.values?.some(v => v.nodeType === node.type && v.widgetName === widget.name)
    );
    // Фильтруем строго по presetCategory (только если задана)
    if (wRef.presetCategory) {
        if (wRef.presetIncludeSubcategories !== false) {
            matchingPresets = matchingPresets.filter(p => categoryMatches(p.category, wRef.presetCategory));
        } else {
            matchingPresets = matchingPresets.filter(p => p.category === wRef.presetCategory);
        }
    } else {
        // Без presetCategory — кнопку не показываем
        return;
    }
    if (matchingPresets.length === 0) return;

    const btn = document.createElement('span');
    btn.className = 'gw-widget-preset-btn';
    btn.title = 'Apply preset to this widget';
    btn.innerHTML = '🔖';
    btn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove any existing popup
        const existingPopup = document.querySelector('.gw-widget-preset-popup');
        if (existingPopup) { existingPopup.remove(); return; }

        // Build popup dropdown
        const popup = document.createElement('div');
        popup.className = 'gw-widget-preset-popup';
        popup.style.cssText =
            'position:absolute;z-index:9999;' +
            'background:var(--a11-panel);border:1px solid var(--a11-border);' +
            'border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,0.5);' +
            'min-width:220px;max-height:300px;overflow-y:auto;';

        const sel = document.createElement('select');
        sel.style.cssText =
            'width:100%;padding:6px 8px;background:var(--a11-input);' +
            'color:var(--a11-text);border:none;font-size:11px;cursor:pointer;';
        sel.size = Math.min(matchingPresets.length + 1, 14);
        sel.innerHTML = '<option value="">🔖 Select preset...</option>';

        matchingPresets.forEach(function(p) {
            var catParts = (p.category || 'General').split('/');
            var depth = catParts.length - 1;
            var indent = '\xA0\xA0'.repeat(Math.max(0, depth));
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = indent + (depth > 0 ? '└ ' : '') + p.name;
            sel.appendChild(opt);
        });

        sel.onchange = async function(ev) {
            var pId = ev.target.value;
            if (!pId) return;
            var preset = matchingPresets.find(function(p) { return p.id === pId; });
            if (!preset) return;
            var sv = preset.values.find(function(v) {
                return v.nodeType === node.type && v.widgetName === widget.name;
            });
            if (sv) {
                try {
                    await applyValuePreset([sv], preset.name);
                } catch (ex) {
                    console.error('[WidgetPreset] Apply failed:', ex);
                }
            }
            popup.remove();
        };

        sel.onmousedown = function(ev) { ev.stopPropagation(); };

        popup.appendChild(sel);
        document.body.appendChild(popup);

        // Position popup near the button (fixed, relative to viewport)
        var btnRect = btn.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = (btnRect.right + 4) + 'px';
        popup.style.top = btnRect.top + 'px';
        // Keep popup within viewport
        var popupRect = popup.getBoundingClientRect();
        if (popupRect.bottom > window.innerHeight) {
            popup.style.top = (window.innerHeight - popupRect.height - 8) + 'px';
        }
        if (popupRect.right > window.innerWidth) {
            popup.style.left = (btnRect.left - popupRect.width - 4) + 'px';
        }

        // Close on outside click
        var closeHandler = function(ev) {
            if (!popup.contains(ev.target) && ev.target !== btn) {
                popup.remove();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(function() { document.addEventListener('mousedown', closeHandler); }, 0);
    };
    wrapper.appendChild(btn);
}

/**
 * Показывает дропдаун пресетов для конкретного виджета (с деревом подкатегорий)
 */
function addTextSuggestionsButton(wrapper, wRef) {
    const existing = wrapper.querySelector('.gw-text-suggestions-btn');
    if (existing) return;

    const suggestions = String(wRef.suggestions || '').split(',').map(s => s.trim()).filter(Boolean);
    if (suggestions.length === 0) return;

    const node = app.graph.getNodeById(wRef.nodeId);
    if (!node?.widgets) return;
    const widget = node.widgets[wRef.widgetIndex];
    if (!widget) return;

    const btn = document.createElement('span');
    btn.className = 'gw-text-suggestions-btn';
    btn.title = 'Quick fill';
    btn.innerHTML = '🔽';
    btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSuggestionsDropdown(btn, suggestions, widget, wRef);
    };
    wrapper.appendChild(btn);
}

function showSuggestionsDropdown(anchorEl, suggestions, widget, wRef) {
    document.querySelectorAll('.gw-widget-preset-dropdown').forEach(d => d.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'gw-widget-preset-dropdown';

    suggestions.forEach(val => {
        const item = document.createElement('div');
        item.className = 'gw-wpd-item';
        item.innerHTML = `<span class="gw-wpd-name">${val}</span>`;
        item.onclick = (e) => {
            e.stopPropagation();
            dropdown.remove();
            widget.value = val;
            if (widget.callback) {
                try { widget.callback(val); } catch (e) { /* ignore */ }
            }
            broadcastWidgetUpdate(wRef.nodeId, wRef.widgetIndex, val);
        };
        dropdown.appendChild(item);
    });

    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
    dropdown.style.display = 'block';
    document.body.appendChild(dropdown);

    const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && e.target !== anchorEl) {
            dropdown.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}


const CONTAINER_VIEWS = { 
    "card": "Card", 
    "flat": "Flat", 
    "outlined": "Tech", 
    "glass": "Glass", 
    "clean": "Clean",
    "minimal": "Minimal",
    "bordered": "Bordered",
    "soft": "Soft"
};
const LAYOUT_MODES = { 
    "list": "List (1 Col)", 
    "auto": "Grid (Auto)", 
    "col-2": "Grid (2 Cols)", 
    "col-3": "Grid (3 Cols)", 
    "col-4": "Grid (4 Cols)", 
    "col-5": "Grid (5 Cols)", 
    "col-6": "Grid (6 Cols)", 
    "flow": "Flow (Wrap)",
    "masonry": "Masonry",
    "flex-row": "Flex Row",
    "flex-col": "Flex Column"
};
const DENSITY_MODES = { "zero": "Zero (0px)", "compact": "Compact", "normal": "Normal", "loose": "Loose", "wide": "Wide" };
const CONTAINER_TYPES = {
    "default": "Default",
    "tabs": "📑 Tabs",
    "accordion": "🔽 Accordion",
    "split": "⬌ Split",
    "scroll": "📜 Scroll",
    "fab": "💠 FAB",
    "steps": "🔄 Steps",
    "drawer": "📥 Drawer",
    "toolbar": "⚡ Toolbar",
    "spotlight": "🔦 Spotlight",
    "freeform": "🎯 Freeform"
};
const TYPE_BADGES = {
    "tabs": "📑 Tabs", "accordion": "🔽 Accordion", "split": "⬌ Split",
    "scroll": "📜 Scroll", "fab": "💠 FAB", "steps": "🔄 Steps",
    "drawer": "📥 Drawer", "toolbar": "⚡ Toolbar", "spotlight": "🔦 Spotlight",
    "freeform": "🎯 Freeform"
};

// Multi-selection state (edit mode)
let multiSelectedIds = new Set();

export function openSingleWidgetSettings(wRef, onSave) {
    const modal = document.createElement("div"); modal.className = "a11-modal open";
    const node = app.graph.getNodeById(wRef.nodeId);

    let originalName = "Unknown";
    let wType = "unknown";
    let isCustomDom = false;

    if (wRef.widgetIndex === "__preview__") {
        originalName = "Output Preview"; wType = "image";
    } else if (node && node.widgets && node.widgets[wRef.widgetIndex]) {
        const actualWidget = node.widgets[wRef.widgetIndex];
        originalName = actualWidget.name;
        wType = actualWidget.type || typeof actualWidget.value;
        if (Array.isArray(actualWidget.options?.values)) wType = "combo";
        if (actualWidget.name === "image" && actualWidget.type !== "text") wType = "image";

        if (actualWidget.element instanceof HTMLElement && wType !== "text" && wType !== "image" && wType !== "combo") {
            isCustomDom = true;
            // Не перезаписываем wType — иначе isText/isImage сломаются
        }
    }

    const isNum = wType === "number" || wType === "slider" || wType === "float" || wType === "int";
    const isText = wType === "customtext" || wType === "text" || wType === "string";
    const isImage = wType === "image";
    const isCombo = wType === "combo";
    const isBtnOrToggle = wType === "button" || wType === "toggle" || wType === "boolean";

    modal.innerHTML = `
        <div class="a11-modal-content" style="width:420px;">
            <div class="a11-modal-title">Widget Settings: <span style="color:var(--a11-accent)">${originalName}</span></div>
            <div class="a11-modal-body">

                <div class="a11-settings-block">
                    <div class="a11-settings-title">Display & Size</div>
                    <div class="a11-wo-grid">
                        <div class="wo-col"><label>Alias (Display Name)</label><input type="text" id="sw-alias" value="${wRef.alias || ''}"></div>
                        <div class="wo-col" style="justify-content: center; gap: 5px;">
                            <label><input type="checkbox" id="sw-hidelabel" ${wRef.hideLabel ? 'checked' : ''}> Hide Label</label>
                            <label><input type="checkbox" id="sw-readonly" ${wRef.readOnly ? 'checked' : ''}> Read Only</label>
                        </div>
                        <div class="wo-col"><label>Custom Width</label><input type="text" id="sw-width" value="${wRef.width || wRef.flex || ''}" placeholder="auto, 100%, 150px"></div>
                        <div class="wo-col"><label>Font Size (px)</label><input type="number" id="sw-fontsize" value="${wRef.fontSize || ''}"></div>
                        ${`<div class="wo-col"><label>Height (px, auto, %)</label><input type="text" id="sw-height" value="${wRef.customHeight || ''}" placeholder="auto, 100%, 250"></div>`}
                    </div>
                </div>

                <div class="a11-settings-block">
                    <div class="a11-settings-title">Colors & Typography</div>
                    <div class="a11-wo-grid">
                        <div class="wo-col"><label>Label Color (Hex)</label><input type="color" id="sw-labelcol" value="${wRef.labelColor || state.settings.textColor || '#ffffff'}"></div>
                        ${isBtnOrToggle || isImage ? `<div class="wo-col"><label>Accent Color</label><input type="color" id="sw-btncol" value="${wRef.buttonColor || state.settings.themeColor || '#ea580c'}"></div>` : '<div class="wo-col"></div>'}
                        ${(isText || isNum || isCombo) ? `
                        <div class="wo-col"><label>Text Align</label><select id="sw-align">
                            <option value="" ${!wRef.textAlign ? 'selected' : ''}>Left</option>
                            <option value="center" ${wRef.textAlign === 'center' ? 'selected' : ''}>Center</option>
                            <option value="right" ${wRef.textAlign === 'right' ? 'selected' : ''}>Right</option>
                        </select></div>` : ''}
                    </div>
                </div>

                ${isCustomDom ? `
                <div class="a11-settings-block">
                    <div class="a11-settings-title">Plugin View & Scale</div>
                    <div class="a11-wo-grid">
                        <div class="wo-col"><label>Scale (%)</label><input type="number" id="sw-scale" value="${wRef.customScale !== undefined ? wRef.customScale : 100}"></div>
                        <div class="wo-col"><label>Overflow Mode</label><select id="sw-overflow">
                            <option value="hidden" ${wRef.overflow === 'hidden' || !wRef.overflow ? 'selected' : ''}>Hidden (Crop)</option>
                            <option value="auto" ${wRef.overflow === 'auto' ? 'selected' : ''}>Scroll (Auto)</option>
                            <option value="visible" ${wRef.overflow === 'visible' ? 'selected' : ''}>Visible (Spill)</option>
                        </select></div>
                    </div>
                </div>
                ` : ''}

                ${isNum || isCombo || isImage ? `
                <div class="a11-settings-block">
                    <div class="a11-settings-title">Behavior Overrides</div>
                    <div class="a11-wo-grid">
                        ${isNum ? `
                        <div class="wo-col"><label>Min/Max/Step</label>
                            <div style="display:flex; gap:2px;">
                                <input type="number" id="sw-min" value="${wRef.min ?? ''}" placeholder="Min">
                                <input type="number" id="sw-max" value="${wRef.max ?? ''}" placeholder="Max">
                                <input type="number" id="sw-step" value="${wRef.step ?? ''}" placeholder="Step">
                            </div>
                        </div>
                        <div class="wo-col" style="justify-content: center; gap: 5px;">
                            <label><input type="checkbox" id="sw-hideslider" ${wRef.hideSlider ? 'checked' : ''}> No Slider</label>
                            <label><input type="checkbox" id="sw-hidenumber" ${wRef.hideNumber ? 'checked' : ''}> No Number</label>
                        </div>
                        ` : ''}
                        ${isCombo ? `
                        <div class="wo-col" style="justify-content: center;">
                            <label><input type="checkbox" id="sw-hidefilter" ${wRef.hideFilter ? 'checked' : ''}> Disable Search Filter</label>
                        </div>
                        ` : ''}
                        ${isImage ? `
                        <div class="wo-col"><label>Image Fit</label><select id="sw-objfit">
                            <option value="contain" ${wRef.objectFit === 'contain' || !wRef.objectFit ? 'selected' : ''}>Contain (Fit)</option>
                            <option value="cover" ${wRef.objectFit === 'cover' ? 'selected' : ''}>Cover (Crop)</option>
                            <option value="fill" ${wRef.objectFit === 'fill' ? 'selected' : ''}>Fill (Stretch)</option>
                        </select></div>
                        ` : ''}
                        ${isImage ? `
                        <div class="wo-col" style="justify-content: center; gap: 5px;">
                            <label><input type="checkbox" id="sw-preview-auto" ${wRef.previewAuto !== false ? 'checked' : ''}> Auto-refresh Preview</label>
                        </div>
                        ` : ''}
                    </div>
                </div>` : ''}
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn" id="sw-cancel">Cancel</button>
                <button class="a11-btn active" id="sw-save">Save & Apply</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelector("#sw-cancel").onclick = () => modal.remove();

    modal.querySelector("#sw-save").onclick = () => {
        wRef.alias = modal.querySelector("#sw-alias").value;
        wRef.hideLabel = modal.querySelector("#sw-hidelabel").checked;
        wRef.readOnly = modal.querySelector("#sw-readonly").checked;
        wRef.width = modal.querySelector("#sw-width").value.trim();

        const fs = modal.querySelector("#sw-fontsize")?.value;
        wRef.fontSize = fs ? parseInt(fs) : "";

        wRef.labelColor = modal.querySelector("#sw-labelcol")?.value || "";
        wRef.buttonColor = modal.querySelector("#sw-btncol")?.value || "";
        wRef.textAlign = modal.querySelector("#sw-align")?.value || "";
        wRef.hideSlider = modal.querySelector("#sw-hideslider")?.checked || false;
        wRef.hideNumber = modal.querySelector("#sw-hidenumber")?.checked || false;
        wRef.hideFilter = modal.querySelector("#sw-hidefilter")?.checked || false;
        wRef.objectFit = modal.querySelector("#sw-objfit")?.value || "contain";
        wRef.previewAuto = modal.querySelector("#sw-preview-auto")?.checked !== false;

        const heightInp = modal.querySelector("#sw-height");
        if (heightInp) wRef.customHeight = heightInp.value.trim();

        const scaleInp = modal.querySelector("#sw-scale");
        if (scaleInp) wRef.customScale = scaleInp.value ? parseFloat(scaleInp.value) : 100;

        const ovfInp = modal.querySelector("#sw-overflow");
        if (ovfInp) wRef.overflow = ovfInp.value;

        const minInp = modal.querySelector("#sw-min");
        if (minInp) wRef.min = minInp.value !== "" ? parseFloat(minInp.value) : "";
        const maxInp = modal.querySelector("#sw-max");
        if (maxInp) wRef.max = maxInp.value !== "" ? parseFloat(maxInp.value) : "";
        const stepInp = modal.querySelector("#sw-step");
        if (stepInp) wRef.step = stepInp.value !== "" ? parseFloat(stepInp.value) : "";

        modal.remove();
        if (onSave) onSave();
    };
}


/**
 * Сохраняет текущие значения виджетов контейнера как пресет
 * @param {Object} config - config контейнера
 * @param {Array} widgetIndices - индексы виджетов для сохранения
 * @param {string} name - имя пресета
 * @param {string} category - категория
 */
export async function saveContainerPreset(config, widgetIndices, name, category) {
    const { app } = await import("../../scripts/app.js");
    const currentValues = [];

    widgetIndices.forEach(idx => {
        const wRef = config.widgets[idx];
        if (!wRef) return;
        
        const node = app.graph.getNodeById(wRef.nodeId);
        if (!node?.widgets) return;

        let widget = node.widgets[wRef.widgetIndex];
        if (!widget || widget.name !== wRef.name) {
            widget = node.widgets.find(x => x.name === wRef.name) || node.widgets[wRef.widgetIndex];
        }
        if (!widget) return;

        currentValues.push({
            nodeTitle: widget.name,
            nodeType: node.type,
            widgetName: widget.name,
            value: widget.value
        });
    });

    if (currentValues.length === 0) {
        alert("No valid widgets to save.");
        return false;
    }

    try {
        const newPreset = createContainerPreset(name, category, currentValues);
        state.settings.valuePresets.containers.push(newPreset);
        await saveValuePresets();
        return true;
    } catch (e) {
        alert(`Error saving preset: ${e.message}`);
        return false;
    }
}

export function renderGlobalPanel() {
    const panel = document.getElementById("a11-global-panel");
    if (!panel) return;
    panel.innerHTML = "";

    if (!state.appData.globalWidgets) state.appData.globalWidgets = [];
    const widgets = state.appData.globalWidgets;

    if (widgets.length === 0) { panel.style.display = "none"; return; }
    panel.style.display = "flex";

    widgets.forEach((wRef, idx) => {
        const node = app.graph.getNodeById(wRef.nodeId);
        if (!node) return;
        const wrapper = document.createElement("div");
        wrapper.className = "gw-global-item";

        const setWidth = wRef.width || wRef.flex;
        if (setWidth) {
            const wStr = String(setWidth).trim().toLowerCase();
            if (wStr === "auto" || wStr === "100%" || wStr === "flex") {
                wrapper.style.width = "auto";
                wrapper.style.flex = "1 1 auto";
                wrapper.style.maxWidth = "none";
            } else {
                const widthVal = isNaN(setWidth) ? setWidth : setWidth + "px";
                wrapper.style.width = widthVal;
                wrapper.style.flex = `0 0 ${widthVal}`;
                wrapper.style.maxWidth = "none";
            }
        }

        const wHeight = wRef.customHeight;
        if (wHeight) {
            const hStr = String(wHeight).trim().toLowerCase();
            if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
                wrapper.classList.add("gw-widget-wrapper--grows");
            } else {
                wrapper.classList.remove("gw-widget-wrapper--grows");
                const hVal = isNaN(wHeight) ? wHeight : wHeight + "px";
                wrapper.style.height = hVal;
                wrapper.style.flexShrink = "0";
            }
        }

        const controls = document.createElement("div");
        controls.className = "gw-global-controls";
        controls.innerHTML = `
            <span class="gw-global-btn move-left">◀</span>
            <span class="gw-global-btn settings" title="Settings" style="color:var(--a11-accent)">⚙</span>
            <span class="gw-global-btn move-right">▶</span>
            <span class="gw-global-btn remove" style="color:var(--a11-error)">✖</span>
        `;

        controls.querySelector(".remove").onclick = (e) => { e.stopPropagation(); if (confirm("Remove?")) { widgets.splice(idx, 1); renderGlobalPanel(); updateGraphExtra(true); } };
        controls.querySelector(".move-left").onclick = (e) => { e.stopPropagation(); if (idx > 0) { [widgets[idx], widgets[idx - 1]] = [widgets[idx - 1], widgets[idx]]; renderGlobalPanel(); updateGraphExtra(true); } };
        controls.querySelector(".move-right").onclick = (e) => { e.stopPropagation(); if (idx < widgets.length - 1) { [widgets[idx], widgets[idx + 1]] = [widgets[idx + 1], widgets[idx]]; renderGlobalPanel(); updateGraphExtra(true); } };

        controls.querySelector(".settings").onclick = (e) => {
            e.stopPropagation();
            openSingleWidgetSettings(wRef, () => { renderGlobalPanel(); updateGraphExtra(true); });
        };

        wrapper.appendChild(controls);
        if (wRef.widgetIndex !== undefined) {
            const options = { ...wRef, onResize: (h) => { wRef.customHeight = h; updateGraphExtra(true); } };
            if (wRef.widgetIndex === "__preview__") {
                const fakeWidget = { name: "$$canvas-image-preview", value: "", type: "image" };
                wrapper.appendChild(createWidgetDOM(fakeWidget, wRef.nodeId, "__preview__", options));
            } else {
                wrapper.appendChild(createWidgetDOM(node.widgets[wRef.widgetIndex], wRef.nodeId, wRef.widgetIndex, options));
            }
        }
        panel.appendChild(wrapper);
    });
    updateSendToDropdown();
}

export function renderRightPanel() {
    const el = document.getElementById("a11-right-panel-container");
    if (!el) return;
    if (!state.appData.rightPanelConfig) {
        state.appData.rightPanelConfig = { title: "Control Panel", widgets: [], layoutMode: "list", containerView: "clean", collapsed: false };
    }

    const hasWidgets = state.appData.rightPanelConfig.widgets && state.appData.rightPanelConfig.widgets.length > 0;
    if (!state.isEditMode && !hasWidgets) {
        el.style.display = "none";
        return;
    }
    el.style.display = "";

    el.classList.add("is-static-container");
    if (state.appData.rightPanelConfig.collapsed) el.classList.add("collapsed");
    else el.classList.remove("collapsed");

    renderGridItemContent(el, state.appData.rightPanelConfig);
}

export function updateSendToDropdown() {
    const sel = document.getElementById("a11-send-target");
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Select Load Image Node...</option>';
    const targets = [];
    const checkNode = (nodeId, alias) => {
        const node = app.graph.getNodeById(nodeId);
        if (node && (node.type.toLowerCase().includes("loadimage") || node.type.toLowerCase().includes("load image"))) {
            targets.push({ id: node.id, title: node.title, alias: alias });
        }
    };
    if (state.grid?.engine) {
        state.grid.engine.nodes.forEach(n => {
            const el = n.el.querySelector(".grid-stack-item-content");
            if (el && el.dataset.config) {
                JSON.parse(el.dataset.config).widgets.forEach(w => checkNode(w.nodeId, w.alias));
            }
        });
    }
    if (state.appData.globalWidgets) state.appData.globalWidgets.forEach(w => checkNode(w.nodeId, w.alias));
    if (state.appData.rightPanelConfig?.widgets) state.appData.rightPanelConfig.widgets.forEach(w => checkNode(w.nodeId, w.alias));

    const uniqueTargets = [...new Map(targets.map(item => [item.id, item])).values()];
    uniqueTargets.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.innerText = t.alias ? `[${t.alias}] ${t.title}` : t.title;
        sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
}

let saveExtraTimeout;
export function updateGraphExtra(immediate = false) {
    const performSave = () => {
        if (state.grid?.engine && state.appData.activeIdx >= 0 && state.appData.activeIdx < state.appData.tabs.length) {
            const layout = [];
            state.grid.engine.nodes.forEach(n => {
                const el = n.el.querySelector(".grid-stack-item-content");
                if (el && el.dataset.config) {
                    const conf = JSON.parse(el.dataset.config);
                    if (el.classList.contains("collapsed")) conf.collapsed = true;
                    else conf.collapsed = false;
                    layout.push({ x: n.x, y: n.y, w: n.w, h: n.h, config: conf });
                }
            });
            state.appData.tabs[state.appData.activeIdx].layout = layout;
        }

        const rpEl = document.getElementById("a11-right-panel-container");
        if (rpEl && state.appData.rightPanelConfig) {
            state.appData.rightPanelConfig.collapsed = rpEl.classList.contains("collapsed");
        }

        if (!app.graph.extra) app.graph.extra = {};
        app.graph.extra.a1111_webui_tabs_data = JSON.parse(JSON.stringify(state.appData));
        updateSendToDropdown();
    };

    if (immediate) {
        clearTimeout(saveExtraTimeout);
        performSave();
    } else {
        clearTimeout(saveExtraTimeout);
        saveExtraTimeout = setTimeout(performSave, 300);
    }
}

export function refreshContainerList() {
    const sel = document.getElementById("sel-target-container");
    if (!sel || !state.grid) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Select Target...</option><option value="__global__">★ GLOBAL PANEL ★</option><option value="__right_panel__">★ RIGHT PANEL ★</option>';
    const nodes = state.grid.engine.nodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    nodes.forEach(n => {
        const el = n.el.querySelector(".grid-stack-item-content");
        if (el && el.dataset.config) {
            const conf = JSON.parse(el.dataset.config);
            const opt = document.createElement("option");
            opt.value = n.el.getAttribute("gs-id");
            opt.innerText = conf.title || "Untitled";
            sel.appendChild(opt);
        }
    });
    if (currentVal) sel.value = currentVal;
    updateSendToDropdown();
}

export function initGrid() {
    const gridEl = document.getElementById("a11-grid");
    if (!gridEl) return;
    const currentTab = state.appData.tabs[state.appData.activeIdx] || {};

    state.grid = GridStack.init({
        column: 12,
        margin: state.settings.gridBorderless ? 0 : (state.settings.gridMargin !== undefined ? state.settings.gridMargin : 5),
        cellHeight: state.settings.gridCellHeight || 50,
        minRow: 1, animate: true,
        float: currentTab.gridFloat === true,
        staticGrid: !state.isEditMode,
        draggable: { handle: '.gw-bar' },
        resizable: { autoHide: true, handles: 'se' }
    }, gridEl);

    state.grid.on('change', () => updateGraphExtra());
    state.grid.on('dragstop', () => updateGraphExtra());
    state.grid.on('resizestop', () => updateGraphExtra());

    // Разрешить скролл колёсиком в textarea — не даём GridStack перехватывать
    gridEl.addEventListener("wheel", function(e) {
        var target = e.target;
        if (target.tagName === "TEXTAREA" || target.closest("textarea")) {
            var ta = target.tagName === "TEXTAREA" ? target : target.closest("textarea");
            var canScrollDown = ta.scrollTop + ta.clientHeight < ta.scrollHeight - 1;
            var canScrollUp = ta.scrollTop > 0;
            if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
                e.stopPropagation();
            }
        }
    }, { passive: false });
}

function toggleCollapse(gridItem, domElement, config) {
    const isStatic = domElement.classList.contains("is-static-container");

    if (isStatic) {
        domElement.classList.toggle("collapsed");
        config.collapsed = domElement.classList.contains("collapsed");
        domElement.dataset.config = JSON.stringify(config);
        if (state.appData.rightPanelConfig) {
            state.appData.rightPanelConfig.collapsed = config.collapsed;
        }
        updateGraphExtra(true);
        return;
    }

    const n = state.grid.engine.nodes.find(n => n.el === gridItem);
    if (!n) return;
    const isCollapsed = domElement.classList.contains("collapsed");

    if (isCollapsed) {
        domElement.classList.remove("collapsed");
        config.collapsed = false;
        let targetH = parseInt(domElement.dataset.expandedH) || config.lastH || 4;
        if (targetH <= 1) targetH = 4;
        state.grid.update(gridItem, { h: targetH });
    } else {
        domElement.dataset.expandedH = n.h;
        config.lastH = n.h;
        domElement.classList.add("collapsed");
        config.collapsed = true;
        state.grid.update(gridItem, { h: 1 });
    }

    domElement.dataset.config = JSON.stringify(config);
    updateGraphExtra(true);
}

function togglePin(gridItem, btn, config, domElement) {
    const n = state.grid.engine.nodes.find(n => n.el === gridItem);
    if (n) {
        config.pinned = !config.pinned;
        const isCollapsed = domElement.classList.contains("collapsed");
        state.grid.update(gridItem, { noMove: config.pinned, noResize: config.pinned || isCollapsed });
        domElement.dataset.config = JSON.stringify(config);
        renderGridItemContent(domElement, config);
        applyGridState();
        updateGraphExtra(true);
    }
}

export function applyGridState() {
    if (!app.graph || !app.graph._nodes) return;

    let activeTabs = state.appData.tabs.map((t, idx) => ({ ...t, _originalIdx: idx }))
        .filter(t => t._originalIdx === state.appData.activeIdx || t.backgroundRun);

    activeTabs.sort((a, b) => (a.tabPriority || 0) - (b.tabPriority || 0));

    const finalNodeStates = new Map();
    const ignoredNodes = new Set();

    app.graph._nodes.forEach(node => {
        finalNodeStates.set(node.id, { mode: 0, reason: "default" });
    });

    for (const tab of activeTabs) {
        const isCurrentTab = (tab._originalIdx === state.appData.activeIdx);
        const tabGroups = tab.activeGroups || [];
        const isGlobalActive = (tabGroups.length === 0);
        const groupActionCode = tab.groupActionType === 'mute' ? 2 : 4;

        const tabNodeRules = new Map();

        const layouts = isCurrentTab && state.grid ?
            state.grid.engine.nodes.map(n => JSON.parse(n.el.querySelector(".grid-stack-item-content").dataset.config)) :
            (tab.layout || []).map(l => l.config);

        layouts.forEach(config => {
            const bypassMode = config.bypassMode || "default";
            const actionCode = config.actionType === 'mute' ? 2 : 4;
            const isManualBypassed = config.manualBypass === true;
            const linkedNodeIds = [...new Set((config.widgets || []).filter(w => w.nodeId).map(w => w.nodeId))];

            linkedNodeIds.forEach(id => {
                if (bypassMode === "graph") {
                    ignoredNodes.add(id);
                } else {
                    if (!tabNodeRules.has(id)) {
                        tabNodeRules.set(id, { bypassMode, actionCode, isManualBypassed, pinned: config.pinned === true });
                    }
                }
            });
        });

        const mutedByGroupIds = new Set();
        if (app.graph._groups) {
            app.graph._nodes.forEach(node => {
                const rule = tabNodeRules.get(node.id);
                if (ignoredNodes.has(node.id) || (rule && rule.bypassMode === "manual")) return;

                let shouldDisableByGroup = false;
                if (!isGlobalActive) {
                    for (const group of app.graph._groups) {
                        if (isNodeInGroup(node, group)) {
                            if (!tabGroups.includes(group.title)) { shouldDisableByGroup = true; break; }
                        }
                    }
                }
                if (shouldDisableByGroup) mutedByGroupIds.add(node.id);
            });
        }

        app.graph._nodes.forEach(node => {
            if (ignoredNodes.has(node.id)) return;
            const rule = tabNodeRules.get(node.id);
            const isMutedByGrp = mutedByGroupIds.has(node.id);

            const tabCares = rule !== undefined || isMutedByGrp || (app.graph._groups && app.graph._groups.some(g => isNodeInGroup(node, g)));

            if (tabCares) {
                let targetMode = 0;
                let reason = "";

                if (rule && rule.pinned) {
                    targetMode = 0;
                } else if (isMutedByGrp) {
                    targetMode = groupActionCode;
                    reason = `⛔ Group Disabled by[${tab.name}]`;
                } else if (rule && rule.isManualBypassed) {
                    targetMode = rule.actionCode;
                    reason = `⛔ Container Disabled in[${tab.name}]`;
                }

                finalNodeStates.set(node.id, { mode: targetMode, reason: reason });
            }
        });
    }

    app.graph._nodes.forEach(node => {
        if (ignoredNodes.has(node.id)) return;
        const finalState = finalNodeStates.get(node.id);
        if (finalState && node.mode !== finalState.mode) {
            node.mode = finalState.mode;
        }
    });

    if (!state.grid) return;
    state.grid.engine.nodes.forEach(n => {
        const el = n.el.querySelector(".grid-stack-item-content");
        if (!el) return;
        const config = JSON.parse(el.dataset.config);
        const isPinned = config.pinned === true;
        const bypassMode = config.bypassMode || "default";
        const bypassBox = el.querySelector(".gw-bypass-chk");
        const gridItemWrapper = n.el;
        const linkedNodeIds = [...new Set((config.widgets || []).filter(w => w.nodeId).map(w => w.nodeId))];

        if (bypassMode === "graph") {
            gridItemWrapper.classList.remove("hidden-by-group");
            el.classList.remove("is-bypassed");
            el.removeAttribute("data-reason");
            if (bypassBox) bypassBox.style.display = "none";
            return;
        }

        let isExternallyDisabled = false;
        let externalReason = "";

        if (bypassMode === "default") {
            for (const id of linkedNodeIds) {
                const s = finalNodeStates.get(id);
                if (s && s.mode !== 0 && (!config.manualBypass || s.reason.includes("Group") || s.reason.includes("["))) {
                    isExternallyDisabled = true;
                    externalReason = s.reason;
                    break;
                }
            }
        }

        if (isPinned) {
            gridItemWrapper.classList.remove("hidden-by-group");
            el.classList.remove("is-bypassed");
            if (bypassBox) bypassBox.style.display = "none";
        }
        else if (isExternallyDisabled) {
            gridItemWrapper.classList.add("hidden-by-group");
            el.classList.add("is-bypassed");
            if (bypassBox) {
                bypassBox.style.display = "inline-block";
                bypassBox.checked = false;
                // Keep checkbox enabled so user can re-enable the container
                bypassBox.disabled = false;
                bypassBox.title = externalReason + " - Click to re-enable";
                el.setAttribute("data-reason", externalReason);
            }
        }
        else {
            gridItemWrapper.classList.remove("hidden-by-group");
            el.removeAttribute("data-reason");
            if (bypassBox) {
                bypassBox.style.display = "inline-block";
                bypassBox.disabled = false;
                const isManualBypassed = config.manualBypass === true;
                bypassBox.checked = !isManualBypassed;
                if (isManualBypassed) el.classList.add("is-bypassed");
                else el.classList.remove("is-bypassed");
            }
        }
    });

    if (app.canvas && app.canvas.parentNode) { app.graph.setDirtyCanvas(true, true); }
}

function isNodeInGroup(node, group) {
    if (!node || !group) return false;
    const nX = node.pos[0], nY = node.pos[1], nW = node.size[0], nH = node.size[1];
    const centerX = nX + nW / 2, centerY = nY + nH / 2;
    const gX = group.pos[0], gY = group.pos[1], gW = group.size[0], gH = group.size[1];
    return (centerX >= gX && centerX <= gX + gW && centerY >= gY && centerY <= gY + gH) ||
        (nX >= gX && nX <= gX + gW && nY >= gY && nY <= gY + gH);
}

export function renderGridItemContent(domElement, config) {
    if (!config.widgets) config.widgets = [];

    let activeLayout = config.layoutMode || "list";
    if (activeLayout === 'col-1') activeLayout = 'list';
    if (activeLayout === 'dense') activeLayout = 'auto';

    if (!config.containerView) config.containerView = "card";
    if (!config.widgetDensity) config.widgetDensity = "normal";

    const isStatic = domElement.classList.contains("is-static-container");

    const containerType = config.containerType || "default";

    domElement.className = "grid-stack-item-content";
    if (isStatic) domElement.classList.add("is-static-container");
    if (config.collapsed) domElement.classList.add("collapsed");

    domElement.classList.add(`gw-view-${config.containerView}`);
    if (containerType !== "default") {
        domElement.classList.add(`gw-type-${containerType}`);
    }

    if (config.customBg && config.containerView !== 'glass' && config.containerView !== 'clean') domElement.style.backgroundColor = config.customBg;
    else domElement.style.backgroundColor = '';
    domElement.style.opacity = config.customOpacity || 1.0;
    if (config.borderCol) domElement.style.borderColor = config.borderCol;
    if (config.borderRadius !== undefined && config.borderRadius !== "") domElement.style.borderRadius = config.borderRadius + "px";

    if (config.minimalHeader) domElement.classList.add("minimal-header");
    if (config.color) domElement.setAttribute("data-color", config.color);
    else domElement.removeAttribute("data-color");

    // Type badge (edit mode)
    let typeBadge = domElement.querySelector(":scope > .gw-type-badge");
    if (containerType !== "default" && TYPE_BADGES[containerType]) {
        if (!typeBadge) {
            typeBadge = document.createElement("span");
            typeBadge.className = "gw-type-badge";
            domElement.appendChild(typeBadge);
        }
        typeBadge.innerText = TYPE_BADGES[containerType];
    } else if (typeBadge) {
        typeBadge.remove();
    }

    const saveAndRefresh = () => {
        if (!isStatic) domElement.dataset.config = JSON.stringify(config);
        updateGraphExtra(true);
    };

    let bar = domElement.querySelector(":scope > .gw-bar");
    if (!bar) {
        bar = document.createElement("div");
        bar.className = "gw-bar";
        domElement.appendChild(bar);
    }
    bar.innerHTML = "";

    let disabledOverlay = domElement.querySelector(":scope > .gw-disabled-overlay");
    if (!disabledOverlay && !isStatic) {
        disabledOverlay = document.createElement("div");
        disabledOverlay.className = "gw-disabled-overlay";
        disabledOverlay.innerText = "GROUP MUTED";
        domElement.appendChild(disabledOverlay);
    }

    let body = domElement.querySelector(":scope > .gw-body");
    if (!body) {
        body = document.createElement("div");
        domElement.appendChild(body);
        // Delegated context menu for widgets
        body.addEventListener("contextmenu", (e) => {
            const wrapper = e.target.closest(".gw-widget-wrapper");
            if (!wrapper) return;
            e.preventDefault();
            e.stopPropagation();
            const config = JSON.parse(domElement.dataset.config || "{}");
            const wKey = wrapper.dataset.widgetKey;
            if (!wKey) return;
            const [nodeId, widgetIndex] = wKey.split("_").map(Number);
            const wRef = config.widgets?.find(w => w.nodeId === nodeId && w.widgetIndex === widgetIndex);
            if (wRef) {
                import("./contextMenu.js").then(m => m.showWidgetContextMenu(e, wRef, config, domElement));
            }
        });
    }
    body.className = `gw-body layout-${activeLayout} gw-density-${config.widgetDensity}`;
    body.innerHTML = "";
    if (config.padding !== undefined && config.padding !== "") body.style.padding = config.padding + "px";
    else body.style.padding = "";

    if (config.hideHeader && !state.isEditMode) bar.style.display = "none";
    else bar.style.display = "";

    const collapseBtn = document.createElement("span");
    collapseBtn.className = "gw-collapse-btn";
    collapseBtn.innerHTML = "▼";
    collapseBtn.onclick = (e) => {
        e.stopPropagation();
        toggleCollapse(isStatic ? null : domElement.closest(".grid-stack-item"), domElement, config);
    };
    collapseBtn.onmousedown = (e) => e.stopPropagation();

    if (config.hideCollapse && !state.isEditMode) {
        collapseBtn.style.display = "none";
    } else {
        collapseBtn.style.display = "flex";
    }

    bar.appendChild(collapseBtn);

    const bypassMode = config.bypassMode || "default";

    if (!config.pinned && !isStatic && bypassMode !== "graph") {
        const bypassBox = document.createElement("input"); bypassBox.type = "checkbox"; bypassBox.className = "gw-bypass-chk"; bypassBox.checked = !config.manualBypass;
        bypassBox.onmousedown = (e) => e.stopPropagation();
        bypassBox.onchange = (e) => { config.manualBypass = !e.target.checked; saveAndRefresh(); applyGridState(); };
        bar.appendChild(bypassBox);
    }

    if (!isStatic) {
        const dragIcon = document.createElement("span"); dragIcon.className = "gw-drag-handle-icon"; dragIcon.innerHTML = "⠿";
        bar.appendChild(dragIcon);
    }

    const titleSpan = document.createElement("span"); titleSpan.className = "gw-title";
    titleSpan.innerText = config.title || "Container";
    if (config.titleColor) titleSpan.style.color = config.titleColor;
    titleSpan.contentEditable = state.isEditMode;
    if (state.isEditMode) { titleSpan.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); titleSpan.blur(); } }; titleSpan.onblur = () => { config.title = titleSpan.innerText; saveAndRefresh(); refreshContainerList(); }; }
    else { titleSpan.onkeydown = null; titleSpan.onblur = null; titleSpan.onmousedown = (e) => e.stopPropagation(); }

    const controlsDiv = document.createElement("div"); controlsDiv.className = "gw-ctrl-grp";

    const containerPresets = filterValuePresets(state.settings.valuePresets?.containers || []);
    const currentTab = state.appData.tabs[state.appData.activeIdx] || {};
    const myCat = config.presetCategory || currentTab.presetCategory || "General";

    let availablePresets = containerPresets;
    if (myCat) {
        availablePresets = availablePresets.filter(p => categoryMatches(p.category, myCat));
    }
    availablePresets = sortPresets(availablePresets, state.settings.presetSortOrder || DEFAULT_SORT_ORDER);

    if (availablePresets.length > 0 && state.settings.showContainerQuickSelect !== false) {
        const quickSel = document.createElement("select");
        quickSel.className = "gw-quick-preset-select";
        quickSel.title = "Apply Preset";

        let optionsHtml = `<option value="">🔖 Preset...</option>`;

        // Строим дерево категорий
        const tree = groupPresetsByCategoryTree(availablePresets);
        function addTreeOptions(node, depth, prefix) {
            Object.keys(node).sort().forEach(key => {
                const val = node[key];
                if (Array.isArray(val)) {
                    if (depth > 0) {
                        const indent = '  '.repeat(depth);
                        const label = (prefix ? prefix + ' / ' : '') + key;
                        optionsHtml += `<optgroup label="${indent}${label}">`;
                    }
                    val.forEach(p => {
                        const indent = '  '.repeat(depth + (depth > 0 ? 1 : 0));
                        optionsHtml += `<option value="${p.id}">${indent}${p.name}</option>`;
                    });
                    if (depth > 0) optionsHtml += `</optgroup>`;
                } else {
                    const indent = '  '.repeat(depth);
                    const label = (prefix ? prefix + ' / ' : '') + key;
                    optionsHtml += `<optgroup label="${indent}📁 ${label}">`;
                    addTreeOptions(val, depth + 1, label);
                    optionsHtml += `</optgroup>`;
                }
            });
        }
        addTreeOptions(tree, 0, '');

        quickSel.innerHTML = optionsHtml;
        quickSel.onmousedown = (e) => e.stopPropagation();
        quickSel.onchange = (e) => {
            const pId = e.target.value;
            if (!pId) return;
            const preset = availablePresets.find(p => p.id === pId);
            if (preset) applyPresetToContainer(config, preset.values, preset.name);
            e.target.value = "";
        };
        controlsDiv.appendChild(quickSel);
    }

        // Quick Save button (view mode)
        if (!state.isEditMode && config.showQuickSave) {
            const saveBtn = document.createElement("button");
            saveBtn.className = "gw-quick-save-btn";
            saveBtn.innerHTML = "💾 Save";
            saveBtn.title = "Quick Save Preset";
            saveBtn.onmousedown = (e) => e.stopPropagation();
            saveBtn.onclick = async (e) => {
                e.stopPropagation();
                saveBtn.innerHTML = "⏳";
                saveBtn.disabled = true;
                const cat = config.presetCategory || currentTab.presetCategory || "General";
                const defaultName = (config.title || "Container") + " Quick Save";
                const name = prompt("Preset name:", defaultName);
                if (!name || !name.trim()) {
                    saveBtn.innerHTML = "💾 Save";
                    saveBtn.disabled = false;
                    return;
                }
                const allIndices = (config.widgets || []).map((_, i) => i);
                try {
                    await saveContainerPreset(config, allIndices, name.trim(), cat);
                    saveBtn.innerHTML = "✅";
                    setTimeout(() => { saveBtn.innerHTML = "💾 Save"; saveBtn.disabled = false; }, 1500);
                } catch (ex) {
                    saveBtn.innerHTML = "❌";
                    setTimeout(() => { saveBtn.innerHTML = "💾 Save"; saveBtn.disabled = false; }, 1500);
                }
            };
            controlsDiv.appendChild(saveBtn);
        }

    if (state.isEditMode) {
        // Кнопка добавления виджета — inline picker
        const addWidgetBtn = document.createElement("span");
        addWidgetBtn.className = "gw-icon-btn gw-add-widget-btn";
        addWidgetBtn.innerText = "➕";
        addWidgetBtn.title = "Add Widget (click to pick from graph)";
        addWidgetBtn.onclick = (e) => {
            e.stopPropagation();
            showWidgetPickerPopup(addWidgetBtn, config, domElement, saveAndRefresh);
        };
        controlsDiv.appendChild(addWidgetBtn);

        // Кнопка Container Presets - управление пресетами конкретного контейнера
        const containerPresetBtn = document.createElement("span");
        containerPresetBtn.className = "gw-preset-btn";
        containerPresetBtn.innerText = "📦";
        containerPresetBtn.title = "Preset Manager";
        containerPresetBtn.onclick = (e) => { e.stopPropagation(); openPresetManagerModal({ containerConfig: config, domElement: domElement }); };
        controlsDiv.appendChild(containerPresetBtn);

        const createSelect = (options, current, onChange) => {
            const sel = document.createElement("select"); sel.className = "gw-layout-select";
            Object.entries(options).forEach(([key, label]) => { const opt = document.createElement("option"); opt.value = key; opt.innerText = label; if (current === key) opt.selected = true; sel.appendChild(opt); });
            sel.onchange = (e) => { e.stopPropagation(); onChange(e.target.value); renderGridItemContent(domElement, config); saveAndRefresh(); };
            sel.onmousedown = (e) => e.stopPropagation(); return sel;
        };

        controlsDiv.appendChild(createSelect(CONTAINER_VIEWS, config.containerView, (v) => { config.containerView = v; }));
        controlsDiv.appendChild(createSelect(LAYOUT_MODES, activeLayout, (v) => { config.layoutMode = v; }));
        controlsDiv.appendChild(createSelect(DENSITY_MODES, config.widgetDensity, (v) => { config.widgetDensity = v; }));
        controlsDiv.appendChild(createSelect(CONTAINER_TYPES, containerType, (v) => {
            config.containerType = v;
            if (v === "default") delete config.containerType;
            // Reset type-specific configs on type change
            if (v !== "tabs") { delete config.tabs; delete config.activeTab; }
            if (v !== "steps") { delete config.steps; delete config.activeStep; }
            if (v !== "drawer") { delete config.openDrawers; }
            if (v !== "split") { delete config.splitDirection; delete config.splitRatio; }
            if (v !== "accordion") { delete config.sections; }
            if (v !== "scroll") { delete config.scrollMaxHeight; }
            if (v !== "freeform") { delete config.freeformMinHeight; }
            // Clean widget-level type-specific fields
            (config.widgets || []).forEach(wRef => {
                if (v !== "tabs") delete wRef.tab;
                if (v !== "accordion") delete wRef.section;
                if (v !== "split") delete wRef.splitGroup;
                if (v !== "steps") delete wRef.stepIndex;
                if (v !== "drawer") delete wRef.drawer;
                if (v !== "spotlight") delete wRef.spotlight;
                if (v !== "freeform") { delete wRef.x; delete wRef.y; }
            });
        }));

        if (!config.hideEditButton) {
            const fseBtn = document.createElement("span"); fseBtn.className = "gw-icon-btn"; fseBtn.innerText = "⛶";
            fseBtn.title = "Full-Screen Editor";
            fseBtn.style.fontSize = "16px";
            fseBtn.onclick = (e) => { e.stopPropagation(); openFullscreenEditor(config, domElement); };
            controlsDiv.appendChild(fseBtn);
        }
    }

    const colorBtn = document.createElement("span"); colorBtn.className = "gw-icon-btn gw-drag-handle-icon"; colorBtn.innerText = "🎨";
    const palette = document.createElement("div"); palette.className = "gw-palette";["", "red", "green", "blue", "yellow", "purple", "cyan"].forEach(c => {
        const swatch = document.createElement("div"); swatch.className = "gw-swatch"; swatch.style.backgroundColor = c === "" ? "#333" : c;
        swatch.onclick = (e) => { e.stopPropagation(); config.color = c; if (c) domElement.setAttribute("data-color", c); else domElement.removeAttribute("data-color"); saveAndRefresh(); palette.classList.remove("visible"); };
        palette.appendChild(swatch);
    });
    colorBtn.onclick = (e) => { e.stopPropagation(); palette.classList.toggle("visible"); };
    controlsDiv.appendChild(colorBtn); colorBtn.appendChild(palette);

    // ▶ Run-to-Node button — executes workflow up to targetNodeId
    if (config.showRunToNodeBtn !== false && config.targetNodeId) {
        const runBtn = document.createElement("span");
        runBtn.className = "gw-icon-btn gw-run-to-node-btn";
        runBtn.innerText = "▶";
        runBtn.title = "Run to Node: " + config.targetNodeId;
        runBtn.onclick = async (e) => {
            e.stopPropagation();
            const n = parseInt(document.getElementById('a11-batch-count')?.value) || 1;
            try {
                const p = await app.graphToPrompt();
                const body = {
                    client_id: window.name || '',
                    prompt: p.output !== undefined ? p.output : p,
                    partial_execution_targets: [String(config.targetNodeId)],
                    extra_data: {}
                };
                if (p.workflow) {
                    body.extra_data = { extra_pnginfo: { workflow: p.workflow } };
                }
                if (n && n !== 1) body.number = n;
                const resp = await fetch('/api/prompt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!resp.ok) {
                    const errText = await resp.text();
                    console.error('Run-to-Node failed:', resp.status, errText);
                }
            } catch (err) {
                console.warn('Run-to-Node direct fetch failed, falling back to full queue:', err);
                app.queuePrompt(0, n);
            }
        };
        controlsDiv.appendChild(runBtn);
    }

    if (!isStatic) {
        const pinBtn = document.createElement("span"); pinBtn.className = `gw-pin-btn gw-drag-handle-icon ${config.pinned ? 'pinned' : ''}`; pinBtn.innerText = config.pinned ? "📌" : "⚓";
        pinBtn.onclick = (e) => { e.stopPropagation(); togglePin(domElement.closest(".grid-stack-item"), pinBtn, config, domElement); };
        const closeBtn = document.createElement("span"); closeBtn.className = "gw-close-btn gw-drag-handle-icon"; closeBtn.innerText = "✖";
        closeBtn.onclick = (e) => { e.stopPropagation(); if (confirm("Remove Container?")) { state.grid.removeWidget(domElement.closest(".grid-stack-item")); updateGraphExtra(true); refreshContainerList(); } };
        controlsDiv.appendChild(pinBtn); controlsDiv.appendChild(closeBtn);
    }

    bar.appendChild(titleSpan); bar.appendChild(controlsDiv);

    // ─── Type-specific DOM ───
    // TABS: tab buttons bar (create once, update in place)
    let tabsBar = domElement.querySelector(":scope > .gw-tabs-bar");
    if (containerType === "tabs") {
        if (!config.tabs || config.tabs.length === 0) {
            const tabMap = new Map();
            (config.widgets || []).forEach(wRef => {
                if (wRef.tab) {
                    if (!tabMap.has(wRef.tab)) tabMap.set(wRef.tab, { id: wRef.tab, label: wRef.tab, enabled: true });
                }
            });
            config.tabs = Array.from(tabMap.values());
        }
        if (!config.activeTab && config.tabs.length > 0) {
            config.activeTab = config.tabs.find(t => t.enabled !== false)?.id || config.tabs[0].id;
        }

        if (!tabsBar) {
            tabsBar = document.createElement("div");
            tabsBar.className = "gw-tabs-bar";
            domElement.insertBefore(tabsBar, body);
        }
        tabsBar.innerHTML = "";
        (config.tabs || []).forEach(tab => {
            const btn = document.createElement("button");
            btn.className = "gw-tab-btn";
            if (tab.id === config.activeTab) btn.classList.add("active");
            if (tab.enabled === false) btn.classList.add("disabled");
            btn.innerText = tab.label || tab.id;
            btn.onclick = (ev) => {
                ev.stopPropagation();
                if (ev.shiftKey && state.isEditMode) {
                    tab.enabled = tab.enabled === false ? true : false;
                } else if (tab.enabled !== false) {
                    config.activeTab = tab.id;
                }
                renderGridItemContent(domElement, config);
                saveAndRefresh();
            };
            btn.oncontextmenu = (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                tab.enabled = tab.enabled === false ? true : false;
                if (tab.enabled === false && config.activeTab === tab.id) {
                    config.activeTab = config.tabs.find(t => t.enabled !== false)?.id || null;
                }
                renderGridItemContent(domElement, config);
                saveAndRefresh();
            };
            tabsBar.appendChild(btn);
        });
    } else if (tabsBar) {
        tabsBar.remove();
    }

    // STEPS: navigation bar (create once, update in place)
    let stepsNav = domElement.querySelector(":scope > .gw-steps-nav");
    if (containerType === "steps") {
        if (!config.steps || config.steps.length === 0) {
            const stepSet = new Set();
            (config.widgets || []).forEach(wRef => { if (wRef.stepIndex !== undefined) stepSet.add(String(wRef.stepIndex)); });
            config.steps = Array.from(stepSet).sort().map(s => ({ id: s, label: `Step ${parseInt(s) + 1}` }));
        }
        // Normalize step IDs to strings
        config.steps = config.steps.map(s => ({ ...s, id: String(s.id) }));
        if (config.activeStep !== undefined) config.activeStep = String(config.activeStep);
        if (config.activeStep === undefined && config.steps.length > 0) config.activeStep = config.steps[0].id;

        if (!stepsNav) {
            stepsNav = document.createElement("div");
            stepsNav.className = "gw-steps-nav";
            domElement.insertBefore(stepsNav, body);
        }
        stepsNav.innerHTML = "";
        const curIdx = config.steps.findIndex(s => s.id === config.activeStep);

        const prevBtn = document.createElement("button");
        prevBtn.className = "gw-steps-btn"; prevBtn.innerText = "◀ Prev";
        prevBtn.disabled = curIdx <= 0;
        prevBtn.onclick = (ev) => {
            ev.stopPropagation();
            if (curIdx > 0) { config.activeStep = config.steps[curIdx - 1].id; renderGridItemContent(domElement, config); saveAndRefresh(); }
        };

        const indicator = document.createElement("div");
        indicator.className = "gw-steps-indicator";
        config.steps.forEach(s => {
            const dot = document.createElement("span");
            dot.className = "gw-steps-dot";
            if (s.id === config.activeStep) dot.classList.add("active");
            else if (config.steps.indexOf(s) < curIdx) dot.classList.add("done");
            dot.title = s.label;
            dot.style.cursor = "pointer";
            dot.onclick = (ev) => { ev.stopPropagation(); config.activeStep = s.id; renderGridItemContent(domElement, config); saveAndRefresh(); };
            indicator.appendChild(dot);
        });

        const nextBtn = document.createElement("button");
        nextBtn.className = "gw-steps-btn"; nextBtn.innerText = "Next ▶";
        nextBtn.disabled = curIdx >= config.steps.length - 1;
        nextBtn.onclick = (ev) => {
            ev.stopPropagation();
            if (curIdx < config.steps.length - 1) { config.activeStep = config.steps[curIdx + 1].id; renderGridItemContent(domElement, config); saveAndRefresh(); }
        };

        stepsNav.appendChild(prevBtn); stepsNav.appendChild(indicator); stepsNav.appendChild(nextBtn);
    } else if (stepsNav) {
        stepsNav.remove();
    }

    // DRAWER: triggers + panels (create once, update in place)
    let drawerTriggers = domElement.querySelector(":scope > .gw-drawer-triggers");
    if (containerType === "drawer") {
        const drawers = ["top", "bottom", "left", "right"];
        const activeDrawers = {};
        drawers.forEach(d => {
            if ((config.widgets || []).some(wRef => wRef.drawer === d)) {
                if (!config.openDrawers) config.openDrawers = {};
                activeDrawers[d] = config.openDrawers?.[d] || false;
            }
        });

        if (Object.keys(activeDrawers).length > 0) {
            if (!drawerTriggers) {
                drawerTriggers = document.createElement("div");
                drawerTriggers.className = "gw-drawer-triggers";
                domElement.insertBefore(drawerTriggers, body);
            }
            drawerTriggers.innerHTML = "";
            drawers.forEach(d => {
                if (activeDrawers.hasOwnProperty(d)) {
                    const btn = document.createElement("button");
                    btn.className = "gw-drawer-trigger";
                    if (activeDrawers[d]) btn.classList.add("active");
                    const icons = { top: "⬆", bottom: "⬇", left: "⬅", right: "➡" };
                    const count = (config.widgets || []).filter(w => w.drawer === d).length;
                    btn.innerHTML = `${icons[d] || d} ${d} <span class="drawer-count">${count}</span>`;
                    btn.onclick = (ev) => {
                        ev.stopPropagation();
                        if (!config.openDrawers) config.openDrawers = {};
                        config.openDrawers[d] = !config.openDrawers[d];
                        renderGridItemContent(domElement, config);
                        saveAndRefresh();
                    };
                    drawerTriggers.appendChild(btn);
                }
            });

            // Drawer panels — create once
            drawers.forEach(d => {
                if (activeDrawers.hasOwnProperty(d)) {
                    let panel = domElement.querySelector(`:scope > .gw-drawer-panel.drawer-${d}`);
                    if (!panel) {
                        panel = document.createElement("div");
                        panel.className = `gw-drawer-panel drawer-${d}`;
                        domElement.insertBefore(panel, body);
                    }
                    if (activeDrawers[d]) panel.classList.add("open");
                    else panel.classList.remove("open");
                }
            });
        }
        // Remove unused panels
        domElement.querySelectorAll(":scope > .gw-drawer-panel").forEach(p => {
            const dir = Array.from(p.classList).find(c => c.startsWith("drawer-"));
            if (dir && !activeDrawers.hasOwnProperty(dir.replace("drawer-", ""))) p.remove();
        });
    } else {
        if (drawerTriggers) drawerTriggers.remove();
        domElement.querySelectorAll(":scope > .gw-drawer-panel").forEach(p => p.remove());
    }

    // Prepare body class based on type
    let bodyExtraClass = "";
    let bodyExtraStyle = {};
    if (containerType === "scroll") {
        bodyExtraClass = "gw-scroll-body";
        bodyExtraStyle.maxHeight = config.scrollMaxHeight || "400px";
    }
    if (containerType === "freeform") {
        bodyExtraClass = "gw-freeform-body";
        bodyExtraStyle.minHeight = config.freeformMinHeight || "250px";
    }

    body.className = `gw-body layout-${activeLayout} gw-density-${config.widgetDensity}`;
    if (bodyExtraClass) body.classList.add(bodyExtraClass);
    // Don't clear body.innerHTML here — let type-specific setup handle it
    if (!containerType || containerType === "default" || containerType === "tabs" || containerType === "steps" ||
        containerType === "scroll" || containerType === "fab" || containerType === "toolbar" || containerType === "freeform") {
        body.innerHTML = "";
        Object.assign(body.style, bodyExtraStyle);
    }
    if (config.padding !== undefined && config.padding !== "") body.style.padding = config.padding + "px";
    else body.style.padding = "";

    if (state.isEditMode && config.widgets.length > 0) {
        const editList = document.createElement("div"); editList.className = "gw-edit-list edit-only";
        config.widgets.forEach((wRef, idx) => {
            const node = app.graph.getNodeById(wRef.nodeId);
            const item = document.createElement("div"); item.className = "gw-edit-item";
            const upBtn = document.createElement("span"); upBtn.innerText = "▲"; upBtn.className = "gw-reorder-btn";
            upBtn.onclick = (e) => { e.stopPropagation(); if (idx > 0) { [config.widgets[idx], config.widgets[idx - 1]] = [config.widgets[idx - 1], config.widgets[idx]]; renderGridItemContent(domElement, config); saveAndRefresh(); } };
            const downBtn = document.createElement("span"); downBtn.innerText = "▼"; downBtn.className = "gw-reorder-btn";
            downBtn.onclick = (e) => { e.stopPropagation(); if (idx < config.widgets.length - 1) { [config.widgets[idx], config.widgets[idx + 1]] = [config.widgets[idx + 1], config.widgets[idx]]; renderGridItemContent(domElement, config); saveAndRefresh(); } };

            let name = "Unknown";
            if (wRef.widgetIndex === "__preview__") name = "Output Preview";
            else if (node && node.widgets && node.widgets[wRef.widgetIndex]) name = node.widgets[wRef.widgetIndex].name;
            if (wRef.alias) name = `[${wRef.alias}] (${name})`;

            const nameSpan = document.createElement("span"); nameSpan.className = "gw-edit-item-name"; nameSpan.innerText = name; if (wRef.hidden) nameSpan.style.textDecoration = "line-through";
            const remBtn = document.createElement("span"); remBtn.className = "gw-edit-remove"; remBtn.innerText = "[x]";
            remBtn.onclick = (e) => { e.stopPropagation(); config.widgets.splice(idx, 1); renderGridItemContent(domElement, config); saveAndRefresh(); };

            item.appendChild(upBtn); item.appendChild(downBtn); item.appendChild(nameSpan); item.appendChild(remBtn); editList.appendChild(item);
        });
        body.appendChild(editList);
    }

    if (config.widgets) {
        // ─── Type-specific container setup ───
        let accordionSections = null;
        let splitLeft = null, splitRight = null;
        let spotlightHero = null, spotlightChips = null;

        if (containerType === "accordion") {
            // Collect sections from widgets
            const sectionMap = new Map();
            (config.widgets || []).forEach(wRef => {
                const sec = wRef.section || "General";
                if (!sectionMap.has(sec)) sectionMap.set(sec, []);
                sectionMap.get(sec).push(wRef);
            });
            if (!config.sections) config.sections = [];
            // Ensure config.sections has entries for all detected sections
            sectionMap.forEach((_, secId) => {
                if (!config.sections.find(s => s.id === secId)) {
                    config.sections.push({ id: secId, label: secId, collapsed: false });
                }
            });
            accordionSections = config.sections;
        }

        if (containerType === "split") {
            if (!config.splitDirection) config.splitDirection = "horizontal";
            if (!config.splitRatio) config.splitRatio = 50;
            // Remove old body content for split — only if structure missing
            if (!body.querySelector(".gw-split-panel")) {
                body.innerHTML = "";
                body.style.display = "flex";
                body.style.flexDirection = config.splitDirection === "vertical" ? "column" : "row";
                body.style.padding = "0";

                splitLeft = document.createElement("div");
                splitLeft.className = "gw-split-panel";
                splitLeft.style.flex = `${config.splitRatio} 1 0%`;
                splitLeft.style.padding = config.padding ? config.padding + "px" : "6px";

                const divider = document.createElement("div");
                divider.className = "gw-split-divider";
                setupSplitDividerDrag(divider, body, config, splitLeft, saveAndRefresh);

                splitRight = document.createElement("div");
                splitRight.className = "gw-split-panel";
                splitRight.style.flex = `${100 - config.splitRatio} 1 0%`;
                splitRight.style.padding = config.padding ? config.padding + "px" : "6px";

                body.appendChild(splitLeft);
                body.appendChild(divider);
                body.appendChild(splitRight);
            } else {
                splitLeft = body.querySelector(".gw-split-panel:first-child");
                splitRight = body.querySelector(".gw-split-panel:last-child");
                if (splitLeft) splitLeft.style.flex = `${config.splitRatio} 1 0%`;
                if (splitRight) splitRight.style.flex = `${100 - config.splitRatio} 1 0%`;
            }
        }

        if (containerType === "spotlight") {
            if (!body.querySelector(".gw-spotlight-hero")) {
                body.innerHTML = "";
                spotlightHero = document.createElement("div");
                spotlightHero.className = "gw-spotlight-hero";
                spotlightChips = document.createElement("div");
                spotlightChips.className = "gw-spotlight-chips";
                body.appendChild(spotlightHero);
                body.appendChild(spotlightChips);
            } else {
                spotlightHero = body.querySelector(".gw-spotlight-hero");
                spotlightChips = body.querySelector(".gw-spotlight-chips");
            }
            // Auto-assign spotlight if none marked
            if (!(config.widgets || []).some(w => w.spotlight) && config.widgets.length > 0) {
                // Prefer image/preview widgets, otherwise first widget
                const imgIdx = config.widgets.findIndex(w => w.widgetIndex === "__preview__" || w.name === "image");
                const heroIdx = imgIdx >= 0 ? imgIdx : 0;
                config.widgets[heroIdx].spotlight = true;
            }
        }

        // ─── Accordion: build sections in body (only if missing) ───
        if (containerType === "accordion" && accordionSections) {
            if (!body.querySelector(".gw-accordion-section")) {
                body.innerHTML = "";
                accordionSections.forEach(sec => {
                const section = document.createElement("div");
                section.className = "gw-accordion-section";
                if (!sec.collapsed) section.classList.add("open");
                section.dataset.sectionId = sec.id;

                const header = document.createElement("div");
                header.className = "gw-accordion-header";
                const arrow = document.createElement("span");
                arrow.className = "gw-accordion-arrow";
                arrow.innerText = "▶";
                const label = document.createElement("span");
                label.innerText = sec.label || sec.id;
                header.appendChild(arrow);
                header.appendChild(label);
                header.onclick = () => {
                    sec.collapsed = !sec.collapsed;
                    section.classList.toggle("open");
                    saveAndRefresh();
                };

                const sectionBody = document.createElement("div");
                sectionBody.className = "gw-accordion-body";
                const inner = document.createElement("div");
                inner.className = "gw-accordion-body-inner";
                sectionBody.appendChild(inner);

                section.appendChild(header);
                section.appendChild(sectionBody);
                body.appendChild(section);
            });
            } else {
                // Update collapse states for existing sections
                accordionSections.forEach(sec => {
                    const section = body.querySelector(`.gw-accordion-section[data-section-id="${sec.id}"]`);
                    if (section) {
                        if (sec.collapsed) section.classList.remove("open");
                        else section.classList.add("open");
                    }
                });
            }
        }

        // === ИНКРЕМЕНТАЛЬНЫЙ РЕНДЕРИНГ ===
        // Cleanup preset buttons if disabled in settings
        if (state.settings.showWidgetPresets === false) {
            body.querySelectorAll('.gw-widget-preset-btn').forEach(b => b.remove());
        }
        // Собираем существующие виджеты для сравнения
        const existingWidgets = new Map();
        body.querySelectorAll('.gw-widget-wrapper').forEach(el => {
            const key = el.dataset.widgetKey; // nodeId_widgetIndex
            if (key) {
                existingWidgets.set(key, el);
            }
        });

        const newWidgetKeys = new Set();

        config.widgets.forEach(wRef => {
            if (wRef.hidden) return;

            // Type-specific filtering
            if (containerType === "tabs" && config.activeTab && wRef.tab !== config.activeTab) return;
            if (containerType === "steps" && config.activeStep !== undefined && wRef.stepIndex !== config.activeStep) return;

            const node = app.graph.getNodeById(wRef.nodeId);
            if (!node) return;

            const widgetKey = `${wRef.nodeId}_${wRef.widgetIndex}`;
            newWidgetKeys.add(widgetKey);

            const options = { ...wRef, onResize: (newHeight) => { wRef.customHeight = newHeight; saveAndRefresh(); } };
            let generatedWrapper = null;

            // Проверяем есть ли уже этот виджет
            if (existingWidgets.has(widgetKey)) {
                generatedWrapper = existingWidgets.get(widgetKey);
                updateWidgetWrapperStyles(generatedWrapper, wRef, options);
                existingWidgets.delete(widgetKey);
            } else {
                if (wRef.widgetIndex === "__preview__") {
                    const fakeWidget = { name: "$$canvas-image-preview", value: "", type: "image" };
                    generatedWrapper = createWidgetDOM(fakeWidget, wRef.nodeId, "__preview__", options);
                } else if (node.widgets && node.widgets[wRef.widgetIndex]) {
                    generatedWrapper = createWidgetDOM(node.widgets[wRef.widgetIndex], wRef.nodeId, wRef.widgetIndex, options);
                }

                if (generatedWrapper) {
                    generatedWrapper.dataset.widgetKey = widgetKey;
                }
            }

            if (generatedWrapper) {
                const isGridMode = activeLayout.startsWith('col-') || activeLayout === 'auto';

                if (isGridMode && wRef.colSpan) {
                    let maxCols = 12;
                    if (activeLayout === 'col-2') maxCols = 2;
                    if (activeLayout === 'col-3') maxCols = 3;
                    if (activeLayout === 'col-4') maxCols = 4;
                    if (activeLayout === 'col-5') maxCols = 5;
                    if (activeLayout === 'col-6') maxCols = 6;
                    const span = Math.min(parseInt(wRef.colSpan) || 1, maxCols);
                    generatedWrapper.style.gridColumn = `span ${span}`;
                }

                const wWidth = wRef.width || wRef.flex;
                if (wWidth) {
                    const wStr = String(wWidth).trim().toLowerCase();
                    if (wStr === "auto" || wStr === "100%" || wStr === "flex") {
                        generatedWrapper.style.width = "auto";
                        generatedWrapper.style.flex = "1 1 auto";
                        generatedWrapper.style.maxWidth = "none";
                    } else {
                        const widthVal = isNaN(wWidth) ? wWidth : wWidth + "px";
                        generatedWrapper.style.width = widthVal;
                        generatedWrapper.style.flex = `0 0 ${widthVal}`;
                        generatedWrapper.style.maxWidth = widthVal;
                    }
                }

                const wHeight = wRef.customHeight;
                if (wHeight) {
                    const hStr = String(wHeight).trim().toLowerCase();
                    if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
                        generatedWrapper.classList.add("gw-widget-wrapper--grows");
                    } else {
                        generatedWrapper.classList.remove("gw-widget-wrapper--grows");
                        const hVal = isNaN(wHeight) ? wHeight : wHeight + "px";
                        generatedWrapper.style.height = hVal;
                        generatedWrapper.style.flexShrink = "0";
                    }
                }

                // Freeform positioning
                if (containerType === "freeform") {
                    const fx = wRef.x !== undefined ? wRef.x : 50;
                    const fy = wRef.y !== undefined ? wRef.y : 50;
                    generatedWrapper.style.position = "absolute";
                    generatedWrapper.style.left = fx + "%";
                    generatedWrapper.style.top = fy + "%";
                    generatedWrapper.style.width = "auto";
                    generatedWrapper.style.minWidth = "80px";
                    generatedWrapper.style.maxWidth = "300px";
                    generatedWrapper.style.flex = "none";
                    generatedWrapper.style.transform = "translate(-50%, -50%)";
                    // Freeform drag (edit mode only)
                    if (state.isEditMode) {
                        generatedWrapper.style.cursor = "move";
                        generatedWrapper.onmousedown = (ev) => {
                            if (!state.isEditMode) return;
                            // Don't drag when clicking on interactive elements
                            if (ev.target.closest("input, button, select, textarea, [contenteditable]")) return;
                            ev.stopPropagation();
                            const wrapper = generatedWrapper;
                            const bodyRect = body.getBoundingClientRect();
                            const startX = ev.clientX;
                            const startY = ev.clientY;
                            const startLeft = parseFloat(wrapper.style.left) || 50;
                            const startTop = parseFloat(wrapper.style.top) || 50;

                            const onMove = (me) => {
                                const dx = ((me.clientX - startX) / bodyRect.width) * 100;
                                const dy = ((me.clientY - startY) / bodyRect.height) * 100;
                                const newX = Math.max(3, Math.min(97, startLeft + dx));
                                const newY = Math.max(3, Math.min(97, startTop + dy));
                                wrapper.style.left = newX + "%";
                                wrapper.style.top = newY + "%";
                                wrapper.classList.add("dragging");
                            };
                            const onUp = () => {
                                document.removeEventListener("mousemove", onMove);
                                document.removeEventListener("mouseup", onUp);
                                wrapper.classList.remove("dragging");
                                wRef.x = Math.round(parseFloat(wrapper.style.left));
                                wRef.y = Math.round(parseFloat(wrapper.style.top));
                                saveAndRefresh();
                            };
                            document.addEventListener("mousemove", onMove);
                            document.addEventListener("mouseup", onUp);
                            ev.preventDefault();
                        };
                    } else {
                        generatedWrapper.style.cursor = "default";
                        generatedWrapper.onmousedown = null;
                    }
                }

                // Determine target parent
                let targetParent = body;
                if (containerType === "accordion") {
                    const secId = wRef.section || "General";
                    const sectionEl = body.querySelector(`.gw-accordion-section[data-section-id="${secId}"]`);
                    if (sectionEl) {
                        targetParent = sectionEl.querySelector(".gw-accordion-body-inner");
                    }
                } else if (containerType === "split") {
                    const side = wRef.splitGroup || "left";
                    targetParent = side === "right" ? splitRight : splitLeft;
                } else if (containerType === "spotlight") {
                    if (wRef.spotlight) {
                        targetParent = spotlightHero;
                    } else {
                        targetParent = spotlightChips;
                    }
                } else if (containerType === "drawer" && wRef.drawer) {
                    const panel = domElement.querySelector(`:scope > .gw-drawer-panel.drawer-${wRef.drawer}`);
                    if (panel) targetParent = panel;
                }

                // Добавляем в target если ещё не там
                if (!generatedWrapper.parentNode || generatedWrapper.parentNode !== targetParent) {
                    targetParent.appendChild(generatedWrapper);
                }

                // Per-widget preset button (not for preview widgets)
                if (wRef.widgetIndex !== "__preview__") {
                    addWidgetPresetButton(generatedWrapper, wRef, config, domElement);
                }

                // Suggestions button for text widgets
                if (wRef.suggestions && wRef.widgetIndex !== "__preview__") {
                    addTextSuggestionsButton(generatedWrapper, wRef);
                }
            }
        });

        // ❌ Удаляем виджеты которых больше нет в конфигурации
        existingWidgets.forEach((el, key) => {
            el.classList.add('removing');
            setTimeout(() => {
                el.remove();
            }, 200);
        });

        // Save split ratio if changed
        if (containerType === "split" && !isStatic) {
            domElement.dataset.config = JSON.stringify(config);
        }
    }
}

/**
 * Обновить стили wrapper без пересоздания DOM
 * @param {HTMLElement} wrapper 
 * @param {Object} wRef 
 * @param {Object} options 
 */
function updateWidgetWrapperStyles(wrapper, wRef, options) {
    // Обновить классы и высоту
    if (options.customHeight) {
        const hStr = String(options.customHeight).trim().toLowerCase();
        if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
            wrapper.classList.add("gw-widget-wrapper--grows");
            wrapper.style.height = "";
            wrapper.style.flexShrink = "";
        } else {
            wrapper.classList.remove("gw-widget-wrapper--grows");
            const hVal = isNaN(options.customHeight) ? options.customHeight : options.customHeight + "px";
            wrapper.style.height = hVal;
            wrapper.style.flexShrink = "0";
        }
    } else {
        wrapper.classList.remove("gw-widget-wrapper--grows");
        wrapper.style.height = "";
        wrapper.style.minHeight = "";
        wrapper.style.flexGrow = "";
        wrapper.style.flexShrink = "";
    }

    // Обновить стили ширины
    const wWidth = wRef.width || wRef.flex;
    if (wWidth) {
        const wStr = String(wWidth).trim().toLowerCase();
        if (wStr === "auto" || wStr === "100%" || wStr === "flex") {
            wrapper.style.width = "auto";
            wrapper.style.flex = "1 1 auto";
            wrapper.style.maxWidth = "none";
        } else {
            const widthVal = isNaN(wWidth) ? wWidth : wWidth + "px";
            wrapper.style.width = widthVal;
            wrapper.style.flex = `0 0 ${widthVal}`;
            wrapper.style.maxWidth = widthVal;
        }
    }

    // Обновить read-only состояние
    if (wRef.readOnly) {
        wrapper.classList.add("a11-readonly-widget");
    } else {
        wrapper.classList.remove("a11-readonly-widget");
    }
}

export function openContainerSettings(config, domElement) {
    openFullscreenEditor(config, domElement);
}

export function openFullscreenEditor(config, domElement) {
    const saveAndRefresh = () => {
        if (!domElement.classList.contains("is-static-container")) {
            domElement.dataset.config = JSON.stringify(config);
        }
        renderGridItemContent(domElement, config);
        updateGraphExtra(true);
    };

    const gridItem = domElement.closest(".grid-stack-item");
    const isStatic = domElement.classList.contains("is-static-container");

    // Save grid state
    const origGridState = gridItem ? {
        gsX: gridItem.getAttribute("gs-x"), gsY: gridItem.getAttribute("gs-y"),
        gsW: gridItem.getAttribute("gs-w"), gsH: gridItem.getAttribute("gs-h"),
    } : null;

    // ─── Overlay ───
    const overlay = document.createElement("div");
    overlay.className = "a11-fse-overlay";

    // Container area (left side)
    const containerArea = document.createElement("div");
    containerArea.className = "a11-fse-container";

    const previewBox = document.createElement("div");
    previewBox.className = "grid-stack-item-content";
    previewBox.style.cssText = "width:100%;height:calc(100vh - 40px);max-width:900px;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);overflow:hidden;";
    previewBox.dataset.config = JSON.stringify(config);
    previewBox.classList.add("view-mode");
    // Initial render without header
    const origHide = config.hideHeader;
    config.hideHeader = true;
    renderGridItemContent(previewBox, config);
    config.hideHeader = origHide;
    containerArea.appendChild(previewBox);

    // Panel (right side)
    const panel = document.createElement("div");
    panel.className = "a11-fse-panel";
    panel.innerHTML = `
        <div class="a11-fse-panel-header">
            <span class="a11-fse-panel-title">⚙ ${config.title || "Container Editor"}</span>
            <span class="a11-fse-close" id="fse-close">✖</span>
        </div>
        <div class="a11-fse-tabs">
            <div class="a11-fse-tab active" data-tab="general">General</div>
            <div class="a11-fse-tab" data-tab="widgets">Widgets</div>
            <div class="a11-fse-tab" data-tab="type">Type</div>
            <div class="a11-fse-tab" data-tab="style">Style</div>
            <div class="a11-fse-tab" data-tab="styles">Styles</div>
        </div>
        <div class="a11-fse-body" id="fse-body"></div>
    `;

    overlay.appendChild(containerArea);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const bodyEl = panel.querySelector("#fse-body");
    let activeTab = "general";
    let selectedWidgetIdx = -1;

    // ─── Dynamic refresh ───
    function refreshPreview() {
        const ct = config.containerType;
        if (config.containerView) previewBox.className = `grid-stack-item-content view-mode gw-view-${config.containerView}` + (ct ? ` gw-type-${ct}` : "");
        else previewBox.className = "grid-stack-item-content view-mode" + (ct ? ` gw-type-${ct}` : "");
        previewBox.dataset.config = JSON.stringify(config);
        const origHide = config.hideHeader;
        config.hideHeader = true;
        renderGridItemContent(previewBox, config);
        config.hideHeader = origHide;
    }

    function applyAndPreview() {
        saveAndRefresh();
        refreshPreview();
    }

    // ─── Helpers ───
    const sel = (label, opts, current) =>
        `<div class="a11-fse-row"><span class="a11-fse-label">${label}</span><select class="a11-fse-select fse-live" data-key="${label}">${
            Object.entries(opts).map(([k,v]) => `<option value="${k}" ${k===current?'selected':''}>${v}</option>`).join('')
        }</select></div>`;

    const catSel = (current) => {
        const opts = {};
        const presets = filterValuePresets(state.settings.valuePresets?.containers || []);
        const paths = getAllCategoryPaths(presets);
        paths.forEach(path => {
            const parts = parseCategory(path);
            const indent = '\xA0\xA0'.repeat(parts.length - 1) + (parts.length > 1 ? '└ ' : '');
            opts[path] = indent + parts[parts.length - 1];
        });
        return sel("Preset Category", opts, current || "");
    };

    const suggestionBuilder = (sw) => {
        const curVals = (sw.suggestions || '').split(',').map(s => s.trim()).filter(Boolean);
        let presetVals = [];
        if (sw.nodeType) {
            const allP = filterValuePresets(state.settings.valuePresets?.containers || []);
            const seen = new Set(curVals);
            allP.forEach(p => {
                p.values.forEach(v => {
                    if (v.nodeType === sw.nodeType && !seen.has(String(v.value))) {
                        presetVals.push(String(v.value));
                        seen.add(String(v.value));
                    }
                });
            });
        }
        const tags = curVals.map(s => `<span class="a11-fse-tag">${s}<button class="a11-fse-tag-rm" data-val="${s}">×</button></span>`).join('');
        const presetBtns = presetVals.slice(0, 12).map(v => 
            `<button class="a11-fse-chip" data-addsugg="${v}">+ ${v.substring(0, 40)}</button>`
        ).join('');
        return `<div class="a11-fse-block">
            <div class="a11-fse-block-title">Suggestions</div>
            <div class="a11-fse-tags" id="fse-suggestion-tags">${tags || '<span class="a11-fse-muted">no suggestions yet</span>'}</div>
            <input type="text" class="a11-fse-input fse-live" data-key="Suggestions" value="${sw.suggestions||''}" placeholder="val1, val2, val3" style="margin-top:4px;">
            ${presetBtns ? '<div class="a11-fse-chips">'+presetBtns+'</div>' : ''}
        </div>`;
    };

    const inp = (label, value, placeholder, type="text") =>
        `<div class="a11-fse-row"><span class="a11-fse-label">${label}</span><input class="a11-fse-input fse-live" type="${type}" value="${value||''}" placeholder="${placeholder||''}" data-key="${label}"></div>`;

    const chk = (label, checked) =>
        `<div class="a11-fse-row"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;"><input type="checkbox" class="fse-live" data-key="${label}" ${checked?'checked':''}> ${label}</label></div>`;

    function getCT() { return config.containerType || "default"; }
    function getAL() { return config.layoutMode || "list"; }

    // ─── Tab: General ───
    function renderGeneral() {
        return `
        <div class="a11-fse-block">
            <div class="a11-fse-block-title">Info</div>
            ${inp("Title", config.title||"", "Container name")}
            ${!isStatic ? catSel(config.presetCategory || "") : ''}
                        ${!isStatic ? chk("Show Quick Save", config.showQuickSave) : ''}
                        ${!isStatic ? chk("Hide Edit Button", config.hideEditButton) : ''}
            ${chk("Hide Header", config.hideHeader)}
            ${chk("Hide Collapse", config.hideCollapse)}
            ${chk("Minimal Header", config.minimalHeader)}
            ${!isStatic ? chk("Pinned", config.pinned) : ''}
        </div>
        <div class="a11-fse-block">
            <div class="a11-fse-block-title">Behavior</div>
            ${!isStatic ? `<div class="a11-fse-row"><span class="a11-fse-label">Bypass</span><select class="a11-fse-select fse-live" data-key="Bypass"><option value="default" ${(config.bypassMode||'default')==='default'?'selected':''}>Default</option><option value="mute" ${config.bypassMode==='mute'?'selected':''}>Mute</option><option value="graph" ${config.bypassMode==='graph'?'selected':''}>Graph</option></select></div>` : ''}
            ${!isStatic ? `<div class="a11-fse-row"><span class="a11-fse-label">Checkbox Action</span><select class="a11-fse-select fse-live" data-key="Checkbox Action"><option value="bypass" ${config.actionType!=='mute'?'selected':''}>Bypass (Pass-through)</option><option value="mute" ${config.actionType==='mute'?'selected':''}>Mute (Disable)</option></select></div>` : ''}
        </div>
        <div class="a11-fse-block">
            <div class="a11-fse-block-title">Layout</div>
            ${sel("View", CONTAINER_VIEWS, config.containerView||"clean")}
            ${sel("Layout", LAYOUT_MODES, getAL())}
            ${sel("Density", DENSITY_MODES, config.widgetDensity||"normal")}
            ${sel("Type", CONTAINER_TYPES, getCT())}
        </div>
        ${(() => {
            let nodeOpts = '<option value="">— None —</option>';
            const nodes = app.graph?.nodes || app.graph?._nodes || [];
            nodes.forEach(node => {
                const id = String(node.id);
                const label = node.title || node.type || id;
                const sel2 = id === config.targetNodeId ? ' selected' : '';
                nodeOpts += '<option value="' + id + '"' + sel2 + '>' + label + '</option>';
            });
            return '<div class="a11-fse-block"><div class="a11-fse-block-title">Execution</div>' +
                '<div class="a11-fse-row"><span class="a11-fse-label">Target Node</span><select class="a11-fse-select fse-live" data-key="Target Node">' + nodeOpts + '</select></div>' +
                chk("Show Run-to-Node button", config.showRunToNodeBtn !== false) +
                '</div>';
        })()}
        <div class="a11-fse-block">
            <div class="a11-fse-block-title">Actions</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="a11-fse-btn primary" id="fse-done">✅ Done</button>
                <button class="a11-fse-btn" id="fse-add-widget">➕ Add Widget</button>
                ${!isStatic ? '<button class="a11-fse-btn danger" id="fse-remove-container">🗑 Remove</button>' : ''}
            </div>
        </div>`;
    }

    // ─── Tab: Widgets ───
    function getWidgetInfo(w) {
        const node = app.graph?.getNodeById(w.nodeId);
        if (w.widgetIndex === "__preview__") return { name: "Output Preview", type: "image", isCustomDom: false };
        if (!node?.widgets?.[w.widgetIndex]) return { name: w.name||"Unknown", type: "widget", isCustomDom: false };
        const aw = node.widgets[w.widgetIndex];
        let t = aw.type || typeof aw.value;
        if (Array.isArray(aw.options?.values)) t = "combo";
        if (aw.name === "image" && aw.type !== "text") t = "image";
        const isCD = aw.element instanceof HTMLElement && t !== "text" && t !== "image" && t !== "combo";
        return { name: w.alias || aw.name || "Unknown", type: t, isCustomDom: isCD };
    }

    function renderWidgets() {
        const wArr = config.widgets || [];
        if (wArr.length === 0) {
            return `<div class="a11-fse-block"><div class="a11-fse-block-title">Widgets (0)</div>
                <div style="color:var(--a11-text-muted);text-align:center;padding:20px;">No widgets yet.<br>
                <button class="a11-fse-btn primary" id="fse-add-widget2" style="margin-top:8px;">➕ Add Widget</button></div></div>`;
        }

        const ct = getCT();
        const needsGrouping = (ct === "tabs" || ct === "steps");

        let html = `<div class="a11-fse-block"><div class="a11-fse-block-title">Widgets (${wArr.length})</div>
            ${wArr.length > 1 && !needsGrouping ? `<div style="font-size:10px;color:var(--a11-text-muted);margin-bottom:4px;">🖱 Drag to reorder</div>` : ''}
            ${wArr.length > 3 ? `<input class="a11-fse-input" id="fse-widget-search" placeholder="🔍 Filter widgets..." style="margin-bottom:8px;width:100%;">` : ''}`;

        if (needsGrouping) {
            // Group by tab/step
            const groups = new Map();
            const ungrouped = [];
            wArr.forEach((w, i) => {
                let key;
                if (ct === "tabs") key = w.tab || "__none__";
                else key = w.stepIndex !== undefined ? String(w.stepIndex) : "__none__";
                if (key === "__none__") ungrouped.push(i);
                else {
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(i);
                }
            });

            const tabLabels = {};
            if (ct === "tabs") (config.tabs||[]).forEach(t => tabLabels[t.id] = t.label||t.id);
            if (ct === "steps") (config.steps||[]).forEach((s,i) => tabLabels[String(i)] = s.label||s.id);

            const renderGroup = (label, indices, groupKey) => {
                html += `<div class="a11-fse-group-header">${label} <span style="opacity:0.5;font-size:10px;">(${indices.length})</span></div>`;
                indices.forEach(i => {
                    const w = wArr[i];
                    const info = getWidgetInfo(w);
                    const active = i === selectedWidgetIdx ? " active-widget" : "";
                    html += `<div class="a11-fse-widget-item${active}" data-widx="${i}" draggable="true" data-group="${groupKey}">
                        <span class="wi-drag">⠿</span>
                        <span class="wi-name">${info.name}</span><span class="wi-type">[${info.type}]</span>
                        <span class="wi-remove" data-rmidx="${i}">✖</span></div>`;
                });
            };

            groups.forEach((indices, key) => {
                const label = tabLabels[key] || key;
                renderGroup(label, indices, key);
            });
            if (ungrouped.length > 0) renderGroup("Ungrouped", ungrouped, "__none__");
        } else {
            html += wArr.length > 1 ? `<div style="font-size:10px;color:var(--a11-text-muted);margin-bottom:4px;">🖱 Drag to reorder</div>` : '';
            wArr.forEach((w, i) => {
                const info = getWidgetInfo(w);
                const active = i === selectedWidgetIdx ? " active-widget" : "";
                html += `<div class="a11-fse-widget-item${active}" data-widx="${i}" draggable="true" data-group="all">
                    <span class="wi-drag">⠿</span>
                    <span class="wi-name">${info.name}</span><span class="wi-type">[${info.type}]</span>
                    <span class="wi-remove" data-rmidx="${i}">✖</span></div>`;
            });
        }
        html += `</div>`;

        // Detail
        if (selectedWidgetIdx >= 0 && wArr[selectedWidgetIdx]) {
            const sw = wArr[selectedWidgetIdx];
            const info = getWidgetInfo(sw);
            const ct = getCT();
            const isNum = info.type === "number" || info.type === "slider" || info.type === "float" || info.type === "int";
            const isText = info.type === "customtext" || info.type === "text" || info.type === "string";
            const isImage = info.type === "image";
            const isCombo = info.type === "combo";
            const isBtn = info.type === "button" || info.type === "toggle" || info.type === "boolean";

            html += `<div class="a11-fse-widget-detail open" id="fse-widget-detail">
                <div class="a11-fse-block-title" style="margin-bottom:6px;">${info.name}</div>
                ${inp("Alias", sw.alias||"", "Display name")}
                ${inp("Width", sw.width||sw.flex||"", "auto, 100%, 150px")}
                ${inp("Height", sw.customHeight||"", "auto, 100%, 250")}
                ${getAL().startsWith('col-')||getAL()==='auto' ? inp("Col Span", sw.colSpan||"", "1","number") : ''}
                ${inp("Font Size", sw.fontSize||"", "px")}
                ${chk("Hide Label", sw.hideLabel)}
                ${chk("Read Only", sw.readOnly)}
                ${chk("Hidden", sw.hidden)}
                ${info.isCustomDom ? inp("Scale (%)", sw.customScale!==undefined?sw.customScale:100, "100") : ''}
                ${info.isCustomDom ? sel("Overflow", {"hidden":"Hidden","auto":"Scroll","visible":"Visible"}, sw.overflow||"hidden") : ''}
                ${isImage ? sel("Image Fit", {"contain":"Contain","cover":"Cover","fill":"Fill"}, sw.objectFit||"contain") : ''}
                ${isImage ? chk("Auto Preview", sw.previewAuto !== false) : ''}
                ${isImage||sw.widgetIndex==='__preview__' ? sel("Thumb Size", {"":"Auto","sm":"Small (80px)","md":"Medium (150px)","lg":"Large (250px)"}, sw.thumbSize||"") : ''}
                ${(isText||isNum||isCombo) ? sel("Text Align", {"":"Left","center":"Center","right":"Right"}, sw.textAlign||"") : ''}
                ${isNum ? inp("Decimals", sw.decimals||"", "Auto") : ''}
                ${isNum ? chk("Compact", sw.compact) : ''}
                ${isNum ? inp("Min", sw.min||"", "")+inp("Max", sw.max||"", "")+inp("Step", sw.step||"", "") : ''}
                ${isNum ? chk("No Slider", sw.hideSlider)+chk("No Number", sw.hideNumber) : ''}
                ${isText ? chk("Multiline", sw.multiline)+inp("Max Chars", sw.maxChars||"", "Unlimited") : ''}
                ${isText ? inp("Suggestions", sw.suggestions||"", "val1, val2, val3") : ''}
                ${isCombo ? chk("No Filter", sw.hideFilter) : ''}
                ${isCombo ? chk("Allow Custom", sw.allowCustom) : ''}
                ${isBtn ? sel("Button Size", {"":"Auto","sm":"Small","md":"Medium","lg":"Large"}, sw.btnSize||"") : ''}
                ${isBtn||isImage ? inp("Accent Color", sw.buttonColor||"", "#ea580c","color") : ''}
                ${inp("Label Color", sw.labelColor||"", "#ffffff","color")}
                <!-- Container-type-specific -->
                ${ct==='tabs' ? sel("Tab", Object.fromEntries([["","— none —"],...(config.tabs||[]).map(t=>[t.id,t.label||t.id])]), sw.tab||"") : ''}
                ${ct==='accordion' ? sel("Section", Object.fromEntries([["","— General —"],...(config.sections||[]).map(s=>[s.id,s.label||s.id])]), sw.section||"") : ''}
                ${ct==='split' ? sel("Panel", {"left":"Left","right":"Right"}, sw.splitGroup||"left") : ''}
                ${ct==='steps' ? inp("Step #", sw.stepIndex!==undefined?sw.stepIndex:"", "0", "number") : ''}
                ${ct==='drawer' ? sel("Drawer", {"":"— visible —","top":"Top","bottom":"Bottom","left":"Left","right":"Right"}, sw.drawer||"") : ''}
                ${ct==='spotlight' ? chk("Spotlight (Hero)", sw.spotlight) : ''}
                ${ct==='freeform' ? inp("X (%)", sw.x!==undefined?sw.x:50,"50","number")+inp("Y (%)", sw.y!==undefined?sw.y:50,"50","number") : ''}
                ${catSel(sw.presetCategory || "")}
                ${sw.presetCategory ? chk("Include Subcategories", sw.presetIncludeSubcategories !== false) + chk("Show 🔖 Button", sw.showPresetBtn !== false) : ''}
                ${isText ? chk("Show Suggestions", sw.showSuggestions || !!sw.suggestions) : ''}
                ${isText && (sw.showSuggestions || sw.suggestions) ? suggestionBuilder(sw) : ''}
                <div style="display:flex;gap:6px;margin-top:8px;">
                    <button class="a11-fse-btn danger" id="fse-widget-remove">✖ Remove Widget</button>
                </div></div>`;
        }
        return html;
    }

    // ─── Tab: Type ───
    function renderType() {
        const ct = getCT();
        let html = `<div class="a11-fse-block"><div class="a11-fse-block-title">Container Type: ${CONTAINER_TYPES[ct]||ct}</div>`;

        if (ct === "tabs") {
            html += `<div style="margin-bottom:6px;font-size:11px;color:var(--a11-text-muted);">Manage tabs.</div>`;
            (config.tabs||[]).forEach((t, i) => {
                html += `<div class="a11-fse-row"><input class="a11-fse-input" value="${t.label||t.id}" placeholder="Tab name" style="flex:1">
                    <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;"><input type="checkbox" ${t.enabled!==false?'checked':''}> Active</label>
                    <span class="a11-fse-btn danger fse-type-remove" style="padding:2px 8px;font-size:10px;" data-idx="${i}" data-kind="tabs">✖</span></div>`;
            });
            html += `<button class="a11-fse-btn" id="fse-add-tab" style="margin-top:6px;">+ Add Tab</button>`;
            html += `<div style="margin-top:8px;"><span class="a11-fse-label" style="font-size:11px;">Default Active:</span>
                <select class="a11-fse-select fse-live" data-key="Default Tab" style="width:100%;margin-top:4px;">
                    <option value="">— none —</option>
                    ${(config.tabs||[]).map(t => `<option value="${t.id}" ${config.activeTab===t.id?'selected':''}>${t.label||t.id}</option>`).join('')}
                </select></div>`;
        } else if (ct === "accordion") {
            (config.sections||[]).forEach((s, i) => {
                html += `<div class="a11-fse-row"><input class="a11-fse-input" value="${s.label||s.id}" placeholder="Section name" style="flex:1">
                    <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;"><input type="checkbox" ${s.collapsed?'checked':''}> Closed</label>
                    <span class="a11-fse-btn danger fse-type-remove" style="padding:2px 8px;font-size:10px;" data-idx="${i}" data-kind="sections">✖</span></div>`;
            });
            html += `<button class="a11-fse-btn" id="fse-add-section" style="margin-top:6px;">+ Add Section</button>`;
        } else if (ct === "split") {
            html += sel("Direction", {"horizontal":"Horizontal","vertical":"Vertical"}, config.splitDirection||"horizontal");
            html += inp("Ratio", config.splitRatio||"50", "50","number");
        } else if (ct === "steps") {
            (config.steps||[]).forEach((s, i) => {
                html += `<div class="a11-fse-row"><span style="font-size:10px;width:20px;">${i+1}.</span>
                    <input class="a11-fse-input" value="${s.label||s.id}" placeholder="Step label" style="flex:1">
                    <span class="a11-fse-btn danger fse-type-remove" style="padding:2px 8px;font-size:10px;" data-idx="${i}" data-kind="steps">✖</span></div>`;
            });
            html += `<button class="a11-fse-btn" id="fse-add-step" style="margin-top:6px;">+ Add Step</button>`;
            html += chk("Loop (wrap around)", config.stepsLoop);
        } else if (ct === "scroll") {
            html += inp("Max Height", config.scrollMaxHeight||"", "300px");
            html += chk("Smooth Scroll", config.scrollSmooth !== false);
        } else if (ct === "freeform") {
            html += inp("Min Height", config.freeformMinHeight||"", "250px");
            html += inp("Snap Grid (px)", config.freeformSnap||0, "0","number");
        } else if (ct === "drawer") {
            html += `<div style="font-size:11px;color:var(--a11-text-muted);">Assign drawer positions per-widget in Widgets tab.</div>`;
            html += `<div style="margin-top:8px;font-size:11px;">Defaults open:</div>`;
            ["top","bottom","left","right"].forEach(d => {
                html += `<label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;margin:2px 0;">
                    <input type="checkbox" ${config.openDrawers?.[d]?'checked':''} class="fse-live" data-key="Drawer Open ${d}"> ${d}</label>`;
            });
        } else if (ct === "spotlight") {
            html += `<div style="font-size:11px;color:var(--a11-text-muted);">Hero widget is auto-selected. Override in Widgets tab.</div>`;
        } else if (ct === "fab") {
            html += chk("Show header on hover", config.fabShowHeader !== false);
        } else if (ct === "toolbar") {
            html += chk("Compact mode", config.toolbarCompact !== false);
        }
        html += `</div>`;
        return html;
    }

    // ─── Tab: Style ───
    function renderStyle() {
        const colors = ["","red","green","blue","yellow","purple","cyan","orange","pink","teal"];
        let sw = `<div class="a11-fse-row" style="flex-wrap:wrap;gap:4px;">`;
        colors.forEach(c => {
            sw += `<span class="a11-fse-color-swatch${(config.color||'')===c?' selected':''}" data-color="${c}" style="background:${c||'#333'};" title="${c||'Default'}"></span>`;
        });
        sw += `</div>`;
        return `<div class="a11-fse-block"><div class="a11-fse-block-title">Color Accent</div>${sw}</div>
        <div class="a11-fse-block"><div class="a11-fse-block-title">Colors</div>
            ${inp("Background", config.customBg||"", "#1a202c","color")}
            ${inp("Border", config.borderCol||"", "#374151","color")}
            ${inp("Title Color", config.titleColor||"", "#ffffff","color")}
        </div>
        <div class="a11-fse-block"><div class="a11-fse-block-title">Spacing</div>
            ${inp("Padding (px)", config.padding||"", "8","number")}
            ${inp("Opacity", config.customOpacity!==undefined?config.customOpacity:"1.0", "1.0","number")}
            ${inp("Radius (px)", config.borderRadius||"", "0","number")}
        </div>`;
    }

    // ─── Tab: Styles (container appearance presets) ───
    function renderPresets() {
        const presets = filterStylePresets(state.settings.valuePresets?.containers);
        let html = `<div class="a11-fse-block">
            <div class="a11-fse-block-title">Save Container Style</div>
            <div class="a11-fse-row">
                <input class="a11-fse-input" id="fse-preset-name" placeholder="Style name" style="flex:1">
            </div>
            <div class="a11-fse-row">
                <input class="a11-fse-input" id="fse-preset-cat" placeholder="Category (e.g. My Styles)" style="flex:1" value="${config.presetCategory||''}">
            </div>
            <button class="a11-fse-btn primary" id="fse-preset-save" style="width:100%;margin-top:4px;">💾 Save Current Style</button>
        </div>`;

        html += `<div class="a11-fse-block"><div class="a11-fse-block-title">Saved Styles (${presets.length})</div>`;
        if (presets.length === 0) {
            html += `<div style="color:var(--a11-text-muted);text-align:center;padding:16px;">No styles saved yet.</div>`;
        } else {
            presets.forEach((p, i) => {
                html += `<div class="a11-fse-preset-item" data-pidx="${i}">
                    <span class="pi-name">${p.name}</span>
                    <span class="pi-cat">${p.category||''}</span>
                    <button class="a11-fse-btn fse-preset-apply" style="padding:2px 8px;font-size:10px;" data-pidx="${i}">Apply</button>
                    <button class="a11-fse-btn danger fse-preset-del" style="padding:2px 8px;font-size:10px;" data-pidx="${i}">✖</button>
                </div>`;
            });
        }
        html += `</div>`;
        return html;
    }

    // ─── Render body ───
    function refreshBody() {
        if (activeTab === "general") bodyEl.innerHTML = renderGeneral();
        else if (activeTab === "widgets") bodyEl.innerHTML = renderWidgets();
        else if (activeTab === "type") bodyEl.innerHTML = renderType();
        else if (activeTab === "style") bodyEl.innerHTML = renderStyle();
        else if (activeTab === "styles") bodyEl.innerHTML = renderPresets();
        bindLiveInputs();
        bindButtons();
        refreshPreview();
    }

    // ─── Live input binding (dynamic preview) ───
    function bindLiveInputs() {
        bodyEl.querySelectorAll(".fse-live").forEach(el => {
            if (el.dataset.bound) return;
            el.dataset.bound = "1";
            const handler = () => {
                const key = el.dataset.key;
                const detail = el.closest("#fse-widget-detail");

                if (detail) {
                    // Widget detail field
                    if (selectedWidgetIdx < 0) return;
                    const sw = config.widgets[selectedWidgetIdx];
                    if (!sw) return;
                    if (el.type === "checkbox") {
                        if (key === "Hide Label") sw.hideLabel = el.checked || undefined;
                        else if (key === "Read Only") sw.readOnly = el.checked || undefined;
                        else if (key === "Hidden") sw.hidden = el.checked || undefined;
                        else if (key === "Compact") sw.compact = el.checked || undefined;
                        else if (key === "No Slider") sw.hideSlider = el.checked || undefined;
                        else if (key === "No Number") sw.hideNumber = el.checked || undefined;
                        else if (key === "Multiline") sw.multiline = el.checked || undefined;
                        else if (key === "No Filter") sw.hideFilter = el.checked || undefined;
                        else if (key === "Auto Preview") sw.previewAuto = el.checked;
                        else if (key === "Spotlight (Hero)") sw.spotlight = el.checked || undefined;
                        else if (key === "Allow Custom") sw.allowCustom = el.checked || undefined;
                        else if (key === "Include Subcategories") sw.presetIncludeSubcategories = el.checked;
                        else if (key === "Show 🔖 Button") sw.showPresetBtn = el.checked;
                        else if (key === "Show Suggestions") { sw.showSuggestions = el.checked; refreshBody(); }
                    } else if (el.tagName === "SELECT") {
                        const v = el.value;
                        if (key === "Tab") sw.tab = v || undefined;
                        else if (key === "Section") sw.section = v || undefined;
                        else if (key === "Panel") sw.splitGroup = v || undefined;
                        else if (key === "Drawer") sw.drawer = v || undefined;
                        else if (key === "Overflow") sw.overflow = v;
                        else if (key === "Image Fit") sw.objectFit = v;
                        else if (key === "Text Align") sw.textAlign = v || undefined;
                        else if (key === "Thumb Size") sw.thumbSize = v || undefined;
                        else if (key === "Button Size") sw.btnSize = v || undefined;
                        else if (key === "Preset Category") { sw.presetCategory = v || undefined; refreshBody(); }
                    } else {
                        const v = el.value || undefined;
                        if (key === "Alias") sw.alias = v;
                        else if (key === "Width") sw.width = v;
                        else if (key === "Height") sw.customHeight = v;
                        else if (key === "Col Span") sw.colSpan = v!==undefined ? parseInt(v) : undefined;
                        else if (key === "Font Size") sw.fontSize = v;
                        else if (key === "Scale (%)") sw.customScale = v !== undefined ? parseFloat(v) : 100;
                        else if (key === "Decimals") sw.decimals = v;
                        else if (key === "Min") sw.min = v !== undefined ? parseFloat(v) : undefined;
                        else if (key === "Max") sw.max = v !== undefined ? parseFloat(v) : undefined;
                        else if (key === "Step") sw.step = v !== undefined ? parseFloat(v) : undefined;
                        else if (key === "Max Chars") sw.maxChars = v;
                        else if (key === "Accent Color") sw.buttonColor = v;
                        else if (key === "Label Color") sw.labelColor = v;
                        else if (key === "Step #") sw.stepIndex = v !== undefined ? parseFloat(v) : undefined;
                        else if (key === "X (%)") sw.x = v !== undefined ? parseFloat(v) : undefined;
                        else if (key === "Y (%)") sw.y = v !== undefined ? parseFloat(v) : undefined;
                        else if (key === "Preset Category") { sw.presetCategory = v || undefined; refreshBody(); }
                        else if (key === "Suggestions") sw.suggestions = v || undefined;
                    }
                } else {
                    // General/Type/Style field
                    if (el.type === "checkbox") {
                        if (key === "Hide Header") config.hideHeader = el.checked;
                        else if (key === "Hide Collapse") config.hideCollapse = el.checked;
                        else if (key === "Pinned") config.pinned = el.checked;
                                        else if (key === "Show Quick Save") config.showQuickSave = el.checked;
                                        else if (key === "Hide Edit Button") config.hideEditButton = el.checked;
                        else if (key === "Minimal Header") config.minimalHeader = el.checked;
                        else if (key === "Show Run-to-Node button") config.showRunToNodeBtn = el.checked;
                        else if (key === "Loop (wrap around)") config.stepsLoop = el.checked || undefined;
                        else if (key === "Smooth Scroll") config.scrollSmooth = el.checked;
                        else if (key === "Show header on hover") config.fabShowHeader = el.checked;
                        else if (key === "Compact mode") config.toolbarCompact = el.checked;
                        else if (key.startsWith("Drawer Open ")) {
                            config.openDrawers = config.openDrawers || {};
                            const dd = key.replace("Drawer Open ","");
                            config.openDrawers[dd] = el.checked || undefined;
                        }
                    } else if (el.tagName === "SELECT") {
                        const v = el.value;
                        if (key === "View") config.containerView = v;
                        else if (key === "Layout") config.layoutMode = v;
                        else if (key === "Density") config.widgetDensity = v;
                        else if (key === "Target Node") config.targetNodeId = v || undefined;
                        else if (key === "Type") {
                            const old = config.containerType;
                            config.containerType = v === "default" ? undefined : v;
                            if (v !== old) {
                                if (v !== "tabs") { delete config.tabs; delete config.activeTab; }
                                if (v !== "steps") { delete config.steps; delete config.activeStep; }
                                if (v !== "drawer") { delete config.openDrawers; }
                                if (v !== "split") { delete config.splitDirection; delete config.splitRatio; }
                                if (v !== "accordion") { delete config.sections; }
                                if (v !== "scroll") { delete config.scrollMaxHeight; delete config.scrollSmooth; }
                                if (v !== "freeform") { delete config.freeformMinHeight; delete config.freeformSnap; }
                                if (v !== "fab") delete config.fabShowHeader;
                                if (v !== "toolbar") delete config.toolbarCompact;
                                (config.widgets||[]).forEach(wRef => {
                                    if (v !== "tabs") delete wRef.tab;
                                    if (v !== "accordion") delete wRef.section;
                                    if (v !== "split") delete wRef.splitGroup;
                                    if (v !== "steps") delete wRef.stepIndex;
                                    if (v !== "drawer") delete wRef.drawer;
                                    if (v !== "spotlight") delete wRef.spotlight;
                                    if (v !== "freeform") { delete wRef.x; delete wRef.y; }
                                });
                            }
                            selectedWidgetIdx = -1;
                            refreshBody(); return;
                        } else if (key === "Direction") config.splitDirection = v;
                        else if (key === "Bypass") config.bypassMode = v === "default" ? undefined : v;
                        else if (key === "Checkbox Action") config.actionType = v;
                        else if (key === "Default Tab") config.activeTab = v || undefined;
                        else if (key === "Preset Category") config.presetCategory = v;
                    } else {
                        const v = el.value || undefined;
                        if (key === "Title") { config.title = v; panel.querySelector(".a11-fse-panel-title").innerText = "⚙ " + (config.title || "Container Editor"); }
                        else if (key === "Preset Category") config.presetCategory = v;
                        else if (key === "Ratio") config.splitRatio = v;
                        else if (key === "Max Height") config.scrollMaxHeight = v;
                        else if (key === "Min Height") config.freeformMinHeight = v;
                        else if (key === "Snap Grid (px)") config.freeformSnap = v!==undefined ? parseInt(v) : undefined;
                        else if (key === "Padding (px)") config.padding = v;
                        else if (key === "Opacity") config.customOpacity = v!==undefined ? parseFloat(v) : undefined;
                        else if (key === "Radius (px)") config.borderRadius = v;
                        else if (key === "Title Color") config.titleColor = v;
                        else if (key === "Background") config.customBg = v;
                        else if (key === "Border") config.borderCol = v;
                    }
                }
                applyAndPreview();
            };
            el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", handler);
        });

        // Type tab: save inputs on change (tab/section/step names)
        bodyEl.querySelectorAll(".a11-fse-row input.a11-fse-input").forEach(inpEl => {
            if (inpEl.dataset.boundType) return;
            if (!inpEl.closest("#fse-widget-detail") && !inpEl.classList.contains("fse-live")) {
                inpEl.dataset.boundType = "1";
                inpEl.addEventListener("input", () => {
                    const ct = getCT();
                    const row = inpEl.closest(".a11-fse-row");
                    const idxEl = row?.querySelector("[data-idx]");
                    const idx = idxEl ? parseInt(idxEl.dataset.idx) : -1;
                    if (ct === "tabs" && idx>=0 && config.tabs?.[idx]) config.tabs[idx].label = inpEl.value;
                    else if (ct === "accordion" && idx>=0 && config.sections?.[idx]) config.sections[idx].label = inpEl.value;
                    else if (ct === "steps" && idx>=0 && config.steps?.[idx]) config.steps[idx].label = inpEl.value;
                    applyAndPreview();
                });
            }
        });

        // Type tab: accordion collapsed checkboxes, tab active cbs
        bodyEl.querySelectorAll(".a11-fse-row input[type=checkbox]").forEach(chkEl => {
            if (chkEl.dataset.boundTypeCb) return;
            if (!chkEl.classList.contains("fse-live") && chkEl.closest(".a11-fse-row") && !chkEl.closest("#fse-widget-detail")) {
                chkEl.dataset.boundTypeCb = "1";
                chkEl.addEventListener("change", () => {
                    const ct = getCT();
                    const row = chkEl.closest(".a11-fse-row");
                    const idxEl = row?.querySelector("[data-idx]");
                    const idx = idxEl ? parseInt(idxEl.dataset.idx) : -1;
                    if (ct === "tabs" && idx>=0 && config.tabs?.[idx]) config.tabs[idx].enabled = chkEl.checked;
                    else if (ct === "accordion" && idx>=0 && config.sections?.[idx]) config.sections[idx].collapsed = chkEl.checked || undefined;
                    applyAndPreview();
                });
            }
        });
    }

    // ─── Buttons ───
    function bindButtons() {
        // Tabs
        panel.querySelectorAll(".a11-fse-tab").forEach(tab => {
            tab.onclick = () => {
                panel.querySelectorAll(".a11-fse-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                activeTab = tab.dataset.tab;
                selectedWidgetIdx = -1;
                refreshBody();
            };
        });

        panel.querySelector("#fse-close").onclick = closeEditor;

        const doneBtn = bodyEl.querySelector("#fse-done");
        if (doneBtn) doneBtn.onclick = closeEditor;

        const addW = bodyEl.querySelector("#fse-add-widget") || bodyEl.querySelector("#fse-add-widget2");
        if (addW) addW.onclick = (e) => {
            e.stopPropagation();
            const anchor = panel.querySelector(".a11-fse-panel-header");
            showWidgetPickerPopup(anchor, config, previewBox, () => {
                config.widgets = config.widgets || [];
                applyAndPreview();
                selectedWidgetIdx = -1;
                refreshBody();
            });
        };

        const rmBtn = bodyEl.querySelector("#fse-remove-container");
        if (rmBtn) rmBtn.onclick = () => {
            if (confirm("Remove this container?")) {
                overlay.remove();
                if (gridItem) state.grid.removeWidget(gridItem);
                updateGraphExtra(true);
                refreshContainerList();
            }
        };

        // Widget search filter
        const searchEl = bodyEl.querySelector("#fse-widget-search");
        if (searchEl && !searchEl.dataset.boundSearch) {
            searchEl.dataset.boundSearch = "1";
            searchEl.addEventListener("input", () => {
                const q = searchEl.value.toLowerCase();
                bodyEl.querySelectorAll(".a11-fse-widget-item").forEach(item => {
                    const name = item.querySelector(".wi-name")?.innerText?.toLowerCase() || "";
                    const type = item.querySelector(".wi-type")?.innerText?.toLowerCase() || "";
                    item.style.display = (!q || name.includes(q) || type.includes(q)) ? "" : "none";
                });
            });
        }

        // Widget list items (click to select, drag to reorder)
        bodyEl.querySelectorAll(".a11-fse-widget-item").forEach(item => {
            item.onclick = (ev) => {
                if (ev.target.classList.contains("wi-remove") || ev.target.classList.contains("wi-drag")) return;
                selectedWidgetIdx = parseInt(item.dataset.widx);
                refreshBody();
            };
            // Drag & drop (within same group for tabs/steps)
            item.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", item.dataset.widx);
                e.dataTransfer.setData("text/group", item.dataset.group || "all");
                item.style.opacity = "0.4";
            });
            item.addEventListener("dragend", (e) => {
                item.style.opacity = "";
                bodyEl.querySelectorAll(".a11-fse-widget-item").forEach(it => it.classList.remove("drag-over"));
            });
            item.addEventListener("dragover", (e) => {
                const fromGroup = (e.dataTransfer.types||[]).includes("text/group") ? "allow" : "allow"; // always allow visual
                e.preventDefault();
                item.classList.add("drag-over");
            });
            item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
            item.addEventListener("drop", (e) => {
                e.preventDefault();
                item.classList.remove("drag-over");
                const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
                const fromGroup = e.dataTransfer.getData("text/group") || "all";
                const toIdx = parseInt(item.dataset.widx);
                const toGroup = item.dataset.group || "all";
                if (fromGroup !== toGroup) return;
                if (fromIdx !== toIdx && !isNaN(fromIdx) && !isNaN(toIdx)) {
                    const moved = config.widgets.splice(fromIdx, 1)[0];
                    config.widgets.splice(toIdx, 0, moved);
                    if (selectedWidgetIdx === fromIdx) selectedWidgetIdx = toIdx;
                    else if (selectedWidgetIdx === toIdx) selectedWidgetIdx = fromIdx;
                    applyAndPreview();
                    refreshBody();
                }
            });
        });

        bodyEl.querySelectorAll(".wi-remove").forEach(btn => {
            btn.onclick = (ev) => {
                ev.stopPropagation();
                config.widgets.splice(parseInt(btn.dataset.rmidx), 1);
                selectedWidgetIdx = -1;
                applyAndPreview();
                refreshBody();
            };
        });

        const wRemove = bodyEl.querySelector("#fse-widget-remove");
        if (wRemove) wRemove.onclick = () => {
            if (selectedWidgetIdx >= 0) {
                config.widgets.splice(selectedWidgetIdx, 1);
                selectedWidgetIdx = -1;
                applyAndPreview();
                refreshBody();
            }
        };

        // Suggestion tags: click × to remove
        bodyEl.querySelectorAll('.a11-fse-tag-rm').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const val = btn.dataset.val;
                const inp = bodyEl.querySelector('[data-key="Suggestions"]');
                if (inp) {
                    const current = inp.value.split(',').map(s => s.trim()).filter(Boolean);
                    const updated = current.filter(v => v !== val);
                    inp.value = updated.join(', ');
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    refreshBody();
                }
            };
        });

        // Suggestion chips: click + to add from presets
        bodyEl.querySelectorAll('.a11-fse-chip').forEach(chip => {
            chip.onclick = (e) => {
                e.preventDefault();
                const val = chip.dataset.addsugg;
                const inp = bodyEl.querySelector('[data-key="Suggestions"]');
                if (inp) {
                    const current = inp.value.split(',').map(s => s.trim()).filter(Boolean);
                    if (!current.includes(val)) {
                        current.push(val);
                        inp.value = current.join(', ');
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        refreshBody();
                    }
                }
            };
        });

        // Color swatches
        bodyEl.querySelectorAll(".a11-fse-color-swatch").forEach(sw => {
            sw.onclick = () => {
                config.color = sw.dataset.color || undefined;
                if (config.color) { previewBox.setAttribute("data-color", config.color); domElement.setAttribute("data-color", config.color); }
                else { previewBox.removeAttribute("data-color"); domElement.removeAttribute("data-color"); }
                applyAndPreview();
                refreshBody();
            };
        });

        // Add tab/section/step
        ["tab","section","step"].forEach(kind => {
            const btn = bodyEl.querySelector(`#fse-add-${kind}`);
            if (btn) btn.onclick = () => {
                const arr = config[kind+"s"] || [];
                const item = { id: `${kind}_${Date.now()}`, label: `New ${kind}` };
                if (kind === "tab") item.enabled = true;
                if (kind === "section") item.collapsed = false;
                arr.push(item);
                config[kind+"s"] = arr;
                applyAndPreview();
                refreshBody();
            };
        });

        // Type remove buttons
        bodyEl.querySelectorAll(".fse-type-remove").forEach(btn => {
            btn.onclick = () => {
                const kind = btn.dataset.kind;
                const idx = parseInt(btn.dataset.idx);
                const arr = config[kind];
                if (arr && idx >= 0) arr.splice(idx, 1);
                applyAndPreview();
                refreshBody();
            };
        });

        // Save preset
        const savePresetBtn = bodyEl.querySelector("#fse-preset-save");
        if (savePresetBtn) savePresetBtn.onclick = () => {
            const nameEl = bodyEl.querySelector("#fse-preset-name");
            const catEl = bodyEl.querySelector("#fse-preset-cat");
            const name = (nameEl?.value||"").trim();
            if (!name) { alert("Enter a style name"); return; }
            const cat = (catEl?.value||"").trim() || "General";
            // Collect container config
            const cc = {};
            ["containerType","containerView","layoutMode","widgetDensity","color","padding","title","titleColor",
             "customBg","borderCol","customOpacity","borderRadius","minimalHeader","hideHeader","hideCollapse",
             "presetCategory","bypassMode","actionType"].forEach(k => { if(config[k]!==undefined) cc[k]=config[k]; });
            // Save widget sizing/styling overrides
            cc.widgetOverrides = (config.widgets||[]).map(w => ({
                nodeId: w.nodeId, widgetIndex: w.widgetIndex,
                alias: w.alias, width: w.width, customHeight: w.customHeight, fontSize: w.fontSize,
                hideLabel: w.hideLabel, readOnly: w.readOnly, hidden: w.hidden,
                labelColor: w.labelColor, buttonColor: w.buttonColor, textAlign: w.textAlign,
                customScale: w.customScale, overflow: w.overflow, objectFit: w.objectFit,
                previewAuto: w.previewAuto, thumbSize: w.thumbSize, colSpan: w.colSpan,
                decimals: w.decimals, compact: w.compact, min: w.min, max: w.max, step: w.step,
                hideSlider: w.hideSlider, hideNumber: w.hideNumber, multiline: w.multiline, maxChars: w.maxChars,
                hideFilter: w.hideFilter, allowCustom: w.allowCustom, btnSize: w.btnSize,
                tab: w.tab, section: w.section, splitGroup: w.splitGroup, stepIndex: w.stepIndex,
                drawer: w.drawer, spotlight: w.spotlight, x: w.x, y: w.y,
                presetCategory: w.presetCategory
            }));
            const preset = { id: `cs_${Date.now()}`, name, category: cat, containerConfig: cc, metadata: { source: "container_style" }, createdAt: Date.now(), modifiedAt: Date.now() };
            state.settings.valuePresets = state.settings.valuePresets || { containers: [] };
            state.settings.valuePresets.containers.push(preset);
            saveValuePresets().then(() => { alert(`Style "${name}" saved.`); refreshBody(); });
        };

        // Apply preset
        bodyEl.querySelectorAll(".fse-preset-apply").forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.pidx);
                const presets = state.settings.valuePresets?.containers || [];
                const p = presets[idx];
                if (!p?.containerConfig) return;
                const cc = p.containerConfig;
                // Apply container config
                Object.keys(cc).forEach(k => {
                    if (k === "widgetOverrides") return;
                    config[k] = cc[k];
                });
                // Apply widget overrides
                if (cc.widgetOverrides) {
                    cc.widgetOverrides.forEach(wo => {
                        let wRef = (config.widgets||[]).find(w => w.nodeId===wo.nodeId && w.widgetIndex===wo.widgetIndex);
                        if (wRef) Object.keys(wo).forEach(k => { if (wo[k]!==undefined) wRef[k]=wo[k]; });
                    });
                }
                applyAndPreview();
                refreshBody();
            };
        });

        // Delete preset
        bodyEl.querySelectorAll(".fse-preset-del").forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.pidx);
                const presets = state.settings.valuePresets?.containers || [];
                const p = presets[idx];
                if (p && confirm(`Delete preset "${p.name}"?`)) {
                    presets.splice(idx, 1);
                    saveValuePresets().then(() => refreshBody());
                }
            };
        });
    }

    function closeEditor() {
        if (!isStatic) {
            domElement.dataset.config = JSON.stringify(config);
        }
        overlay.remove();
        renderGridItemContent(domElement, config);
        updateGraphExtra(true);
    }

    document.addEventListener("keydown", function fseEsc(e) {
        if (e.key === "Escape") { closeEditor(); document.removeEventListener("keydown", fseEsc); }
    });

    refreshBody();
}

export function openGroupSettings() {
    const currentTab = state.appData.tabs[state.appData.activeIdx];
    const modal = document.createElement("div");
    modal.className = "a11-modal open";

    const activeGroups = currentTab.activeGroups || [];
    const groupAction = currentTab.groupActionType || 'bypass';
    const bgRun = currentTab.backgroundRun || false;
    const priority = currentTab.tabPriority || 0;
    const gridFloat = currentTab.gridFloat || false;

    let groupsHtml = "";
    if (!app.graph._groups || app.graph._groups.length === 0) {
        groupsHtml = "<div style='color:var(--a11-desc); padding:10px;'>No groups found in workflow.</div>";
    } else {
        app.graph._groups.forEach(g => {
            const checked = activeGroups.includes(g.title) ? "checked" : "";
            groupsHtml += `
                <div class="a11-group-item">
                    <input type="checkbox" class="ts-group-chk" value="${g.title}" ${checked}>
                    <span style="color:var(--a11-text); flex-grow:1;">${g.title}</span>
                    <button class="a11-btn ts-group-solo" data-val="${g.title}" style="font-size:10px;">Solo</button>
                </div>
            `;
        });
    }

    modal.innerHTML = `
        <div class="a11-modal-content" style="width:600px;">
            <div class="a11-modal-title">Tab Interactions & Groups</div>
            <div class="a11-modal-layout">
                <div class="a11-modal-sidebar">
                    <div class="a11-modal-tab active" data-target="tab-tm-groups">📦 Workflow Groups</div>
                    <div class="a11-modal-tab" data-target="tab-tm-linkage">🔗 Cross-Tab Linkage</div>
                    <div class="a11-modal-tab" data-target="tab-tm-grid">📐 Grid Physics</div>
                </div>

                <div class="a11-modal-content-area">

                    <div class="a11-modal-panel active" id="tab-tm-groups">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Workflow Behavior</div>
                            <div class="a11-setting-row column">
                                <label>Action when Group is disabled</label>
                                <select id="gm-action-type" style="width:100%">
                                    <option value="bypass" ${groupAction !== 'mute' ? 'selected' : ''}>Bypass (Pass-through)</option>
                                    <option value="mute" ${groupAction === 'mute' ? 'selected' : ''}>Mute (Disable nodes completely)</option>
                                </select>
                            </div>
                        </div>
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Active Groups (Checked = Active)</div>
                            <div style="max-height: 40vh; overflow-y: auto; padding-right:5px;">
                                ${groupsHtml}
                            </div>
                        </div>
                    </div>

                    <div class="a11-modal-panel" id="tab-tm-linkage">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Cross-Tab Linking</div>
                            <div class="a11-setting-row column">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="gm-bgrun" ${bgRun ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span><b>Enable Background Run</b><br><small style="color:var(--a11-desc); font-weight:normal; line-height:1.2;">Containers and Groups managed by this tab will affect the workflow even when you are on another tab. Perfect for global addons (ControlNet, LoRAs).</small></span>
                                </label>
                            </div>
                            <div class="a11-setting-row column" style="margin-top:10px;">
                                <label>Tab Priority Index</label>
                                <input type="number" id="gm-priority" value="${priority}" style="width:100%;">
                                <small style="color:var(--a11-desc);">If multiple tabs conflict over a node's state, the tab with the higher priority wins.</small>
                            </div>
                        </div>
                    </div>

                    <div class="a11-modal-panel" id="tab-tm-grid">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Container Displacement & Overlap</div>
                            <div class="a11-setting-row column">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="gm-float" ${gridFloat ? 'checked' : ''} style="width:18px; height:18px;">
                                    <span><b>Float Grid Elements</b><br><small style="color:var(--a11-desc); font-weight:normal; line-height:1.2;">If checked, elements stay exactly where placed. If unchecked, gravity pushes everything to the top (prevents overlapping and gaps when expanding containers).</small></span>
                                </label>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn" id="gm-cancel">Cancel</button>
                <button class="a11-btn active" id="gm-save">Save & Apply</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.a11-modal-tab').forEach(tab => {
        tab.onclick = () => {
            modal.querySelectorAll('.a11-modal-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.a11-modal-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            modal.querySelector('#' + tab.dataset.target).classList.add('active');
        };
    });

    modal.querySelectorAll('.ts-group-solo').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            currentTab.activeGroups = [btn.dataset.val];
            currentTab.groupActionType = modal.querySelector("#gm-action-type").value;
            currentTab.backgroundRun = modal.querySelector("#gm-bgrun").checked;
            currentTab.tabPriority = parseInt(modal.querySelector("#gm-priority").value) || 0;
            currentTab.gridFloat = modal.querySelector("#gm-float").checked;

            updateGraphExtra(true); applyGridState();
            if (state.grid) state.grid.float(currentTab.gridFloat);
            modal.remove();
        };
    });

    modal.querySelector("#gm-cancel").onclick = () => modal.remove();
    modal.querySelector("#gm-save").onclick = () => {
        currentTab.groupActionType = modal.querySelector("#gm-action-type").value;
        currentTab.backgroundRun = modal.querySelector("#gm-bgrun").checked;
        currentTab.tabPriority = parseInt(modal.querySelector("#gm-priority").value) || 0;
        currentTab.gridFloat = modal.querySelector("#gm-float").checked;

        const inputs = modal.querySelectorAll(".ts-group-chk:checked");
        currentTab.activeGroups = Array.from(inputs).map(inp => inp.value);

        updateGraphExtra(true); applyGridState();
        if (state.grid) state.grid.float(currentTab.gridFloat);
        modal.remove();
    };
}

export function addGridItem(config, gsOptions = {}) {
    const id = "gw_" + Date.now() + Math.random();
    if (!config.widgets) config.widgets = [];

    const wrapper = document.createElement('div');
    wrapper.className = 'grid-stack-item';
    wrapper.setAttribute('gs-id', id);

    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    content.dataset.config = JSON.stringify(config);
    wrapper.appendChild(content);

    renderGridItemContent(content, config);

    const el = state.grid.addWidget(wrapper, { w: 4, h: config.collapsed ? 1 : (config.lastH || 4), id: id, ...gsOptions });

    const updatedContent = el.querySelector('.grid-stack-item-content');
    updatedContent.onclick = (e) => {
        if (!state.isEditMode) return;
        const gsId = el.getAttribute("gs-id");

        if (e.shiftKey) {
            // Multi-select toggle
            e.stopPropagation();
            if (multiSelectedIds.has(gsId)) {
                multiSelectedIds.delete(gsId);
                updatedContent.classList.remove("multi-selected");
            } else {
                multiSelectedIds.add(gsId);
                updatedContent.classList.add("multi-selected");
            }
            updateMultiSelectUI();
            return;
        }

        // Clear multi-selection on normal click
        if (!e.shiftKey && multiSelectedIds.size > 0) {
            clearMultiSelection();
        }

        document.querySelectorAll(".grid-stack-item-content").forEach(e => e.classList.remove("active-target"));
        updatedContent.classList.add("active-target");
        const sel = document.getElementById("sel-target-container");
        if (sel) sel.value = gsId;

        // Show floating appearance panel
        showFloatingAppearance(config, updatedContent);
    };

    // Context menu (right-click)
    el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const conf = JSON.parse(updatedContent.dataset.config || "{}");
        import("./contextMenu.js").then(m => m.showContainerContextMenu(e, el, conf));
    });

    if (config.pinned) state.grid.update(el, { noMove: true, noResize: true, locked: false });

    updateGraphExtra(true);
    return updatedContent;
}

// ─── Multi-selection & Floating Appearance ───

export function clearMultiSelection() {
    multiSelectedIds.forEach(gsId => {
        const el = document.querySelector(`.grid-stack-item[gs-id="${gsId}"] .grid-stack-item-content`);
        if (el) el.classList.remove("multi-selected");
    });
    multiSelectedIds.clear();
    updateMultiSelectUI();
}

function updateMultiSelectUI() {
    const countEl = document.getElementById("a11-multi-count");
    const actionsEl = document.getElementById("a11-multi-actions");
    if (countEl) countEl.innerText = multiSelectedIds.size > 0 ? `${multiSelectedIds.size} selected` : "";
    if (actionsEl) actionsEl.style.display = multiSelectedIds.size > 0 ? "flex" : "none";
}

export function getMultiSelectedConfigs() {
    const configs = [];
    multiSelectedIds.forEach(gsId => {
        const el = document.querySelector(`.grid-stack-item[gs-id="${gsId}"] .grid-stack-item-content`);
        if (el) {
            try { configs.push({ el, config: JSON.parse(el.dataset.config || "{}"), gsId }); } catch (e) { }
        }
    });
    return configs;
}

export function deleteMultiSelected() {
    if (multiSelectedIds.size === 0) return;
    if (!state.settings.confirmActions || confirm(`Delete ${multiSelectedIds.size} selected containers?`)) {
        const tab = state.appData.tabs[state.appData.activeIdx];
        multiSelectedIds.forEach(gsId => {
            const gridItem = document.querySelector(`.grid-stack-item[gs-id="${gsId}"]`);
            if (gridItem) {
                const content = gridItem.querySelector(".grid-stack-item-content");
                if (content) {
                    try {
                        const config = JSON.parse(content.dataset.config || "{}");
                        const idx = tab.layout.findIndex(li => li.config === config);
                        if (idx > -1) tab.layout.splice(idx, 1);
                    } catch (e) { }
                }
                state.grid.removeWidget(gridItem);
            }
        });
        multiSelectedIds.clear();
        updateMultiSelectUI();
        updateGraphExtra(true);
        refreshContainerList();
    }
}

export function duplicateMultiSelected() {
    const configs = getMultiSelectedConfigs();
    const tab = state.appData.tabs[state.appData.activeIdx];
    configs.forEach(({ config }) => {
        const newConfig = JSON.parse(JSON.stringify(config));
        newConfig.title = (config.title || "Container") + " (Copy)";
        tab.layout.push(newConfig);
        addGridItem(newConfig);
    });
    clearMultiSelection();
}

function showFloatingAppearance(config, domElement) {
    if (!state.isEditMode) return;
    let panel = document.getElementById("a11-floating-appearance");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "a11-floating-appearance";
        panel.className = "a11-floating-appearance";
        document.body.appendChild(panel);
    }

    // Build panel content
    const currentView = config.containerView || "card";
    const currentDensity = config.widgetDensity || "normal";
    const currentColor = config.color || "";

    panel.innerHTML = `
        <div class="fl-group">
            <span class="fl-label">View</span>
            ${Object.entries(CONTAINER_VIEWS).map(([k]) =>
                `<button class="fl-view-btn ${k === currentView ? 'active' : ''}" data-view="${k}" title="${CONTAINER_VIEWS[k]}">${getViewIcon(k)}</button>`
            ).join('')}
        </div>
        <div class="fl-divider"></div>
        <div class="fl-group">
            <span class="fl-label">Density</span>
            <input type="range" class="fl-density-slider" min="0" max="4" value="${Object.keys(DENSITY_MODES).indexOf(currentDensity)}" title="${currentDensity}">
        </div>
        <div class="fl-divider"></div>
        <div class="fl-group">
            <span class="fl-label">Color</span>
            ${["", "red", "green", "blue", "yellow", "purple", "cyan"].map(c =>
                `<span class="fl-color-dot ${c === currentColor ? 'active' : ''}" data-color="${c}" style="background-color:${c || '#333'}; color:${c || '#333'};"></span>`
            ).join('')}
        </div>
    `;

    panel.classList.add("visible");

    // Event handlers
    panel.querySelectorAll(".fl-view-btn").forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            config.containerView = btn.dataset.view;
            renderGridItemContent(domElement, config);
            saveConfig(domElement, config);
            showFloatingAppearance(config, domElement);
        };
    });

    const densitySlider = panel.querySelector(".fl-density-slider");
    if (densitySlider) {
        densitySlider.oninput = () => {
            const keys = Object.keys(DENSITY_MODES);
            config.widgetDensity = keys[parseInt(densitySlider.value)];
            renderGridItemContent(domElement, config);
            saveConfig(domElement, config);
        };
    }

    panel.querySelectorAll(".fl-color-dot").forEach(dot => {
        dot.onclick = (e) => {
            e.stopPropagation();
            config.color = dot.dataset.color;
            if (config.color) domElement.setAttribute("data-color", config.color);
            else domElement.removeAttribute("data-color");
            saveConfig(domElement, config);
            showFloatingAppearance(config, domElement);
        };
    });

    // Auto-hide after 4s of inactivity
    clearTimeout(panel._hideTimeout);
    panel._hideTimeout = setTimeout(() => {
        panel.classList.remove("visible");
    }, 4000);
}

function getViewIcon(view) {
    const icons = {
        "card": "▣", "flat": "□", "outlined": "▢", "glass": "◇",
        "clean": "○", "minimal": "|", "bordered": "▤", "soft": "◈"
    };
    return icons[view] || "▣";
}

function saveConfig(domElement, config) {
    if (!domElement.classList.contains("is-static-container")) {
        domElement.dataset.config = JSON.stringify(config);
    }
    updateGraphExtra(true);
}

function showWidgetPickerPopup(anchorEl, config, domElement, saveAndRefresh) {
    // Remove existing picker
    const existing = document.querySelector(".gw-widget-picker");
    if (existing) existing.remove();

    const picker = document.createElement("div");
    picker.className = "gw-widget-picker";
    picker.style.cssText = `
        position: fixed;
        background: var(--a11-menu, #2a2a2a);
        border: 1px solid var(--a11-border, #454545);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        z-index: 100001;
        width: 280px;
        max-height: 360px;
        display: flex;
        flex-direction: column;
        font-family: var(--a11-font);
        font-size: 12px;
    `;

    // Search input
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search widgets...";
    searchInput.style.cssText = `
        width: 100%;
        border: none;
        border-bottom: 1px solid var(--a11-border);
        background: var(--a11-input, #222);
        color: var(--a11-text);
        padding: 8px 10px;
        border-radius: 8px 8px 0 0;
        font-size: 12px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
    `;

    // Results list
    const list = document.createElement("div");
    list.style.cssText = `
        overflow-y: auto;
        flex: 1;
        max-height: 300px;
    `;

    picker.appendChild(searchInput);
    picker.appendChild(list);
    document.body.appendChild(picker);

    // Position near anchor
    const anchorRect = anchorEl.getBoundingClientRect();
    picker.style.top = (anchorRect.bottom + 4) + "px";
    picker.style.left = Math.min(anchorRect.left, window.innerWidth - 300) + "px";

    // Fix if off-screen
    requestAnimationFrame(() => {
        const r = picker.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 8) picker.style.top = (anchorRect.top - r.height - 4) + "px";
        if (r.right > window.innerWidth - 8) picker.style.left = (window.innerWidth - r.width - 8) + "px";
    });

    // Collect available widgets
    const existingKeys = new Set((config.widgets || []).map(w => `${w.nodeId}_${w.widgetIndex}`));

    function buildWidgetList(filter = "") {
        list.innerHTML = "";
        const results = [];
        const nodes = app.graph._nodes || [];

        nodes.forEach(node => {
            if (!node.widgets) return;
            node.widgets.forEach((w, wi) => {
                const key = `${node.id}_${wi}`;
                if (existingKeys.has(key)) return;
                const label = w.name || `widget_${wi}`;
                const nodeTitle = node.title || node.type || `Node #${node.id}`;
                const searchStr = `${nodeTitle} ${label}`.toLowerCase();
                if (filter && !searchStr.includes(filter.toLowerCase())) return;
                results.push({ node, widget: w, widgetIndex: wi, key, label, nodeTitle });
            });
            // Preview image
            if (node.type && (node.type.toLowerCase().includes("preview") || node.type.toLowerCase().includes("save"))) {
                const key = `${node.id}__preview__`;
                if (!existingKeys.has(key)) {
                    const searchStr = `${node.title || node.type} preview`.toLowerCase();
                    if (!filter || searchStr.includes(filter.toLowerCase())) {
                        results.push({ node, widget: null, widgetIndex: "__preview__", key, label: "Output Preview", nodeTitle: node.title || node.type });
                    }
                }
            }
        });

        results.sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle) || a.label.localeCompare(b.label));

        if (results.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "padding:12px; color:var(--a11-text-muted); text-align:center;";
            empty.innerText = filter ? "No matching widgets" : "All widgets already added";
            list.appendChild(empty);
            return;
        }

        results.forEach(r => {
            const item = document.createElement("div");
            item.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                cursor: pointer;
                transition: background 0.1s;
            `;
            item.addEventListener("mouseenter", () => item.style.background = "var(--a11-hover, #4a4a4a)");
            item.addEventListener("mouseleave", () => item.style.background = "");

            const nameSpan = document.createElement("span");
            nameSpan.style.cssText = "flex:1; font-weight:500;";
            nameSpan.innerText = r.label;

            const nodeSpan = document.createElement("span");
            nodeSpan.style.cssText = "font-size:10px; color:var(--a11-text-muted); max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
            nodeSpan.innerText = r.nodeTitle;
            nodeSpan.title = r.nodeTitle;

            item.appendChild(nameSpan);
            item.appendChild(nodeSpan);

            item.onclick = () => {
                const wRef = { nodeId: r.node.id, widgetIndex: r.widgetIndex, nodeType: r.node.type, name: r.label };
                if (!config.widgets) config.widgets = [];
                config.widgets.push(wRef);
                renderGridItemContent(domElement, config);
                saveAndRefresh();
                picker.remove();
            };

            list.appendChild(item);
        });
    }

    buildWidgetList();
    searchInput.oninput = () => buildWidgetList(searchInput.value);
    searchInput.focus();

    // Close handlers
    const closePicker = (e) => {
        if (!picker.contains(e.target) && e.target !== anchorEl) {
            picker.remove();
            document.removeEventListener("mousedown", closePicker);
            document.removeEventListener("keydown", onKey);
        }
    };
    const onKey = (e) => {
        if (e.key === "Escape") { picker.remove(); document.removeEventListener("mousedown", closePicker); document.removeEventListener("keydown", onKey); }
    };
    setTimeout(() => {
        document.addEventListener("mousedown", closePicker);
        document.addEventListener("keydown", onKey);
    }, 50);
}

function setupSplitDividerDrag(divider, body, config, splitLeft, saveAndRefresh) {
    let dragging = false;
    divider.addEventListener("mousedown", (e) => {
        if (!state.isEditMode) return;
        dragging = true;
        divider.classList.add("dragging");
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const containerRect = body.getBoundingClientRect();
        let ratio;
        if (config.splitDirection === "vertical") {
            ratio = ((e.clientY - containerRect.top) / containerRect.height) * 100;
        } else {
            ratio = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        }
        ratio = Math.max(20, Math.min(80, ratio));
        config.splitRatio = Math.round(ratio);
        splitLeft.style.flex = `${config.splitRatio} 1 0%`;
    });
    document.addEventListener("mouseup", () => {
        if (dragging) {
            dragging = false;
            divider.classList.remove("dragging");
            saveAndRefresh();
        }
    });
}

export function refreshActiveItem() {
    const sel = document.getElementById("sel-target-container");
    if (!sel || !sel.value) return;
    const gridItem = document.querySelector(`.grid-stack-item[gs-id="${sel.value}"]`);
    if (gridItem) { const content = gridItem.querySelector(".grid-stack-item-content"); const config = JSON.parse(content.dataset.config); renderGridItemContent(content, config); updateGraphExtra(true); }
}
