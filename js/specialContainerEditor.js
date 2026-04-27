/**
 * A11 Studio - Special Container Editor UI
 * UI for creating and editing special containers with virtual widgets
 */

import { state } from "./state.js";
import { 
    SPECIAL_CONTAINER_TYPES, 
    SPECIAL_WIDGET_TYPES,
    createSpecialContainer,
    createVirtualWidget,
    connectVirtualWidget,
    disconnectVirtualWidget,
    getSpecialContainerTypes,
    getSpecialWidgetTypes,
    validateSpecialContainer
} from "./specialContainers.js";
import { CONTAINER_TYPES } from "./presetManager.js";

let currentEditingConfig = null;
let onEditorSaveCallback = null;

/**
 * Open the special container editor modal
 */
export function openSpecialContainerEditor(config = null, onSave = null) {
    const modal = document.createElement("div");
    modal.className = "a11-modal open";
    
    currentEditingConfig = config || null;
    onEditorSaveCallback = onSave;
    
    const isEditing = !!config;
    const containerTypes = getSpecialContainerTypes();
    const widgetTypes = getSpecialWidgetTypes();
    
    // Group widget types by category
    const widgetsByCategory = {};
    widgetTypes.forEach(wt => {
        if (!widgetsByCategory[wt.category]) widgetsByCategory[wt.category] = [];
        widgetsByCategory[wt.category].push(wt);
    });
    
    let containerTypeOptions = containerTypes.map(ct => 
        `<option value="${ct.id}" ${config?.specialType === ct.id ? 'selected' : ''}>${ct.name}</option>`
    ).join('');
    
    let widgetTypeOptions = '';
    Object.entries(widgetsByCategory).forEach(([category, widgets]) => {
        const categoryName = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        widgetTypeOptions += `<optgroup label="${categoryName}">`;
        widgets.forEach(wt => {
            widgetTypeOptions += `<option value="${wt.id}">${wt.name}</option>`;
        });
        widgetTypeOptions += `</optgroup>`;
    });
    
    // Build virtual widgets list
    let virtualWidgetsHtml = '';
    if (config?.virtualWidgets && config.virtualWidgets.length > 0) {
        config.virtualWidgets.forEach((vw, idx) => {
            const isConnected = !!vw.connection;
            const connectionInfo = isConnected 
                ? `<span class="vw-connection-badge">🔗 Connected to Node #${vw.connection.nodeId}</span>` 
                : '<span class="vw-no-connection">Not connected</span>';
            
            virtualWidgetsHtml += `
                <div class="vw-item" data-vw-id="${vw.id}">
                    <div class="vw-header">
                        <span class="vw-type-badge">${vw.type.replace(/_/g, ' ').toUpperCase()}</span>
                        <input type="text" class="vw-name" value="${vw.name || ''}" placeholder="Widget Name">
                        <div class="vw-actions">
                            <button class="vw-btn vw-connect-btn" title="Connect to Real Widget">🔗 Connect</button>
                            <button class="vw-btn vw-config-btn" title="Configure Widget">⚙️ Config</button>
                            <button class="vw-btn vw-remove-btn" title="Remove Widget">❌</button>
                        </div>
                    </div>
                    <div class="vw-body">
                        <div class="vw-status">${connectionInfo}</div>
                        <div class="vw-value-preview">Value: <span class="vw-value">${JSON.stringify(vw.value)}</span></div>
                    </div>
                </div>
            `;
        });
    } else {
        virtualWidgetsHtml = '<div class="vw-empty">No virtual widgets yet. Add one using the panel below.</div>';
    }
    
    modal.innerHTML = `
        <div class="a11-modal-content" style="width:900px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column;">
            <div class="a11-modal-title">${isEditing ? '✏️ Edit Special Container' : '➕ Create Special Container'}</div>
            <div class="a11-modal-layout" style="flex:1; overflow:hidden;">
                <div class="a11-modal-sidebar" style="width:280px;">
                    <div class="a11-modal-tab active" data-target="sce-general">📋 General</div>
                    <div class="a11-modal-tab" data-target="sce-widgets">🔧 Virtual Widgets</div>
                    <div class="a11-modal-tab" data-target="sce-connections">🔗 Connections</div>
                    <div class="a11-modal-tab" data-target="sce-settings">⚙️ Settings</div>
                </div>
                <div class="a11-modal-content-area" style="overflow-y:auto; padding:15px;">
                    
                    <!-- General Tab -->
                    <div class="a11-modal-panel active" id="sce-general">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Container Type & Basic Info</div>
                            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none;">
                                <label>Special Container Type</label>
                                <select id="sce-container-type" style="width:100%">${containerTypeOptions}</select>
                                <small class="sce-type-desc" style="color:var(--a11-desc); margin-top:5px;"></small>
                            </div>
                            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; border-bottom:none; margin-top:10px;">
                                <label>Container Title</label>
                                <input type="text" id="sce-title" value="${config?.title || 'Special Container'}" style="width:100%" placeholder="Enter container title">
                            </div>
                        </div>
                        
                        <div class="a11-info-box" style="margin-top:15px; padding:12px; background:rgba(234,88,12,0.1); border-left:3px solid var(--a11-accent); border-radius:4px;">
                            <strong>ℹ️ About Special Containers</strong>
                            <p style="margin:8px 0 0 0; font-size:12px; color:var(--a11-desc);">
                                Special containers are autonomous containers with virtual widgets that can exist independently 
                                from real node widgets. You can connect virtual widgets to real ones for synchronized control.
                            </p>
                        </div>
                    </div>
                    
                    <!-- Virtual Widgets Tab -->
                    <div class="a11-modal-panel" id="sce-widgets">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Virtual Widgets</div>
                            
                            <div class="vw-list" style="max-height:300px; overflow-y:auto; margin-bottom:15px; border:1px solid var(--a11-border); border-radius:6px; padding:10px;">
                                ${virtualWidgetsHtml}
                            </div>
                            
                            <div class="vw-add-section" style="display:flex; gap:10px; align-items:flex-end;">
                                <div style="flex-grow:1;">
                                    <label>Add Virtual Widget</label>
                                    <select id="sce-add-widget-type" style="width:100%">${widgetTypeOptions}</select>
                                </div>
                                <button id="sce-add-widget-btn" class="a11-btn active">➕ Add Widget</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Connections Tab -->
                    <div class="a11-modal-panel" id="sce-connections">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Widget Connections</div>
                            <small style="color:var(--a11-desc); display:block; margin-bottom:10px;">
                                Connect virtual widgets to real node widgets for synchronization
                            </small>
                            
                            <div id="sce-connections-list" style="max-height:400px; overflow-y:auto;">
                                ${renderConnectionsList(null)}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Settings Tab -->
                    <div class="a11-modal-panel" id="sce-settings">
                        <div class="a11-settings-block">
                            <div class="a11-settings-title">Container Settings</div>
                            <div id="sce-dynamic-settings">
                                ${renderDynamicSettings(null)}
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn danger" id="sce-delete" style="${isEditing ? '' : 'display:none'}" ${!isEditing ? 'disabled' : ''}>Delete Container</button>
                <button class="a11-btn" id="sce-cancel">Cancel</button>
                <button class="a11-btn active" id="sce-save">💾 Save & ${isEditing ? 'Apply' : 'Create'}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize tab switching
    modal.querySelectorAll('.a11-modal-tab').forEach(tab => {
        tab.onclick = () => {
            modal.querySelectorAll('.a11-modal-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.a11-modal-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            modal.querySelector('#' + tab.dataset.target).classList.add('active');
        };
    });
    
    // Update description when container type changes AND refresh settings
    const typeSelect = modal.querySelector('#sce-container-type');
    const descEl = modal.querySelector('.sce-type-desc');
    const dynamicSettingsDiv = modal.querySelector('#sce-dynamic-settings');
    
    typeSelect.onchange = () => {
        const selectedType = containerTypes.find(ct => ct.id === typeSelect.value);
        descEl.textContent = selectedType?.description || '';
        
        // Update currentEditingConfig specialType
        if (currentEditingConfig) {
            currentEditingConfig.specialType = typeSelect.value;
        }
        
        // Refresh dynamic settings for the new type
        if (dynamicSettingsDiv) {
            dynamicSettingsDiv.innerHTML = renderDynamicSettings(null);
        }
    };
    // Trigger initial description update
    typeSelect.onchange();
    
    // Add widget button
    modal.querySelector('#sce-add-widget-btn').onclick = () => {
        const widgetType = modal.querySelector('#sce-add-widget-type').value;
        addVirtualWidgetToList(config, widgetType, modal);
    };
    
    // Cancel button
    modal.querySelector('#sce-cancel').onclick = () => modal.remove();
    
    // Save button
    modal.querySelector('#sce-save').onclick = () => {
        saveSpecialContainer(modal);
    };
    
    // Delete button (only for editing)
    if (isEditing) {
        modal.querySelector('#sce-delete').onclick = () => {
            if (confirm('Are you sure you want to delete this special container?')) {
                if (onEditorSaveCallback) {
                    onEditorSaveCallback(null, true); // null config, isDelete=true
                }
                modal.remove();
            }
        };
    }
    
    // Setup event delegation for dynamic widget actions
    modal.querySelector('.vw-list').addEventListener('click', (e) => {
        const vwItem = e.target.closest('.vw-item');
        if (!vwItem) return;
        
        const vwId = vwItem.dataset.vwId;
        const vw = currentEditingConfig?.virtualWidgets?.find(w => w.id === vwId);
        
        if (e.target.classList.contains('vw-remove-btn')) {
            removeVirtualWidget(config, vwId, modal);
        } else if (e.target.classList.contains('vw-connect-btn')) {
            openConnectionDialog(vw, modal);
        } else if (e.target.classList.contains('vw-config-btn')) {
            openWidgetConfigDialog(vw, modal);
        }
    });
}

/**
 * Render connections list HTML
 */
function renderConnectionsList(config) {
    // Use currentEditingConfig if config not provided
    const dataConfig = config || currentEditingConfig;
    
    if (!dataConfig?.virtualWidgets || dataConfig.virtualWidgets.length === 0) {
        return '<div style="color:var(--a11-desc); padding:20px; text-align:center;">No virtual widgets to connect.</div>';
    }
    
    const { app } = window;
    let html = '';
    
    dataConfig.virtualWidgets.forEach(vw => {
        const isConnected = !!vw.connection;
        let nodeOptions = '<option value="">-- Select Node --</option>';
        
        if (app?.graph?._nodes) {
            app.graph._nodes.forEach(node => {
                const hasWidgets = node.widgets && node.widgets.length > 0;
                if (hasWidgets) {
                    const selected = vw.connection?.nodeId === node.id ? 'selected' : '';
                    nodeOptions += `<option value="${node.id}" ${selected}>${node.title || node.type} (#${node.id})</option>`;
                }
            });
        }
        
        let widgetOptions = '<option value="">-- Select Widget --</option>';
        if (vw.connection?.nodeId && app?.graph) {
            const node = app.graph.getNodeById(vw.connection.nodeId);
            if (node?.widgets) {
                node.widgets.forEach((w, idx) => {
                    const selected = vw.connection?.widgetIndex === idx ? 'selected' : '';
                    widgetOptions += `<option value="${idx}" ${selected}>${w.name || `Widget ${idx}`}</option>`;
                });
            }
        }
        
        html += `
            <div class="conn-item" data-vw-id="${vw.id}" style="border:1px solid var(--a11-border); border-radius:6px; padding:12px; margin-bottom:10px;">
                <div style="font-weight:bold; margin-bottom:8px;">${vw.name || vw.type}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:end;">
                    <div>
                        <label style="font-size:11px;">Node</label>
                        <select class="conn-node-select" style="width:100%; font-size:12px;">${nodeOptions}</select>
                    </div>
                    <div>
                        <label style="font-size:11px;">Widget</label>
                        <select class="conn-widget-select" style="width:100%; font-size:12px;">${widgetOptions}</select>
                    </div>
                    <div>
                        <label style="font-size:11px;">Direction</label>
                        <select class="conn-direction-select" style="width:100%; font-size:12px;">
                            <option value="bidirectional" ${vw.connection?.direction !== 'input' && vw.connection?.direction !== 'output' ? 'selected' : ''}>↔️ Both</option>
                            <option value="input" ${vw.connection?.direction === 'input' ? 'selected' : ''}>⬅️ Input Only</option>
                            <option value="output" ${vw.connection?.direction === 'output' ? 'selected' : ''}>➡️ Output Only</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top:10px; display:flex; gap:10px;">
                    ${isConnected 
                        ? '<button class="a11-btn danger conn-disconnect" style="font-size:11px; padding:4px 8px;">Disconnect</button>' 
                        : '<button class="a11-btn active conn-connect" style="font-size:11px; padding:4px 8px;">Connect</button>'}
                    <button class="a11-btn conn-sync" style="font-size:11px; padding:4px 8px;">🔄 Sync Now</button>
                </div>
            </div>
        `;
    });
    
    return html;
}

