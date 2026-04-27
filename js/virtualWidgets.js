/**
 * A11 Studio - Virtual Widgets Module
 * DOM rendering for virtual widgets in special containers
 */

import { state, broadcastWidgetUpdate } from "./state.js";
import { SPECIAL_WIDGET_TYPES, BUTTON_APPEARANCE_TYPES, virtualWidgetStates } from "./specialContainers.js";

/**
 * Create DOM element for a virtual widget
 * @param {Object} virtualWidget - Virtual widget configuration
 * @param {string} containerId - ID of the parent container
 * @param {Object} options - Rendering options
 * @returns {HTMLElement}
 */
export function createVirtualWidgetDOM(virtualWidget, containerId, options = {}) {
    if (!virtualWidget || !virtualWidget.type) {
        console.error('[Virtual Widget] Invalid widget configuration');
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'gw-widget-wrapper gw-virtual-widget';
    wrapper.dataset.virtualWidgetId = virtualWidget.id;
    wrapper.dataset.containerId = containerId;
    wrapper.dataset.widgetType = virtualWidget.type;

    // Restore saved state if exists
    if (virtualWidgetStates.has(virtualWidget.id)) {
        virtualWidget.value = virtualWidgetStates.get(virtualWidget.id);
    }

    // Add updateValue method for external updates
    wrapper.updateValue = (newValue) => {
        updateVirtualWidgetValue(wrapper, newValue);
    };

    // Create label if not hidden
    if (!options.hideLabel) {
        const label = document.createElement('div');
        label.className = 'gw-widget-label';
        label.textContent = virtualWidget.name || virtualWidget.type.replace(/_/g, ' ').toUpperCase();
        if (options.labelColor) label.style.color = options.labelColor;
        wrapper.appendChild(label);
    }

    // Create widget-specific content with value change handler
    const contentDiv = document.createElement('div');
    contentDiv.className = 'gw-virtual-content';
    
    // Create value change handler that saves state
    const handleValueChange = (newValue) => {
        virtualWidget.value = newValue;
        virtualWidgetStates.set(virtualWidget.id, newValue);
        
        // Sync with connected real widget if exists
        if (virtualWidget.connection) {
            wrapper.classList.add('is-syncing');
            syncWithRealWidget(virtualWidget).then(() => {
                setTimeout(() => wrapper.classList.remove('is-syncing'), 300);
            });
        }
        
        // Broadcast update
        broadcastWidgetUpdate(`virtual_${virtualWidget.id}`, null, newValue);
    };
    
    const widgetElement = createWidgetContent(virtualWidget, options, handleValueChange);
    if (widgetElement) {
        contentDiv.appendChild(widgetElement);
    }

    wrapper.appendChild(contentDiv);

    // Apply custom styles
    applyVirtualWidgetStyles(wrapper, virtualWidget, options);

    // Setup event listeners for value changes (for widgets that don't use the handler)
    setupVirtualWidgetListeners(wrapper, virtualWidget, options);

    return wrapper;
}

/**
 * Create widget-specific content based on type
 */
function createWidgetContent(virtualWidget, options = {}, onValueChange) {
    const { type, config, value } = virtualWidget;

    switch (type) {
        case SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER:
        case SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER:
            return createNumberWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT:
            return createTextWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE:
            return createToggleWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN:
            return createDropdownWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON:
            return createButtonWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY:
            return createDisplayWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE:
            return createImageWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_CHART:
            return createChartWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS:
            return createProgressWidget(virtualWidget, options, onValueChange);

        case SPECIAL_WIDGET_TYPES.CUSTOM_HTML:
            return createCustomHTMLWidget(virtualWidget, options, onValueChange);

        default:
            console.warn(`[Virtual Widget] Unknown type: ${type}`);
            return createDefaultWidget(virtualWidget, options, onValueChange);
    }
}

/**
 * Number/Slider widget
 */
function createNumberWidget(virtualWidget, options, onValueChange) {
    const container = document.createElement('div');
    container.className = 'vw-number-container';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'vw-number-input';
    input.value = virtualWidget.value ?? 0;
    
    if (virtualWidget.config.min !== null && virtualWidget.config.min !== undefined) {
        input.min = virtualWidget.config.min;
    }
    if (virtualWidget.config.max !== null && virtualWidget.config.max !== undefined) {
        input.max = virtualWidget.config.max;
    }
    if (virtualWidget.config.step !== null && virtualWidget.config.step !== undefined) {
        input.step = virtualWidget.config.step;
    }

    if (options.readOnly) {
        input.disabled = true;
        container.classList.add('vw-readonly');
    }

    container.appendChild(input);

    // Add slider if not hidden
    if (!virtualWidget.config.hideSlider && virtualWidget.config.min !== null && virtualWidget.config.max !== null) {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'vw-slider';
        slider.min = virtualWidget.config.min;
        slider.max = virtualWidget.config.max;
        slider.step = virtualWidget.config.step || 1;
        slider.value = virtualWidget.value ?? 0;
        
        if (options.readOnly) slider.disabled = true;

        // Sync between number and slider with state saving
        const syncValues = (newValue) => {
            input.value = newValue;
            slider.value = newValue;
            virtualWidget.value = parseFloat(newValue);
            if (onValueChange) onValueChange(parseFloat(newValue));
        };

        input.oninput = () => syncValues(input.value);
        slider.oninput = () => syncValues(slider.value);

        container.appendChild(slider);
    }

    return container;
}

/**
 * Text widget
 */
function createTextWidget(virtualWidget, options, onValueChange) {
    const textarea = document.createElement('textarea');
    textarea.className = 'vw-text-input';
    textarea.value = virtualWidget.value ?? '';
    textarea.placeholder = virtualWidget.config.placeholder || 'Enter text...';

    if (options.readOnly) {
        textarea.disabled = true;
        textarea.classList.add('vw-readonly');
    }

    if (virtualWidget.config.rows) {
        textarea.rows = virtualWidget.config.rows;
    }

    if (onValueChange) {
        textarea.addEventListener('input', () => {
            virtualWidget.value = textarea.value;
            onValueChange(textarea.value);
        });
    }

    return textarea;
}

/**
 * Toggle widget
 */
function createToggleWidget(virtualWidget, options, onValueChange) {
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'vw-toggle-container';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'vw-toggle-checkbox';
    checkbox.checked = !!virtualWidget.value;
    checkbox.id = `vw-toggle-${virtualWidget.id}`;

    if (options.readOnly) {
        checkbox.disabled = true;
    }

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.className = 'vw-toggle-label';

    toggleContainer.appendChild(checkbox);
    toggleContainer.appendChild(label);

    if (onValueChange) {
        checkbox.addEventListener('change', () => {
            virtualWidget.value = checkbox.checked;
            onValueChange(checkbox.checked);
        });
    }

    return toggleContainer;
}

/**
 * Dropdown widget
 */
function createDropdownWidget(virtualWidget, options, onValueChange) {
    const select = document.createElement('select');
    select.className = 'vw-dropdown';

    // Parse aliases if provided
    let aliases = {};
    if (virtualWidget.config.aliases) {
        try {
            aliases = typeof virtualWidget.config.aliases === 'string' 
                ? JSON.parse(virtualWidget.config.aliases) 
                : virtualWidget.config.aliases;
        } catch (e) {
            console.error('Invalid aliases JSON for dropdown', virtualWidget.id, e);
            aliases = {};
        }
    }

    // Add empty option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Select...';
    select.appendChild(emptyOpt);

    // Build options from aliases if available, otherwise from config.options
    if (Object.keys(aliases).length > 0) {
        // Use aliases: key = display label, value = internal value
        for (const [label, val] of Object.entries(aliases)) {
            const option = document.createElement('option');
            option.value = String(val);
            option.textContent = label;
            if (virtualWidget.value !== null && virtualWidget.value !== undefined && String(virtualWidget.value) === String(val)) {
                option.selected = true;
            }
            select.appendChild(option);
        }
    } else if (virtualWidget.config.options && Array.isArray(virtualWidget.config.options)) {
        virtualWidget.config.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = typeof opt === 'object' ? opt.value : opt;
            option.textContent = typeof opt === 'object' ? opt.label : opt;
            if (virtualWidget.value === option.value) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    if (options.readOnly) {
        select.disabled = true;
    }

    if (onValueChange) {
        select.addEventListener('change', () => {
            virtualWidget.value = select.value;
            onValueChange(select.value);
        });
    }

    return select;
}

/**
 * Button widget with enhanced action support
 */
function createButtonWidget(virtualWidget, options, onValueChange) {
    const { config, actionConfig } = virtualWidget;
    const appearanceType = config.appearanceType || BUTTON_APPEARANCE_TYPES.BUTTON;
    const label = config.label || virtualWidget.name || 'Button';
    const icon = config.icon || '';
    const showLabel = config.showLabel !== false;
    const accentColor = config.accentColor || '#ea580c';
    
    let button;
    
    // Create button based on appearance type
    switch (appearanceType) {
        case BUTTON_APPEARANCE_TYPES.TOGGLE:
        case BUTTON_APPEARANCE_TYPES.SWITCH:
            button = document.createElement('label');
            button.className = `vw-button vw-toggle ${appearanceType === BUTTON_APPEARANCE_TYPES.SWITCH ? 'vw-switch' : ''}`;
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.className = 'vw-toggle-input';
            if (virtualWidget.value) toggleInput.checked = true;
            
            toggleInput.addEventListener('change', async (e) => {
                virtualWidget.value = e.target.checked;
                await handleButtonClick(virtualWidget, button, onValueChange);
            });
            
            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'vw-toggle-slider';
            
            button.appendChild(toggleInput);
            button.appendChild(toggleSlider);
            if (showLabel) {
                const toggleLabel = document.createElement('span');
                toggleLabel.className = 'vw-toggle-label';
                toggleLabel.textContent = label;
                button.appendChild(toggleLabel);
            }
            break;
            
        case BUTTON_APPEARANCE_TYPES.CHECKBOX:
            button = document.createElement('label');
            button.className = 'vw-button vw-checkbox';
            const checkboxInput = document.createElement('input');
            checkboxInput.type = 'checkbox';
            checkboxInput.className = 'vw-checkbox-input';
            if (virtualWidget.value) checkboxInput.checked = true;
            
            checkboxInput.addEventListener('change', async (e) => {
                virtualWidget.value = e.target.checked;
                await handleButtonClick(virtualWidget, button, onValueChange);
            });
            
            button.appendChild(checkboxInput);
            if (showLabel) {
                const checkboxLabel = document.createElement('span');
                checkboxLabel.className = 'vw-checkbox-label';
                checkboxLabel.textContent = label;
                button.appendChild(checkboxLabel);
            }
            break;
            
        case BUTTON_APPEARANCE_TYPES.ICON:
            button = document.createElement('button');
            button.className = 'vw-button vw-icon-button';
            if (icon) {
                button.innerHTML = `<span class="vw-icon">${icon}</span>`;
            } else {
                button.textContent = '⚙️';
            }
            button.title = label;
            attachClickHandler(button, virtualWidget, onValueChange);
            break;
            
        case BUTTON_APPEARANCE_TYPES.ICON_TEXT:
            button = document.createElement('button');
            button.className = 'vw-button vw-icon-text';
            if (icon) {
                button.innerHTML = `<span class="vw-icon">${icon}</span><span class="vw-btn-text">${label}</span>`;
            } else {
                button.textContent = label;
            }
            attachClickHandler(button, virtualWidget, onValueChange);
            break;
            
        case BUTTON_APPEARANCE_TYPES.PILL:
            button = document.createElement('button');
            button.className = 'vw-button vw-pill';
            button.textContent = label;
            attachClickHandler(button, virtualWidget, onValueChange);
            break;
            
        case BUTTON_APPEARANCE_TYPES.OUTLINE:
            button = document.createElement('button');
            button.className = 'vw-button vw-outline';
            button.textContent = label;
            attachClickHandler(button, virtualWidget, onValueChange);
            break;
            
        case BUTTON_APPEARANCE_TYPES.GHOST:
            button = document.createElement('button');
            button.className = 'vw-button vw-ghost';
            button.textContent = label;
            attachClickHandler(button, virtualWidget, onValueChange);
            break;
            
        case BUTTON_APPEARANCE_TYPES.MOMENTARY:
            button = document.createElement('button');
            button.className = 'vw-button vw-momentary';
            button.textContent = label;
            
            button.addEventListener('mousedown', async () => {
                button.classList.add('is-pressed');
                await handleButtonClick(virtualWidget, button, onValueChange);
            });
            
            button.addEventListener('mouseup', () => {
                button.classList.remove('is-pressed');
            });
            
            button.addEventListener('mouseleave', () => {
                button.classList.remove('is-pressed');
            });
            break;
            
        case BUTTON_APPEARANCE_TYPES.DROPDOWN:
            button = document.createElement('div');
            button.className = 'vw-button vw-dropdown';
            button.innerHTML = `
                <button class="vw-dropdown-toggle">${label} ▾</button>
                <div class="vw-dropdown-menu" style="display:none;"></div>
            `;
            
            const dropdownToggle = button.querySelector('.vw-dropdown-toggle');
            const dropdownMenu = button.querySelector('.vw-dropdown-menu');
            
            dropdownToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
            });
            
            document.addEventListener('click', () => {
                dropdownMenu.style.display = 'none';
            });
            
            attachClickHandler(dropdownToggle, virtualWidget, onValueChange);
            break;
            
        default: // BUTTON type
            button = document.createElement('button');
            button.className = 'vw-button';
            button.textContent = label;
            attachClickHandler(button, virtualWidget, onValueChange);
    }
    
    // Apply accent color for standard buttons
    if (accentColor && ['button', 'pill', 'outline', 'ghost', 'icon_text', 'momentary'].includes(appearanceType)) {
        button.style.backgroundColor = accentColor;
    }
    
    if (options.readOnly) {
        if (button.tagName === 'BUTTON') {
            button.disabled = true;
        } else {
            button.style.pointerEvents = 'none';
            button.style.opacity = '0.6';
        }
    }

    return button;
}

