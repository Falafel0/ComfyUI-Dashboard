
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для цветовых виджетов
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class ColorInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 60;
        this.supportedTypes = ['color', 'string'];
        this.supportedNames = ['color', 'colour', 'bg_color', 'text_color', 'font_color'];
    }

    canHandle(w, node, options) {
        const isColorType = w.type === "color";
        const isColorName = this.supportedNames.some(name =>
            w.name.toLowerCase().includes(name)
        );
        const isColorValue = typeof w.value === "string" &&
                            (w.value.startsWith("#") ||
                             w.value.startsWith("rgb") ||
                             /^[0-9a-fA-F]{6}$/.test(w.value));

        return isColorType || isColorName || isColorValue;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const row = document.createElement("div");
        row.style.cssText = "display:flex; gap:8px; align-items:center; width:100%;";

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.className = "a11-color-picker";
        colorInput.style.width = "50px";
        colorInput.style.height = "35px";
        colorInput.style.padding = "0";
        colorInput.style.border = "1px solid var(--a11-border)";
        colorInput.style.borderRadius = "4px";
        colorInput.style.cursor = "pointer";

        const toHex = (val) => {
            if (!val) return "#000000";
            if (val.startsWith("#")) {
                return val.length === 4 ? `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}` : val.slice(0, 7);
            }
            if (val.startsWith("rgb")) {
                const match = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    const r = parseInt(match[1]).toString(16).padStart(2, '0');
                    const g = parseInt(match[2]).toString(16).padStart(2, '0');
                    const b = parseInt(match[3]).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                }
            }
            return "#000000";
        };

        const hexValue = toHex(w.value);
        colorInput.value = hexValue;

        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.className = "a11-input";
        textInput.style.flexGrow = "1";
        textInput.value = w.value || "#000000";

        const syncValues = (newVal) => {
            this.sync(w, nodeId, widgetIndex, newVal);

            if (!textInput.matches(":focus")) {
                textInput.value = newVal;
            }
            if (!colorInput.matches(":focus")) {
                const hex = toHex(newVal);
                if (colorInput.value !== hex) {
                    colorInput.value = hex;
                }
            }
        };

        colorInput.oninput = (e) => {
            syncValues(e.target.value);
        };

        textInput.onchange = (e) => {
            let val = e.target.value.trim();
            if (!val.startsWith("#") && /^[0-9a-fA-F]{6}$/.test(val)) {
                val = `#${val}`;
            }
            syncValues(val);
        };

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, textInput, (newVal) => {
            if (textInput.value !== newVal) {
                textInput.value = newVal;
                colorInput.value = toHex(newVal);
            }
        });

        row.appendChild(colorInput);
        row.appendChild(textInput);
        wrapper.appendChild(row);

        this.applyStyles(wrapper, lbl, [colorInput, textInput], options);

        return wrapper;
    }
}

export default ColorInterpreter;