/**
 * Render dynamic settings based on container type
 */
function renderDynamicSettings(config) {
    // Use currentEditingConfig if config not provided, or get type from modal
    let specialType;
    if (config?.specialType) {
        specialType = config.specialType;
    } else if (currentEditingConfig?.specialType) {
        specialType = currentEditingConfig.specialType;
    } else {
        // Try to get from modal if it exists
        const modalTypeSelect = document.querySelector('#sce-container-type');
        specialType = modalTypeSelect?.value || SPECIAL_CONTAINER_TYPES.DASHBOARD;
    }
    
    let settingsHtml = '';
    
    switch (specialType) {
        case SPECIAL_CONTAINER_TYPES.DASHBOARD:
            settingsHtml = `
                <div class="a11-setting-row"><label>Refresh Rate (ms)</label><input type="number" id="sce-refresh-rate" value="${config?.settings?.refreshRate || currentEditingConfig?.settings?.refreshRate || 1000}" min="100" step="100"></div>
                <div class="a11-setting-row"><label>Layout Mode</label>
                    <select id="sce-dashboard-layout" style="width:100%">
                        <option value="grid" ${config?.settings?.layout !== 'flex' && currentEditingConfig?.settings?.layout !== 'flex' ? 'selected' : ''}>Grid</option>
                        <option value="flex" ${config?.settings?.layout === 'flex' || currentEditingConfig?.settings?.layout === 'flex' ? 'selected' : ''}>Flex</option>
                    </select>
                </div>
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-show-header" ${config?.settings?.showHeader !== false && currentEditingConfig?.settings?.showHeader !== false ? 'checked' : ''}> Show Header</label></div>
            `;
            break;
        case SPECIAL_CONTAINER_TYPES.CONTROL_PANEL:
            settingsHtml = `
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-auto-apply" ${config?.settings?.autoApply !== false && currentEditingConfig?.settings?.autoApply !== false ? 'checked' : ''}> Auto-Apply Changes</label></div>
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-confirm-changes" ${config?.settings?.confirmChanges || currentEditingConfig?.settings?.confirmChanges ? 'checked' : ''}> Confirm Changes</label></div>
                <div class="a11-setting-row"><label>Preset Slots</label><input type="number" id="sce-preset-slots" value="${config?.settings?.presetSlots || currentEditingConfig?.settings?.presetSlots || 5}" min="1" max="20"></div>
            `;
            break;
        case SPECIAL_CONTAINER_TYPES.MONITOR:
            settingsHtml = `
                <div class="a11-setting-row"><label>Update Interval (ms)</label><input type="number" id="sce-update-interval" value="${config?.settings?.updateInterval || currentEditingConfig?.settings?.updateInterval || 500}" min="100" step="100"></div>
                <div class="a11-setting-row"><label>History Size</label><input type="number" id="sce-history-size" value="${config?.settings?.historySize || currentEditingConfig?.settings?.historySize || 100}" min="10" max="1000"></div>
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-show-graph" ${config?.settings?.showGraph !== false && currentEditingConfig?.settings?.showGraph !== false ? 'checked' : ''}> Show Graph</label></div>
            `;
            break;
        case SPECIAL_CONTAINER_TYPES.FORM:
            settingsHtml = `
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-validate-submit" ${config?.settings?.validateOnSubmit !== false && currentEditingConfig?.settings?.validateOnSubmit !== false ? 'checked' : ''}> Validate on Submit</label></div>
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-show-reset" ${config?.settings?.showResetButton !== false && currentEditingConfig?.settings?.showResetButton !== false ? 'checked' : ''}> Show Reset Button</label></div>
                <div class="a11-setting-row"><label>Submit Action</label>
                    <select id="sce-submit-action" style="width:100%">
                        <option value="apply" ${config?.settings?.submitAction === 'apply' || currentEditingConfig?.settings?.submitAction === 'apply' ? 'selected' : ''}>Apply Values</option>
                        <option value="execute" ${config?.settings?.submitAction === 'execute' || currentEditingConfig?.settings?.submitAction === 'execute' ? 'selected' : ''}>Execute Workflow</option>
                    </select>
                </div>
            `;
            break;
        case SPECIAL_CONTAINER_TYPES.GALLERY:
            settingsHtml = `
                <div class="a11-setting-row"><label>Thumbnail Size (px)</label><input type="number" id="sce-thumb-size" value="${config?.settings?.thumbnailSize || currentEditingConfig?.settings?.thumbnailSize || 128}" min="64" max="512" step="32"></div>
                <div class="a11-setting-row"><label><input type="checkbox" id="sce-show-captions" ${config?.settings?.showCaptions !== false && currentEditingConfig?.settings?.showCaptions !== false ? 'checked' : ''}> Show Captions</label></div>
                <div class="a11-setting-row"><label>Columns</label><input type="number" id="sce-gallery-cols" value="${config?.settings?.columns || currentEditingConfig?.settings?.columns || 4}" min="1" max="12"></div>
            `;
            break;
        default:
            settingsHtml = '<div style="color:var(--a11-desc);">No additional settings for this container type.</div>';
    }
    
    return settingsHtml;
}

