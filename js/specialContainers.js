/**
 * A11 Studio - Special Containers Module
 * Autonomous containers with virtual widgets and enhanced customization
 */

import { state } from "./state.js";
import { CONTAINER_TYPES } from "./presetManager.js";

// Global state storage for virtual widget values
export const virtualWidgetStates = new Map();

// Initialize window object for global access (used by virtualWidgets.js)
if (typeof window !== 'undefined') {
    window.virtualWidgetStates = virtualWidgetStates;
    // Legacy alias for compatibility
    window.specialContainersState = [];
}

// Special container type definitions
export const SPECIAL_CONTAINER_TYPES = {
    DASHBOARD: 'dashboard',      // Dashboard with multiple virtual widgets
    CONTROL_PANEL: 'control_panel', // Control panel with custom controls
    MONITOR: 'monitor',          // Monitoring display
    FORM: 'form',                // Custom form builder
    GALLERY: 'gallery'           // Image/media gallery
};

// Special widget type definitions (more customizable than standard widgets)
export const SPECIAL_WIDGET_TYPES = {
    VIRTUAL_NUMBER: 'virtual_number',
    VIRTUAL_TEXT: 'virtual_text',
    VIRTUAL_TOGGLE: 'virtual_toggle',
    VIRTUAL_SLIDER: 'virtual_slider',
    VIRTUAL_DROPDOWN: 'virtual_dropdown',
    VIRTUAL_BUTTON: 'virtual_button',
    VIRTUAL_DISPLAY: 'virtual_display',
    VIRTUAL_IMAGE: 'virtual_image',
    VIRTUAL_CHART: 'virtual_chart',
    VIRTUAL_PROGRESS: 'virtual_progress',
    CUSTOM_HTML: 'custom_html'
};

/**
 * Create a new special container configuration
 */
