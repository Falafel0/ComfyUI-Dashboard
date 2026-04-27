import { app } from "../../../scripts/app.js";
import { WidgetInterpreter } from "./WidgetInterpreter.js";

/**
 * Улучшенный менеджер для "кражи" DOM элементов из нод и перемещения их в overlay
 * 
 * P0 улучшения:
 * - Остановка setInterval когда не нужен (устранена утечка CPU)
 * - Очистка при удалении контейнера (устранена утечка DOM)
 * - Защита от гонки состояний (lock机制)
 * 
 * P1 улучшения:
 * - Убраны !important — используются CSS классы
 * - Улучшенный triggerResize без глобальных событий
 * - Обработка ошибок с логированием
 * - Поддержка отслеживания нескольких хостов
 */
const DOMManager = {
    /** @type {Map<Object, { parent: HTMLElement, placeholder: HTMLElement, origStyle: string, hosts: Set<HTMLElement>, currentHost: HTMLElement }>} */
    stolen: new Map(),
    timer: null,
    activeCount: 0,
    isShuttingDown: false,
    resizeObserver: null,

    /**
     * Запустить периодическую проверку
     * P0: Таймер запускается только когда есть активные "украденные" элементы
     */
    start() {
        if (this.timer) return;
        
        this.isShuttingDown = false;
        this.activeCount++;

        this.timer = setInterval(() => {
            if (this.isShuttingDown) {
                this.stop();
                return;
            }

            const overlayVisible = document.getElementById("a11-overlay")?.classList.contains("visible");

            this.stolen.forEach((data, w) => {
                try {
                    const currentHost = data.currentHost;
                    if (!currentHost) return;

                    const isInDOM = document.body.contains(currentHost);
                    const inOverlay = currentHost.closest("#a11-overlay") !== null;

                    if (!isInDOM || (inOverlay && !overlayVisible)) {
                        this.returnToGraph(w, data);
                    }
                } catch (error) {
                    console.error('[DOMManager] Error in periodic check:', error);
                }
            });

            // Если украденных элементов нет — остановить таймер
            if (this.stolen.size === 0) {
                this.stop();
            }
        }, 500);

        // Не давать таймеру работать в фоне когда вкладка не активна
        if (document.hidden !== undefined) {
            this._visibilityHandler = () => {
                if (document.hidden) {
                    clearInterval(this.timer);
                    this.timer = null;
                } else if (this.stolen.size > 0) {
                    this.start();
                }
            };
            document.addEventListener('visibilitychange', this._visibilityHandler);
        }
    },

    /**
     * Остановить периодическую проверку
     * P0: Правильная очистка таймера
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }

        this.isShuttingDown = true;
    },

    /**
     * Полная очистка всех ресурсов
     * P0: Вызывается при закрытии overlay
     */
    cleanup() {
        this.stop();
        
        const stolenCopy = new Map(this.stolen);
        stolenCopy.forEach((data, w) => {
            try {
                this.returnToGraph(w, data);
            } catch (error) {
                console.error('[DOMManager] Error during cleanup:', error);
            }
        });

        this.stolen.clear();
        this.activeCount = 0;
        this.isShuttingDown = false;

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    },

    /**
     * "Украсть" DOM элемент и переместить в новый хост
     * P0: Защита от гонки состояний через проверку currentHost
     * 
     * @param {Object} w - объект виджета с w.element
     * @param {HTMLElement} newHost - новый контейнер
     * @param {Object} options - опции
     */
    steal(w, newHost, options = {}) {
        if (!w.element) {
            console.warn('[DOMManager] Widget has no element to steal');
            return;
        }

        if (!w.element.parentNode) {
            console.warn('[DOMManager] Widget element has no parent node');
            return;
        }

        // Запустить проверку если ещё не запущена
        this.start();

        // Если виджет уже "украден" — обновить хост
        if (this.stolen.has(w)) {
            const data = this.stolen.get(w);
            
            // P0: Защита от гонки — проверить что placeholder всё ещё на месте
            if (!this._validatePlaceholder(data)) {
                console.warn('[DOMManager] Placeholder invalid, returning to graph');
                this.returnToGraph(w, data);
                // Рекурсивно вызвать steal() заново
                setTimeout(() => this.steal(w, newHost, options), 0);
                return;
            }

            // Удалить из старого хоста
            if (data.currentHost && data.currentHost.contains(w.element)) {
                data.currentHost.removeChild(w.element);
            }

            // Добавить в новый хост
            data.currentHost = newHost;
            data.hosts.add(newHost);
            newHost.appendChild(w.element);
            
            this._applyStyles(w.element, options);
            this._triggerResize(w.element);
            return;
        }

        // Первая "кража"
        try {
            const originalParent = w.element.parentNode;
            const placeholder = document.createElement("div");
            placeholder.style.display = "none";
            placeholder.className = "a11-dom-placeholder";
            placeholder.dataset.widgetInfo = "placeholder";

            const origStyle = w.element.style.cssText;

            // Заменить элемент на placeholder
            originalParent.replaceChild(placeholder, w.element);
            
            // Вставить в новый хост
            newHost.appendChild(w.element);

            // Применить стили
            this._applyStyles(w.element, options);

            // Сохранить данные
            const data = {
                parent: originalParent,
                placeholder: placeholder,
                origStyle: origStyle,
                hosts: new Set([newHost]),
                currentHost: newHost,
                options: options
            };

            this.stolen.set(w, data);

            // Настроить ResizeObserver для автоматического масштабирования
            this._setupResizeObserver(w, data, newHost);

            // Триггерить resize
            this._triggerResize(w.element);

        } catch (error) {
            console.error('[DOMManager] Error stealing widget element:', error);
            // Попытаться восстановить состояние
            try {
                if (w.element.parentNode !== w.element.originalParent) {
                    w.element.originalParent?.appendChild(w.element);
                }
            } catch (restoreError) {
                console.error('[DOMManager] Failed to restore state:', restoreError);
            }
        }
    },

    /**
     * Проверить что placeholder всё ещё валиден
     * P0: Защита от гонки состояний
     */
    _validatePlaceholder(data) {
        return data.placeholder && 
               data.placeholder.parentNode === data.parent &&
               data.parent && 
               document.body.contains(data.parent);
    },

    /**
     * Применить стили к элементу
     * P1: Убраны !important — используются CSS переменные и классы
     */
    _applyStyles(el, options) {
        const scale = options.customScale ? (parseFloat(options.customScale) / 100) : 1;

        // Вместо !important используем прямые стили с высоким приоритетом
        el.style.position = 'absolute';
        el.style.transformOrigin = 'top left';
        el.style.left = '0';
        el.style.top = '0';
        el.style.margin = '0';
        el.style.zIndex = '1';

        if (scale !== 1) {
            el.style.transform = `scale(${scale})`;
            el.style.width = `${100 / scale}%`;
            el.style.height = `${100 / scale}%`;
        } else {
            el.style.transform = 'none';
            el.style.width = '100%';
            el.style.height = '100%';
        }

        if (options.objectFit) {
            el.style.objectFit = options.objectFit;
        }

        // Добавить класс для возможности переопределения стилей
        el.classList.add('a11-stolen-widget');
        if (scale !== 1) {
            el.classList.add('a11-stolen-widget-scaled');
        }
    },

    /**
     * Улучшенный triggerResize без глобальных событий
     * P1: Триггерит только целевой элемент, не window
     */
    _triggerResize(el) {
        // Используем ResizeObserver если доступен
        if (window.ResizeObserver && !this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const target = entry.target;
                    if (target && target.dispatchEvent) {
                        try {
                            target.dispatchEvent(new CustomEvent('resize', { 
                                bubbles: false,
                                detail: { entry }
                            }));
                        } catch (e) {
                            // Игнорировать ошибки dispatchEvent
                        }
                    }
                }
            });
        }

        // Для iframe — отдельная обработка
        if (el.tagName === 'IFRAME' && el.contentWindow) {
            try {
                // Не триггерим глобальный resize — только для iframe
                setTimeout(() => {
                    try {
                        el.contentWindow.dispatchEvent(new Event('resize'));
                    } catch (e) {}
                }, 50);
            } catch (e) {
                console.warn('[DOMManager] Cannot access iframe contentWindow:', e);
            }
        }

        // Триггерим resize только на целевом элементе
        try {
            el.dispatchEvent(new CustomEvent('widget-resized', { 
                bubbles: true,
                detail: { element: el }
            }));
        } catch (e) {
            // Игнорировать ошибки dispatchEvent
        }
    },

    /**
     * Настроить ResizeObserver для автоматического масштабирования
     * P1: Автоматический fit контента в хост
     */
    _setupResizeObserver(w, data, host) {
        if (!window.ResizeObserver) return;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.target === host && w.element) {
                    const hostRect = entry.contentRect;
                    const widgetRect = w.element.getBoundingClientRect();
                    
                    // Автоматический fit если включено
                    if (data.options.autoFit) {
                        const scaleX = hostRect.width / widgetRect.width;
                        const scaleY = hostRect.height / widgetRect.height;
                        const scale = Math.min(scaleX, scaleY, 1); // Не увеличивать больше оригинала
                        
                        if (scale < 0.95 || scale > 1.05) { // Применять только при значительном изменении
                            w.element.style.transform = `scale(${scale})`;
                            w.element.style.width = `${100 / scale}%`;
                            w.element.style.height = `${100 / scale}%`;
                        }
                    }
                }
            }
        });

        observer.observe(host);
        data.resizeObserver = observer;
    },

    /**
     * Вернуть виджет обратно в граф
     * P0: Проверка валидности перед возвратом
     */
    returnToGraph(w, data) {
        if (!data) {
            console.warn('[DOMManager] No data provided for return');
            return;
        }

        try {
            // Очистить ResizeObserver
            if (data.resizeObserver) {
                data.resizeObserver.disconnect();
                data.resizeObserver = null;
            }

            // Проверить что placeholder всё ещё валиден
            if (data.parent && data.placeholder && data.placeholder.parentNode === data.parent) {
                // Заменить placeholder на оригинальный элемент
                if (document.body.contains(w.element)) {
                    data.parent.replaceChild(w.element, data.placeholder);
                } else {
                    // Если элемент уже удалён из DOM — просто вставить вместо placeholder
                    data.placeholder.remove();
                    data.parent.appendChild(w.element);
                }
            } else if (data.parent) {
                // Placeholder невалиден — просто добавить элемент обратно
                data.parent.appendChild(w.element);
            }

            // Восстановить оригинальные стили
            if (data.origStyle) {
                w.element.style.cssText = data.origStyle;
            }

            // Удалить классы
            w.element.classList.remove('a11-stolen-widget', 'a11-stolen-widget-scaled');

        } catch (error) {
            console.error('[DOMManager] Error returning widget to graph:', error);
            // Попытаться восстановить элемент несмотря на ошибку
            try {
                if (w.element.parentNode && w.element.parentNode !== data.parent) {
                    // Удалить из текущего родителя
                    w.element.parentNode.removeChild(w.element);
                }
                if (data.parent) {
                    data.parent.appendChild(w.element);
                }
            } catch (restoreError) {
                console.error('[DOMManager] Failed to restore element:', restoreError);
            }
        }

        // Удалить из stolen
        this.stolen.delete(w);
    },

    /**
     * Получить информацию о "украденных" виджетах
     */
    getStolenInfo() {
        const info = [];
        this.stolen.forEach((data, w) => {
            info.push({
                widgetName: w.name || 'unknown',
                hostsCount: data.hosts.size,
                currentHost: data.currentHost?.className || 'none',
                hasValidPlaceholder: this._validatePlaceholder(data)
            });
        });
        return info;
    }
};