/**
 * Add a virtual widget to the list
 */
function addVirtualWidgetToList(config, widgetType, modal) {
    // Ensure we're working with the current editing config
    if (!currentEditingConfig) {
        currentEditingConfig = { 
            specialType: modal.querySelector('#sce-container-type').value,
            title: modal.querySelector('#sce-title').value,
            virtualWidgets: [] 
        };
    }
    
    if (!currentEditingConfig.virtualWidgets) {
        currentEditingConfig.virtualWidgets = [];
    }
    
    const newWidget = createVirtualWidget(widgetType);
    currentEditingConfig.virtualWidgets.push(newWidget);
    
    // Refresh the widget list
    refreshVirtualWidgetsList(currentEditingConfig, modal);
    
    // Also refresh connections tab
    const connectionsList = modal.querySelector('#sce-connections-list');
    if (connectionsList) {
        connectionsList.innerHTML = renderConnectionsList(currentEditingConfig);
    }
}

/**
 * Remove a virtual widget from the list
 */
function removeVirtualWidget(config, widgetId, modal) {
    if (!currentEditingConfig?.virtualWidgets) return;
    
    const idx = currentEditingConfig.virtualWidgets.findIndex(w => w.id === widgetId);
    if (idx >= 0) {
        currentEditingConfig.virtualWidgets.splice(idx, 1);
        refreshVirtualWidgetsList(currentEditingConfig, modal);
        
        // Refresh connections tab
        const connectionsList = modal.querySelector('#sce-connections-list');
        if (connectionsList) {
            connectionsList.innerHTML = renderConnectionsList(currentEditingConfig);
        }
    }
}

