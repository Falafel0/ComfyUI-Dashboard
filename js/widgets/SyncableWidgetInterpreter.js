/**
 * SyncableWidgetInterpreter.js
 * 
 * Базовый класс для интерпретаторов с центральной синхронизацией
 * Устраняет дублирование setupLiveSync и syncNode во всех интерпретаторах
 * 
 * Использование:
 * class MyInterpreter extends SyncableWidgetInterpreter {
 *     render(w, nodeId, widgetIndex, options) {
 *         const wrapper = this.createWrapper(options);
 *         const input = document.createElement('input');
 *         
 *         input.onchange = (e) => {
 *             w.value = e.target.value;
 *             this.sync(w, nodeId, widgetIndex, input, (val) => {
 *                 // updateFn для синхронизации
 *             });
 *         };
 *         
 *         return wrapper;
 *     }
 * }
 */

import { WidgetInterpreter } from "./WidgetInterpreter.js";
import { centralSyncManager, createSyncKey } from "./CentralSyncManager.js";

export class SyncableWidgetInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        /** @type {Map<string, { nodeId, widgetIndex, widgetName }>} */
        this.activeSyncs = new Map();
    }

    /**
     * Настроить синхронизацию виджета с DOM элементом
     * Автоматически очищается при удалении элемента
     * 
     * @param {Object} w - объект виджета
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {HTMLElement} domElement - DOM элемент для отслеживания
     * @param {Function} updateFn - функция обновления DOM при изменении значения
     */
    setupLiveSync(w, nodeId, widgetIndex, domElement, updateFn) {
        if (!w || !domElement) {
            console.warn('[Syncable] Invalid sync setup');
            return;
        }

        const key = createSyncKey(nodeId, widgetIndex, w.name);
        
        // Сохранить информацию для очистки
        this.activeSyncs.set(key, { nodeId, widgetIndex, widgetName: w.name });
        
        // Подписаться на центральный менеджер
        centralSyncManager.subscribe(key, w, domElement, (newValue) => {
            // Обновить DOM
            if (updateFn) {
                updateFn(newValue);
            }
            
            // Сохранить виджет в графе
            this.syncNode(nodeId, widgetIndex, newValue, w);
        }, nodeId, widgetIndex);

        // Настроить MutationObserver для обнаружения удаления элемента
        this._setupCleanupObserver(key, domElement);
    }

    /**
     * Настроить автоматическую очистку при удалении элемента
     * @param {string} key 
     * @param {HTMLElement} domElement 
     */
    _setupCleanupObserver(key, domElement) {
        // Проверка через IntersectionObserver не подходит — используем периодическую проверку
        // Но теперь это делает CentralSyncManager, так что просто запоминаем элемент
        
        // Сохраняем ссылку на элемент для проверки в centralSyncManager
        // Центральная проверка: если document.body.contains(domElement) === false — отписка
    }

    /**
     * Отменить синхронизацию для конкретного виджета
     * @param {number} nodeId 
     * @param {number} widgetIndex 
     * @param {string} widgetName 
     */
    cleanupSync(nodeId, widgetIndex, widgetName) {
        const key = createSyncKey(nodeId, widgetIndex, widgetName);
        centralSyncManager.unsubscribe(key);
        this.activeSyncs.delete(key);
    }

    /**
     * Отменить все синхронизации для этого интерпретатора
     */
    cleanupAllSyncs() {
        for (const key of this.activeSyncs.keys()) {
            centralSyncManager.unsubscribe(key);
        }
        this.activeSyncs.clear();
    }

    /**
     * Улучшенная синхронизация с валидацией
     * Делегирует CentralSyncManager.syncNode()
     * 
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {*} value - новое значение
     * @param {Object} widgetRef - ссылка на виджет
     */
    syncNode(nodeId, widgetIndex, value, widgetRef = null) {
        centralSyncManager.syncNode(nodeId, widgetIndex, value, widgetRef);
    }

    /**
     * Быстрая синхронизация — обновить значение и транслировать
     * Используется в обработчиках onchange/oninput
     * 
     * @param {Object} w - объект виджета
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {*} value - новое значение
     * @param {HTMLElement} domElement - DOM элемент (опционально, для updateFn)
     * @param {Function} updateFn - функция обновления DOM (опционально)
     */
    sync(w, nodeId, widgetIndex, value, domElement = null, updateFn = null) {
        w.value = value;
        
        if (w.callback) {
            try {
                w.callback(value);
            } catch (error) {
                console.error(`[Syncable] Callback error:`, error);
            }
        }
        
        // Синхронизировать с графом
        this.syncNode(nodeId, widgetIndex, value, w);
        
        // Обновить DOM если нужно
        if (domElement && updateFn) {
            updateFn(value);
        }
    }

    /**
     * Создать обработчик с автоматической синхронизацией
     * Удобно для создания input/select/textarea без дублирования кода
     * 
     * @param {Object} w - объект виджета
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {HTMLElement} domElement - DOM элемент
     * @param {Object} options - опции
     * @returns {Object} { onChange, onInput, onSync } — готовые обработчики
     */
    createSyncedHandlers(w, nodeId, widgetIndex, domElement, options = {}) {
        const onChange = (e) => {
            const value = this._extractValue(e.target, w);
            this.sync(w, nodeId, widgetIndex, value);
        };

        const onInput = (e) => {
            const value = this._extractValue(e.target, w);
            w.value = value;
            if (w.callback) w.callback(value);
            // Не вызываем syncNode здесь — только при onchange
        };

        // Настроить live sync для внешних изменений
        this.setupLiveSync(w, nodeId, widgetIndex, domElement, (newValue) => {
            this._updateDOMValue(domElement, newValue, w);
        });

        return { onChange, onInput, onSync: (val) => this._updateDOMValue(domElement, val, w) };
    }

    /**
     * Извлечь значение из DOM элемента
     * @param {HTMLElement} element 
     * @param {Object} w 
     * @returns {*}
     */
    _extractValue(element, w) {
        if (element.type === 'checkbox') {
            return element.checked;
        }
        if (element.type === 'number' || element.type === 'range') {
            const num = parseFloat(element.value);
            return isNaN(num) ? (w.value ?? 0) : num;
        }
        if (element.tagName === 'SELECT' && element.multiple) {
            return Array.from(element.selectedOptions).map(opt => opt.value);
        }
        return element.value;
    }

    /**
     * Обновить значение в DOM элементе
     * @param {HTMLElement} element 
     * @param {*} value 
     * @param {Object} w 
     */
    _updateDOMValue(element, value, w) {
        if (!element) return;
        
        // Пропустить если элемент в фокусе (пользователь редактирует)
        if (document.activeElement === element) return;
        
        if (element.type === 'checkbox') {
            if (element.checked !== !!value) {
                element.checked = !!value;
            }
        } else if (element.type === 'number' || element.type === 'range') {
            const numVal = parseFloat(value);
            if (!isNaN(numVal) && element.value !== String(numVal)) {
                element.value = numVal;
            }
        } else if (element.tagName === 'SELECT' && element.multiple) {
            const values = Array.isArray(value) ? value : [value];
            Array.from(element.options).forEach(opt => {
                opt.selected = values.includes(opt.value);
            });
        } else {
            if (element.value !== value) {
                element.value = value ?? '';
            }
        }
    }

    /**
     * Очистка при удалении виджета
     * Вызывать при удалении DOM элемента
     * @param {number} nodeId 
     * @param {number} widgetIndex 
     * @param {string} widgetName 
     */
    onWidgetRemoved(nodeId, widgetIndex, widgetName) {
        this.cleanupSync(nodeId, widgetIndex, widgetName);
    }

    /**
     * Получить статистику синхронизации
     * @returns {Object}
     */
    getSyncStats() {
        return {
            activeSyncs: this.activeSyncs.size,
            centralStats: centralSyncManager.getStats()
        };
    }
}

export default SyncableWidgetInterpreter;
