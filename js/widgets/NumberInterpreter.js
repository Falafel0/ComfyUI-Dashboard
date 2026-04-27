
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для числовых виджетов и seed
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class NumberInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 50;
        this.supportedTypes = ['number', 'slider', 'int', 'float'];
        this.supportedNames = ['seed', 'noise_seed', 'steps', 'cfg', 'denoise', 'width', 'height'];
    }

    canHandle(w, node, options) {
        const isSeed = w.name === "seed" || w.name === "noise_seed";
        const isNumberType = w.type === "number" || w.type === "slider" || typeof w.value === "number";
        return isSeed || isNumberType;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        if (w.name === "seed" || w.name === "noise_seed") {
            return this.renderSeed(w, nodeId, widgetIndex, options);
        }

        return this.renderNumber(w, nodeId, widgetIndex, options);
    }

    renderSeed(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const row = document.createElement("div");
        row.style.cssText = "display:flex; gap:5px; align-items:center;";

        const num = document.createElement("input");
        num.type = "number";
        num.className = "a11-input a11-num-input";
        num.style.flexGrow = "1";
        num.style.width = "auto";
        num.value = w.value;

        const btnRand = document.createElement("button");
        btnRand.className = "a11-btn";
        btnRand.innerText = "🎲";

        const btnReuse = document.createElement("button");
        btnReuse.className = "a11-btn";
        btnReuse.innerText = "♻️";

        btnRand.onclick = () => {
            const rnd = Math.floor(Math.random() * 1125899906842624);
            this.sync(w, nodeId, widgetIndex, rnd);
        };

        btnReuse.onclick = () => {
            this.sync(w, nodeId, widgetIndex, -1);
        };

        num.onchange = (e) => {
            this.sync(w, nodeId, widgetIndex, e.target.value);
        };

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, num, (newVal) => {
            if (num.value !== newVal) num.value = newVal;
        });

        row.appendChild(num);
        row.appendChild(btnRand);
        row.appendChild(btnReuse);
        wrapper.appendChild(row);

        this.applyStyles(wrapper, lbl, [num, btnRand, btnReuse], options);

        return wrapper;
    }

    renderNumber(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        let min = options.min !== undefined && options.min !== "" ? Number(options.min) : w.options?.min;
        let max = options.max !== undefined && options.max !== "" ? Number(options.max) : w.options?.max;
        let step = options.step !== undefined && options.step !== "" ? Number(options.step) : w.options?.step;
        let val = Number(w.value);

        const name = w.name.toLowerCase();
        const presets = {
            "steps": { min: 1, max: 100, step: 1 },
            "cfg": { min: 0, max: 30, step: 0.1 },
            "denoise": { min: 0, max: 1, step: 0.01 },
            "width": { min: 64, max: 4096, step: 8 },
            "height": { min: 64, max: 4096, step: 8 }
        };

        for (const key in presets) {
            if (name.includes(key)) {
                if (max === undefined) max = presets[key].max;
                if (min === undefined) min = presets[key].min;
                if (step === undefined) step = presets[key].step;
                break;
            }
        }

        if (max === undefined) max = val > 100 ? 1024 : 100;
        if (min === undefined) min = 0;
        if (step === undefined) step = Number.isInteger(val) ? 1 : 0.01;

        const row = document.createElement("div");
        row.className = "a11-slider-row";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "a11-slider-input";
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = val;

        const num = document.createElement("input");
        num.type = "number";
        num.className = "a11-input a11-num-input";
        num.min = min;
        num.max = max;
        num.step = step;
        num.value = val;

        const validateAndSync = (rawValue) => {
            let v = parseFloat(rawValue);
            if (isNaN(v)) v = min;
            if (v < min) v = min;
            if (v > max) v = max;
            this.sync(w, nodeId, widgetIndex, v);
        };

        slider.oninput = (e) => validateAndSync(e.target.value);
        num.onchange = (e) => validateAndSync(e.target.value);

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, num, (newVal) => {
            slider.value = newVal;
            num.value = newVal;
        });

        if (options.hideSlider) slider.style.display = "none";
        if (options.hideNumber) num.style.display = "none";

        row.appendChild(slider);
        row.appendChild(num);
        wrapper.appendChild(row);

        this.applyStyles(wrapper, lbl, [slider, num], options);

        return wrapper;
    }
}

export default NumberInterpreter;