/**
 * Refresh the virtual widgets list UI
 */
function refreshVirtualWidgetsList(config, modal) {
    const vwList = modal.querySelector('.vw-list');
    if (!vwList) return;
    
    // Use currentEditingConfig if config not provided
    const dataConfig = config || currentEditingConfig;
    
    if (!dataConfig?.virtualWidgets || dataConfig.virtualWidgets.length === 0) {
        vwList.innerHTML = '<div class="vw-empty">No virtual widgets yet. Add one using the panel below.</div>';
        return;
    }
    
    let html = '';
    dataConfig.virtualWidgets.forEach(vw => {
        const isConnected = !!vw.connection;
        const connectionInfo = isConnected 
            ? `<span class="vw-connection-badge">🔗 Connected to Node #${vw.connection.nodeId}</span>` 
            : '<span class="vw-no-connection">Not connected</span>';
        
        html += `
            <div class="vw-item" data-vw-id="${vw.id}">
                <div class="vw-header">
                    <span class="vw-type-badge">${vw.type.replace(/_/g, ' ').toUpperCase()}</span>
                    <input type="text" class="vw-name" value="${vw.name || ''}" placeholder="Widget Name">
                    <div class="vw-actions">
                        <button class="vw-btn vw-connect-btn" title="Connect to Real Widget">🔗 Connect</button>
                        <button class="vw-btn vw-config-btn" title="Configure Widget">⚙️ Config</button>
                        <button class="vw-btn vw-remove-btn" title="Remove Widget">❌</button>
                    </div>
                </div>
                <div class="vw-body">
                    <div class="vw-status">${connectionInfo}</div>
                    <div class="vw-value-preview">Value: <span class="vw-value">${JSON.stringify(vw.value)}</span></div>
                </div>
            </div>
        `;
    });
    
    vwList.innerHTML = html;
}

