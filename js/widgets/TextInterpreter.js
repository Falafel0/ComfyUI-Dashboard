
import { app } from "../../../scripts/app.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Интерпретатор для текстовых виджетов
 * Рефакторинг с использованием SyncableWidgetInterpreter
 */
export class TextInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 50;
        this.supportedTypes = ['text', 'customtext', 'string'];
    }

    canHandle(w, node, options) {
        return w.type === "text" || w.type === "customtext" || w.type === "string";
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);

        if (!options.customHeight) {
            wrapper.classList.add("gw-widget-wrapper--grows");
        }
        wrapper.classList.add("is-text-widget");

        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const txt = document.createElement("textarea");
        txt.className = "a11-textarea";
        txt.value = w.value;

        txt.oninput = (e) => {
            w.value = e.target.value;
            if (w.callback) w.callback(w.value);
        };

        txt.onchange = (e) => {
            this.sync(w, nodeId, widgetIndex, e.target.value);
        };

        // Live sync через базовый класс
        this.setupLiveSync(w, nodeId, widgetIndex, txt, (newVal) => {
            if (txt.value !== newVal) txt.value = newVal;
        });

        let resizeTimeout;
        const resizeObserver = new ResizeObserver(() => {
            if (options.onResize && txt.offsetHeight > 0) {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    options.onResize(txt.offsetHeight);
                }, 200);
            }
        });

        txt.addEventListener("mousedown", () => resizeObserver.observe(txt));
        window.addEventListener("mouseup", () => resizeObserver.disconnect());

        wrapper.appendChild(txt);
        this.applyStyles(wrapper, lbl, [txt], options);

        return wrapper;
    }
}

export default TextInterpreter;
