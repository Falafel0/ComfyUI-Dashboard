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

// Special button action types for enhanced functionality
export const BUTTON_ACTION_TYPES = {
    LAUNCH_WORKFLOW: 'launch_workflow',        // Launch entire workflow
    LAUNCH_NODE: 'launch_node',                // Execute workflow up to specific node only
    BYPASS_NODE: 'bypass_node',                // Toggle bypass for a node
    MUTE_NODE: 'mute_node',                    // Toggle mute for a node
    RESET_WIDGETS: 'reset_widgets',            // Reset all widgets in container
    SAVE_PRESET: 'save_preset',                // Save current state as preset
    LOAD_PRESET: 'load_preset',                // Load a preset
    COPY_VALUES: 'copy_values',                // Copy values to clipboard
    PASTE_VALUES: 'paste_values',              // Paste values from clipboard
    SYNC_ALL: 'sync_all',                      // Force sync all connected widgets
    CLEAR_CACHE: 'clear_cache',                // Clear cached data
    EXPORT_CONFIG: 'export_config',            // Export container config
    IMPORT_CONFIG: 'import_config',            // Import container config
    TOGGLE_COLLAPSE: 'toggle_collapse',        // Toggle container collapse
    CUSTOM_SCRIPT: 'custom_script'             // Run custom JavaScript
};

