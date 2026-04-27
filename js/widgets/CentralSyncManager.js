/**
 * CentralSyncManager.js
 * 
 * Центральный менеджер синхронизации виджетов
 * Заменяет множественные requestAnimationFrame циклы в каждом интерпретаторе
 * на один оптимизированный центральный цикл
 * 
 * Преимущества:
 * - Устранение утечки памяти (правильная очистка при удалении элементов)
 * - Снижение нагрузки (1 цикл вместо 10-20)
 * - Централизованный контроль и мониторинг
 */

import { broadcastWidgetUpdate } from "../state.js";

/**
 * @typedef {Object} SyncSubscription
 * @property {Object} w - объект виджета
 * @property {HTMLElement} domElement - DOM элемент
 * @property {Function} updateFn - функция обновления
 * @property {*} lastVal - последнее значение
 * @property {number} nodeId - ID ноды
 * @property {number} widgetIndex - индекс виджета
 */

export class CentralSyncManager {
    constructor() {
        /** @type {Map<string, SyncSubscription>} */
        this.subscriptions = new Map();
        this.isRunning = false;
        this.rafId = null;
        this.stats = {
            totalSubscriptions: 0,
            totalUpdates: 0,
            startTime: Date.now()
        };
    }

    /**
     * Подписаться на изменения виджета
     * @param {string} key - уникальный ключ (обычно `${nodeId}_${widgetIndex}_${widgetName}`)
     * @param {Object} w - объект виджета
     * @param {HTMLElement} domElement - DOM элемент для отслеживания
     * @param {Function} updateFn - функция вызываемая при изменении
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     */
    subscribe(key, w, domElement, updateFn, nodeId, widgetIndex) {
        if (!key || !domElement) {
            console.warn('[CentralSync] Invalid subscription attempt:', key);
            return;
        }

        // Если уже есть подписка с таким ключом — отменить её
        if (this.subscriptions.has(key)) {
            this.unsubscribe(key);
        }

        const subscription = {
            w,
            domElement,
            updateFn,
            lastVal: w?.value,
            nodeId,
            widgetIndex,
            createdAt: Date.now()
        };

        this.subscriptions.set(key, subscription);
        this.stats.totalSubscriptions++;

        // Запустить центральный цикл если ещё не запущен
        if (!this.isRunning) {
            this.start();
        }
    }

    /**
     * Отписаться от синхронизации
     * @param {string} key - ключ подписки
     */
    unsubscribe(key) {
        if (this.subscriptions.has(key)) {
            const sub = this.subscriptions.get(key);
            
            // Очистка ссылок для сборщика мусора
            sub.w = null;
            sub.domElement = null;
            sub.updateFn = null;
            
            this.subscriptions.delete(key);
        }

        // Если подписок не осталось — остановить цикл
        if (this.subscriptions.size === 0 && this.isRunning) {
            this.stop();
        }
    }

    /**
     * Отписаться по DOM элементу (для очистки при удалении)
     * @param {HTMLElement} domElement - DOM элемент
     */
    unsubscribeByElement(domElement) {
        const toRemove = [];
        
        for (const [key, sub] of this.subscriptions.entries()) {
            if (sub.domElement === domElement) {
                toRemove.push(key);
            }
        }
        
        toRemove.forEach(key => this.unsubscribe(key));
    }