/**
 * Attach click handler to button element
 */
async function attachClickHandler(button, virtualWidget, onValueChange) {
    button.addEventListener('click', async () => {
        await handleButtonClick(virtualWidget, button, onValueChange);
    });
}

/**
 * Handle button click and execute action
 */
async function handleButtonClick(virtualWidget, button, onValueChange) {
    // Execute button action if configured
    if (virtualWidget.actionConfig) {
        try {
            const { executeButtonAction } = await import('./specialContainers.js');
            const containerId = button.closest('.gw-widget-wrapper')?.dataset?.containerId;
            
            // Get container config from state
            let containerConfig = null;
            if (containerId && window.appData?.gridConfig?.items) {
                containerConfig = window.appData.gridConfig.items.find(
                    item => item.id === containerId || item.config?.id === containerId
                )?.config;
            }
            
            const result = await executeButtonAction(virtualWidget, containerConfig);
            console.log('[Virtual Button] Action result:', result);
            
            // Show feedback if available
            if (result?.message) {
                showButtonFeedback(button, result.success ? '✓ ' + result.message : '✗ ' + result.error);
            }
        } catch (e) {
            console.error('[Virtual Button] Action execution failed:', e);
            showButtonFeedback(button, '✗ Error: ' + e.message);
        }
    }
    
    // Also trigger the standard value change callback
    onValueChange({ type: 'click', timestamp: Date.now() });
}

