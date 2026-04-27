/**
 * A11 Studio - Virtual Widgets Module
 * DOM rendering for virtual widgets in special containers
 */

import { state, broadcastWidgetUpdate } from "./state.js";
import { SPECIAL_WIDGET_TYPES } from "./specialContainers.js";

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

    // Create widget-specific content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'gw-virtual-content';
    
    const widgetElement = createWidgetContent(virtualWidget, options);
    if (widgetElement) {
        contentDiv.appendChild(widgetElement);
    }

    wrapper.appendChild(contentDiv);

    // Apply custom styles
    applyVirtualWidgetStyles(wrapper, virtualWidget, options);

    // Setup event listeners for value changes
    setupVirtualWidgetListeners(wrapper, virtualWidget, options);

    return wrapper;
}

/**
 * Create widget-specific content based on type
 */
function createWidgetContent(virtualWidget, options = {}) {
    const { type, config, value } = virtualWidget;

    switch (type) {
        case SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER:
        case SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER:
            return createNumberWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT:
            return createTextWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE:
            return createToggleWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN:
            return createDropdownWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON:
            return createButtonWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY:
            return createDisplayWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE:
            return createImageWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_CHART:
            return createChartWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS:
            return createProgressWidget(virtualWidget, options);

        case SPECIAL_WIDGET_TYPES.CUSTOM_HTML:
            return createCustomHTMLWidget(virtualWidget, options);

        default:
            console.warn(`[Virtual Widget] Unknown type: ${type}`);
            return createDefaultWidget(virtualWidget, options);
    }
}

/**
 * Number/Slider widget
 */
function createNumberWidget(virtualWidget, options) {
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

        // Sync between number and slider
        input.oninput = () => {
            slider.value = input.value;
            virtualWidget.value = parseFloat(input.value);
        };
        slider.oninput = () => {
            input.value = slider.value;
            virtualWidget.value = parseFloat(slider.value);
        };

        container.appendChild(slider);
    }

    return container;
}

/**
 * Text widget
 */
function createTextWidget(virtualWidget, options) {
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

    return textarea;
}

/**
 * Toggle widget
 */
function createToggleWidget(virtualWidget, options) {
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

    return toggleContainer;
}

/**
 * Dropdown widget
 */
function createDropdownWidget(virtualWidget, options) {
    const select = document.createElement('select');
    select.className = 'vw-dropdown';

    // Add empty option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Select...';
    select.appendChild(emptyOpt);

    // Add options
    if (virtualWidget.config.options && Array.isArray(virtualWidget.config.options)) {
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

    return select;
}

/**
 * Button widget
 */
function createButtonWidget(virtualWidget, options) {
    const button = document.createElement('button');
    button.className = 'vw-button';
    button.textContent = virtualWidget.config.label || virtualWidget.name || 'Button';
    
    if (virtualWidget.config.accentColor) {
        button.style.backgroundColor = virtualWidget.config.accentColor;
    }

    if (options.readOnly) {
        button.disabled = true;
    }

    return button;
}

/**
 * Display widget (read-only value display)
 */
function createDisplayWidget(virtualWidget, options) {
    const display = document.createElement('div');
    display.className = 'vw-display';
    display.textContent = formatValue(virtualWidget.value, virtualWidget.config.format);

    if (virtualWidget.config.fontSize) {
        display.style.fontSize = virtualWidget.config.fontSize + 'px';
    }

    return display;
}

/**
 * Image widget
 */
function createImageWidget(virtualWidget, options) {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'vw-image-container';

    const img = document.createElement('img');
    img.className = 'vw-image';
    
    if (virtualWidget.value) {
        img.src = virtualWidget.value;
    } else {
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJhcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
    }

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
function createChartWidget(virtualWidget, options) {
    const chartContainer = document.createElement('div');
    chartContainer.className = 'vw-chart';
    chartContainer.innerHTML = '<div class="vw-chart-placeholder">📊 Chart Placeholder<br><small>Chart integration coming soon</small></div>';
    return chartContainer;
}

/**
 * Progress widget
 */
function createProgressWidget(virtualWidget, options) {
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
function createCustomHTMLWidget(virtualWidget, options) {
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
function createDefaultWidget(virtualWidget, options) {
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
 * Apply styles to virtual widget wrapper
 */
function applyVirtualWidgetStyles(wrapper, virtualWidget, options) {
    if (options.width) {
        wrapper.style.width = options.width;
    }
    
    if (options.fontSize) {
        wrapper.style.fontSize = options.fontSize + 'px';
    }

    if (options.textAlign) {
        wrapper.style.textAlign = options.textAlign;
    }

    if (options.customHeight) {
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
}

/**
 * Setup event listeners for virtual widget value changes
 */
function setupVirtualWidgetListeners(wrapper, virtualWidget, options) {
    const input = wrapper.querySelector('input, textarea, select, button');
    if (!input) return;

    const emitChange = () => {
        // Update virtual widget value
        if (input.type === 'checkbox') {
            virtualWidget.value = input.checked;
        } else if (input.type === 'number' || input.type === 'range') {
            virtualWidget.value = parseFloat(input.value);
        } else if (input.tagName === 'SELECT') {
            virtualWidget.value = input.value;
        } else if (input.tagName === 'TEXTAREA' || input.type === 'text') {
            virtualWidget.value = input.value;
        }

        // Sync with connected real widget if exists
        if (virtualWidget.connection) {
            syncWithRealWidget(virtualWidget);
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
            realWidget.value = virtualWidget.value;
            if (realWidget.callback) {
                try {
                    realWidget.callback(virtualWidget.value);
                } catch (e) {
                    console.error('[Virtual Widget] Callback error:', e);
                }
            }
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
    const input = wrapper.querySelector('input, textarea, select');
    if (!input) return;

    if (input.type === 'checkbox') {
        input.checked = !!newValue;
    } else {
        input.value = newValue ?? '';
    }
}
