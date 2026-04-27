
export { WidgetInterpreter, default } from "./WidgetInterpreter.js";
export { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

export {
    WidgetInterpreterManager,
    widgetInterpreterManager
} from "./WidgetInterpreterManager.js";

export {
    CentralSyncManager,
    centralSyncManager,
    createSyncKey
} from "./CentralSyncManager.js";

export { PresetUndoManager, presetUndoManager } from "./PresetUndoManager.js";

export { CustomDOMInterpreter, DOMManager } from "./CustomDOMInterpreter.js";
export { LoadImageInterpreter } from "./LoadImageInterpreter.js";
export { ImageInterpreter } from "./ImageInterpreter.js";
export { PreviewImageInterpreter } from "./PreviewImageInterpreter.js";
export { NumberInterpreter } from "./NumberInterpreter.js";
export { ToggleInterpreter } from "./ToggleInterpreter.js";
export { ComboInterpreter } from "./ComboInterpreter.js";
export { TextInterpreter } from "./TextInterpreter.js";
export { ButtonInterpreter } from "./ButtonInterpreter.js";
export { ColorInterpreter } from "./ColorInterpreter.js";
export { MultiSelectInterpreter } from "./MultiSelectInterpreter.js";
export { VueBridgeInterpreter } from "./VueBridgeInterpreter.js"; // Поддержка ComfyUI 2.0
export { FSDNodeInterpreter } from "./FSDNodeInterpreter.js"; // Интерпретатор для FSD-нод

/**
 * Пример добавления пользовательского интерпретатора для конкретной ноды:
 *
 * import { widgetInterpreterManager, WidgetInterpreter } from './index.js';
 *
 * class MyNodeInterpreter extends WidgetInterpreter {
 *     constructor() {
 *         super();
 *         this.priority = 75;
 *         this.supportedTypes = ['my_custom_type'];
 *     }
 *
 *     canHandle(w, node, options) {
 *         return node.type === 'MyCustomNode' && w.name === 'special_param';
 *     }
 *
 *     render(w, nodeId, widgetIndex, options) {
 *         // Ваша логика рендеринга
 *         const wrapper = this.createWrapper(options);
 *         // ... создание элементов
 *         return wrapper;
 *     }
 * }
 *
 * // Регистрация интерпретатора для конкретной ноды
 * widgetInterpreterManager.addNodeInterpreter('MyCustomNode', new MyNodeInterpreter());
 *
 * // Или добавление глобального интерпретатора с приоритетом
 * widgetInterpreterManager.addInterpreter(new MyNodeInterpreter(), 75);
 */
