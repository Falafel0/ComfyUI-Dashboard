
import { WidgetInterpreter } from "./WidgetInterpreter.js";
import { CustomDOMInterpreter, DOMManager } from "./CustomDOMInterpreter.js";
import { LoadImageInterpreter } from "./LoadImageInterpreter.js";
import { ImageInterpreter } from "./ImageInterpreter.js";
import { PreviewImageInterpreter } from "./PreviewImageInterpreter.js";
import { NumberInterpreter } from "./NumberInterpreter.js";
import { ToggleInterpreter } from "./ToggleInterpreter.js";
import { ComboInterpreter } from "./ComboInterpreter.js";
import { TextInterpreter } from "./TextInterpreter.js";
import { ButtonInterpreter } from "./ButtonInterpreter.js";
import { ColorInterpreter } from "./ColorInterpreter.js";
import { MultiSelectInterpreter } from "./MultiSelectInterpreter.js";
import { VueBridgeInterpreter } from "./VueBridgeInterpreter.js"; // Поддержка ComfyUI 2.0
import { FSDNodeInterpreter } from "./FSDNodeInterpreter.js"; // Интерпретатор для FSD-нод

/**
 * Реестр всех доступных интерпретаторов
 * Можно расширять, добавляя новые интерпретаторы
 */
const defaultInterpreters = [
    new CustomDOMInterpreter(),      // Приоритет 100 - кастомные DOM элементы
    new VueBridgeInterpreter(),      // Приоритет 95 - мост для ComfyUI 2.0 (Vue)
    new FSDNodeInterpreter(),        // Приоритет 75 - интерпретатор для FSD-нод
    new LoadImageInterpreter(),      // Приоритет 90 - загрузка изображений (LoadImage)
    new ImageInterpreter(),          // Приоритет 88 - другие изображения
    new PreviewImageInterpreter(),   // Приоритет 85 - предпросмотр
    new ColorInterpreter(),          // Приоритет 60 - цвета
    new MultiSelectInterpreter(),    // Приоритет 55 - множественный выбор
    new NumberInterpreter(),         // Приоритет 50 - числа и seed
    new ToggleInterpreter(),         // Приоритет 50 - переключатели
    new ComboInterpreter(),          // Приоритет 50 - выпадающие списки
    new TextInterpreter(),           // Приоритет 50 - текст
    new ButtonInterpreter(),         // Приоритет 50 - кнопки
];

/**
 * Менеджер интерпретаторов виджетов
 * Отвечает за выбор подходящего интерпретатора для каждого виджета
 */
export class WidgetInterpreterManager {
    constructor() {
        this.interpreters = [...defaultInterpreters];
        this.customInterpreters = [];
        this.nodeInterpreters = new Map(); // Для интерпретаторов конкретных нод
    }

    /**
     * Добавить пользовательский интерпретатор
     * @param {WidgetInterpreter} interpreter - экземпляр интерпретатора
     * @param {number} priority - приоритет (чем выше, тем раньше проверяется)
     */
    addInterpreter(interpreter, priority = 0) {
        if (!(interpreter instanceof WidgetInterpreter)) {
            console.error("Interpreter must extend WidgetInterpreter");
            return;
        }

        if (priority !== undefined) {
            interpreter.priority = priority;
        }

        this.customInterpreters.push(interpreter);
        this.sortInterpreters();
    }

    /**
     * Добавить интерпретатор для конкретной ноды
     * @param {string} nodeType - тип ноды (например, "MyCustomNode")
     * @param {WidgetInterpreter} interpreter - экземпляр интерпретатора
     */
    addNodeInterpreter(nodeType, interpreter) {
        if (!(interpreter instanceof WidgetInterpreter)) {
            console.error("Interpreter must extend WidgetInterpreter");
            return;
        }

        const key = nodeType.toLowerCase();
        if (!this.nodeInterpreters.has(key)) {
            this.nodeInterpreters.set(key, []);
        }
        this.nodeInterpreters.get(key).push(interpreter);
    }

    /**
     * Сортировать интерпретаторы по приоритету (убывание)
     */
    sortInterpreters() {
        this.interpreters = [
            ...this.customInterpreters,
            ...defaultInterpreters
        ].sort((a, b) => b.priority - a.priority);
    }

    /**
     * Найти подходящий интерпретатор для виджета
     * @param {Object} w - объект виджета
     * @param {Object} node - объект ноды
     * @param {Object} options - опции
     * @returns {WidgetInterpreter|null}
     */
    findInterpreter(w, node, options = {}) {
        const nodeType = node.type ? node.type.toLowerCase() : "";
        if (this.nodeInterpreters.has(nodeType)) {
            const nodeInterpreters = this.nodeInterpreters.get(nodeType);
            for (const interpreter of nodeInterpreters) {
                if (interpreter.canHandle(w, node, options)) {
                    return interpreter;
                }
            }
        }

        for (const interpreter of this.interpreters) {
            if (interpreter.canHandle(w, node, options)) {
                return interpreter;
            }
        }

        return null;
    }

    /**
     * Рендерить виджет используя подходящий интерпретатор
     * @param {Object} w - объект виджета
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {Object} options - опции
     * @returns {HTMLElement}
     */
    renderWidget(w, nodeId, widgetIndex, options = {}) {
        const node = window.app?.graph?.getNodeById(nodeId);
        if (!node) {
            console.warn("Node not found:", nodeId);
            return document.createElement("div");
        }

        const interpreter = this.findInterpreter(w, node, options);

        if (interpreter) {
            try {
                return interpreter.render(w, nodeId, widgetIndex, options);
            } catch (error) {
                console.error("Error rendering widget with interpreter:", error);
            }
        }

        return this.renderDefault(w, nodeId, widgetIndex, options);
    }

    /**
     * Рендерить виджет по умолчанию (простой input)
     */
    renderDefault(w, nodeId, widgetIndex, options = {}) {
        const wrapper = document.createElement("div");
        wrapper.className = "gw-widget-wrapper";

        const displayName = options.alias || w.name;

        let lbl = null;
        if (!options.hideLabel) {
            lbl = document.createElement("div");
            lbl.className = "a11-label";
            lbl.innerText = displayName;
            wrapper.appendChild(lbl);
        }

        const inp = document.createElement("input");
        inp.className = "a11-input";
        inp.value = w.value;

        inp.onchange = (e) => {
            w.value = e.target.value;
            if (w.callback) w.callback(w.value);
        };

        wrapper.appendChild(inp);

        return wrapper;
    }

    /**
     * Получить DOMManager для работы с кастомными DOM элементами
     */
    getDOMManager() {
        return DOMManager;
    }

    /**
     * Очистить все кастомные интерпретаторы
     */
    clearCustomInterpreters() {
        this.customInterpreters = [];
        this.nodeInterpreters.clear();
        this.sortInterpreters();
    }
}

export const widgetInterpreterManager = new WidgetInterpreterManager();

export default WidgetInterpreterManager;