/**
 * Show temporary feedback message on button
 */
function showButtonFeedback(button, message) {
    const originalText = button.textContent;
    const originalBg = button.style.backgroundColor;
    
    button.textContent = message;
    button.disabled = true;
    
    if (message.startsWith('✓')) {
        button.style.backgroundColor = '#22c55e'; // Green for success
    } else if (message.startsWith('✗')) {
        button.style.backgroundColor = '#ef4444'; // Red for error
    }
    
    setTimeout(() => {
        button.textContent = originalText;
        button.style.backgroundColor = originalBg;
        button.disabled = false;
    }, 2000);
}

/**
 * Display widget (read-only value display)
 */
function createDisplayWidget(virtualWidget, options, onValueChange) {
    const display = document.createElement('div');
    display.className = 'vw-display';
    display.textContent = formatValue(virtualWidget.value, virtualWidget.config.format);

    if (virtualWidget.config.fontSize) {
        display.style.fontSize = virtualWidget.config.fontSize + 'px';
    }

    return display;
}

/**
 * Get ComfyUI image URL from filename
 */
function getComfyImageUrl(filename, type = "input") {
    if (!filename) return "";
    let cleanName = filename;
    let subfolder = "";
    if (filename.includes("/")) {
        const parts = filename.split("/");
        cleanName = parts.pop();
        subfolder = parts.join("/");
    } else if (filename.includes("\\")) {
        const parts = filename.split("\\");
        cleanName = parts.pop();
        subfolder = parts.join("\\");
    }
    return `/view?filename=${encodeURIComponent(cleanName)}&type=${type}&subfolder=${encodeURIComponent(subfolder)}&t=${Date.now()}`;
}

