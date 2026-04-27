import { app } from "../../scripts/app.js";
import { state, applyValuePreset, saveValuePresets, broadcastWidgetUpdate } from "./state.js";
import { createWidgetDOM } from "./widgets.js";
import { openPresetManagerModal } from "./widgets/PresetManagerUI.js";
import {
    sortPresets,
    getUniqueCategories,
    filterPresetsBySearch,
    PRESET_CATEGORIES,
    DEFAULT_SORT_ORDER,
    createContainerPreset,
    validateContainerPreset,
    CONTAINER_TYPES
} from "./presetManager.js";
import { 
    createSpecialContainer,
    createVirtualWidget,
    SPECIAL_CONTAINER_TYPES,
    SPECIAL_WIDGET_TYPES,
    serializeSpecialContainer,
    validateSpecialContainer,
    syncVirtualWidget,
    connectVirtualWidget,
    disconnectVirtualWidget,
    startAutoSync,
    stopAutoSync,
    virtualWidgetStates
} from "./specialContainers.js";
import { openSpecialContainerEditor } from "./specialContainerEditor.js";
import { createVirtualWidgetDOM, applySpecialContainerLayout } from "./virtualWidgets.js";

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

    // Для каждого значения в пресете
    presetValues.forEach(sv => {
        // Ищем ВСЕ виджеты этого типа в контейнере
        config.widgets.forEach(wRef => {
            const node = app.graph.getNodeById(wRef.nodeId);
            if (!node?.widgets) return;

            // Находим виджет в ноде по имени
            const widget = node.widgets.find(w => w.name === sv.widgetName);
            if (!widget) return;

            // Проверяем что тип ноды совпадает
            if (node.type !== sv.nodeType) return;

            // Применяем значение если оно изменилось
            if (widget.value === sv.value) {
                skipped++;
                return;
            }

            const oldValue = widget.value;
            widget.value = sv.value;

            if (widget.callback) {
                try {
                    widget.callback(sv.value);
                } catch (e) {
                    console.error(`[Preset] Callback error:`, e);
                }
            }

            // Транслируем обновление
            const wIndex = node.widgets.indexOf(widget);
            broadcastWidgetUpdate(node.id, wIndex, sv.value);

            applied++;
        });
    });

    console.log(`[Preset Container] "${presetName}": ✅ ${applied} applied, ⏭️ ${skipped} skipped`);

    if (app.canvas && app.canvas.parentNode) {
        app.graph.setDirtyCanvas(true, true);
    }
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
            wType = "custom_dom";
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
                        ${isText || isImage || isCustomDom ? `<div class="wo-col"><label>Height (px, auto, %)</label><input type="text" id="sw-height" value="${wRef.customHeight || ''}" placeholder="auto, 100%, 250"></div>` : '<div class="wo-col"></div>'}
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