export function createSpecialContainer(type, options = {}) {
    const baseConfig = {
        containerType: CONTAINER_TYPES.SPECIAL,
        specialType: type,
        title: `Special ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        widgets: [],
        virtualWidgets: [],
        connections: [],
        settings: {},
        ...options
    };

    // Initialize type-specific defaults
    switch (type) {
        case SPECIAL_CONTAINER_TYPES.DASHBOARD:
            baseConfig.settings = {
                refreshRate: 1000,
                layout: 'grid',
                showHeader: true
            };
            break;
        case SPECIAL_CONTAINER_TYPES.CONTROL_PANEL:
            baseConfig.settings = {
                autoApply: true,
                confirmChanges: false,
                presetSlots: 5
            };
            break;
        case SPECIAL_CONTAINER_TYPES.MONITOR:
            baseConfig.settings = {
                updateInterval: 500,
                historySize: 100,
                showGraph: true
            };
            break;
        case SPECIAL_CONTAINER_TYPES.FORM:
            baseConfig.settings = {
                validateOnSubmit: true,
                showResetButton: true,
                submitAction: 'apply'
            };
            break;
        case SPECIAL_CONTAINER_TYPES.GALLERY:
            baseConfig.settings = {
                thumbnailSize: 128,
                showCaptions: true,
                columns: 4
            };
            break;
    }

    return baseConfig;
}

/**
 * Create a virtual widget for special containers
 */
export function createVirtualWidget(type, options = {}) {
    const id = `vw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const baseWidget = {
        id,
        type,
        name: `${type.replace('virtual_', '').toUpperCase()} Widget`,
        value: null,
        config: {
            label: '',
            placeholder: '',
            min: null,
            max: null,
            step: null,
            options: [],
            defaultValue: null,
            validation: null,
            style: {}
        },
        displaySettings: {
            visible: true,           // Overall visibility
            viewMode: 'normal',      // 'normal', 'compact', 'detailed', 'hidden'
            order: 0,                // Display order in container
            conditionalDisplay: null,// { operator: 'gt'|'lt'|'eq'|'neq', value: any, sourceWidgetId: string }
            minWidth: null,          // Minimum width in px or %
            maxWidth: null,          // Maximum width in px or %
            minHeight: null,         // Minimum height in px
            maxHeight: null,         // Maximum height in px
            grow: false,             // Allow widget to grow in flex/grid layouts
            shrink: true,            // Allow widget to shrink
            align: 'stretch',        // 'start', 'end', 'center', 'stretch', 'baseline'
            justify: 'auto',         // For grid items: 'start', 'end', 'center', 'stretch'
            columnSpan: 1,           // Grid column span
            rowSpan: 1,              // Grid row span
            showLabel: true,         // Show/hide label
            labelPosition: 'top',    // 'top', 'bottom', 'left', 'right', 'overlay'
            icon: null,              // Icon class or URL
            tooltip: null,           // Tooltip text
            animations: {
                enabled: true,       // Enable CSS animations
                entrance: 'fade',    // 'fade', 'slide', 'scale', 'none'
                hover: 'highlight',  // 'highlight', 'lift', 'glow', 'none'
                duration: 300        // Animation duration in ms
            }
        },
        connection: null, // { nodeId, widgetIndex, direction: 'input'|'output'|'bidirectional' }
        ...options
    };

    // Type-specific defaults
    switch (type) {
        case SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER:
        case SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER:
            baseWidget.config.min = 0;
            baseWidget.config.max = 100;
            baseWidget.config.step = 1;
            baseWidget.value = 0;
            break;
        case SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE:
            baseWidget.value = false;
            break;
        case SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT:
            baseWidget.config.placeholder = 'Enter text...';
            baseWidget.value = '';
            break;
        case SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN:
            baseWidget.config.options = ['Option 1', 'Option 2', 'Option 3'];
            baseWidget.value = '';
            break;
        case SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY:
        case SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS:
            baseWidget.config.format = 'default';
            baseWidget.value = 0;
            break;
        case SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE:
            baseWidget.config.fit = 'contain';
            baseWidget.value = null;
            break;
        case SPECIAL_WIDGET_TYPES.CUSTOM_HTML:
            baseWidget.config.html = '<div>Custom HTML Content</div>';
            baseWidget.config.scripts = [];
            baseWidget.config.styles = '';
            break;
    }

    return baseWidget;
}

/**
 * Connect a virtual widget to a real node widget
 */
export function connectVirtualWidget(virtualWidget, nodeId, widgetIndex, direction = 'bidirectional') {
    if (!virtualWidget || !nodeId) return false;
    
    virtualWidget.connection = {
        nodeId,
        widgetIndex,
        direction,
        lastSync: Date.now()
    };
    
    return true;
}

/**
 * Disconnect a virtual widget from its real widget
 */
export function disconnectVirtualWidget(virtualWidget) {
    if (!virtualWidget) return false;
    
    virtualWidget.connection = null;
    return true;
}

/**
 * Sync value between virtual and real widgets
 */
export async function syncVirtualWidget(virtualWidget, preserveVirtualValue = false) {
    if (!virtualWidget?.connection) return null;
    
    const { app } = await import("../../scripts/app.js");
    const { nodeId, widgetIndex, direction } = virtualWidget.connection;
    
    const node = app.graph.getNodeById(nodeId);
    if (!node || !node.widgets || !node.widgets[widgetIndex]) {
        console.warn(`[Special Container] Node or widget not found: ${nodeId}:${widgetIndex}`);
        return null;
    }
    
    const realWidget = node.widgets[widgetIndex];
    
    // Handle image widgets specially - convert ComfyUI paths
    const isImageWidget = virtualWidget.type === 'virtual_image';
    const isImagePathValue = typeof realWidget.value === 'string' && 
                             (realWidget.value.startsWith('/') || 
                              realWidget.value.includes('://') ||
                              realWidget.value.endsWith('.png') ||
                              realWidget.value.endsWith('.jpg') ||
                              realWidget.value.endsWith('.jpeg') ||
                              realWidget.value.endsWith('.webp') ||
                              realWidget.value.endsWith('.gif'));
    
    // Sync based on direction
    if (direction === 'input' || direction === 'bidirectional') {
        // Virtual -> Real
        if (virtualWidget.value !== undefined && virtualWidget.value !== null) {
            realWidget.value = virtualWidget.value;
            if (realWidget.callback) {
                try {
                    realWidget.callback(virtualWidget.value);
                } catch (e) {
                    console.error(`[Special Container] Callback error:`, e);
                }
            }
        }
    }
    
    if (direction === 'output' || direction === 'bidirectional') {
        // Real -> Virtual
        let realValue = realWidget.value;
        
        // For image widgets, ensure we get the proper path from the node
        if (isImageWidget && isImagePathValue) {
            // Only update virtual value if not preserving or if real value is different
            if (!preserveVirtualValue || virtualWidget.value !== realValue) {
                virtualWidget.value = realValue;
            }
        } else {
            // Only update virtual value if not preserving or if real value is different
            if (!preserveVirtualValue || virtualWidget.value !== realValue) {
                virtualWidget.value = realValue;
            }
        }
    }
    
    virtualWidget.connection.lastSync = Date.now();
    return virtualWidget.value;
}

/**
 * Start auto-sync for a special container (for real-time updates)
 */
export function startAutoSync(containerId, intervalMs = 500) {
    if (!containerId) return null;
    
    const syncInterval = setInterval(async () => {
        const { state } = await import("./state.js");
        const container = state.appData.gridConfig?.items?.find(
            item => item.id === containerId || item.config?.id === containerId
        );
        
        if (!container?.config?.virtualWidgets) {
            clearInterval(syncInterval);
            return;
        }
        
        for (const vw of container.config.virtualWidgets) {
            if (vw.connection && (vw.connection.direction === 'output' || vw.connection.direction === 'bidirectional')) {
                // Auto-sync: do NOT preserve virtual value - always update from real widget for output/bidirectional
                await syncVirtualWidget(vw, false);
                // Update DOM if exists
                const domEl = document.querySelector(`[data-virtual-widget-id="${vw.id}"]`);
                if (domEl && domEl.updateValue) {
                    domEl.updateValue(vw.value);
                }
            }
        }
    }, intervalMs);
    
    return syncInterval;
}

/**
 * Stop auto-sync interval
 */
export function stopAutoSync(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
    }
}