/**
 * Check if value is an image path/URL
 */
function isImagePath(value) {
    if (!value || typeof value !== 'string') return false;
    return value.startsWith('/') || 
           value.includes('://') || 
           value.endsWith('.png') || 
           value.endsWith('.jpg') || 
           value.endsWith('.jpeg') || 
           value.endsWith('.webp') || 
           value.endsWith('.gif');
}

/**
 * Image widget with dynamic node image support
 */
function createImageWidget(virtualWidget, options, onValueChange) {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'vw-image-container';

    const img = document.createElement('img');
    img.className = 'vw-image';
    
    // Set initial image source
    const updateImageSource = () => {
        if (virtualWidget.value) {
            if (isImagePath(virtualWidget.value)) {
                // Handle ComfyUI image paths
                if (virtualWidget.value.startsWith('/')) {
                    img.src = getComfyImageUrl(virtualWidget.value);
                } else {
                    img.src = virtualWidget.value;
                }
            } else {
                img.src = virtualWidget.value;
            }
        } else {
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJhcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        }
    };
    
    updateImageSource();
    
    // Store update function for external updates
    imgContainer.updateImageSource = updateImageSource;

    const fit = virtualWidget.config.fit || 'contain';
    img.style.objectFit = fit;
    img.style.width = '100%';
    img.style.height = '100%';

    imgContainer.appendChild(img);
    return imgContainer;
}

