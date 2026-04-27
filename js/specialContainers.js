/**
 * A11 Studio - Special Containers Module
 * Autonomous containers with virtual widgets and enhanced customization
 */

import { state } from "./state.js";
import { CONTAINER_TYPES } from "./presetManager.js";

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
export async function syncVirtualWidget(virtualWidget) {
    if (!virtualWidget?.connection) return null;
    
    const { app } = await import("../../scripts/app.js");
    const { nodeId, widgetIndex, direction } = virtualWidget.connection;
    
    const node = app.graph.getNodeById(nodeId);
    if (!node || !node.widgets || !node.widgets[widgetIndex]) {
        console.warn(`[Special Container] Node or widget not found: ${nodeId}:${widgetIndex}`);
        return null;
    }
    
    const realWidget = node.widgets[widgetIndex];
    
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
        virtualWidget.value = realWidget.value;
    }
    
    virtualWidget.connection.lastSync = Date.now();
    return virtualWidget.value;
}

/**
 * Validate a special container configuration
 */
export function validateSpecialContainer(config) {
    const errors = [];
    const warnings = [];
    
    if (!config.containerType || config.containerType !== CONTAINER_TYPES.SPECIAL) {
        errors.push('Container type must be SPECIAL');
    }
    
    if (!config.specialType || !Object.values(SPECIAL_CONTAINER_TYPES).includes(config.specialType)) {
        errors.push(`Invalid special container type: ${config.specialType}`);
    }
    
    // Validate virtual widgets
    if (config.virtualWidgets && Array.isArray(config.virtualWidgets)) {
        config.virtualWidgets.forEach((vw, idx) => {
            if (!vw.type || !Object.values(SPECIAL_WIDGET_TYPES).includes(vw.type)) {
                errors.push(`Virtual widget ${idx}: Invalid type`);
            }
            if (!vw.id) {
                warnings.push(`Virtual widget ${idx}: Missing ID`);
            }
            
            // Validate connection if exists
            if (vw.connection) {
                if (!vw.connection.nodeId) {
                    warnings.push(`Virtual widget ${vw.id}: Connection missing nodeId`);
                }
                if (vw.connection.widgetIndex === undefined) {
                    warnings.push(`Virtual widget ${vw.id}: Connection missing widgetIndex`);
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