/**
 * Validate a special container configuration with type-specific rules
 */
export function validateSpecialContainer(config) {
    const errors = [];
    const warnings = [];
    
    if (!config.containerType || config.containerType !== CONTAINER_TYPES.SPECIAL) {
        errors.push('Container type must be SPECIAL');
    }
    
    if (!config.specialType || !Object.values(SPECIAL_CONTAINER_TYPES).includes(config.specialType)) {
        errors.push(`Invalid special container type: ${config.specialType}`);
        return { valid: false, errors, warnings };
    }

    const { specialType, virtualWidgets } = config;

    // Type-specific restrictions and validations
    if (specialType === SPECIAL_CONTAINER_TYPES.CONTROL_PANEL) {
        const interactiveTypes = [
            SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON,
            SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE,
            SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER,
            SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN
        ];
        
        if (virtualWidgets && Array.isArray(virtualWidgets)) {
            virtualWidgets.forEach((vw, idx) => {
                if (!interactiveTypes.includes(vw.type)) {
                    errors.push(`Control Panel only allows interactive widgets. Widget ${idx} (${vw.type}) is invalid.`);
                }
            });
        }
        
        // Control Panel specific: Max 20 interactive controls recommended
        if (virtualWidgets && virtualWidgets.length > 20) {
            warnings.push(`Control Panel has ${virtualWidgets.length} widgets. Performance may degrade with >20 controls.`);
        }
    }

    if (specialType === SPECIAL_CONTAINER_TYPES.FORM) {
        const inputTypes = [
            SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT,
            SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER,
            SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN,
            SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE,
            SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON,
            SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER
        ];
        
        if (virtualWidgets && Array.isArray(virtualWidgets)) {
            virtualWidgets.forEach((vw, idx) => {
                if (!inputTypes.includes(vw.type)) {
                    errors.push(`Form only allows input widgets. Widget ${idx} (${vw.type}) is invalid.`);
                }
            });
            
            // Form must have at least one submit button
            const hasButton = virtualWidgets.some(vw => vw.type === SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON);
            if (!hasButton) {
                warnings.push('Form should have at least one button widget for submission.');
            }
        }
        
        // Form specific: Max width constraint enforced in rendering
        if (config.settings?.maxWidth && config.settings.maxWidth < 400) {
            warnings.push('Form width less than 400px may cause layout issues.');
        }
    }

    if (specialType === SPECIAL_CONTAINER_TYPES.MONITOR) {
        // Monitor restriction: Optimized for display widgets
        const displayTypes = [
            SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY,
            SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER,
            SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS,
            SPECIAL_WIDGET_TYPES.VIRTUAL_CHART,
            SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE
        ];
        
        if (virtualWidgets && Array.isArray(virtualWidgets)) {
            virtualWidgets.forEach((vw, idx) => {
                if (!displayTypes.includes(vw.type) && vw.type !== SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE) {
                    warnings.push(`Monitor widget ${idx} (${vw.type}) might not render optimally. Consider using display types.`);
                }
            });
            
            // Monitor optimized for up to 16 widgets in grid
            if (virtualWidgets.length > 16) {
                errors.push(`Monitor type is optimized for up to 16 widgets. Current: ${virtualWidgets.length}`);
            }
        }
        
        // Monitor requires refresh rate setting
        if (!config.settings?.updateInterval) {
            config.settings = config.settings || {};
            config.settings.updateInterval = 500; // Default 500ms
        }
    }

    if (specialType === SPECIAL_CONTAINER_TYPES.GALLERY) {
        // Gallery restriction: Visual content preferred
        const visualTypes = [
            SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE,
            SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY,
            SPECIAL_WIDGET_TYPES.CUSTOM_HTML
        ];
        
        if (virtualWidgets && Array.isArray(virtualWidgets)) {
            virtualWidgets.forEach((vw, idx) => {
                if (!visualTypes.includes(vw.type) && vw.type !== SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON) {
                    warnings.push(`Gallery widget ${idx} (${vw.type}) might not render optimally in gallery mode.`);
                }
            });
            
            // Gallery needs at least one image or display
            const hasVisual = virtualWidgets.some(vw => visualTypes.includes(vw.type));
            if (!hasVisual) {
                errors.push('Gallery must contain at least one image or display widget.');
            }
        }
        
        // Gallery column constraints
        if (config.settings?.columns) {
            if (config.settings.columns < 1 || config.settings.columns > 12) {
                errors.push('Gallery columns must be between 1 and 12.');
            }
        }
    }

    if (specialType === SPECIAL_CONTAINER_TYPES.DASHBOARD) {
        // Dashboard is most flexible - allow all widget types
        if (virtualWidgets && virtualWidgets.length > 50) {
            warnings.push(`Dashboard has ${virtualWidgets.length} widgets. Consider splitting into multiple dashboards.`);
        }
    }

    // Validate virtual widgets common checks
    if (virtualWidgets && Array.isArray(virtualWidgets)) {
        virtualWidgets.forEach((vw, idx) => {
            if (!vw.type || !Object.values(SPECIAL_WIDGET_TYPES).includes(vw.type)) {
                errors.push(`Virtual widget ${idx}: Invalid type "${vw.type}"`);
            }
            if (!vw.id) {
                errors.push(`Virtual widget ${idx}: Missing unique ID`);
            }
            
            // Validate connection if exists
            if (vw.connection) {
                if (!vw.connection.nodeId) {
                    errors.push(`Virtual widget ${vw.id || idx}: Connection missing nodeId`);
                }
                if (vw.connection.widgetIndex === undefined || vw.connection.widgetIndex < 0) {
                    errors.push(`Virtual widget ${vw.id || idx}: Connection missing or invalid widgetIndex`);
                }
                
                // Validate direction
                const validDirections = ['input', 'output', 'bidirectional'];
                if (vw.connection.direction && !validDirections.includes(vw.connection.direction)) {
                    errors.push(`Virtual widget ${vw.id || idx}: Invalid connection direction`);
                }
            }
            
            // Type-specific config validation
            if (vw.type === SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER || 
                vw.type === SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER) {
                if (vw.config.min !== null && vw.config.max !== null && vw.config.min >= vw.config.max) {
                    errors.push(`Virtual widget ${vw.id || idx}: min must be less than max`);
                }
            }
        });
    }
    
    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Serialize special container for storage
 */
export function serializeSpecialContainer(config) {
    return JSON.parse(JSON.stringify({
        containerType: config.containerType,
        specialType: config.specialType,
        title: config.title,
        virtualWidgets: config.virtualWidgets,
        connections: config.connections,
        settings: config.settings,
        containerView: config.containerView,
        layoutMode: config.layoutMode,
        widgetDensity: config.widgetDensity,
        customBg: config.customBg,
        borderCol: config.borderCol,
        borderRadius: config.borderRadius,
        customOpacity: config.customOpacity,
        pinned: config.pinned,
        collapsed: config.collapsed
    }));
}

/**
 * Deserialize special container from storage
 */
export function deserializeSpecialContainer(data) {
    if (!data || data.containerType !== CONTAINER_TYPES.SPECIAL) {
        return null;
    }
    
    // Ensure all required fields exist
    const config = {
        ...data,
        virtualWidgets: data.virtualWidgets || [],
        connections: data.connections || [],
        settings: data.settings || {}
    };
    
    return config;
}

/**
 * Get available special container types for UI
 */
export function getSpecialContainerTypes() {
    return Object.entries(SPECIAL_CONTAINER_TYPES).map(([key, value]) => ({
        id: value,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: getSpecialContainerDescription(value)
    }));
}

/**
 * Get description for special container type
 */
function getSpecialContainerDescription(type) {
    const descriptions = {
        [SPECIAL_CONTAINER_TYPES.DASHBOARD]: 'Multi-widget dashboard with real-time updates',
        [SPECIAL_CONTAINER_TYPES.CONTROL_PANEL]: 'Custom control panel with presets and quick actions',
        [SPECIAL_CONTAINER_TYPES.MONITOR]: 'Real-time monitoring and visualization',
        [SPECIAL_CONTAINER_TYPES.FORM]: 'Custom form builder with validation',
        [SPECIAL_CONTAINER_TYPES.GALLERY]: 'Image and media gallery viewer'
    };
    return descriptions[type] || 'Special autonomous container';
}

/**
 * Get available special widget types for UI
 */
export function getSpecialWidgetTypes() {
    return Object.entries(SPECIAL_WIDGET_TYPES).map(([key, value]) => ({
        id: value,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        category: getSpecialWidgetCategory(value)
    }));
}

/**
 * Get category for special widget type
 */
function getSpecialWidgetCategory(type) {
    if (type.startsWith('virtual_')) {
        if (type.includes('number') || type.includes('slider')) return 'input_numeric';
        if (type.includes('text')) return 'input_text';
        if (type.includes('toggle') || type.includes('button')) return 'input_action';
        if (type.includes('dropdown')) return 'input_select';
        if (type.includes('display') || type.includes('progress') || type.includes('image')) return 'output';
        if (type.includes('chart')) return 'visualization';
    }
    if (type === 'custom_html') return 'custom';
    return 'other';
}

/**
 * Update display settings for a virtual widget
 * @param {Object} virtualWidget - Virtual widget to update
 * @param {Object} newSettings - New display settings to merge
 * @returns {Object} Updated virtual widget
 */
export function updateVirtualWidgetDisplaySettings(virtualWidget, newSettings) {
    if (!virtualWidget) return null;
    
    if (!virtualWidget.displaySettings) {
        virtualWidget.displaySettings = {};
    }
    
    // Deep merge for animations
    if (newSettings.animations) {
        virtualWidget.displaySettings.animations = {
            ...(virtualWidget.displaySettings.animations || {}),
            ...newSettings.animations
        };
        delete newSettings.animations;
    }
    
    // Merge other settings
    virtualWidget.displaySettings = {
        ...virtualWidget.displaySettings,
        ...newSettings
    };
    
    return virtualWidget;
}

/**
 * Validate display settings configuration
 * @param {Object} displaySettings - Display settings to validate
 * @returns {Object} Validation result with valid flag, errors and warnings
 */
export function validateDisplaySettings(displaySettings) {
    const errors = [];
    const warnings = [];
    
    if (!displaySettings) {
        return { valid: true, errors, warnings };
    }
    
    // Validate viewMode
    const validViewModes = ['normal', 'compact', 'detailed', 'hidden'];
    if (displaySettings.viewMode && !validViewModes.includes(displaySettings.viewMode)) {
        errors.push(`Invalid viewMode: ${displaySettings.viewMode}. Must be one of: ${validViewModes.join(', ')}`);
    }
    
    // Validate labelPosition
    const validLabelPositions = ['top', 'bottom', 'left', 'right', 'overlay'];
    if (displaySettings.labelPosition && !validLabelPositions.includes(displaySettings.labelPosition)) {
        errors.push(`Invalid labelPosition: ${displaySettings.labelPosition}. Must be one of: ${validLabelPositions.join(', ')}`);
    }
    
    // Validate align
    const validAligns = ['start', 'end', 'center', 'stretch', 'baseline', 'auto'];
    if (displaySettings.align && !validAligns.includes(displaySettings.align)) {
        errors.push(`Invalid align: ${displaySettings.align}. Must be one of: ${validAligns.join(', ')}`);
    }
    
    // Validate animation settings
    if (displaySettings.animations) {
        const validEntrance = ['fade', 'slide', 'scale', 'none'];
        const validHover = ['highlight', 'lift', 'glow', 'none'];
        
        if (displaySettings.animations.entrance && !validEntrance.includes(displaySettings.animations.entrance)) {
            errors.push(`Invalid animation.entrance: ${displaySettings.animations.entrance}. Must be one of: ${validEntrance.join(', ')}`);
        }
        
        if (displaySettings.animations.hover && !validHover.includes(displaySettings.animations.hover)) {
            errors.push(`Invalid animation.hover: ${displaySettings.animations.hover}. Must be one of: ${validHover.join(', ')}`);
        }
        
        if (displaySettings.animations.duration && (typeof displaySettings.animations.duration !== 'number' || displaySettings.animations.duration < 0)) {
            errors.push('Animation duration must be a positive number');
        } else if (displaySettings.animations.duration > 5000) {
            warnings.push('Animation duration > 5000ms may cause UX issues');
        }
    }
    
    // Validate conditional display
    if (displaySettings.conditionalDisplay) {
        const validOperators = ['eq', '==', 'neq', '!=', 'gt', '>', 'gte', '>=', 'lt', '<', 'lte', '<=', 'truthy', 'falsy'];
        if (displaySettings.conditionalDisplay.operator && !validOperators.includes(displaySettings.conditionalDisplay.operator)) {
            errors.push(`Invalid conditionalDisplay.operator: ${displaySettings.conditionalDisplay.operator}`);
        }
        
        if (!displaySettings.conditionalDisplay.sourceWidgetId) {
            warnings.push('conditionalDisplay requires sourceWidgetId to function');
        }
    }
    
    // Validate grid spans
    if (displaySettings.columnSpan && (typeof displaySettings.columnSpan !== 'number' || displaySettings.columnSpan < 1)) {
        errors.push('columnSpan must be a positive integer');
    }
    
    if (displaySettings.rowSpan && (typeof displaySettings.rowSpan !== 'number' || displaySettings.rowSpan < 1)) {
        errors.push('rowSpan must be a positive integer');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