/**
 * Chart widget (placeholder for future chart library integration)
 */
function createChartWidget(virtualWidget, options, onValueChange) {
    const chartContainer = document.createElement('div');
    chartContainer.className = 'vw-chart';
    chartContainer.innerHTML = '<div class="vw-chart-placeholder">📊 Chart Placeholder<br><small>Chart integration coming soon</small></div>';
    return chartContainer;
}

/**
 * Progress widget
 */
function createProgressWidget(virtualWidget, options, onValueChange) {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'vw-progress-container';

    const progressBar = document.createElement('div');
    progressBar.className = 'vw-progress-bar';
    
    const value = virtualWidget.value ?? 0;
    const max = virtualWidget.config.max || 100;
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    
    progressBar.style.width = percentage + '%';
    
    if (virtualWidget.config.accentColor) {
        progressBar.style.backgroundColor = virtualWidget.config.accentColor;
    }

    const progressTrack = document.createElement('div');
    progressTrack.className = 'vw-progress-track';
    progressTrack.appendChild(progressBar);

    const valueLabel = document.createElement('div');
    valueLabel.className = 'vw-progress-value';
    valueLabel.textContent = `${value} / ${max}`;

    progressContainer.appendChild(progressTrack);
    progressContainer.appendChild(valueLabel);

    return progressContainer;
}

/**
 * Custom HTML widget
 */
function createCustomHTMLWidget(virtualWidget, options, onValueChange) {
    const container = document.createElement('div');
    container.className = 'vw-custom-html';
    
    if (virtualWidget.config.html) {
        container.innerHTML = virtualWidget.config.html;
    } else {
        container.innerHTML = '<div>Custom HTML Content</div>';
    }

    // Apply custom styles if provided
    if (virtualWidget.config.styles) {
        const styleEl = document.createElement('style');
        styleEl.textContent = virtualWidget.config.styles;
        container.appendChild(styleEl);
    }

    return container;
}

/**
 * Default widget fallback
 */
function createDefaultWidget(virtualWidget, options, onValueChange) {
    const div = document.createElement('div');
    div.className = 'vw-default';
    div.textContent = `Virtual Widget: ${virtualWidget.type}\nValue: ${JSON.stringify(virtualWidget.value)}`;
    div.style.padding = '10px';
    div.style.background = 'rgba(255,255,255,0.1)';
    div.style.borderRadius = '4px';
    return div;
}

/**
 * Format value for display
 */
function formatValue(value, format) {
    if (value === null || value === undefined) return '-';
    
    switch (format) {
        case 'percent':
            return `${value}%`;
        case 'currency':
            return `$${Number(value).toFixed(2)}`;
        case 'number':
            return Number(value).toLocaleString();
        case 'boolean':
            return value ? '✓' : '✗';
        default:
            return String(value);
    }
}

/**
 * Apply styles to virtual widget wrapper with advanced styling support
 */