    /**
     * Запустить центральный цикл синхронизации
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        
        const loop = () => {
            if (!this.isRunning) return;
            
            const toRemove = [];
            let updatesThisFrame = 0;
            
            for (const [key, sub] of this.subscriptions.entries()) {
                // Проверка: элемент всё ещё в DOM?
                if (!document.body.contains(sub.domElement)) {
                    toRemove.push(key);
                    continue;
                }
                
                // Проверка: значение изменилось?
                const currentValue = sub.w?.value;
                if (currentValue !== sub.lastVal) {
                    sub.lastVal = currentValue;
                    updatesThisFrame++;
                    
                    try {
                        sub.updateFn(currentValue);
                        this.stats.totalUpdates++;
                    } catch (error) {
                        console.error(`[CentralSync] Update error for ${key}:`, error);
                        // При ошибке — отписаться чтобы не спамить
                        toRemove.push(key);
                    }
                }
            }
            
            // Удалить невалидные подписки
            toRemove.forEach(key => {
                this.subscriptions.delete(key);
            });
            
            // Если подписок не осталось — остановить
            if (this.subscriptions.size === 0) {
                this.stop();
                return;
            }
            
            this.rafId = requestAnimationFrame(loop);
        };
        
        this.rafId = requestAnimationFrame(loop);
    }

    /**
     * Остановить центральный цикл
     */
    stop() {
        this.isRunning = false;
        
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * Принудительно триггернуть обновление для конкретного виджета
     * @param {string} key - ключ подписки
     */
    forceUpdate(key) {
        const sub = this.subscriptions.get(key);
        if (sub) {
            sub.lastVal = undefined; // Сбросить чтобы триггернуть обновление
        }
    }

    /**
     * Принудительно триггернуть все обновления
     */
    forceUpdateAll() {
        for (const [key, sub] of this.subscriptions.entries()) {
            sub.lastVal = undefined;
        }
    }

    /**
     * Получить статистику
     * @returns {Object}
     */
    getStats() {
        const elapsed = (Date.now() - this.stats.startTime) / 1000;
        return {
            activeSubscriptions: this.subscriptions.size,
            totalSubscriptions: this.stats.totalSubscriptions,
            totalUpdates: this.stats.totalUpdates,
            updatesPerSecond: elapsed > 0 ? Math.round(this.stats.totalUpdates / elapsed) : 0,
            uptime: `${Math.round(elapsed)}s`
        };
    }

    /**
     * Очистить все подписки (для горячей перезагрузки)
     */
    clearAll() {
        this.stop();
        
        for (const [key, sub] of this.subscriptions.entries()) {
            sub.w = null;
            sub.domElement = null;
            sub.updateFn = null;
        }
        
        this.subscriptions.clear();
        this.stats = {
            totalSubscriptions: 0,
            totalUpdates: 0,
            startTime: Date.now()
        };
    }

    /**
     * Улучшенная синхронизация с валидацией
     * @param {number} nodeId - ID ноды
     * @param {number} widgetIndex - индекс виджета
     * @param {*} value - новое значение
     * @param {Object} widgetRef - ссылка на виджет для сравнения имён
     */
    syncNode(nodeId, widgetIndex, value, widgetRef = null) {
        if (!window.app?.graph) {
            console.warn('[CentralSync] App graph not available');
            return;
        }

        const liveNode = window.app.graph.getNodeById(nodeId);
        if (!liveNode?.widgets) {
            console.warn(`[CentralSync] Node ${nodeId} not found or has no widgets`);
            return;
        }

        // Найти целевой виджет
        let targetWidget = liveNode.widgets[widgetIndex];
        
        // Если индекс не совпадает — найти по имени
        if ((!targetWidget || (widgetRef && targetWidget.name !== widgetRef.name)) && widgetRef) {
            targetWidget = liveNode.widgets.find(wid => wid.name === widgetRef.name);
        }

        if (!targetWidget) {
            console.warn(`[CentralSync] Widget ${widgetIndex} not found in node ${nodeId}`);
            return;
        }

        // Обновить значение
        targetWidget.value = value;
        
        // Вызвать callback если есть
        if (targetWidget.callback) {
            try {
                targetWidget.callback(value);
            } catch (error) {
                console.error(`[CentralSync] Widget callback error:`, error);
            }
        }

        // Обновить canvas
        if (window.app.canvas?.parentNode) {
            try {
                window.app.graph.setDirtyCanvas(true, true);
            } catch (error) {
                console.warn('[CentralSync] setDirtyCanvas error:', error);
            }
        }

        // Транслировать изменение
        try {
            broadcastWidgetUpdate(nodeId, widgetIndex, value, 'ui');
        } catch (error) {
            console.warn('[CentralSync] broadcastWidgetUpdate error:', error);
        }
    }
}

/**
 * Singleton instance
 */
export const centralSyncManager = new CentralSyncManager();

/**
 * Helper для создания уникальных ключей
 * @param {number} nodeId 
 * @param {number} widgetIndex 
 * @param {string} widgetName 
 * @returns {string}
 */
export function createSyncKey(nodeId, widgetIndex, widgetName = '') {
    return `${nodeId}_${widgetIndex}_${widgetName}`;
}

export default CentralSyncManager;
