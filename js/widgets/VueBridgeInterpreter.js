/**
 * VueBridgeInterpreter.js
 * Мост для поддержки нод ComfyUI 2.0 (Vue-based)
 *
 * Этот интерпретатор обнаруживает ноды, использующие новый рендерер,
 * и создает совместимый интерфейс, связывая данные между Vue и нашей системой.
 */

import { WidgetInterpreter } from './WidgetInterpreter.js';

export class VueBridgeInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        this.priority = 95; // Высокий приоритет, но ниже чем CustomDOM (100)
        this.name = 'VueBridge';
        this.description = 'Адаптер для нод ComfyUI 2.0 (Vue)';

        this.isVueAvailable = typeof window.Vue !== 'undefined' || typeof window.app?.vueApp !== 'undefined';
    }

    /**
     * Проверяет, является ли нода нодой 2.0 (Vue)
     * В ComfyUI 2.0 у нод может быть свойство renderMethod или специфичная структура
     */
    canHandle(w, node, options) {
        if (node._isVueNode) return true;

        if (window.app?.isVueMode) return true;

        if (w.type === 'custom_vue_widget' || (w.element && w.element.__vue__)) {
            return true;
        }

        return false;
    }

    /**
     * Рендеринг виджета для Vue-ноды
     */
    render(w, nodeId, widgetIndex, options) {
        const wrapper = this.createWrapper(options);
        const container = document.createElement('div');
        container.className = 'a11-vue-bridge-container';
        container.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #aaa;
            border: 1px dashed #444;
            border-radius: 4px;
            background: rgba(0,0,0,0.2);
        `;

        const vueElement = this.findVueElement(nodeId, widgetIndex);

        if (vueElement) {
            container.innerHTML = '';
            container.appendChild(vueElement.cloneNode(true));
            container.style.border = 'none';
            container.style.background = 'transparent';
        } else {
            container.innerHTML = `
                <div style="text-align:center">
                    <div>🔮 Vue Node Detected</div>
                    <div style="font-size:10px; margin-top:4px">Режим совместимости 2.0</div>
                    <div style="font-size:9px; color:#666">Widget: ${w.name}</div>
                </div>
            `;

            this.triggerVueRender(nodeId, widgetIndex);
        }

        wrapper.appendChild(container);
        this.applyStyles(wrapper, options);

        return wrapper;
    }

    /**
     * Поиск элемента, созданного Vue, внутри ноды
     * В ComfyUI 2.0 ноды могут хранить ссылки на свои DOM элементы
     */
    findVueElement(nodeId, widgetIndex) {
        try {
            const node = window.app?.graph?.getNodeById(nodeId);
            if (!node) return null;

            if (node.widgets?.[widgetIndex]?.element) {
                return node.widgets[widgetIndex].element;
            }

            const potentialElements = document.querySelectorAll(`[data-node-id="${nodeId}"]`);
            if (potentialElements.length > 0) {
                return potentialElements[widgetIndex] || potentialElements[0];
            }
        } catch (e) {
            console.warn('[VueBridge] Error finding Vue element:', e);
        }
        return null;
    }

    /**
     * Триггер перерисовки Vue-компонента
     * Иногда требуется явно сказать Vue обновить состояние
     */
    triggerVueRender(nodeId, widgetIndex) {
        try {
            const node = window.app?.graph?.getNodeById(nodeId);
            if (!node) return;

            if (typeof node.onDrawBackground === 'function') {
                node.setDirtyCanvas(true, true);
            }

        } catch (e) {
            console.warn('[VueBridge] Error triggering render:', e);
        }
    }

    /**
     * Создание двусторонней связки данных (Data Binding)
     * Для синхронизации значения между нашим UI и Vue-нодой
     */
    bindValue(widgetElement, node, widgetKey, initialValue) {
        let currentValue = initialValue;

        const getValue = () => {
            if (node.widgets) {
                const w = node.widgets.find(x => x.name === widgetKey);
                return w ? w.value : currentValue;
            }
            return currentValue;
        };

        const setValue = (val) => {
            currentValue = val;
            if (node.widgets) {
                const w = node.widgets.find(x => x.name === widgetKey);
                if (w) {
                    w.value = val;
                    if (w.callback) w.callback(val);
                }
            }
            this.triggerVueRender(node.id, -1);
        };

        const input = widgetElement.querySelector('input, select');
        if (input) {
            input.value = getValue();
            input.addEventListener('change', (e) => {
                setValue(e.target.value);
            });
        }

        return { getValue, setValue };
    }
}

export default VueBridgeInterpreter;
