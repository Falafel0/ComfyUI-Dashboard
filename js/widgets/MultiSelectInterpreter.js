
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для виджетов множественного выбора
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class MultiSelectInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 55;
        this.supportedTypes = ['multiselect', 'multi-select', 'array'];
        this.supportedNames = ['tags', 'categories', 'list', 'items', 'selection'];
    }

    canHandle(w, node, options) {
        const isMultiType = w.type === "multiselect" || w.type === "multi-select";
        const isArrayValue = Array.isArray(w.value);
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

        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "4px";

        const sel = document.createElement("select");
        sel.className = "a11-select";
        sel.multiple = true;
        sel.style.minHeight = "100px";

        const populate = () => {
            sel.innerHTML = "";

            const values = w.options?.values || [];
            const currentValues = Array.isArray(w.value) ? w.value : [];

            values.forEach(v => {
                const opt = document.createElement("option");
                opt.value = v;
                opt.innerText = v;
                if (currentValues.includes(v)) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            });
        };

        populate();

        sel.onchange = (e) => {
            const selected = Array.from(sel.selectedOptions).map(opt => opt.value);
            this.sync(w, nodeId, widgetIndex, selected);
        };

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, sel, (newVal) => {
            const currentSelected = Array.from(sel.selectedOptions).map(opt => opt.value);
            const newValues = Array.isArray(newVal) ? newVal : [];

            const needsUpdate = currentSelected.length !== newValues.length ||
                               currentSelected.some((v, i) => v !== newValues[i]);

            if (needsUpdate) {
                Array.from(sel.options).forEach(opt => {
                    opt.selected = newValues.includes(opt.value);
                });
            }
        });

        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex; gap:4px; margin-top:4px;";

        const selectAllBtn = document.createElement("button");
        selectAllBtn.className = "a11-btn";
        selectAllBtn.innerText = "All";
        selectAllBtn.style.flex = "1";
        selectAllBtn.style.fontSize = "12px";
        selectAllBtn.style.padding = "4px 8px";
        selectAllBtn.onclick = () => {
            Array.from(sel.options).forEach(opt => opt.selected = true);
            sel.onchange();
        };

        const clearBtn = document.createElement("button");
        clearBtn.className = "a11-btn";
        clearBtn.innerText = "Clear";
        clearBtn.style.flex = "1";
        clearBtn.style.fontSize = "12px";
        clearBtn.style.padding = "4px 8px";
        clearBtn.onclick = () => {
            Array.from(sel.options).forEach(opt => opt.selected = false);
            sel.onchange();
        };

        if (!options.readOnly) {
            btnRow.appendChild(selectAllBtn);
            btnRow.appendChild(clearBtn);
        }

        container.appendChild(sel);
        if (!options.readOnly) {
            container.appendChild(btnRow);
        }
        wrapper.appendChild(container);

        this.applyStyles(wrapper, lbl, [sel, selectAllBtn, clearBtn], options);

        return wrapper;
    }
}

export default MultiSelectInterpreter;