function applyVirtualWidgetStyles(wrapper, virtualWidget, options) {
    const styles = virtualWidget.styles || {};
    
    // Legacy options support
    if (options.width && !styles.width) {
        wrapper.style.width = options.width;
    }
    
    if (options.fontSize && !styles.fontSize) {
        wrapper.style.fontSize = options.fontSize + 'px';
    }

    if (options.textAlign && !styles.textAlign) {
        wrapper.style.textAlign = options.textAlign;
    }

    if (options.customHeight && !styles.height) {
        const hStr = String(options.customHeight).trim().toLowerCase();
        if (hStr === 'auto' || hStr === '100%' || hStr === 'flex') {
            wrapper.classList.add('gw-widget-wrapper--grows');
        } else {
            wrapper.style.height = isNaN(options.customHeight) ? options.customHeight : options.customHeight + 'px';
        }
    }

    if (options.readOnly) {
        wrapper.classList.add('a11-readonly-widget');
    }

    // Advanced Styling Engine
    if (Object.keys(styles).length > 0) {
        applyAdvancedStyling(wrapper, styles, virtualWidget.type);
    }
}

/**
 * Apply Advanced Styling including Glassmorphism, Gradients, Shadows, and Typography
 */
function applyAdvancedStyling(element, styles, type) {
    if (!styles) return;

    const s = styles;
    const rootStyle = element.style;

    // 1. Layout & Dimensions
    if (s.width) rootStyle.width = typeof s.width === 'number' ? `${s.width}%` : s.width;
    if (s.minHeight) rootStyle.minHeight = `${s.minHeight}px`;
    if (s.flexGrow) rootStyle.flexGrow = s.flexGrow;
    if (s.height) rootStyle.height = typeof s.height === 'number' ? `${s.height}px` : s.height;
    
    // 2. Backgrounds (Solid, Gradient, Glass)
    if (s.backgroundType === 'gradient') {
        const angle = s.gradientAngle || 45;
        const stops = s.gradientStops || ['#3b82f6', '#8b5cf6'];
        rootStyle.background = `linear-gradient(${angle}deg, ${stops.join(', ')})`;
    } else if (s.backgroundType === 'glass') {
        rootStyle.background = s.glassColor || 'rgba(255, 255, 255, 0.1)';
        rootStyle.backdropFilter = `blur(${s.blurAmount || 10}px)`;
        rootStyle.webkitBackdropFilter = `blur(${s.blurAmount || 10}px)`;
        if (s.saturation) rootStyle.backdropFilter += ` saturate(${s.saturation}%)`;
    } else if (s.backgroundType === 'image') {
        rootStyle.backgroundImage = `url(${s.backgroundImage})`;
        rootStyle.backgroundSize = s.backgroundSize || 'cover';
        rootStyle.backgroundPosition = s.backgroundPosition || 'center';
    } else {
        rootStyle.background = s.backgroundColor || 'var(--bg-secondary)';
    }

    // 3. Multi-Layer Borders
    if (s.borderStyle !== 'none') {
        if (s.borderStyle === 'double') {
            rootStyle.border = `double ${s.borderWidth || 2}px ${s.borderColor || 'var(--border-color)'}`;
        } else if (s.borderStyle === 'dashed-custom') {
            rootStyle.border = `${s.borderWidth || 2}px dashed ${s.borderColor || 'var(--border-color)'}`;
            rootStyle.borderRadius = `${s.borderRadius || 4}px`;
        } else if (s.borderStyle === 'dotted-custom') {
            rootStyle.border = `${s.borderWidth || 2}px dotted ${s.borderColor || 'var(--border-color)'}`;
            rootStyle.borderRadius = `${s.borderRadius || 4}px`;
        } else {
            rootStyle.border = `${s.borderWidth || 1}px ${s.borderStyle || 'solid'} ${s.borderColor || 'var(--border-color)'}`;
        }
    } else {
        rootStyle.border = 'none';
    }
    
    // Inner Border/Overlay
    if (s.innerBorderWidth > 0) {
        const existingShadow = rootStyle.boxShadow || '';
        rootStyle.boxShadow = `${existingShadow} inset 0 0 0 ${s.innerBorderWidth}px ${s.innerBorderColor || 'rgba(255,255,255,0.1)'}`.trim();
    }

    // 4. Dynamic Shadows
    if (s.shadowEnabled) {
        const color = s.shadowColor || 'rgba(0,0,0,0.2)';
        const x = s.shadowX || 0;
        const y = s.shadowY || 4;
        const blur = s.shadowBlur || 8;
        const spread = s.shadowSpread || 0;
        const existingShadow = rootStyle.boxShadow || '';
        rootStyle.boxShadow = `${existingShadow} ${x}px ${y}px ${blur}px ${spread}px ${color}`.trim();
    }

    // 5. Typography
    if (s.fontFamily) rootStyle.fontFamily = s.fontFamily;
    if (s.fontSize) rootStyle.fontSize = `${s.fontSize}px`;
    if (s.fontWeight) rootStyle.fontWeight = s.fontWeight;
    if (s.textColor) rootStyle.color = s.textColor;
    if (s.textAlign) rootStyle.textAlign = s.textAlign;
    if (s.letterSpacing) rootStyle.letterSpacing = `${s.letterSpacing}px`;
    if (s.lineHeight) rootStyle.lineHeight = s.lineHeight;
    if (s.textTransform) rootStyle.textTransform = s.textTransform;
    if (s.fontStyle) rootStyle.fontStyle = s.fontStyle;
    if (s.textDecoration) rootStyle.textDecoration = s.textDecoration;

    // 6. Radius & Spacing
    if (s.borderRadius !== undefined) rootStyle.borderRadius = `${s.borderRadius}px`;
    if (s.padding !== undefined) rootStyle.padding = `${s.padding}px`;
    if (s.margin !== undefined) rootStyle.margin = `${s.margin}px`;
    if (s.gap) rootStyle.gap = `${s.gap}px`;

    // 7. Transitions for smooth state changes (prevents twitch)
    rootStyle.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // 8. CSS Containment for performance
    rootStyle.contain = 'layout style paint';
    
    // 9. Interactive States (Hover, Active, Focus) - via data attributes
    if (s.hoverBackgroundColor || s.hoverTextColor) {
        element.dataset.hasHoverStyles = 'true';
        if (s.hoverBackgroundColor) element.style.setProperty('--hover-bg', s.hoverBackgroundColor);
        if (s.hoverTextColor) element.style.setProperty('--hover-text', s.hoverTextColor);
    }
}

