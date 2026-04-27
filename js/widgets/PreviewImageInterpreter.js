import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { SyncableWidgetInterpreter } from "./SyncableWidgetInterpreter.js";

/**
 * Утилита для создания хеша из информации об изображении
 * Используется для кеширования — не перезагружать если изображение не изменилось
 */
function hashImageInfo(imgInfo) {
    if (!imgInfo) return '';
    return `${imgInfo.filename || ''}_${imgInfo.subfolder || ''}_${imgInfo.type || ''}`;
}

/**
 * Интерпретатор для нод предпросмотра изображений
 * P0+P1 улучшения:
 * - P0: Исправлена утечка событий — автоматическая очистка через MutationObserver
 * - P0: Обработка ошибок загрузки с сообщениями
 * - P1: Кеширование изображений — не перезагружать если не изменились
 * - P1: Индикатор загрузки — спиннер вместо пустого placeholder
 * - P1: Поддержка режима галереи для нескольких изображений
 */
export class PreviewImageInterpreter extends SyncableWidgetInterpreter {
    constructor() {
        super();
        this.priority = 85;
        this.supportedNodeTypes = ['previewimage', 'save image', 'showtext'];
        
        // Кеширование: nodeId -> { hash, url, timestamp }
        this._imageCache = new Map();
        // Таймауты кеширования (5 минут)
        this._cacheTimeout = 5 * 60 * 1000;
    }

    canHandle(w, node, options) {
        const isPreviewNode = node.type && (
            node.type === "PreviewImage" ||
            node.type === "ShowText" ||
            node.type.toLowerCase().includes("preview") ||
            node.type.toLowerCase().includes("show")
        );
        const isImageWidget = w.name === "$$canvas-image-preview" ||
                              w.name === "image" ||
                              w.name === "text";

        return (isPreviewNode || w.name === "$$canvas-image-preview") && isImageWidget;
    }

    render(w, nodeId, widgetIndex, options = {}) {
        const wrapper = this.createWrapper(options);

        if (!options.customHeight) {
            wrapper.classList.add("gw-widget-wrapper--grows");
        }

        const displayName = this.getDisplayName(w, options);

        let lbl = null;
        if (!options.hideLabel) {
            lbl = this.createLabel(displayName, options);
            if (lbl) wrapper.appendChild(lbl);
        }

        // Определяем режим отображения
        const isGalleryMode = options.previewMode === "gallery";

        if (isGalleryMode) {
            return this._renderGallery(w, nodeId, widgetIndex, options, wrapper, lbl);
        }

        return this._renderSingleImage(w, nodeId, widgetIndex, options, wrapper, lbl);
    }

