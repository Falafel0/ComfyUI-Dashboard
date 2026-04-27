/**
 * A11 Studio - Preset Undo Manager
 * Система управления отменой/повтором применённых пресетов
 */

export class PresetUndoManager {
    constructor(maxHistory = 20) {
        this.maxHistory = maxHistory;
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Сохранить состояние ДО применения пресета
     * @param {Array} savedValues - значения из пресета
     * @returns {Array} массив текущих значений виджетов
     */
    async saveBeforeState(savedValues) {
        const { app } = await import("../../scripts/app.js");
        const beforeValues = [];

        if (!app?.graph) return beforeValues;

        savedValues.forEach(sv => {
            let targetNode = null;
            
            // Сначала по nodeId (обратная совместимость)
            if (sv.nodeId) {
                targetNode = app.graph.getNodeById(sv.nodeId);
            }

            // Затем по типу ноды
            if (!targetNode && sv.nodeType) {
                const nodes = app.graph._nodes.filter(n =>
                    n.type === sv.nodeType
                );
                targetNode = nodes.length > 0 ? nodes[0] : null;
            }

            if (!targetNode?.widgets) return;

            const widget = targetNode.widgets.find(w => w.name === sv.widgetName);
            if (!widget) return;

            beforeValues.push({
                nodeId: targetNode.id,
                nodeTitle: targetNode.title,
                nodeType: targetNode.type,
                widgetName: sv.widgetName,
                value: widget.value
            });
        });

        return beforeValues;
    }

    /**
     * Добавить состояние в undo стек
     * @param {Array} beforeValues - значения ДО
     * @param {Array} afterValues - значения ПОСЛЕ
     * @param {string} presetName - имя применённого пресета
     */
    pushUndoState(beforeValues, afterValues, presetName) {
        const state = {
            before: beforeValues,
            after: afterValues,
            presetName: presetName,
            timestamp: Date.now()
        };

        this.undoStack.push(state);
        
        // Ограничиваем размер стека
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Очищаем redo стек при новом действии
        this.redoStack = [];

        console.log(`[PresetUndo] State pushed: "${presetName}" (${beforeValues.length} values)`);
    }

    /**
     * Отменить последнее применение пресета
     * @returns {Promise<boolean>} успех операции
     */
    async undo() {
        if (this.undoStack.length === 0) {
            console.warn('[PresetUndo] Nothing to undo');
            return false;
        }

        const state = this.undoStack.pop();
        const { app } = await import("../../scripts/app.js");

        if (!app?.graph) {
            console.error('[PresetUndo] App graph not available');
            return false;
        }

        // Восстанавливаем значения ДО
        const redoValues = [];
        state.before.forEach(bv => {
            let targetNode = app.graph.getNodeById(bv.nodeId);

            if (!targetNode) {
                const nodes = app.graph._nodes.filter(n =>
                    n.title === bv.nodeTitle && n.type === bv.nodeType
                );
                targetNode = nodes.length > 0 ? nodes[0] : null;
            }

            if (!targetNode?.widgets) return;

            const widget = targetNode.widgets.find(w => w.name === bv.widgetName);
            if (!widget) return;

            // Сохраняем текущее значение для redo
            redoValues.push({
                nodeId: targetNode.id,
                nodeTitle: targetNode.title,
                nodeType: targetNode.type,
                widgetName: bv.widgetName,
                value: widget.value
            });

            // Восстанавливаем старое значение
            widget.value = bv.value;

            // Вызываем callback если есть
            if (widget.callback) {
                try {
                    widget.callback(bv.value);
                } catch (e) {
                    console.error(`[PresetUndo] Callback error:`, e);
                }
            }

            // Убираем метку пресета
            delete widget._lastModifiedByPreset;
            delete widget._lastModifiedAt;
        });

        // Добавляем в redo стек
        this.redoStack.push({
            before: redoValues,
            after: state.before,
            presetName: `Redo: ${state.presetName}`,
            timestamp: Date.now()
        });

        // Обновляем canvas
        if (app.canvas && app.canvas.parentNode) {
            app.graph.setDirtyCanvas(true, true);
        }

        console.log(`[PresetUndo] Undone: "${state.presetName}" (${state.before.length} values)`);
        return true;
    }

    /**
     * Повторить отменённое применение пресета
     * @returns {Promise<boolean>} успех операции
     */
    async redo() {
        if (this.redoStack.length === 0) {
            console.warn('[PresetRedo] Nothing to redo');
            return false;
        }

        const state = this.redoStack.pop();
        const { app } = await import("../../scripts/app.js");

        if (!app?.graph) {
            console.error('[PresetRedo] App graph not available');
            return false;
        }

        // Восстанавливаем значения ПОСЛЕ
        const undoValues = [];
        state.after.forEach(av => {
            let targetNode = app.graph.getNodeById(av.nodeId);

            if (!targetNode) {
                const nodes = app.graph._nodes.filter(n =>
                    n.title === av.nodeTitle && n.type === av.nodeType
                );
                targetNode = nodes.length > 0 ? nodes[0] : null;
            }

            if (!targetNode?.widgets) return;

            const widget = targetNode.widgets.find(w => w.name === av.widgetName);
            if (!widget) return;

            // Сохраняем текущее значение для undo
            undoValues.push({
                nodeId: targetNode.id,
                nodeTitle: targetNode.title,
                nodeType: targetNode.type,
                widgetName: av.widgetName,
                value: widget.value
            });

            // Восстанавливаем значение
            widget.value = av.value;

            if (widget.callback) {
                try {
                    widget.callback(av.value);
                } catch (e) {
                    console.error(`[PresetRedo] Callback error:`, e);
                }
            }
        });

        // Добавляем обратно в undo стек
        this.undoStack.push({
            before: state.before,
            after: undoValues,
            presetName: state.presetName.replace('Redo: ', ''),
            timestamp: Date.now()
        });

        if (app.canvas && app.canvas.parentNode) {
            app.graph.setDirtyCanvas(true, true);
        }

        console.log(`[PresetRedo] Redone: "${state.presetName}" (${state.after.length} values)`);
        return true;
    }

    /**
     * Получить историю undo
     * @returns {Array} массив состояний
     */
    getUndoHistory() {
        return [...this.undoStack];
    }

    /**
     * Получить историю redo
     * @returns {Array} массив состояний
     */
    getRedoHistory() {
        return [...this.redoStack];
    }

    /**
     * Проверить можно ли отменить
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Проверить можно ли повторить
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Очистить всю историю
     */
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
        console.log('[PresetUndo] History cleared');
    }

    /**
     * Получить размер стека undo
     * @returns {number}
     */
    getUndoCount() {
        return this.undoStack.length;
    }

    /**
     * Получить размер стека redo
     * @returns {number}
     */
    getRedoCount() {
        return this.redoStack.length;
    }
}

// Синглтон для использования во всём приложении
export const presetUndoManager = new PresetUndoManager();