function openContainerValuePresets(config, domElement) {
    const modal = document.createElement("div");
    modal.className = "a11-modal open";
    const currentTab = state.appData.tabs[state.appData.activeIdx];
    const defaultCat = config.presetCategory || currentTab.presetCategory || "General";

    const updateSelectOptions = () => {
        const filterCat = modal.querySelector("#pm-cat-filter").value;
        const sel = modal.querySelector("#pm-preset-select");
        sel.innerHTML = "";

        let allPresets = state.settings.valuePresets.containers || [];

        allPresets = sortPresets(allPresets, DEFAULT_SORT_ORDER);

        const filteredPresets = filterCat === "ALL"
            ? allPresets
            : allPresets.filter(p => (p.category || PRESET_CATEGORIES.GENERAL) === filterCat);

        filteredPresets.forEach((p, i) => {
            const originalIndex = (state.settings.valuePresets.containers || []).findIndex(ap => ap.id === p.id);
            sel.innerHTML += `<option value="${originalIndex}">${p.name}[${p.category || PRESET_CATEGORIES.GENERAL}]</option>`;
        });
    };

    const renderModalInner = () => {
        const allCats = getUniqueCategories(state.settings.valuePresets.containers || []);
        if (!allCats.includes(defaultCat)) allCats.push(defaultCat);

        let catOptions = `<option value="ALL">-- All Categories --</option>`;
        allCats.forEach(c => { catOptions += `<option value="${c}" ${c === defaultCat ? 'selected' : ''}>${c}</option>`; });

        let widgetChecklistHtml = '';
        config.widgets.forEach((wRef, i) => {
            if (wRef.widgetIndex === "__preview__") return;
            const node = app.graph.getNodeById(wRef.nodeId);
            if (!node || !node.widgets) return;

            let widget = node.widgets[wRef.widgetIndex];
            if (!widget || widget.name !== wRef.name) {
                widget = node.widgets.find(x => x.name === wRef.name) || node.widgets[wRef.widgetIndex];
            }
            if (!widget) return;

            let wName = widget.name || "Unknown";
            let displayName = wRef.alias || wName;

            widgetChecklistHtml += `
                <div class="pm-w-item">
                    <label>
                        <span style="font-weight:500;">${displayName}</span>
                        <span style="opacity:0.5; font-size:9px; margin-left:6px;">(${wName})</span>
                    </label>
                    <input type="checkbox" class="pm-w-chk" value="${i}" checked style="width:auto; margin:0 0 0 8px;">
                </div>`;
        });

        if (!widgetChecklistHtml) widgetChecklistHtml = `<div style="color:var(--a11-desc); font-size:11px; padding:8px;">No valid widgets to save.</div>`;

        modal.innerHTML = `
            <div class="a11-modal-content" style="width:650px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
                <div class="a11-modal-title">📦 Container Value Presets</div>
                <div class="a11-modal-layout" style="flex:1; overflow:hidden;">
                    <div class="a11-modal-sidebar">
                        <div class="a11-modal-tab active" data-target="pm-apply-tab">📥 Apply Preset</div>
                        <div class="a11-modal-tab" data-target="pm-save-tab">💾 Save New Preset</div>
                    </div>
                    <div class="a11-modal-content-area" style="overflow-y:auto; padding:15px;">
                        
                        <div class="a11-modal-panel active" id="pm-apply-tab">
                            <div class="a11-settings-block">
                                <div class="a11-settings-title">Apply Preset</div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none;">
                                    <label>Filter Category</label>
                                    <select id="pm-cat-filter" style="width:100%">${catOptions}</select>
                                </div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none; margin-top:10px;">
                                    <label>Select Preset</label>
                                    <select id="pm-preset-select" style="width:100%;"></select>
                                </div>
                                <button id="pm-apply" class="a11-btn active" style="margin-top:12px; width:100%;">✅ Apply Selected Preset</button>
                                <button id="pm-delete" class="a11-btn danger" style="margin-top:8px; width:100%;">🗑️ Delete Selected Preset</button>
                            </div>
                        </div>
                        
                        <div class="a11-modal-panel" id="pm-save-tab">
                            <div class="a11-settings-block">
                                <div class="a11-settings-title">Save New Preset</div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none;">
                                    <label>Preset Name</label>
                                    <input type="text" id="pm-new-name" placeholder="My Preset" style="width:100%;">
                                </div>
                                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none; margin-top:10px;">
                                    <label>Category</label>
                                    <input type="text" id="pm-new-cat" value="${defaultCat}" placeholder="General" style="width:100%;">
                                </div>
                            </div>
                            <div class="a11-settings-block">
                                <div class="a11-settings-title">Select Widgets to Include</div>
                                <small style="color:var(--a11-desc); display:block; margin-bottom:8px;">Choose which widgets should be saved in this preset</small>
                                <div class="a11-wo-grid" style="max-height:250px; overflow-y:auto; padding-right:5px;">
                                    ${widgetChecklistHtml}
                                </div>
                                <button id="pm-save" class="a11-btn active" style="margin-top:12px; width:100%;">💾 Save Preset</button>
                            </div>
                        </div>
                        
                    </div>
                </div>
                <div class="a11-modal-footer">
                    <button class="a11-btn" id="pm-close">Close</button>
                </div>
            </div>
        `;

        updateSelectOptions();
        modal.querySelector("#pm-cat-filter").onchange = updateSelectOptions;

        // Tab switching logic
        modal.querySelectorAll('.a11-modal-tab').forEach(tab => {
            tab.onclick = () => {
                modal.querySelectorAll('.a11-modal-tab').forEach(t => t.classList.remove('active'));
                modal.querySelectorAll('.a11-modal-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                modal.querySelector('#' + tab.dataset.target).classList.add('active');
            };
        });

        modal.querySelector("#pm-apply").onclick = () => {
            const idx = modal.querySelector("#pm-preset-select").value;
            if (idx !== "") applyPresetToContainer(config, state.settings.valuePresets.containers[idx].values, state.settings.valuePresets.containers[idx].name);
        };

        modal.querySelector("#pm-delete").onclick = () => {
            const idx = modal.querySelector("#pm-preset-select").value;
            if (idx !== "" && confirm("Delete this container value preset?")) {
                state.settings.valuePresets.containers.splice(idx, 1);
                saveValuePresets(); renderModalInner();
            }
        };

        modal.querySelector("#pm-save").onclick = () => {
            const name = modal.querySelector("#pm-new-name").value.trim();
            const cat = modal.querySelector("#pm-new-cat").value.trim() || "General";
            if (!name) return alert("Enter preset name.");

            const currentValues = [];
            const checkedBoxes = modal.querySelectorAll(".pm-w-chk:checked");

            checkedBoxes.forEach(cb => {
                const idx = cb.value;
                const wRef = config.widgets[idx];
                const node = app.graph.getNodeById(wRef.nodeId);
                if (node && node.widgets) {
                    let widget = node.widgets[wRef.widgetIndex];
                    if (!widget || widget.name !== wRef.name) widget = node.widgets.find(x => x.name === wRef.name) || node.widgets[wRef.widgetIndex];
                    if (widget) currentValues.push({ nodeTitle: node.title, nodeType: node.type, widgetName: widget.name, value: widget.value });
                }
            });

            if (currentValues.length === 0) return alert("Select at least one widget to save.");

            try {
                const newPreset = createContainerPreset(name, cat, currentValues);
                state.settings.valuePresets.containers.push(newPreset);
                saveValuePresets();
                renderModalInner();
                alert(`Preset "${name}" saved successfully!`);
            } catch (e) {
                alert(`Error saving preset: ${e.message}`);
            }
        };

        modal.querySelector("#pm-close").onclick = () => {
            modal.remove();
            renderGridItemContent(domElement, config);
        };
    };

    renderModalInner();
    document.body.appendChild(modal);
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

    if (widgets.length === 0 && !state.isEditMode) { panel.style.display = "none"; return; }
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
    if (state.grid) {
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
        if (state.grid && state.appData.activeIdx >= 0 && state.appData.activeIdx < state.appData.tabs.length) {
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
        margin: state.settings.gridMargin !== undefined ? state.settings.gridMargin : 5,
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
        const isSpecialContainer = config.containerType === CONTAINER_TYPES.SPECIAL;
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
            if (!isSpecialContainer) {
                el.classList.add("is-bypassed");
            }
            if (bypassBox && !isSpecialContainer) {
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
            if (bypassBox && !isSpecialContainer) {
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

    domElement.className = "grid-stack-item-content";
    if (isStatic) domElement.classList.add("is-static-container");
    if (config.collapsed) domElement.classList.add("collapsed");

    domElement.classList.add(`gw-view-${config.containerView}`);

    // Apply seamless mode override from global settings
    const isSeamless = state.settings.seamlessMode === true;
    
    if (config.customBg && config.containerView !== 'glass' && config.containerView !== 'clean') domElement.style.backgroundColor = config.customBg;
    else domElement.style.backgroundColor = '';
    domElement.style.opacity = config.customOpacity || 1.0;
    
    // Only apply border settings if not in seamless mode (global overrides local)
    if (!isSeamless) {
        if (config.borderCol) domElement.style.borderColor = config.borderCol;
        if (config.borderRadius !== undefined && config.borderRadius !== "") domElement.style.borderRadius = config.borderRadius + "px";
    } else {
        // In seamless mode, remove borders visually
        domElement.style.borderColor = 'transparent';
        domElement.style.borderRadius = '0';
        domElement.style.boxShadow = 'none';
    }

    if (config.minimalHeader) domElement.classList.add("minimal-header");
    if (config.color) domElement.setAttribute("data-color", config.color);
    else domElement.removeAttribute("data-color");

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
    }
    body.className = `gw-body layout-${activeLayout} gw-density-${config.widgetDensity}`;
    // Don't clear innerHTML - use incremental rendering instead to prevent animation twitching
    // Only remove widgets that are no longer in the config (handled later in the render logic)
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

    if (!config.pinned && !isStatic && bypassMode !== "graph" && config.containerType !== CONTAINER_TYPES.SPECIAL) {
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

    const containerPresets = state.settings.valuePresets?.containers || [];
    const currentTab = state.appData.tabs[state.appData.activeIdx] || {};
    const myCat = config.presetCategory || currentTab.presetCategory || "General";

    let availablePresets = filterPresetsBySearch(
        containerPresets.filter(p => (p.category || PRESET_CATEGORIES.GENERAL) === myCat),
        ""
    );

    availablePresets = sortPresets(availablePresets, DEFAULT_SORT_ORDER);

    if (availablePresets.length > 0) {
        const quickSel = document.createElement("select");
        quickSel.className = "gw-quick-preset-select";
        quickSel.title = "Apply Preset";
        
        // Group presets by category for better organization
        const presetsByCategory = {};
        availablePresets.forEach(p => {
            const cat = p.category || PRESET_CATEGORIES.GENERAL;
            if (!presetsByCategory[cat]) presetsByCategory[cat] = [];
            presetsByCategory[cat].push(p);
        });
        
        let optionsHtml = `<option value="">🔖 Preset...</option>`;
        Object.keys(presetsByCategory).sort().forEach(cat => {
            const catPresets = presetsByCategory[cat];
            if (catPresets.length > 0) {
                if (Object.keys(presetsByCategory).length > 1) {
                    optionsHtml += `<optgroup label="${cat}">`;
                }
                catPresets.forEach(p => {
                    optionsHtml += `<option value="${p.id}">${p.name}</option>`;
                });
                if (Object.keys(presetsByCategory).length > 1) {
                    optionsHtml += `</optgroup>`;
                }
            }
        });
        
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

    if (state.isEditMode) {
        // Кнопка Container Presets - управление пресетами конкретного контейнера
        const containerPresetBtn = document.createElement("span");
        containerPresetBtn.className = "gw-preset-btn";
        containerPresetBtn.innerText = "📦";
        containerPresetBtn.title = "Container Presets";
        containerPresetBtn.onclick = (e) => {
            e.stopPropagation();
            openContainerValuePresets(config, domElement);
        };
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

        const gearBtn = document.createElement("span"); gearBtn.className = "gw-icon-btn"; gearBtn.innerText = "⚙";
        gearBtn.onclick = (e) => { 
            e.stopPropagation(); 
            // Check if this is a special container
            if (config.containerType === CONTAINER_TYPES.SPECIAL) {
                openSpecialContainerSettings(config, domElement);
            } else {
                openContainerSettings(config, domElement); 
            }
        };
        controlsDiv.appendChild(gearBtn);
    }

    const colorBtn = document.createElement("span"); colorBtn.className = "gw-icon-btn gw-drag-handle-icon"; colorBtn.innerText = "🎨";
    const palette = document.createElement("div"); palette.className = "gw-palette";["", "red", "green", "blue", "yellow", "purple", "cyan"].forEach(c => {
        const swatch = document.createElement("div"); swatch.className = "gw-swatch"; swatch.style.backgroundColor = c === "" ? "#333" : c;
        swatch.onclick = (e) => { e.stopPropagation(); config.color = c; if (c) domElement.setAttribute("data-color", c); else domElement.removeAttribute("data-color"); saveAndRefresh(); palette.classList.remove("visible"); };
        palette.appendChild(swatch);
    });
    colorBtn.onclick = (e) => { e.stopPropagation(); palette.classList.toggle("visible"); };
    controlsDiv.appendChild(colorBtn); colorBtn.appendChild(palette);

    if (!isStatic) {
        const pinBtn = document.createElement("span"); pinBtn.className = `gw-pin-btn gw-drag-handle-icon ${config.pinned ? 'pinned' : ''}`; pinBtn.innerText = config.pinned ? "📌" : "⚓";
        pinBtn.onclick = (e) => { e.stopPropagation(); togglePin(domElement.closest(".grid-stack-item"), pinBtn, config, domElement); };
        const closeBtn = document.createElement("span"); closeBtn.className = "gw-close-btn gw-drag-handle-icon"; closeBtn.innerText = "✖";
        closeBtn.onclick = (e) => { e.stopPropagation(); if (confirm("Remove Container?")) { state.grid.removeWidget(domElement.closest(".grid-stack-item")); updateGraphExtra(true); refreshContainerList(); } };
        controlsDiv.appendChild(pinBtn); controlsDiv.appendChild(closeBtn);
    }

    bar.appendChild(titleSpan); bar.appendChild(controlsDiv);

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
        // === ИНКРЕМЕНТАЛЬНЫЙ РЕНДЕРИНГ ===
        // Собираем существующие виджеты для сравнения
        const existingWidgets = new Map();
        body.querySelectorAll('.gw-widget-wrapper').forEach(el => {
            const key = el.dataset.widgetKey || el.dataset.virtualWidgetId; // Support both real and virtual widgets
            if (key) {
                existingWidgets.set(key, el);
            }
        });

        const newWidgetKeys = new Set();

        // Render real widgets from config.widgets
        config.widgets.forEach(wRef => {
            if (wRef.hidden) return;
            const node = app.graph.getNodeById(wRef.nodeId);
            if (!node) return;

            const widgetKey = `${wRef.nodeId}_${wRef.widgetIndex}`;
            newWidgetKeys.add(widgetKey);

            const options = { ...wRef, onResize: (newHeight) => { wRef.customHeight = newHeight; saveAndRefresh(); } };
            let generatedWrapper = null;

            // Проверяем есть ли уже этот виджет
            if (existingWidgets.has(widgetKey)) {
                // ✅ Виджет уже существует — обновляем только стили и конфигурацию
                generatedWrapper = existingWidgets.get(widgetKey);
                updateWidgetWrapperStyles(generatedWrapper, wRef, options);
                existingWidgets.delete(widgetKey); // Удаляем из списка для удаления
            } else {
                // ❌ Виджет не существует — создаём новый
                if (wRef.widgetIndex === "__preview__") {
                    const fakeWidget = { name: "$$canvas-image-preview", value: "", type: "image" };
                    generatedWrapper = createWidgetDOM(fakeWidget, wRef.nodeId, "__preview__", options);
                } else if (node.widgets && node.widgets[wRef.widgetIndex]) {
                    generatedWrapper = createWidgetDOM(node.widgets[wRef.widgetIndex], wRef.nodeId, wRef.widgetIndex, options);
                }

                if (generatedWrapper) {
                    generatedWrapper.dataset.widgetKey = widgetKey;
                    // Mark as new for animation
                    generatedWrapper.classList.add('gw-widget-new');
                    // Remove the animation class after animation completes to prevent re-animation on updates
                    setTimeout(() => {
                        generatedWrapper.classList.remove('gw-widget-new');
                    }, 200);
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

                // Добавляем в body если ещё не там
                if (!generatedWrapper.parentNode || generatedWrapper.parentNode !== body) {
                    body.appendChild(generatedWrapper);
                }
            }
        });

        // Render virtual widgets for special containers
        if (config.containerType === CONTAINER_TYPES.SPECIAL && config.virtualWidgets) {
            // Apply special container type-specific layout
            applySpecialContainerLayout(body, config);

            config.virtualWidgets.forEach(vw => {
                const virtualKey = `virtual_${vw.id}`;
                newWidgetKeys.add(virtualKey);

                // Restore saved state before rendering
                if (virtualWidgetStates.has(vw.id)) {
                    vw.value = virtualWidgetStates.get(vw.id);
                }

                const options = {
                    hideLabel: vw.hideLabel,
                    labelColor: vw.labelColor,
                    width: vw.width,
                    fontSize: vw.fontSize,
                    textAlign: vw.textAlign,
                    customHeight: vw.customHeight,
                    readOnly: vw.readOnly
                };

                let generatedWrapper = null;

                // Check if widget already exists
                if (existingWidgets.has(virtualKey)) {
                    generatedWrapper = existingWidgets.get(virtualKey);
                    updateWidgetWrapperStyles(generatedWrapper, vw, options);
                    existingWidgets.delete(virtualKey);
                } else {
                    // Create new virtual widget DOM
                    generatedWrapper = createVirtualWidgetDOM(vw, config.id || `container_${Date.now()}`, options);
                    if (generatedWrapper) {
                        generatedWrapper.dataset.virtualWidgetId = virtualKey;
                        // Mark as new for animation
                        generatedWrapper.classList.add('gw-widget-new');
                        // Remove the animation class after animation completes to prevent re-animation on updates
                        setTimeout(() => {
                            generatedWrapper.classList.remove('gw-widget-new');
                        }, 200);
                    }
                }

                if (generatedWrapper) {
                    const isGridMode = activeLayout.startsWith('col-') || activeLayout === 'auto';

                    if (isGridMode && vw.colSpan) {
                        let maxCols = 12;
                        if (activeLayout === 'col-2') maxCols = 2;
                        if (activeLayout === 'col-3') maxCols = 3;
                        if (activeLayout === 'col-4') maxCols = 4;
                        if (activeLayout === 'col-5') maxCols = 5;
                        if (activeLayout === 'col-6') maxCols = 6;
                        const span = Math.min(parseInt(vw.colSpan) || 1, maxCols);
                        generatedWrapper.style.gridColumn = `span ${span}`;
                    }

                    const wWidth = vw.width;
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

                    // Add to body if not already there
                    if (!generatedWrapper.parentNode || generatedWrapper.parentNode !== body) {
                        body.appendChild(generatedWrapper);
                    }

                    // Sync virtual widget with connected real widget on render
                    if (vw.connection) {
                        // First sync: preserve virtual value to avoid overwriting with real widget value
                        syncVirtualWidget(vw, true).then(() => {
                            // Update DOM with synced value
                            if (vw.value !== undefined && vw.value !== null) {
                                const domEl = document.querySelector(`[data-virtual-widget-id="${virtualKey}"]`);
                                if (domEl && domEl.updateValue) {
                                    domEl.updateValue(vw.value);
                                }
                            }
                        });
                    }
                }
            });
        }

        // ❌ Удаляем виджеты которых больше нет в конфигурации
        existingWidgets.forEach((el, key) => {
            // Добавляем класс для анимации удаления
            el.classList.add('removing');
            setTimeout(() => {
                el.remove();
            }, 200); // Ждём окончания анимации
        });
    }
}

/**
 * Обновить стили wrapper без пересоздания DOM
 * @param {HTMLElement} wrapper 
 * @param {Object} wRef 
 * @param {Object} options 
 */
function updateWidgetWrapperStyles(wrapper, wRef, options) {
    // Обновить классы
    if (options.customHeight) {
        const hStr = String(options.customHeight).trim().toLowerCase();
        if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
            wrapper.classList.add("gw-widget-wrapper--grows");
        } else {
            wrapper.classList.remove("gw-widget-wrapper--grows");
        }
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
    const modal = document.createElement("div"); modal.className = "a11-modal open";
    let widgetsHtml = '';

    let activeLayout = config.layoutMode || "list";
    if (activeLayout === 'col-1') activeLayout = 'list';
    if (activeLayout === 'dense') activeLayout = 'auto';

    const isGrid = activeLayout.startsWith('col-') || activeLayout === 'auto';

    config.widgets.forEach((w, i) => {
        const node = app.graph.getNodeById(w.nodeId);
        let originalName = "Unknown";
        let wType = "unknown";
        let isCustomDom = false;

        if (w.widgetIndex === "__preview__") {
            originalName = "Output Preview"; wType = "image";
        } else if (node && node.widgets && node.widgets[w.widgetIndex]) {
            const actualWidget = node.widgets[w.widgetIndex];
            originalName = actualWidget.name;
            wType = actualWidget.type || typeof actualWidget.value;
            if (Array.isArray(actualWidget.options?.values)) wType = "combo";
            if (actualWidget.name === "image" && actualWidget.type !== "text") wType = "image";

            if (actualWidget.element instanceof HTMLElement && wType !== "text" && wType !== "image" && wType !== "combo") {
                isCustomDom = true;
                wType = "custom_dom";
            }
        }

        const isNum = wType === "number" || wType === "slider" || wType === "float" || wType === "int";
        const isText = wType === "customtext" || wType === "text" || wType === "string";
        const isImage = wType === "image";
        const isCombo = wType === "combo";
        const isBtnOrToggle = wType === "button" || wType === "toggle" || wType === "boolean";

        const currentWidth = w.width || w.flex || '';

        widgetsHtml += `
            <div class="a11-wo-item" data-idx="${i}">
                <div class="a11-wo-header">${originalName} <span style="opacity:0.5;float:right">[${wType}]</span></div>

                <div class="a11-wo-grid">
                    <div class="wo-col"><label>Alias (Display Name)</label><input type="text" class="w-alias" value="${w.alias || ''}"></div>
                    <div class="wo-col" style="justify-content: center; gap: 5px;">
                        <label><input type="checkbox" class="w-hide" ${w.hidden ? 'checked' : ''}> Hide Widget</label>
                        <label><input type="checkbox" class="w-hidelabel" ${w.hideLabel ? 'checked' : ''}> Hide Label</label>
                        <label><input type="checkbox" class="w-readonly" ${w.readOnly ? 'checked' : ''}> Read Only</label>
                    </div>

                    ${isGrid ? `<div class="wo-col"><label>Grid Span (Cols)</label><input type="number" class="w-colspan" min="1" max="12" value="${w.colSpan || ''}" placeholder="1"></div>` : ''}
                    <div class="wo-col"><label>Set Width (auto, %, px)</label><input type="text" class="w-width" value="${currentWidth}" placeholder="auto, 100%, 150px"></div>

                    <div class="wo-col"><label>Font Size (px)</label><input type="number" class="w-fontsize" value="${w.fontSize || ''}" placeholder="Auto"></div>
                    ${(isText || isNum || isCombo) ? `
                    <div class="wo-col"><label>Text Align</label><select class="w-align">
                        <option value="" ${!w.textAlign ? 'selected' : ''}>Left</option>
                        <option value="center" ${w.textAlign === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right" ${w.textAlign === 'right' ? 'selected' : ''}>Right</option>
                    </select></div>` : '<div class="wo-col"></div>'}

                    <div class="wo-col">
                        <label><input type="checkbox" class="w-uselabelcol" ${w.labelColor ? 'checked' : ''}> Label Color</label>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <input type="color" class="w-labelcol" value="${w.labelColor || state.settings.textColor || '#ffffff'}">
                        </div>
                    </div>
                    ${isBtnOrToggle || isImage ? `
                    <div class="wo-col">
                        <label><input type="checkbox" class="w-usebtncol" ${w.buttonColor ? 'checked' : ''}> Accent Color</label>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <input type="color" class="w-btncol" value="${w.buttonColor || state.settings.themeColor || '#ea580c'}">
                        </div>
                    </div>` : '<div class="wo-col"></div>'}

                    ${isNum ? `
                    <div class="wo-col"><label>Min / Max / Step</label>
                        <div style="display:flex; gap:2px;">
                            <input type="number" class="w-min" value="${w.min ?? ''}" placeholder="Min">
                            <input type="number" class="w-max" value="${w.max ?? ''}" placeholder="Max">
                            <input type="number" class="w-step" value="${w.step ?? ''}" placeholder="Step">
                        </div>
                    </div>
                    <div class="wo-col" style="justify-content: center; gap: 5px;">
                        <label><input type="checkbox" class="w-hideslider" ${w.hideSlider ? 'checked' : ''}> No Slider</label>
                        <label><input type="checkbox" class="w-hidenumber" ${w.hideNumber ? 'checked' : ''}> No Number</label>
                    </div>
                    ` : ''}

                    ${isCombo ? `
                    <div class="wo-col" style="justify-content: center;">
                        <label><input type="checkbox" class="w-hidefilter" ${w.hideFilter ? 'checked' : ''}> Disable Search Filter</label>
                    </div>
                    ` : ''}

                    ${isCustomDom ? `
                    <div class="wo-col"><label>Scale (%)</label><input type="number" class="w-scale" value="${w.customScale !== undefined ? w.customScale : 100}"></div>
                    <div class="wo-col"><label>Overflow</label><select class="w-overflow">
                        <option value="hidden" ${w.overflow === 'hidden' || !w.overflow ? 'selected' : ''}>Hidden (Crop)</option>
                        <option value="auto" ${w.overflow === 'auto' ? 'selected' : ''}>Scroll (Auto)</option>
                        <option value="visible" ${w.overflow === 'visible' ? 'selected' : ''}>Visible (Spill)</option>
                    </select></div>
                    ` : ''}

                    ${isImage || isText || isCustomDom ? `
                    <div class="wo-col"><label>Height (auto, px, %)</label><input type="text" class="w-height" value="${w.customHeight || ''}" placeholder="auto, 100%, 250"></div>
                    ` : ''}
                    ${isImage ? `
                    <div class="wo-col"><label>Image Fit</label><select class="w-objfit">
                        <option value="contain" ${w.objectFit === 'contain' || !w.objectFit ? 'selected' : ''}>Contain (Fit)</option>
                        <option value="cover" ${w.objectFit === 'cover' ? 'selected' : ''}>Cover (Crop)</option>
                        <option value="fill" ${w.objectFit === 'fill' ? 'selected' : ''}>Fill (Stretch)</option>
                    </select></div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    const bypassModes = {
        "default": "Auto (Groups + Manual)",
        "manual": "Manual Only (Ignore Groups)",
        "graph": "Graph Priority (Ignore UI)"
    };
    let bypassModeOptions = "";
    Object.entries(bypassModes).forEach(([k, v]) => {
        bypassModeOptions += `<option value="${k}" ${config.bypassMode === k ? 'selected' : ''}>${v}</option>`;
    });

    modal.innerHTML = `
        <div class="a11-modal-content" style="width:750px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column;">
            <div class="a11-modal-title">Advanced Container Settings</div>
            <div class="a11-modal-layout" style="flex:1; overflow:hidden;">
                <div class="a11-modal-sidebar">
                    <div class="a11-modal-tab active" data-target="acs-behavior">⚙️ Workflow Behavior</div>
                    <div class="a11-modal-tab" data-target="acs-appearance">🎨 Appearance</div>
                    <div class="a11-modal-tab" data-target="acs-header">📑 Header & Presets</div>
                    <div class="a11-modal-tab" data-target="acs-widgets">🔧 Widget Overrides</div>
                </div>
                <div class="a11-modal-content-area" style="overflow-y:auto; padding:15px;">
                    
                    <div class="a11-modal-panel active" id="acs-behavior">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Workflow Behavior</div>
                            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none;">
                                <label>Bypass / Mute Behavior</label>
                                <select id="c-bypass-mode" style="width:100%">${bypassModeOptions}</select>
                            </div>
                            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none; margin-top:10px;">
                                <label>Checkbox Action (When UI disables it)</label>
                                <select id="c-action-type" style="width:100%">
                                    <option value="bypass" ${config.actionType !== 'mute' ? 'selected' : ''}>Bypass (Pass-through)</option>
                                    <option value="mute" ${config.actionType === 'mute' ? 'selected' : ''}>Mute (Disable nodes completely)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="a11-modal-panel" id="acs-appearance">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Appearance Settings</div>
                            <div class="a11-wo-grid">
                                <div class="wo-col"><label>Background Color</label><input type="color" id="c-bg" value="${config.customBg || '#1a202c'}"></div>
                                <div class="wo-col"><label>Border Color</label><input type="color" id="c-border" value="${config.borderCol || '#374151'}"></div>
                                <div class="wo-col"><label>Title Color</label><input type="color" id="c-title" value="${config.titleColor || '#ffffff'}"></div>
                                <div class="wo-col"><label>Opacity</label><input type="number" id="c-op" step="0.1" min="0.1" max="1" value="${config.customOpacity || 1.0}"></div>
                                <div class="wo-col"><label>Border Radius (px)</label><input type="number" id="c-rad" min="0" max="50" value="${config.borderRadius || ''}"></div>
                                <div class="wo-col"><label>Inner Padding (px)</label><input type="number" id="c-pad" min="0" max="50" value="${config.padding || ''}"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="a11-modal-panel" id="acs-header">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Header & Presets</div>
                            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none;">
                                <label>Preset Category</label>
                                <input type="text" id="c-preset-cat" value="${config.presetCategory || ''}" placeholder="e.g. SDXL Styles" style="width:100%;">
                            </div>
                            <div class="a11-setting-row" style="margin-top:12px; gap:15px;">
                                <label><input type="checkbox" id="c-min" ${config.minimalHeader ? 'checked' : ''}> Minimal Header</label>
                                <label><input type="checkbox" id="c-hide-head" ${config.hideHeader ? 'checked' : ''}> Hide Header (View Mode)</label>
                                <label><input type="checkbox" id="c-hide-collapse" ${config.hideCollapse ? 'checked' : ''}> Hide Collapse Arrow</label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="a11-modal-panel" id="acs-widgets">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Widget Overrides</div>
                            <small style="color:var(--a11-desc); display:block; margin-bottom:10px;">Customize individual widget appearance and behavior within this container</small>
                            <div style="max-height:400px; overflow-y:auto; padding-right:5px;">${widgetsHtml}</div>
                        </div>
                    </div>
                    
                </div>
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn danger" id="c-reset" style="margin-right:auto;">Reset Container</button>
                <button class="a11-btn" id="c-cancel">Cancel</button>
                <button class="a11-btn active" id="c-save">Save & Apply</button>
            </div>
        </div>`;
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

    modal.querySelector("#c-reset").onclick = () => {
        if (confirm("Are you sure you want to reset all advanced settings for this container?")) {
            delete config.customBg; delete config.borderCol; delete config.titleColor;
            delete config.customOpacity; delete config.borderRadius; delete config.padding;
            delete config.presetCategory; delete config.minimalHeader; delete config.hideHeader;
            delete config.hideCollapse; delete config.bypassMode; delete config.actionType;

            config.widgets.forEach(wRef => {
                delete wRef.alias; delete wRef.hidden; delete wRef.hideLabel;
                delete wRef.readOnly; delete wRef.customScale; delete wRef.overflow;
                delete wRef.flex; delete wRef.width; delete wRef.colSpan; delete wRef.labelColor; delete wRef.buttonColor;
                delete wRef.fontSize; delete wRef.textAlign; delete wRef.hideSlider; delete wRef.hideNumber;
                delete wRef.hideFilter; delete wRef.objectFit; delete wRef.customHeight;
                delete wRef.min; delete wRef.max; delete wRef.step;
            });

            if (!domElement.classList.contains("is-static-container")) domElement.dataset.config = JSON.stringify(config);
            renderGridItemContent(domElement, config);
            updateGraphExtra(true);
            modal.remove();
        }
    };

    modal.querySelector("#c-cancel").onclick = () => modal.remove();

    modal.querySelector("#c-save").onclick = () => {
        config.bypassMode = modal.querySelector("#c-bypass-mode").value;
        config.actionType = modal.querySelector("#c-action-type").value;
        config.customBg = modal.querySelector("#c-bg").value;
        config.borderCol = modal.querySelector("#c-border").value;
        config.titleColor = modal.querySelector("#c-title").value;
        config.customOpacity = parseFloat(modal.querySelector("#c-op").value);
        config.borderRadius = modal.querySelector("#c-rad").value;
        config.padding = modal.querySelector("#c-pad").value;
        config.presetCategory = modal.querySelector("#c-preset-cat").value.trim();
        config.minimalHeader = modal.querySelector("#c-min").checked;
        config.hideHeader = modal.querySelector("#c-hide-head").checked;
        config.hideCollapse = modal.querySelector("#c-hide-collapse").checked;

        const items = modal.querySelectorAll(".a11-wo-item");
        items.forEach(item => {
            const idx = item.dataset.idx;
            const wRef = config.widgets[idx];

            wRef.alias = item.querySelector(".w-alias").value;
            wRef.hidden = item.querySelector(".w-hide").checked;
            wRef.hideLabel = item.querySelector(".w-hidelabel").checked;
            wRef.readOnly = item.querySelector(".w-readonly").checked;

            const wWidth = item.querySelector(".w-width");
            if (wWidth) wRef.width = wWidth.value.trim();

            const scaleInp = item.querySelector(".w-scale");
            if (scaleInp) wRef.customScale = scaleInp.value ? parseFloat(scaleInp.value) : 100;

            const ovfInp = item.querySelector(".w-overflow");
            if (ovfInp) wRef.overflow = ovfInp.value;

            const colSpanInp = item.querySelector(".w-colspan");
            if (colSpanInp) wRef.colSpan = colSpanInp.value ? parseInt(colSpanInp.value) : "";

            const useLCol = item.querySelector(".w-uselabelcol");
            if (useLCol) wRef.labelColor = useLCol.checked ? item.querySelector(".w-labelcol").value : "";

            const useBCol = item.querySelector(".w-usebtncol");
            if (useBCol) wRef.buttonColor = useBCol.checked ? item.querySelector(".w-btncol").value : "";

            const fs = item.querySelector(".w-fontsize")?.value;
            wRef.fontSize = fs ? parseInt(fs) : "";

            wRef.textAlign = item.querySelector(".w-align")?.value || "";

            const hs = item.querySelector(".w-hideslider"); if (hs) wRef.hideSlider = hs.checked;
            const hn = item.querySelector(".w-hidenumber"); if (hn) wRef.hideNumber = hn.checked;
            const hf = item.querySelector(".w-hidefilter"); if (hf) wRef.hideFilter = hf.checked;

            const of = item.querySelector(".w-objfit");
            if (of) wRef.objectFit = of.value;

            const heightInp = item.querySelector(".w-height");
            if (heightInp) wRef.customHeight = heightInp.value.trim();

            const minInp = item.querySelector(".w-min");
            if (minInp) wRef.min = minInp.value !== "" ? parseFloat(minInp.value) : "";

            const maxInp = item.querySelector(".w-max");
            if (maxInp) wRef.max = maxInp.value !== "" ? parseFloat(maxInp.value) : "";

            const stepInp = item.querySelector(".w-step");
            if (stepInp) wRef.step = stepInp.value !== "" ? parseFloat(stepInp.value) : "";
        });

        if (!domElement.classList.contains("is-static-container")) domElement.dataset.config = JSON.stringify(config);
        renderGridItemContent(domElement, config);
        updateGraphExtra(true);
        modal.remove();
    };
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
    updatedContent.onclick = () => {
        if (!state.isEditMode) return;
        document.querySelectorAll(".grid-stack-item-content").forEach(e => e.classList.remove("active-target"));
        updatedContent.classList.add("active-target");
        const sel = document.getElementById("sel-target-container");
        if (sel) sel.value = el.getAttribute("gs-id");
    };

    if (config.pinned) state.grid.update(el, { noMove: true, noResize: true, locked: false });

    updateGraphExtra(true);
    return updatedContent;
}

export function refreshActiveItem() {
    const sel = document.getElementById("sel-target-container");
    if (!sel || !sel.value) return;
    const gridItem = document.querySelector(`.grid-stack-item[gs-id="${sel.value}"]`);
    if (gridItem) { const content = gridItem.querySelector(".grid-stack-item-content"); const config = JSON.parse(content.dataset.config); renderGridItemContent(content, config); updateGraphExtra(true); }
}

/**
 * Open the special container creator dialog
 */
export function openSpecialContainerCreator() {
    // Open the special container editor with no existing config (create mode)
    openSpecialContainerEditor(null, (config, isDelete) => {
        if (isDelete || !config) return;
        
        // Add the special container to the grid
        addGridItem(config, { w: 12, h: 4 });
        setTimeout(refreshContainerList, 100);
    });
}

/**
 * Open settings for a special container
 */
export function openSpecialContainerSettings(config, domElement) {
    openSpecialContainerEditor(config, (updatedConfig, isDelete) => {
        if (isDelete) {
            // Remove the container from grid
            const gridItem = domElement.closest(".grid-stack-item");
            if (gridItem && state.grid) {
                state.grid.removeWidget(gridItem);
            }
        } else if (updatedConfig) {
            // Update the config and re-render
            domElement.dataset.config = JSON.stringify(updatedConfig);
            renderGridItemContent(domElement, updatedConfig);
        }
        updateGraphExtra(true);
        refreshContainerList();
    });
}

export function syncNodeMonitors() { }