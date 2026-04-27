
import { app } from "../../../scripts/app.js";
import { WidgetInterpreter } from "./WidgetInterpreter.js";

/**
 * Интерпретатор для кнопок
 */
export class ButtonInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        this.priority = 50;
        this.supportedTypes = ['button'];
    }

    canHandle(w, node, options) {
        return w.type === "button";
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        const btn = document.createElement("button");
        btn.className = "a11-btn action-btn";
        btn.innerText = displayName;

        btn.onclick = () => {
            if (w.callback) w.callback();
        };

        wrapper.appendChild(btn);
        this.applyStyles(wrapper, null, [btn], options);

        return wrapper;
    }
}

export default ButtonInterpreter;
