
import { app } from "../../scripts/app.js";
import { state, registerWidgetDOM, broadcastWidgetUpdate } from "./state.js";
import {
    widgetInterpreterManager,
    WidgetInterpreter,
    DOMManager
} from "./widgets/index.js";

export { widgetInterpreterManager, WidgetInterpreter, DOMManager };


/**
 * Создать DOM элемент для виджета используя модульную систему интерпретаторов
 * @param {Object} w - объект виджета ComfyUI
 * @param {number} nodeId - ID ноды
 * @param {number} widgetIndex - индекс виджета
 * @param {Object} options - опции рендеринга
 * @returns {HTMLElement}
 */
export function createWidgetDOM(w, nodeId, widgetIndex, options = {}) {
    return widgetInterpreterManager.renderWidget(w, nodeId, widgetIndex, options);
}