/**
 * Open connection dialog for a virtual widget
 */
function openConnectionDialog(virtualWidget, modal) {
    const { app } = window;
    if (!app?.graph) return;
    
    const connModal = document.createElement("div");
    connModal.className = "a11-modal open";
    
    let nodeOptions = '<option value="">-- Select Node --</option>';
    app.graph._nodes.forEach(node => {
        const hasWidgets = node.widgets && node.widgets.length > 0;
        if (hasWidgets) {
            const selected = virtualWidget.connection?.nodeId === node.id ? 'selected' : '';
            nodeOptions += `<option value="${node.id}" ${selected}>${node.title || node.type} (#${node.id})</option>`;
        }
    });
    
    connModal.innerHTML = `
        <div class="a11-modal-content" style="width:500px;">
            <div class="a11-modal-title">🔗 Connect Virtual Widget</div>
            <div class="a11-modal-body">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Select Node</label>
                    <select id="conn-node-select" style="width:100%">${nodeOptions}</select>
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                    <label>Select Widget</label>
                    <select id="conn-widget-select" style="width:100%"><option value="">-- Select Node First --</option></select>
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                    <label>Sync Direction</label>
                    <select id="conn-direction-select" style="width:100%">
                        <option value="bidirectional">↔️ Bidirectional (Both ways)</option>
                        <option value="input">⬅️ Input Only (Virtual → Real)</option>
                        <option value="output">➡️ Output Only (Real → Virtual)</option>
                    </select>
                </div>
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn" id="conn-cancel">Cancel</button>
                <button class="a11-btn active" id="conn-save">Connect</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(connModal);
    
    // Update widget options when node changes
    const nodeSelect = connModal.querySelector('#conn-node-select');
    const widgetSelect = connModal.querySelector('#conn-widget-select');
    
    nodeSelect.onchange = () => {
        const nodeId = parseInt(nodeSelect.value);
        const node = app.graph.getNodeById(nodeId);
        
        widgetSelect.innerHTML = '<option value="">-- Select Widget --</option>';
        if (node?.widgets) {
            node.widgets.forEach((w, idx) => {
                const selected = virtualWidget.connection?.widgetIndex === idx ? 'selected' : '';
                widgetSelect.innerHTML += `<option value="${idx}" ${selected}>${w.name || `Widget ${idx}`}</option>`;
            });
        }
    };
    
    // Initialize widget select if editing existing connection
    if (virtualWidget.connection?.nodeId) {
        nodeSelect.value = virtualWidget.connection.nodeId;
        nodeSelect.onchange();
    }
    
    connModal.querySelector('#conn-cancel').onclick = () => connModal.remove();
    
    connModal.querySelector('#conn-save').onclick = () => {
        const nodeId = parseInt(nodeSelect.value);
        const widgetIndex = parseInt(widgetSelect.value);
        const direction = connModal.querySelector('#conn-direction-select').value;
        
        if (!nodeId || isNaN(widgetIndex)) {
            alert('Please select both a node and a widget.');
            return;
        }
        
        connectVirtualWidget(virtualWidget, nodeId, widgetIndex, direction);
        
        // Refresh UI
        refreshVirtualWidgetsList(currentEditingConfig, modal);
        const connectionsList = modal.querySelector('#sce-connections-list');
        if (connectionsList) {
            connectionsList.innerHTML = renderConnectionsList(currentEditingConfig);
        }
        
        connModal.remove();
    };
}

/**
 * Open widget configuration dialog
 */
function openWidgetConfigDialog(virtualWidget, modal) {
    const configModal = document.createElement("div");
    configModal.className = "a11-modal open";
    
    let configFields = '';
    
    // Common fields
    configFields += `
        <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
            <label>Label</label>
            <input type="text" id="vw-config-label" value="${virtualWidget.config?.label || ''}" style="width:100%" placeholder="Widget label">
        </div>
    `;
    
    // Type-specific fields
    if ([SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER, SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER].includes(virtualWidget.type)) {
        configFields += `
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Min</label>
                    <input type="number" id="vw-config-min" value="${virtualWidget.config?.min ?? 0}" style="width:100%">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Max</label>
                    <input type="number" id="vw-config-max" value="${virtualWidget.config?.max ?? 100}" style="width:100%">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Step</label>
                    <input type="number" id="vw-config-step" value="${virtualWidget.config?.step ?? 1}" step="any" style="width:100%">
                </div>
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Options (comma-separated)</label>
                <input type="text" id="vw-config-options" value="${(virtualWidget.config?.options || []).join(', ')}" style="width:100%" placeholder="Option1, Option2, Option3">
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.CUSTOM_HTML) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>HTML Content</label>
                <textarea id="vw-config-html" style="width:100%; min-height:150px; font-family:monospace; background:var(--a11-input); color:var(--a11-text); border:1px solid var(--a11-border); border-radius:4px; padding:8px;">${virtualWidget.config?.html || ''}</textarea>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>CSS Styles</label>
                <textarea id="vw-config-styles" style="width:100%; min-height:80px; font-family:monospace; background:var(--a11-input); color:var(--a11-text); border:1px solid var(--a11-border); border-radius:4px; padding:8px;">${virtualWidget.config?.styles || ''}</textarea>
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Placeholder</label>
                <input type="text" id="vw-config-placeholder" value="${virtualWidget.config?.placeholder || ''}" style="width:100%" placeholder="Enter placeholder text">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Rows</label>
                <input type="number" id="vw-config-rows" value="${virtualWidget.config?.rows || 3}" min="1" max="20" style="width:100%">
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Button Label</label>
                <input type="text" id="vw-config-btn-label" value="${virtualWidget.config?.label || virtualWidget.name || 'Button'}" style="width:100%">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Accent Color</label>
                <input type="color" id="vw-config-accent" value="${virtualWidget.config?.accentColor || '#ea580c'}" style="width:100%; height:40px;">
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Format</label>
                <select id="vw-config-format" style="width:100%">
                    <option value="default" ${virtualWidget.config?.format === 'default' ? 'selected' : ''}>Default</option>
                    <option value="number" ${virtualWidget.config?.format === 'number' ? 'selected' : ''}>Number</option>
                    <option value="percent" ${virtualWidget.config?.format === 'percent' ? 'selected' : ''}>Percent</option>
                    <option value="currency" ${virtualWidget.config?.format === 'currency' ? 'selected' : ''}>Currency</option>
                    <option value="boolean" ${virtualWidget.config?.format === 'boolean' ? 'selected' : ''}>Boolean</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Font Size (px)</label>
                <input type="number" id="vw-config-fontsize" value="${virtualWidget.config?.fontSize || 16}" min="10" max="72" style="width:100%">
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Fit Mode</label>
                <select id="vw-config-fit" style="width:100%">
                    <option value="contain" ${virtualWidget.config?.fit === 'contain' ? 'selected' : ''}>Contain</option>
                    <option value="cover" ${virtualWidget.config?.fit === 'cover' ? 'selected' : ''}>Cover</option>
                    <option value="fill" ${virtualWidget.config?.fit === 'fill' ? 'selected' : ''}>Fill</option>
                    <option value="none" ${virtualWidget.config?.fit === 'none' ? 'selected' : ''}>None</option>
                </select>
            </div>
        `;
    } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS) {
        configFields += `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Min</label>
                    <input type="number" id="vw-config-min" value="${virtualWidget.config?.min ?? 0}" style="width:100%">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Max</label>
                    <input type="number" id="vw-config-max" value="${virtualWidget.config?.max ?? 100}" style="width:100%">
                </div>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Accent Color</label>
                <input type="color" id="vw-config-accent" value="${virtualWidget.config?.accentColor || '#ea580c'}" style="width:100%; height:40px;">
            </div>
        `;
    }
    
    configModal.innerHTML = `
        <div class="a11-modal-content" style="width:500px;">
            <div class="a11-modal-title">⚙️ Configure ${virtualWidget.type.replace(/_/g, ' ').toUpperCase()}</div>
            <div class="a11-modal-body" style="overflow-y:auto; max-height:70vh; padding:15px;">
                ${configFields}
            </div>
            <div class="a11-modal-footer">
                <button class="a11-btn" id="vw-config-cancel">Cancel</button>
                <button class="a11-btn active" id="vw-config-save">Save Config</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(configModal);
    
    configModal.querySelector('#vw-config-cancel').onclick = () => configModal.remove();
    
    configModal.querySelector('#vw-config-save').onclick = () => {
        // Save common config
        virtualWidget.config.label = configModal.querySelector('#vw-config-label').value;
        
        // Save type-specific config
        if ([SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER, SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER].includes(virtualWidget.type)) {
            virtualWidget.config.min = parseFloat(configModal.querySelector('#vw-config-min').value) || 0;
            virtualWidget.config.max = parseFloat(configModal.querySelector('#vw-config-max').value) || 100;
            virtualWidget.config.step = parseFloat(configModal.querySelector('#vw-config-step').value) || 1;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN) {
            virtualWidget.config.options = configModal.querySelector('#vw-config-options').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.CUSTOM_HTML) {
            virtualWidget.config.html = configModal.querySelector('#vw-config-html').value;
            virtualWidget.config.styles = configModal.querySelector('#vw-config-styles').value;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT) {
            virtualWidget.config.placeholder = configModal.querySelector('#vw-config-placeholder').value;
            virtualWidget.config.rows = parseInt(configModal.querySelector('#vw-config-rows').value) || 3;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON) {
            virtualWidget.config.label = configModal.querySelector('#vw-config-btn-label').value;
            virtualWidget.config.accentColor = configModal.querySelector('#vw-config-accent').value;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY) {
            virtualWidget.config.format = configModal.querySelector('#vw-config-format').value;
            virtualWidget.config.fontSize = parseInt(configModal.querySelector('#vw-config-fontsize').value) || 16;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE) {
            virtualWidget.config.fit = configModal.querySelector('#vw-config-fit').value;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS) {
            virtualWidget.config.min = parseFloat(configModal.querySelector('#vw-config-min').value) || 0;
            virtualWidget.config.max = parseFloat(configModal.querySelector('#vw-config-max').value) || 100;
            virtualWidget.config.accentColor = configModal.querySelector('#vw-config-accent').value;
        }
        
        configModal.remove();
    };
}