// Button appearance/types for visual customization
export const BUTTON_APPEARANCE_TYPES = {
    BUTTON: 'button',              // Standard push button
    TOGGLE: 'toggle',              // On/off toggle switch
    CHECKBOX: 'checkbox',          // Checkbox style
    RADIO: 'radio',                // Radio button
    SWITCH: 'switch',              // Modern toggle switch
    ICON: 'icon',                  // Icon-only button
    ICON_TEXT: 'icon_text',        // Icon with text
    PILL: 'pill',                  // Pill-shaped button
    OUTLINE: 'outline',            // Outlined button
    GHOST: 'ghost',                // Transparent background
    DROPDOWN: 'dropdown',          // Dropdown menu button
    MOMENTARY: 'momentary'         // Momentary press button
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
        actionConfig: null, // For buttons: { actionType, targetNodeId, presetId, script, etc. }
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
        case SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON:
            baseWidget.config.label = 'Button';
            baseWidget.config.accentColor = '';
            baseWidget.config.appearanceType = BUTTON_APPEARANCE_TYPES.BUTTON;
            baseWidget.config.icon = '';
            baseWidget.config.showLabel = true;
            baseWidget.actionConfig = {
                actionType: BUTTON_ACTION_TYPES.CUSTOM_SCRIPT,
                script: 'console.log("Button clicked!");',
                targetNodeId: null,
                presetId: null,
                confirmBeforeExec: false
            };
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
 * Execute button action for virtual button widgets
 * @param {Object} virtualWidget - The virtual button widget
 * @param {Object} containerConfig - The parent container config
 * @returns {Promise<any>} - Result of the action
 */
export async function executeButtonAction(virtualWidget, containerConfig = null) {
    if (!virtualWidget?.actionConfig) {
        console.warn('[Special Container] Button has no action configured');
        return null;
    }

    const { actionType, targetNodeId, presetId, script, confirmBeforeExec } = virtualWidget.actionConfig;

    // Confirm before execution if configured
    if (confirmBeforeExec) {
        const confirmed = await showConfirmDialog(`Execute action: ${actionType}?`);
        if (!confirmed) return null;
    }

    switch (actionType) {
        case BUTTON_ACTION_TYPES.LAUNCH_WORKFLOW:
            return launchWorkflow();

        case BUTTON_ACTION_TYPES.LAUNCH_NODE:
            return launchNode(targetNodeId);

        case BUTTON_ACTION_TYPES.BYPASS_NODE:
            return bypassNode(targetNodeId);

        case BUTTON_ACTION_TYPES.MUTE_NODE:
            return muteNode(targetNodeId);

        case BUTTON_ACTION_TYPES.RESET_WIDGETS:
            return resetContainerWidgets(containerConfig);

        case BUTTON_ACTION_TYPES.SAVE_PRESET:
            return savePreset(presetId, containerConfig);

        case BUTTON_ACTION_TYPES.LOAD_PRESET:
            return loadPreset(presetId, containerConfig);

        case BUTTON_ACTION_TYPES.COPY_VALUES:
            return copyValuesToClipboard(containerConfig);

        case BUTTON_ACTION_TYPES.PASTE_VALUES:
            return pasteValuesFromClipboard(containerConfig);

        case BUTTON_ACTION_TYPES.SYNC_ALL:
            return syncAllWidgets(containerConfig);

        case BUTTON_ACTION_TYPES.CLEAR_CACHE:
            return clearCache();

        case BUTTON_ACTION_TYPES.EXPORT_CONFIG:
            return exportContainerConfig(containerConfig);

        case BUTTON_ACTION_TYPES.IMPORT_CONFIG:
            return importContainerConfig(containerConfig);

        case BUTTON_ACTION_TYPES.TOGGLE_COLLAPSE:
            return toggleContainerCollapse(containerConfig);

        case BUTTON_ACTION_TYPES.CUSTOM_SCRIPT:
            return executeCustomScript(script, virtualWidget, containerConfig);

        default:
            console.warn(`[Special Container] Unknown action type: ${actionType}`);
            return null;
    }
}

/**
 * Launch entire workflow
 */
async function launchWorkflow() {
    try {
        const { app } = await import("../../scripts/app.js");
        if (app?.queuePrompt) {
            await app.queuePrompt(0);
            return { success: true, message: 'Workflow launched' };
        }
        throw new Error('app.queuePrompt not available');
    } catch (e) {
        console.error('[Special Container] Failed to launch workflow:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Launch/execute workflow up to a specific node (executes only the path to that node)
 */
async function launchNode(nodeId) {
    try {
        if (!nodeId) {
            return { success: false, error: 'No target node specified' };\n        }
        const { app } = await import("../../scripts/app.js");
        const targetNode = app.graph.getNodeById(nodeId);
        if (!targetNode) {
            return { success: false, error: `Node #${nodeId} not found` };
        }
        
        // Build execution path from start nodes to target node
        // This executes only the branches leading to the target node
        const executedNodes = new Set();
        const nodesToExecute = [];
        
        // Find all nodes that are ancestors of the target node (upstream dependencies)
        function findUpstreamNodes(node, visited = new Set()) {
            if (visited.has(node.id)) return;
            visited.add(node.id);
            
            // Get input links to find upstream nodes
            if (node.inputs && Array.isArray(node.inputs)) {
                for (const input of node.inputs) {
                    if (input.link !== null && input.link !== undefined) {
                        const link = app.graph.links[input.link];
                        if (link) {
                            const upstreamNode = app.graph.getNodeById(link.origin_id);
                            if (upstreamNode) {
                                findUpstreamNodes(upstreamNode, visited);
                            }
                        }
                    }
                }
            }
            
            // Add this node to execution list
            nodesToExecute.push(node);
        }
        
        findUpstreamNodes(targetNode);
        
        // Execute nodes in order (upstream first, then target)
        for (const node of nodesToExecute) {
            if (!executedNodes.has(node.id)) {
                if (node.onExecute) {
                    try {
                        node.onExecute();
                        executedNodes.add(node.id);
                    } catch (e) {
                        console.warn(`[Special Container] Node ${node.id} execution warning:`, e.message);
                    }
                } else {
                    executedNodes.add(node.id);
                }
            }
        }
        
        if (executedNodes.size > 0) {
            // Trigger canvas update
            if (app.graph.setDirtyCanvas) {
                app.graph.setDirtyCanvas(true, true);
            }
            return { 
                success: true, 
                message: `Executed ${executedNodes.size} node(s) up to Node #${nodeId}`,
                executedCount: executedNodes.size
            };
        }
        
        // Fallback: queue prompt if no onExecute methods found
        if (app.queuePrompt) {
            await app.queuePrompt(0);
            return { success: true, message: `Workflow launched (target: Node #${nodeId})` };
        }
        
        return { success: false, error: 'Node does not support direct execution' };
    } catch (e) {
        console.error('[Special Container] Failed to launch node:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Toggle bypass state for a node
 */
async function bypassNode(nodeId) {
    try {
        if (!nodeId) {
            return { success: false, error: 'No target node specified' };
        }
        const { app } = await import("../../scripts/app.js");
        const node = app.graph.getNodeById(nodeId);
        if (!node) {
            return { success: false, error: `Node #${nodeId} not found` };
        }
        
        // Toggle bypass mode (ComfyUI standard approach)
        const isBypassed = node.mode === 4; // Mode 4 = bypass in ComfyUI
        node.mode = isBypassed ? 0 : 4; // 0 = always, 4 = bypass
        
        // Update canvas
        if (app.graph.setDirtyCanvas) {
            app.graph.setDirtyCanvas(true, true);
        }
        
        return { 
            success: true, 
            message: `Node #${nodeId} ${isBypassed ? 'unbypassed' : 'bypassed'}`,
            isBypassed: !isBypassed
        };
    } catch (e) {
        console.error('[Special Container] Failed to toggle bypass:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Toggle mute state for a node
 */
async function muteNode(nodeId) {
    try {
        if (!nodeId) {
            return { success: false, error: 'No target node specified' };
        }
        const { app } = await import("../../scripts/app.js");
        const node = app.graph.getNodeById(nodeId);
        if (!node) {
            return { success: false, error: `Node #${nodeId} not found` };
        }
        
        // Toggle mute mode (ComfyUI standard approach)
        const isMuted = node.mode === 2; // Mode 2 = muted in ComfyUI
        node.mode = isMuted ? 0 : 2; // 0 = always, 2 = muted
        
        // Update canvas
        if (app.graph.setDirtyCanvas) {
            app.graph.setDirtyCanvas(true, true);
        }
        
        return { 
            success: true, 
            message: `Node #${nodeId} ${isMuted ? 'unmuted' : 'muted'}`,
            isMuted: !isMuted
        };
    } catch (e) {
        console.error('[Special Container] Failed to toggle mute:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Reset all widgets in container to default values
 */
async function resetContainerWidgets(containerConfig) {
    try {
        if (!containerConfig?.virtualWidgets) {
            return { success: false, error: 'No widgets to reset' };
        }

        for (const vw of containerConfig.virtualWidgets) {
            if (vw.config?.defaultValue !== null && vw.config?.defaultValue !== undefined) {
                vw.value = vw.config.defaultValue;
            } else {
                // Type-specific defaults
                switch (vw.type) {
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER:
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER:
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY:
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS:
                        vw.value = 0;
                        break;
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE:
                        vw.value = false;
                        break;
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT:
                        vw.value = '';
                        break;
                    case SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN:
                        vw.value = vw.config.options?.[0] || '';
                        break;
                }
            }
            
            // Update DOM if exists
            const domEl = document.querySelector(`[data-virtual-widget-id="${vw.id}"]`);
            if (domEl?.updateValue) {
                domEl.updateValue(vw.value);
            }
        }

        return { success: true, message: 'All widgets reset' };
    } catch (e) {
        console.error('[Special Container] Failed to reset widgets:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Save current state as preset
 */
async function savePreset(presetId, containerConfig) {
    try {
        if (!containerConfig?.virtualWidgets) {
            return { success: false, error: 'No widgets to save' };
        }

        const presetData = {
            id: presetId || `preset_${Date.now()}`,
            name: `Preset ${new Date().toLocaleTimeString()}`,
            values: {},
            createdAt: Date.now()
        };

        for (const vw of containerConfig.virtualWidgets) {
            presetData.values[vw.id] = vw.value;
        }

        // Store in localStorage or state
        const existingPresets = JSON.parse(localStorage.getItem('specialContainerPresets') || '{}');
        existingPresets[presetData.id] = presetData;
        localStorage.setItem('specialContainerPresets', JSON.stringify(existingPresets));

        return { success: true, message: 'Preset saved', presetId: presetData.id };
    } catch (e) {
        console.error('[Special Container] Failed to save preset:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Load a preset
 */
async function loadPreset(presetId, containerConfig) {
    try {
        if (!containerConfig?.virtualWidgets) {
            return { success: false, error: 'No widgets to update' };
        }

        const existingPresets = JSON.parse(localStorage.getItem('specialContainerPresets') || '{}');
        const preset = existingPresets[presetId];
        
        if (!preset) {
            return { success: false, error: 'Preset not found' };
        }

        for (const vw of containerConfig.virtualWidgets) {
            if (preset.values[vw.id] !== undefined) {
                vw.value = preset.values[vw.id];
                
                // Update DOM if exists
                const domEl = document.querySelector(`[data-virtual-widget-id="${vw.id}"]`);
                if (domEl?.updateValue) {
                    domEl.updateValue(vw.value);
                }
            }
        }

        return { success: true, message: 'Preset loaded' };
    } catch (e) {
        console.error('[Special Container] Failed to load preset:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Copy widget values to clipboard
 */
async function copyValuesToClipboard(containerConfig) {
    try {
        if (!containerConfig?.virtualWidgets) {
            return { success: false, error: 'No widgets to copy' };
        }

        const values = {};
        for (const vw of containerConfig.virtualWidgets) {
            values[vw.id] = { name: vw.name, type: vw.type, value: vw.value };
        }

        await navigator.clipboard.writeText(JSON.stringify(values, null, 2));
        return { success: true, message: 'Values copied to clipboard' };
    } catch (e) {
        console.error('[Special Container] Failed to copy values:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Paste widget values from clipboard
 */
async function pasteValuesFromClipboard(containerConfig) {
    try {
        if (!containerConfig?.virtualWidgets) {
            return { success: false, error: 'No widgets to update' };
        }

        const clipboardText = await navigator.clipboard.readText();
        const values = JSON.parse(clipboardText);

        for (const vw of containerConfig.virtualWidgets) {
            if (values[vw.id]?.value !== undefined) {
                vw.value = values[vw.id].value;
                
                // Update DOM if exists
                const domEl = document.querySelector(`[data-virtual-widget-id="${vw.id}"]`);
                if (domEl?.updateValue) {
                    domEl.updateValue(vw.value);
                }
            }
        }

        return { success: true, message: 'Values pasted from clipboard' };
    } catch (e) {
        console.error('[Special Container] Failed to paste values:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Force sync all connected widgets
 */
async function syncAllWidgets(containerConfig) {
    try {
        if (!containerConfig?.virtualWidgets) {
            return { success: false, error: 'No widgets to sync' };
        }

        let syncedCount = 0;
        for (const vw of containerConfig.virtualWidgets) {
            if (vw.connection) {
                await syncVirtualWidget(vw, false);
                syncedCount++;
                
                // Update DOM if exists
                const domEl = document.querySelector(`[data-virtual-widget-id="${vw.id}"]`);
                if (domEl?.updateValue) {
                    domEl.updateValue(vw.value);
                }
            }
        }

        return { success: true, message: `Synced ${syncedCount} widgets` };
    } catch (e) {
        console.error('[Special Container] Failed to sync widgets:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Clear cached data
 */
async function clearCache() {
    try {
        // Clear virtual widget states
        virtualWidgetStates.clear();
        
        // Clear any cached presets
        localStorage.removeItem('specialContainerPresets');
        
        return { success: true, message: 'Cache cleared' };
    } catch (e) {
        console.error('[Special Container] Failed to clear cache:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Export container configuration
 */
async function exportContainerConfig(containerConfig) {
    try {
        if (!containerConfig) {
            return { success: false, error: 'No container config to export' };
        }

        const exportData = serializeSpecialContainer(containerConfig);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `special-container-${containerConfig.specialType}-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        return { success: true, message: 'Configuration exported' };
    } catch (e) {
        console.error('[Special Container] Failed to export config:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Import container configuration (placeholder - requires file picker)
 */
async function importContainerConfig(containerConfig) {
    try {
        // This would require a file picker UI
        // For now, just show a message
        return { 
            success: false, 
            message: 'Import functionality requires file picker UI. Use the editor to import configurations.',
            requiresUI: true
        };
    } catch (e) {
        console.error('[Special Container] Failed to import config:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Toggle container collapse state
 */
async function toggleContainerCollapse(containerConfig) {
    try {
        if (!containerConfig) {
            return { success: false, error: 'No container config' };
        }

        containerConfig.collapsed = !containerConfig.collapsed;
        
        // Update DOM if exists
        const containerEl = document.querySelector(`[data-container-id="${containerConfig.id}"]`);
        if (containerEl) {
            containerEl.classList.toggle('collapsed', containerConfig.collapsed);
        }
        
        return { success: true, message: `Container ${containerConfig.collapsed ? 'collapsed' : 'expanded'}` };
    } catch (e) {
        console.error('[Special Container] Failed to toggle collapse:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Execute custom JavaScript script
 */
async function executeCustomScript(script, virtualWidget, containerConfig) {
    try {
        if (!script) {
            return { success: false, error: 'No script defined' };
        }

        // Create a safe execution context
        const context = {
            widget: virtualWidget,
            container: containerConfig,
            virtualWidgetStates,
            console,
            Date,
            Math,
            JSON,
            Object,
            Array,
            String,
            Number,
            Boolean
        };

        // Create function with context
        const fn = new Function(...Object.keys(context), script);
        const result = fn(...Object.values(context));
        
        return { 
            success: true, 
            message: 'Script executed',
            result: result
        };
    } catch (e) {
        console.error('[Special Container] Script execution failed:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Show confirmation dialog
 */
async function showConfirmDialog(message) {
    // In browser context, use native confirm
    if (typeof window !== 'undefined' && window.confirm) {
        return window.confirm(message);
    }
    // Default to true in non-browser contexts
    return true;
}