    /**
     * Рендер одного изображения (стандартный режим)
     */
    _renderSingleImage(w, nodeId, widgetIndex, options, wrapper, lbl) {
        const imgContainer = document.createElement("div");
        imgContainer.className = "a11-preview-container";
        imgContainer.style.cssText = `
            width: 100%;
            height: ${options.customHeight || 200}px;
            background: #1a1a1a;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;

        const img = document.createElement("img");
        img.className = "a11-node-preview";
        img.dataset.nodeId = nodeId;
        img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            object-fit: ${options.objectFit || 'contain'};
            display: none;
        `;
        if (options.objectFit) img.style.objectFit = options.objectFit;

        const placeholder = document.createElement("div");
        placeholder.className = "a11-preview-placeholder";
        placeholder.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
                <div>Waiting for execution...</div>
            </div>
        `;
        placeholder.style.cssText = `
            color: #666;
            font-size: 12px;
            text-align: center;
        `;

        // ✅ P1: Спиннер загрузки
        const spinner = document.createElement("div");
        spinner.className = "a11-preview-spinner";
        spinner.innerHTML = `
            <div style="text-align: center;">
                <div style="
                    width: 32px;
                    height: 32px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: var(--a11-accent, #ea580c);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin: 0 auto 8px;
                "></div>
                <div style="color: #888; font-size: 11px;">Loading...</div>
            </div>
        `;
        spinner.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: none;
            z-index: 10;
        `;

        // Добавляем CSS анимации spin если ещё нет
        if (!document.getElementById('a11-spin-animation')) {
            const style = document.createElement('style');
            style.id = 'a11-spin-animation';
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        // Счётчик изображений
        const imageCounter = document.createElement("div");
        imageCounter.className = "a11-image-counter";
        imageCounter.style.cssText = `
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            display: none;
            z-index: 11;
            backdrop-filter: blur(4px);
        `;

        imgContainer.appendChild(img);
        imgContainer.appendChild(placeholder);
        imgContainer.appendChild(spinner);
        imgContainer.appendChild(imageCounter);
        wrapper.appendChild(imgContainer);

        // Состояние
        let currentImageIndex = 0;
        let totalImages = 0;

        /**
         * ✅ P1: Обновление изображения с кешированием
         */
        const updateImage = () => {
            if (!app.nodeOutputs || !app.nodeOutputs[nodeId]) {
                placeholder.style.display = 'block';
                placeholder.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
                        <div>Waiting for execution...</div>
                    </div>
                `;
                img.style.display = 'none';
                spinner.style.display = 'none';
                imageCounter.style.display = 'none';
                return;
            }

            const output = app.nodeOutputs[nodeId];
            let images = output.images || output.prev_images || [];

            if (images.length > 0) {
                // Показываем счётчик если изображений > 1
                totalImages = images.length;
                if (totalImages > 1) {
                    imageCounter.textContent = `${currentImageIndex + 1}/${totalImages}`;
                    imageCounter.style.display = 'block';
                } else {
                    imageCounter.style.display = 'none';
                }

                const imgInfo = images[currentImageIndex];
                const filename = imgInfo.filename;
                const subfolder = imgInfo.subfolder || '';
                const type = imgInfo.type || 'output';

                if (filename) {
                    // ✅ P1: Проверяем кеш
                    const cacheKey = `${nodeId}_${filename}`;
                    const cached = this._imageCache.get(cacheKey);
                    const now = Date.now();

                    if (cached && (now - cached.timestamp) < this._cacheTimeout) {
                        // Используем кешированный URL
                        const imageUrl = cached.url;
                        this._loadImage(img, imageUrl, placeholder, spinner);
                    } else {
                        // Загружаем новое изображение
                        const params = new URLSearchParams({
                            filename: filename,
                            subfolder: subfolder,
                            type: type,
                            t: Date.now()
                        });
                        const imageUrl = `/view?${params.toString()}`;
                        
                        // Сохраняем в кеш
                        this._imageCache.set(cacheKey, {
                            hash: hashImageInfo(imgInfo),
                            url: imageUrl,
                            timestamp: now
                        });

                        this._loadImage(img, imageUrl, placeholder, spinner);
                    }

                    wrapper.dataset.imageUrl = img.src;
                    wrapper.dataset.imageType = 'preview';
                    wrapper._currentImageInfo = imgInfo;

                    imgContainer.dispatchEvent(new CustomEvent('image-loaded', { bubbles: true }));
                    return;
                }
            }

            placeholder.style.display = 'block';
            img.style.display = 'none';
            spinner.style.display = 'none';
            imageCounter.style.display = 'none';
            wrapper.dataset.imageUrl = '';
        };

        /**
         * ✅ P1: Загрузка изображения с индикатором и обработкой ошибок
         */
        this._loadImage = (imgElement, url, placeholderEl, spinnerEl) => {
            // Показываем спиннер, скрываем остальное
            spinnerEl.style.display = 'block';
            placeholderEl.style.display = 'none';
            imgElement.style.display = 'none';

            // ✅ P0: Обработка ошибок загрузки
            imgElement.onload = () => {
                spinnerEl.style.display = 'none';
                imgElement.style.display = 'block';
                wrapper.classList.add('changed');
                setTimeout(() => wrapper.classList.remove('changed'), 500);
            };

            imgElement.onerror = (e) => {
                spinnerEl.style.display = 'none';
                placeholderEl.style.display = 'block';
                placeholderEl.innerHTML = `
                    <div style="text-align: center; color: var(--a11-error, #ff4444);">
                        <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
                        <div>Failed to load image</div>
                        <div style="font-size: 10px; margin-top: 4px; color: #666;">
                            ${url.substring(0, 50)}...
                        </div>
                    </div>
                `;
                imgElement.style.display = 'none';
                console.error('[Preview] Image load failed:', url, e);
            };

            imgElement.src = url;
        };

        // Навигация для нескольких изображений
        if (totalImages > 1) {
            const navPrev = document.createElement("button");
            navPrev.className = "a11-preview-nav-btn";
            navPrev.innerHTML = "◀";
            navPrev.style.cssText = `
                position: absolute;
                left: 8px;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(0,0,0,0.6);
                color: white;
                border: none;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                display: none;
                z-index: 12;
                font-size: 14px;
                backdrop-filter: blur(4px);
            `;
            navPrev.onclick = (e) => {
                e.stopPropagation();
                currentImageIndex = (currentImageIndex - 1 + totalImages) % totalImages;
                updateImage();
            };

            const navNext = document.createElement("button");
            navNext.className = "a11-preview-nav-btn";
            navNext.innerHTML = "▶";
            navNext.style.cssText = navPrev.style.cssText.replace('left: 8px', 'right: 8px');
            navNext.onclick = (e) => {
                e.stopPropagation();
                currentImageIndex = (currentImageIndex + 1) % totalImages;
                updateImage();
            };

            imgContainer.appendChild(navPrev);
            imgContainer.appendChild(navNext);

            // Показываем навигацию когда есть > 1 изображений
            const origUpdateImage = updateImage;
            updateImage = () => {
                origUpdateImage();
                if (totalImages > 1) {
                    navPrev.style.display = 'block';
                    navNext.style.display = 'block';
                }
            };
        }

        // Начальная загрузка
        setTimeout(updateImage, 100);

        // ✅ P0: Подписка на события с автоматической очисткой
        const onExecuted = (e) => {
            if (options.previewAuto !== false && e.detail?.node?.id === nodeId) {
                // Сбросить индекс при новом выполнении
                currentImageIndex = 0;
                updateImage();
            }
        };

        const onStatus = (e) => {
            if (e.detail?.progress?.node_id && e.detail.progress.node_id.toString() === nodeId.toString()) {
                setTimeout(updateImage, 50);
            }
        };

        wrapper._onExecuted = onExecuted;
        wrapper._onStatus = onStatus;
        api.addEventListener('executed', onExecuted);
        api.addEventListener('status', onStatus);

        // ✅ P0: Автоматическая очистка через MutationObserver
        this._setupAutoCleanup(wrapper, nodeId);

        this.applyStyles(wrapper, lbl, [], options);

        return wrapper;
    }

    /**
     * Рендер в режиме галереи (P1)
     */
    _renderGallery(w, nodeId, widgetIndex, options, wrapper, lbl) {
        const galleryContainer = document.createElement("div");
        galleryContainer.className = "a11-preview-gallery";
        galleryContainer.style.cssText = `
            width: 100%;
            height: ${options.customHeight || 300}px;
            background: #1a1a1a;
            border-radius: 4px;
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 8px;
            padding: 8px;
        `;

        const placeholder = document.createElement("div");
        placeholder.className = "a11-preview-placeholder";
        placeholder.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 32px; margin-bottom: 8px;">🖼️</div>
                <div>Waiting for images...</div>
            </div>
        `;
        placeholder.style.cssText = `
            color: #666;
            font-size: 12px;
            text-align: center;
            grid-column: 1 / -1;
        `;

        galleryContainer.appendChild(placeholder);
        wrapper.appendChild(galleryContainer);

        /**
         * Обновление галереи
         */
        const updateGallery = () => {
            if (!app.nodeOutputs || !app.nodeOutputs[nodeId]) {
                placeholder.style.display = 'block';
                galleryContainer.querySelectorAll('.a11-gallery-thumb').forEach(el => el.remove());
                return;
            }

            const output = app.nodeOutputs[nodeId];
            let images = output.images || output.prev_images || [];

            if (images.length > 0) {
                placeholder.style.display = 'none';

                // Удаляем старые миниатюры
                galleryContainer.querySelectorAll('.a11-gallery-thumb').forEach(el => el.remove());

                // Создаём новые миниатюры
                images.forEach((imgInfo, idx) => {
                    const thumb = document.createElement("img");
                    thumb.className = "a11-gallery-thumb";
                    
                    const cacheKey = `${nodeId}_${imgInfo.filename}`;
                    const cached = this._imageCache.get(cacheKey);
                    const now = Date.now();

                    let imageUrl;
                    if (cached && (now - cached.timestamp) < this._cacheTimeout) {
                        imageUrl = cached.url;
                    } else {
                        const params = new URLSearchParams({
                            filename: imgInfo.filename,
                            subfolder: imgInfo.subfolder || '',
                            type: imgInfo.type || 'output',
                            t: Date.now()
                        });
                        imageUrl = `/view?${params.toString()}`;
                        this._imageCache.set(cacheKey, {
                            hash: hashImageInfo(imgInfo),
                            url: imageUrl,
                            timestamp: now
                        });
                    }

                    thumb.src = imageUrl;
                    thumb.style.cssText = `
                        width: 100%;
                        aspect-ratio: 1;
                        object-fit: cover;
                        border-radius: 4px;
                        cursor: pointer;
                        border: 2px solid transparent;
                        transition: all 0.2s ease;
                    `;
                    thumb.onmouseover = () => {
                        thumb.style.borderColor = 'var(--a11-accent, #ea580c)';
                        thumb.style.transform = 'scale(1.05)';
                    };
                    thumb.onmouseout = () => {
                        thumb.style.borderColor = 'transparent';
                        thumb.style.transform = 'scale(1)';
                    };
                    thumb.onclick = () => {
                        // Открыть полноразмерное изображение
                        this._openFullscreen(imageUrl, imgInfo);
                    };

                    galleryContainer.appendChild(thumb);
                });
            } else {
                placeholder.style.display = 'block';
            }
        };

        setTimeout(updateGallery, 100);

        // Подписка на события
        const onExecuted = (e) => {
            if (options.previewAuto !== false && e.detail?.node?.id === nodeId) {
                updateGallery();
            }
        };

        const onStatus = (e) => {
            if (e.detail?.progress?.node_id && e.detail.progress.node_id.toString() === nodeId.toString()) {
                setTimeout(updateGallery, 50);
            }
        };

        wrapper._onExecuted = onExecuted;
        wrapper._onStatus = onStatus;
        api.addEventListener('executed', onExecuted);
        api.addEventListener('status', onStatus);

        // ✅ P0: Автоматическая очистка
        this._setupAutoCleanup(wrapper, nodeId);

        this.applyStyles(wrapper, lbl, [], options);

        return wrapper;
    }

    /**
     * ✅ P0: Автоматическая очистка при удалении элемента
     */
    _setupAutoCleanup(wrapper, nodeId) {
        // Очистка при удалении wrapper из DOM
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (node === wrapper || wrapper.contains?.(node)) {
                        this._cleanup(wrapper);
                        observer.disconnect();
                        return;
                    }
                }
            }
        });

        // Начинаем наблюдение
        try {
            observer.observe(document.body, { childList: true, subtree: true });
            // Сохраняем observer для возможной ручной очистки
            wrapper._cleanupObserver = observer;
        } catch (e) {
            console.warn('[Preview] Failed to setup MutationObserver:', e);
            // Fallback: проверяем периодически
            const checkInterval = setInterval(() => {
                if (!document.body.contains(wrapper)) {
                    this._cleanup(wrapper);
                    clearInterval(checkInterval);
                }
            }, 1000);
            wrapper._cleanupInterval = checkInterval;
        }
    }