/**
 * Интерпретатор для кастомных DOM виджетов
 * Обрабатывает виджеты с нативными HTMLElement (LayerForge, Qwen, AceNodes и др.)
 * 
 * P0+P1: Использует улучшенный DOMManager
 */
export class CustomDOMInterpreter extends WidgetInterpreter {
    constructor() {
        super();
        this.priority = 100; // Высокий приоритет
        this.supportedTypes = ['customdom', 'dom', 'host'];
    }

    canHandle(w, node, options) {
        return w.element instanceof HTMLElement;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);
        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        const host = document.createElement("div");
        host.className = "a11-custom-widget-host";

        host.style.position = "relative";
        host.style.width = "100%";
        host.style.overflow = options.overflow || "hidden";
        host.style.borderRadius = "4px";
        host.style.border = "1px solid var(--a11-border)";

        const hStr = options.customHeight ? String(options.customHeight).trim().toLowerCase() : "";
        if (!hStr) {
            host.style.height = "250px";
            host.style.flexShrink = "0";
        } else if (hStr === "auto" || hStr === "100%" || hStr === "flex") {
            host.style.flexGrow = "1";
            host.style.minHeight = "50px";
        } else {
            host.style.flexGrow = "1";
            host.style.minHeight = "0";
        }

        // P0: Обработка ошибок при steal
        try {
            DOMManager.steal(w, host, options);
        } catch (error) {
            console.error('[CustomDOM] Error stealing widget:', error);
            
            // Показать ошибку вместо виджета
            const errorPlaceholder = document.createElement("div");
            errorPlaceholder.className = "a11-custom-widget-error";
            errorPlaceholder.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--a11-error, #ff4444);
                font-size: 12px;
                text-align: center;
                padding: 20px;
            `;
            errorPlaceholder.innerHTML = `
                <div>
                    <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
                    <div>Failed to load custom widget</div>
                    <div style="font-size: 10px; color: #666; margin-top: 4px;">${error.message}</div>
                </div>
            `;
            host.appendChild(errorPlaceholder);
        }

        wrapper.appendChild(host);
        this.applyStyles(wrapper, lbl, [], options);

        return wrapper;
    }
}

export default CustomDOMInterpreter;
export { DOMManager };