/**
 * Setup event listeners for virtual widget value changes
 * This is now a fallback for widgets that don't use the onValueChange handler
 */
function setupVirtualWidgetListeners(wrapper, virtualWidget, options) {
    const input = wrapper.querySelector('input, textarea, select, button');
    if (!input) return;

    // Add connection status class
    if (virtualWidget.connection) {
        wrapper.classList.add('is-connected');
    }

    // Check if already has listener from createWidgetContent
    if (input.dataset.hasVirtualListener) return;

    const emitChange = () => {
        // Update virtual widget value
        let newValue;
        if (input.type === 'checkbox') {
            newValue = input.checked;
            virtualWidget.value = newValue;
        } else if (input.type === 'number' || input.type === 'range') {
            newValue = parseFloat(input.value);
            virtualWidget.value = newValue;
        } else if (input.tagName === 'SELECT') {
            newValue = input.value;
            virtualWidget.value = newValue;
        } else if (input.tagName === 'TEXTAREA' || input.type === 'text') {
            newValue = input.value;
            virtualWidget.value = newValue;
        }

        // Save to global state storage
        virtualWidgetStates.set(virtualWidget.id, virtualWidget.value);

        // Sync with connected real widget if exists
        if (virtualWidget.connection) {
            wrapper.classList.add('is-syncing');
            syncWithRealWidget(virtualWidget).then(() => {
                setTimeout(() => wrapper.classList.remove('is-syncing'), 300);
            });
        }

        // Broadcast update
        broadcastWidgetUpdate(`virtual_${virtualWidget.id}`, null, virtualWidget.value);
    };

    if (input.type === 'button') {
        input.onclick = emitChange;
    } else if (input.type === 'checkbox') {
        input.onchange = emitChange;
    } else {
        input.oninput = emitChange;
        input.onchange = emitChange;
    }
    
    // Mark as having listener to avoid duplicates
    input.dataset.hasVirtualListener = 'true';
}

/**
 * Sync virtual widget with connected real widget
 */
