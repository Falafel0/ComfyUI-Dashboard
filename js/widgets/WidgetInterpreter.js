
/**
 * Базовый класс для всех интерпретаторов виджетов
 * Предоставляет общий интерфейс и утилиты
 */
export class WidgetInterpreter {
    constructor() {
        this.priority = 0; // Приоритет обработки (чем выше, тем раньше)
        this.supportedTypes = [];
        this.supportedNames = [];
        this.supportedNodeTypes = [];
    }

    /**
     * Проверка, может ли этот интерпретатор обработать виджет
     * @param {Object} w - объект виджета ComfyUI
     * @param {Object} node - объект ноды
     * @param {Object} options - опции рендеринга
     * @returns {boolean}
     */
    canHandle(w, node, options) {
        const typeMatch = this.supportedTypes.includes(w.type) ||
                          this.supportedTypes.includes(typeof w.value);
        const nameMatch = this.supportedNames.some(name =>
            w.name === name || w.name.toLowerCase().includes(name.toLowerCase())
        );
        const nodeTypeMatch = this.supportedNodeTypes.length === 0 ||
                              this.supportedNodeTypes.some(nt =>
                                  node.type && node.type.toLowerCase().includes(nt.toLowerCase())
                              );

        return (typeMatch || nameMatch) && nodeTypeMatch;
    }

    /**
     * Создание DOM элемента для виджета
     * @param {Object} w - объект виджета
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {Object} options - опции
     * @returns {HTMLElement}
     */
    render(w, nodeId, widgetIndex, options = {}) {
        throw new Error("Method 'render' must be implemented in subclass");
    }

    /**
     * Получить отображаемое имя виджета
     */
    getDisplayName(w, options) {
        return options.alias || w.name;
    }

    /**
     * Создать обёртку для виджета
     */
    createWrapper(options = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = "gw-widget-wrapper";

        if (options.customHeight) {
            const hStr = String(options.customHeight).trim().toLowerCase();
            if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
                wrapper.classList.add("gw-widget-wrapper--grows");
            }
        }

        return wrapper;
    }

    /**
     * Создать лейбл
     */
    createLabel(text, options = {}) {
        if (options.hideLabel) return null;
        const lbl = document.createElement("div");
        lbl.className = "a11-label";
        lbl.innerText = text;
        return lbl;
    }

    /**
     * Применить продвинутые стили
     */
    applyStyles(wrapper, lbl, elementsArray, options) {
        if (options.labelColor && lbl) lbl.style.color = options.labelColor;
        if (options.buttonColor && wrapper) {
            wrapper.style.setProperty('--a11-accent', options.buttonColor);
        }

        if (options.fontSize) {
            const fs = options.fontSize + "px";
            if (lbl) lbl.style.fontSize = fs;
            elementsArray.forEach(el => {
                if (el) el.style.fontSize = fs;
            });
            const switchLabel = wrapper.querySelector('.a11-switch-label');
            if (switchLabel) switchLabel.style.fontSize = fs;
        }

        elementsArray.forEach(el => {
            if (!el) return;
            if (options.textAlign && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) {
                el.style.textAlign = options.textAlign;
            }
            if (options.buttonColor && el.tagName === "BUTTON") {
                el.style.background = options.buttonColor;
                el.style.borderColor = options.buttonColor;
                el.style.color = "#ffffff";
            }
        });

        if (options.customHeight) {
            const hStr = String(options.customHeight).trim().toLowerCase();
            const h = isNaN(options.customHeight) ? options.customHeight : options.customHeight + "px";

            if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
                wrapper.classList.add("gw-widget-wrapper--grows");
                wrapper.style.height = "auto";
                wrapper.style.minHeight = "0";
                wrapper.style.flexShrink = "1";
            } else {
                wrapper.classList.remove("gw-widget-wrapper--grows");
                wrapper.style.flexGrow = "0";
                wrapper.style.flexShrink = "0";
                wrapper.style.height = h;
                wrapper.style.minHeight = h;
            }
        }

        if (options.readOnly) {
            wrapper.classList.add("a11-readonly-widget");
            elementsArray.forEach(el => {
                if (!el) return;
                if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                    el.readOnly = true;
                } else if (el.tagName === 'TEXTAREA') {
                    el.readOnly = true;
                } else if (el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.type === 'range' || el.type === 'checkbox') {
                    el.disabled = true;
                }
            });
        }
    }
}

export default WidgetInterpreter;