/**
 * Save the special container configuration
 */
function saveSpecialContainer(modal) {
    const containerType = modal.querySelector('#sce-container-type').value;
    const title = modal.querySelector('#sce-title').value.trim();
    
    if (!title) {
        alert('Please enter a container title.');
        return;
    }
    
    // Collect settings based on container type
    const settings = {};
    
    switch (containerType) {
        case SPECIAL_CONTAINER_TYPES.DASHBOARD:
            settings.refreshRate = parseInt(modal.querySelector('#sce-refresh-rate').value) || 1000;
            settings.layout = modal.querySelector('#sce-dashboard-layout').value;
            settings.showHeader = modal.querySelector('#sce-show-header').checked;
            break;
        case SPECIAL_CONTAINER_TYPES.CONTROL_PANEL:
            settings.autoApply = modal.querySelector('#sce-auto-apply').checked;
            settings.confirmChanges = modal.querySelector('#sce-confirm-changes').checked;
            settings.presetSlots = parseInt(modal.querySelector('#sce-preset-slots').value) || 5;
            break;
        case SPECIAL_CONTAINER_TYPES.MONITOR:
            settings.updateInterval = parseInt(modal.querySelector('#sce-update-interval').value) || 500;
            settings.historySize = parseInt(modal.querySelector('#sce-history-size').value) || 100;
            settings.showGraph = modal.querySelector('#sce-show-graph').checked;
            break;
        case SPECIAL_CONTAINER_TYPES.FORM:
            settings.validateOnSubmit = modal.querySelector('#sce-validate-submit').checked;
            settings.showResetButton = modal.querySelector('#sce-show-reset').checked;
            settings.submitAction = modal.querySelector('#sce-submit-action').value;
            break;
        case SPECIAL_CONTAINER_TYPES.GALLERY:
            settings.thumbnailSize = parseInt(modal.querySelector('#sce-thumb-size').value) || 128;
            settings.showCaptions = modal.querySelector('#sce-show-captions').checked;
            settings.columns = parseInt(modal.querySelector('#sce-gallery-cols').value) || 4;
            break;
    }
    
    // Update virtual widget names from inputs
    if (currentEditingConfig?.virtualWidgets) {
        modal.querySelectorAll('.vw-item').forEach(vwItem => {
            const vwId = vwItem.dataset.vwId;
            const vw = currentEditingConfig.virtualWidgets.find(w => w.id === vwId);
            if (vw) {
                const nameInput = vwItem.querySelector('.vw-name');
                if (nameInput) vw.name = nameInput.value.trim() || vw.type;
            }
        });
    }
    
    const config = {
        containerType: CONTAINER_TYPES.SPECIAL,
        specialType: containerType,
        title,
        virtualWidgets: currentEditingConfig?.virtualWidgets || [],
        settings,
        // Preserve standard container properties
        containerView: currentEditingConfig?.containerView || 'card',
        layoutMode: currentEditingConfig?.layoutMode || 'list',
        widgetDensity: currentEditingConfig?.widgetDensity || 'normal',
        pinned: currentEditingConfig?.pinned || false,
        collapsed: currentEditingConfig?.collapsed || false
    };
    
    // Validate before saving
    const validation = validateSpecialContainer(config);
    if (!validation.valid) {
        alert('Validation errors:\n' + validation.errors.join('\n'));
        return;
    }
    
    if (onEditorSaveCallback) {
        onEditorSaveCallback(config, false);
    }
    
    modal.remove();
}