async function syncWithRealWidget(virtualWidget) {
    if (!virtualWidget?.connection) return;

    try {
        const { app } = await import("../../scripts/app.js");
        const { nodeId, widgetIndex, direction } = virtualWidget.connection;
        
        const node = app.graph.getNodeById(nodeId);
        if (!node || !node.widgets || !node.widgets[widgetIndex]) return;

        const realWidget = node.widgets[widgetIndex];

        if (direction === 'input' || direction === 'bidirectional') {
            // Virtual -> Real: update real widget with virtual value
            realWidget.value = virtualWidget.value;
            if (realWidget.callback) {
                try {
                    realWidget.callback(virtualWidget.value);
                } catch (e) {
                    console.error('[Virtual Widget] Callback error:', e);
                }
            }
        }

        if (direction === 'output' || direction === 'bidirectional') {
            // Real -> Virtual: update virtual value from real widget
            virtualWidget.value = realWidget.value;
        }

        virtualWidget.connection.lastSync = Date.now();
    } catch (e) {
        console.error('[Virtual Widget] Sync error:', e);
    }
}

/**
 * Update virtual widget value from external source
 */
export function updateVirtualWidgetValue(wrapper, newValue) {
    // Handle image widgets specially
    if (wrapper.classList.contains('vw-image-container') && wrapper.updateImageSource) {
        const virtualWidgetId = wrapper.dataset?.virtualWidgetId;
        if (virtualWidgetId) {
            // Save to global state
            virtualWidgetStates.set(virtualWidgetId, newValue);
            
            // Try to find in window.specialContainersState for backward compatibility
            if (window.specialContainersState && Array.isArray(window.specialContainersState)) {
                const vw = window.specialContainersState.find(v => v.id === virtualWidgetId);
                if (vw) {
                    vw.value = newValue;
                }
            }
            wrapper.updateImageSource();
            return;
        }
    }
    
    const input = wrapper.querySelector('input, textarea, select');
    if (!input) return;

    if (input.type === 'checkbox') {
        input.checked = !!newValue;
    } else {
        input.value = newValue ?? '';
    }
    
    // Also save to global state for non-image widgets
    const virtualWidgetId = wrapper.dataset?.virtualWidgetId;
    if (virtualWidgetId) {
        virtualWidgetStates.set(virtualWidgetId, newValue);
    }
}

/**
 * Apply special container type-specific layout and styling
 * @param {HTMLElement} body - Container body element
 * @param {Object} config - Special container configuration
 */
export function applySpecialContainerLayout(body, config) {
    if (!config || config.containerType !== 'special' || !config.specialType) {
        return;
    }

    const { specialType, settings } = config;

    // Remove any existing special container layout classes
    body.classList.remove('sc-dashboard', 'sc-control-panel', 'sc-monitor', 'sc-form', 'sc-gallery');

    // Add type-specific class
    switch (specialType) {
        case 'dashboard':
            body.classList.add('sc-dashboard');
            // Dashboard: Grid layout with flexible sizing
            body.style.display = 'grid';
            body.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            body.style.gap = settings?.gap || '12px';
            body.style.alignItems = 'start';
            break;

        case 'control_panel':
            body.classList.add('sc-control-panel');
            // Control Panel: Compact vertical/horizontal flow
            body.style.display = 'flex';
            body.style.flexDirection = settings?.orientation === 'horizontal' ? 'row' : 'column';
            body.style.flexWrap = 'wrap';
            body.style.gap = settings?.gap || '8px';
            body.style.alignItems = 'flex-start';
            break;

        case 'monitor':
            body.classList.add('sc-monitor');
            // Monitor: Dense grid for data displays
            body.style.display = 'grid';
            body.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
            body.style.gap = settings?.gap || '6px';
            body.style.alignItems = 'stretch';
            break;

        case 'form':
            body.classList.add('sc-form');
            // Form: Vertical stacked layout with max-width constraint
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
            body.style.gap = settings?.gap || '16px';
            body.style.maxWidth = settings?.maxWidth ? `${settings.maxWidth}px` : '600px';
            body.style.margin = '0 auto';
            break;

        case 'gallery':
            body.classList.add('sc-gallery');
            // Gallery: Multi-column grid with fixed aspect ratios
            body.style.display = 'grid';
            const columns = settings?.columns || 4;
            body.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
            body.style.gap = settings?.gap || '8px';
            body.style.alignItems = 'stretch';
            break;

        default:
            // Fallback to default flex layout
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
            body.style.gap = '10px';
    }
}
