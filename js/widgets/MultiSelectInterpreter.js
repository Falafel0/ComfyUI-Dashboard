import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для виджетов множественного выбора
 * Поддержка: поиск, чипы, Select All/Clear, кастомные списки
 */
export class MultiSelectInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 55;
        this.supportedTypes = ['multiselect', 'multi-select', 'array'];
        this.supportedNames = ['tags', 'categories', 'list', 'items', 'selection', 'options', 'multi'];
    }

    canHandle(w, node, options) {
        const wType = (w.type || "").toLowerCase();
        const isMultiType = wType === "multiselect" || wType === "multi-select";
        const isArrayValue = Array.isArray(w.value);
        // Only for FSD nodes with explicit multiselect type OR array-valued widgets with matching names
        const isFsdNode = node.type && (node.type.startsWith("FSD_") || node.type.startsWith("Math") || node.type.startsWith("Logic"));
        if (!isFsdNode) return false;
        const isMultiName = this.supportedNames.some(name =>
            w.name.toLowerCase().includes(name)
        );
        return isMultiType || (isArrayValue && isMultiName);
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const values = w.options?.values || [];
        const currentValues = Array.isArray(w.value) ? [...w.value] : (w.value ? [w.value] : []);

        // Search input
        const searchRow = document.createElement("div");
        searchRow.style.cssText = "display:flex; gap:4px; margin-bottom:4px;";

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "a11-input";
        searchInput.placeholder = "Filter...";
        searchInput.style.cssText = "flex:1; height:26px; font-size:11px;";

        searchRow.appendChild(searchInput);
        wrapper.appendChild(searchRow);

        // Options container (scrollable checkbox list)
        const optsContainer = document.createElement("div");
        optsContainer.style.cssText = "max-height:160px; overflow-y:auto; border:1px solid var(--a11-border); border-radius:4px; padding:4px; background:var(--a11-input);";

        const renderOptions = (filter = "") => {
            optsContainer.innerHTML = "";
            const filterLower = filter.toLowerCase();
            const filtered = filter
                ? values.filter(v => String(v).toLowerCase().includes(filterLower))
                : values;

            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.style.cssText = "color:var(--a11-desc); font-size:11px; padding:4px; text-align:center;";
                empty.innerText = "No matches";
                optsContainer.appendChild(empty);
                return;
            }

            filtered.forEach(v => {
                const row = document.createElement("label");
                row.style.cssText = "display:flex; align-items:center; gap:6px; padding:3px 5px; cursor:pointer; border-radius:3px; font-size:12px;";
                row.addEventListener("mouseenter", () => row.style.background = "var(--a11-hover-light)");
                row.addEventListener("mouseleave", () => row.style.background = "");

                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.style.cssText = "width:14px; height:14px; accent-color:var(--a11-accent); flex-shrink:0;";
                cb.checked = currentValues.includes(v);
                cb.addEventListener("change", () => {
                    if (cb.checked) {
                        if (!currentValues.includes(v)) currentValues.push(v);
                    } else {
                        const idx = currentValues.indexOf(v);
                        if (idx > -1) currentValues.splice(idx, 1);
                    }
                    this.sync(w, nodeId, widgetIndex, [...currentValues]);
                    updateChips();
                });

                const label = document.createElement("span");
                label.innerText = v;
                label.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

                row.appendChild(cb);
                row.appendChild(label);
                optsContainer.appendChild(row);
            });
        };

        // Chips display
        const chipsRow = document.createElement("div");
        chipsRow.style.cssText = "display:flex; flex-wrap:wrap; gap:3px; margin-bottom:4px; min-height:22px;";

        const updateChips = () => {
            chipsRow.innerHTML = "";
            const maxChips = 8;
            const display = currentValues.slice(0, maxChips);
            display.forEach(v => {
                const chip = document.createElement("span");
                chip.style.cssText = "background:var(--a11-accent); color:#fff; padding:2px 8px; border-radius:10px; font-size:10px; display:flex; align-items:center; gap:4px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;";
                chip.title = v;
                const text = document.createElement("span");
                text.innerText = v;
                text.style.overflow = "hidden";
                text.style.textOverflow = "ellipsis";
                const xBtn = document.createElement("span");
                xBtn.innerText = "×";
                xBtn.style.cssText = "font-weight:bold; opacity:0.7; flex-shrink:0;";
                xBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const idx = currentValues.indexOf(v);
                    if (idx > -1) currentValues.splice(idx, 1);
                    this.sync(w, nodeId, widgetIndex, [...currentValues]);
                    renderOptions(searchInput.value);
                    updateChips();
                });
                chip.appendChild(text);
                chip.appendChild(xBtn);
                chipsRow.appendChild(chip);
            });
            if (currentValues.length > maxChips) {
                const more = document.createElement("span");
                more.style.cssText = "color:var(--a11-desc); font-size:10px; padding:2px 4px;";
                more.innerText = `+${currentValues.length - maxChips} more`;
                chipsRow.appendChild(more);
            }
        };

        updateChips();
        wrapper.appendChild(chipsRow);

        searchInput.addEventListener("input", () => renderOptions(searchInput.value));
        renderOptions();
        wrapper.appendChild(optsContainer);

        // Action buttons
        if (!options.readOnly) {
            const btnRow = document.createElement("div");
            btnRow.style.cssText = "display:flex; gap:4px; margin-top:4px;";

            const selectAllBtn = document.createElement("button");
            selectAllBtn.className = "a11-btn";
            selectAllBtn.innerText = "All";
            selectAllBtn.style.cssText = "flex:1; font-size:11px; padding:3px 6px;";
            selectAllBtn.onclick = () => {
                currentValues.length = 0;
                currentValues.push(...values);
                this.sync(w, nodeId, widgetIndex, [...currentValues]);
                renderOptions(searchInput.value);
                updateChips();
            };

            const clearBtn = document.createElement("button");
            clearBtn.className = "a11-btn";
            clearBtn.innerText = "Clear";
            clearBtn.style.cssText = "flex:1; font-size:11px; padding:3px 6px;";
            clearBtn.onclick = () => {
                currentValues.length = 0;
                this.sync(w, nodeId, widgetIndex, []);
                renderOptions(searchInput.value);
                updateChips();
            };

            btnRow.appendChild(selectAllBtn);
            btnRow.appendChild(clearBtn);
            wrapper.appendChild(btnRow);
        }

        // Live sync
        this.setupLiveSync(w, nodeId, widgetIndex, optsContainer, (newVal) => {
            const newValues = Array.isArray(newVal) ? newVal : (newVal ? [newVal] : []);
            const changed = currentValues.length !== newValues.length ||
                currentValues.some((v, i) => v !== newValues[i]);
            if (changed) {
                currentValues.length = 0;
                currentValues.push(...newValues);
                renderOptions(searchInput.value);
                updateChips();
            }
        });

        this.applyStyles(wrapper, lbl, [], options);
        return wrapper;
    }
}

export default MultiSelectInterpreter;
