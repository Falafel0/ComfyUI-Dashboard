
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для combo виджетов (выпадающие списки с поиском)
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class ComboInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 50;
        this.supportedTypes = ['combo', 'combobox'];
    }

    canHandle(w, node, options) {
        return w.type === "combo" || w.type === "combobox";
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
        container.style.gap = "2px";

        const sel = document.createElement("select");
        sel.className = "a11-select";

        const populate = (filter = "") => {
            sel.innerHTML = "";
            const lowerFilter = filter.toLowerCase();

            if (w.options?.values) {
                w.options.values.forEach(v => {
                    if (!filter || v.toLowerCase().includes(lowerFilter) || v === w.value) {
                        const opt = document.createElement("option");
                        opt.value = v;
                        opt.innerText = v;
                        if (v === w.value) opt.selected = true;
                        sel.appendChild(opt);
                    }
                });
            }
        };

        populate();

        sel.onchange = (e) => {
            this.sync(w, nodeId, widgetIndex, e.target.value);
        };

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, sel, (newVal) => {
            if (sel.value !== newVal) sel.value = newVal;
        });

        const skipSearch = w.name === "sampler_name" ||
                          w.name === "scheduler" ||
                          w.name === "upscale_method";

        if (!options.hideFilter &&
            w.options?.values?.length > 10 &&
            !skipSearch &&
            !options.readOnly) {

            const search = document.createElement("input");
            search.type = "text";
            search.placeholder = "🔍 Filter...";
            search.className = "a11-input";
            search.style.borderBottom = "none";
            search.style.borderRadius = "4px 4px 0 0";

            search.oninput = (e) => populate(e.target.value);
            sel.style.borderRadius = "0 0 4px 4px";

            container.appendChild(search);
        }

        container.appendChild(sel);
        wrapper.appendChild(container);

        this.applyStyles(wrapper, lbl, [sel], options);

        return wrapper;
    }
}

export default ComboInterpreter;
