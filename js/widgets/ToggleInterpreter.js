
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для булевых виджетов (toggle, checkbox)
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class ToggleInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 50;
        this.supportedTypes = ['toggle', 'boolean', 'bool'];
    }

    canHandle(w, node, options) {
        const isToggleType = w.type === "toggle" || w.type === "boolean" || typeof w.value === "boolean";
        return isToggleType;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        const row = document.createElement("div");
        row.className = "a11-switch-row";

        const label = document.createElement("label");
        label.className = "a11-switch";

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = !!w.value;

        const sliderSpan = document.createElement("span");
        sliderSpan.className = "a11-switch-slider";

        label.appendChild(chk);
        label.appendChild(sliderSpan);

        let text = null;
        if (!options.hideLabel) {
            text = document.createElement("span");
            text.className = "a11-switch-label";
            text.innerText = displayName;
            row.appendChild(text);
        }

        chk.onchange = (e) => {
            this.sync(w, nodeId, widgetIndex, e.target.checked);
        };

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, chk, (newVal) => {
            chk.checked = !!newVal;
        });

        row.prepend(label);
        wrapper.appendChild(row);

        this.applyStyles(wrapper, text, [chk], options);

        return wrapper;
    }
}

export default ToggleInterpreter;