    /**
     * ✅ P0: Полная очистка ресурсов
     */
    _cleanup(wrapper) {
        // Отписка от событий API
        if (wrapper._onExecuted) {
            try {
                api.removeEventListener('executed', wrapper._onExecuted);
            } catch (e) {
                console.warn('[Preview] Error removing executed listener:', e);
            }
            wrapper._onExecuted = null;
        }

        if (wrapper._onStatus) {
            try {
                api.removeEventListener('status', wrapper._onStatus);
            } catch (e) {
                console.warn('[Preview] Error removing status listener:', e);
            }
            wrapper._onStatus = null;
        }

        // Очистка MutationObserver
        if (wrapper._cleanupObserver) {
            try {
                wrapper._cleanupObserver.disconnect();
            } catch (e) {}
            wrapper._cleanupObserver = null;
        }

        // Очистка interval fallback
        if (wrapper._cleanupInterval) {
            clearInterval(wrapper._cleanupInterval);
            wrapper._cleanupInterval = null;
        }

        // Очистка ссылок на изображения для сборщика мусора
        if (wrapper._currentImageInfo) {
            wrapper._currentImageInfo = null;
        }
    }

    /**
     * ✅ P1: Открыть полноразмерное изображение
     */
    _openFullscreen(imageUrl, imgInfo) {
        // Используем существующий fullscreen viewer если есть
        const fsViewer = document.getElementById("a11-fs-viewer");
        if (fsViewer) {
            const fsImg = fsViewer.querySelector("#a11-fs-img");
            if (fsImg) {
                fsImg.src = imageUrl;
                fsViewer.classList.add("open");
            }
        } else {
            // Fallback: открыть в новой вкладке
            window.open(imageUrl, '_blank');
        }
    }

    /**
     * Очистить кеш изображений
     */
    clearCache() {
        this._imageCache.clear();
    }

    /**
     * Очистить старые записи кеша
     */
    pruneCache() {
        const now = Date.now();
        for (const [key, value] of this._imageCache.entries()) {
            if ((now - value.timestamp) > this._cacheTimeout) {
                this._imageCache.delete(key);
            }
        }
    }
}

export default PreviewImageInterpreter;
