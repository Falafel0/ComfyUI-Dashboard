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
import { closeModalSmooth } from "./ui.js";

let currentEditingConfig = null;
let onEditorSaveCallback = null;

/**
 * Open the special container editor modal
 */
export function openSpecialContainerEditor(config = null, onSave = null) {
    const modal = document.createElement("div");
    modal.className = "a11-modal";
    // Force reflow for smooth transition
    void modal.offsetWidth;
    modal.classList.add('open');
    
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
    modal.querySelector('#sce-cancel').onclick = () => {
        closeModalSmooth(modal);
    };
    
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
                closeModalSmooth(modal);
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
 * Open widget configuration dialog with MAXIMUM settings for each virtual widget type
 */
function openWidgetConfigDialog(virtualWidget, modal) {
    const configModal = document.createElement("div");
    configModal.className = "a11-modal open";
    
    let configFields = '';
    
    // Common fields for all widgets
    configFields += `
        <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
            <label>Label</label>
            <input type="text" id="vw-config-label" value="${virtualWidget.config?.label || ''}" style="width:100%" placeholder="Widget label">
        </div>
        <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
            <label>Width (%)</label>
            <input type="range" id="vw-config-width" min="10" max="100" step="5" value="${virtualWidget.config?.width ?? 100}" style="width:100%">
            <small style="opacity:0.7">Current: <span id="vw-width-val">${virtualWidget.config?.width ?? 100}%</span></small>
        </div>
    `;
    
    // Type-specific fields - VIRTUAL_NUMBER
    if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER) {
        configFields += `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Min Value</label>
                    <input type="number" id="vw-config-min" value="${virtualWidget.config?.min ?? 0}" style="width:100%">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Max Value</label>
                    <input type="number" id="vw-config-max" value="${virtualWidget.config?.max ?? 100}" style="width:100%">
                </div>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Decimal Places</label>
                <input type="number" id="vw-config-decimals" value="${virtualWidget.config?.decimals ?? 0}" min="0" max="5" style="width:100%">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Prefix</label>
                    <input type="text" id="vw-config-prefix" value="${virtualWidget.config?.prefix || ''}" style="width:100%" placeholder="$">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Suffix</label>
                    <input type="text" id="vw-config-suffix" value="${virtualWidget.config?.suffix || ''}" style="width:100%" placeholder="°C">
                </div>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Color Mode</label>
                <select id="vw-config-colormode" style="width:100%">
                    <option value="static" ${virtualWidget.config?.colorMode === 'static' ? 'selected' : ''}>Static Color</option>
                    <option value="gradient" ${virtualWidget.config?.colorMode === 'gradient' ? 'selected' : ''}>Value Gradient</option>
                    <option value="alarm" ${virtualWidget.config?.colorMode === 'alarm' ? 'selected' : ''}>Alarm Thresholds</option>
                </select>
            </div>
            ${virtualWidget.config?.colorMode === 'static' ? `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Text Color</label>
                <input type="color" id="vw-config-color" value="${virtualWidget.config?.color || '#ffffff'}" style="width:100%; height:40px;">
            </div>` : ''}
            ${virtualWidget.config?.colorMode === 'alarm' ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label style="color:#ff4444">High Limit</label>
                    <input type="number" id="vw-config-highlimit" value="${virtualWidget.config?.highLimit ?? 90}" style="width:100%">
                    <input type="color" id="vw-config-highcolor" value="${virtualWidget.config?.highColor || '#ff4444'}" style="width:100%; height:30px; margin-top:5px;">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label style="color:#44ff44">Low Limit</label>
                    <input type="number" id="vw-config-lowlimit" value="${virtualWidget.config?.lowLimit ?? 10}" style="width:100%">
                    <input type="color" id="vw-config-lowcolor" value="${virtualWidget.config?.lowColor || '#44ff44'}" style="width:100%; height:30px; margin-top:5px;">
                </div>
            </div>` : ''}
        `;
    }
    // VIRTUAL_SLIDER
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER) {
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
                <label>Step Size</label>
                <input type="number" id="vw-config-step" value="${virtualWidget.config?.step ?? 1}" step="any" style="width:100%">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Orientation</label>
                <select id="vw-config-orient" style="width:100%">
                    <option value="horizontal" ${virtualWidget.config?.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    <option value="vertical" ${virtualWidget.config?.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Track Color</label>
                <input type="color" id="vw-config-trackcolor" value="${virtualWidget.config?.trackColor || '#444444'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Thumb Color</label>
                <input type="color" id="vw-config-thumbcolor" value="${virtualWidget.config?.thumbColor || '#ea580c'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Show Tooltip</label>
                <select id="vw-config-tooltip" style="width:100%">
                    <option value="always" ${virtualWidget.config?.showTooltip === 'always' ? 'selected' : ''}>Always</option>
                    <option value="drag" ${virtualWidget.config?.showTooltip === 'drag' ? 'selected' : ''}>On Drag</option>
                    <option value="never" ${virtualWidget.config?.showTooltip === 'never' ? 'selected' : ''}>Never</option>
                </select>
            </div>
        `;
    }
    // VIRTUAL_TOGGLE
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Style</label>
                <select id="vw-config-style" style="width:100%">
                    <option value="switch" ${virtualWidget.config?.style === 'switch' ? 'selected' : ''}>Modern Switch</option>
                    <option value="checkbox" ${virtualWidget.config?.style === 'checkbox' ? 'selected' : ''}>Classic Checkbox</option>
                    <option value="button" ${virtualWidget.config?.style === 'button' ? 'selected' : ''}>Push Button</option>
                </select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>ON Color</label>
                    <input type="color" id="vw-config-oncolor" value="${virtualWidget.config?.onColor || '#00ff00'}" style="width:100%; height:40px;">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>OFF Color</label>
                    <input type="color" id="vw-config-offcolor" value="${virtualWidget.config?.offColor || '#ff4444'}" style="width:100%; height:40px;">
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>ON Label</label>
                    <input type="text" id="vw-config-onlabel" value="${virtualWidget.config?.onLabel || 'ON'}" style="width:100%">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>OFF Label</label>
                    <input type="text" id="vw-config-offlabel" value="${virtualWidget.config?.offLabel || 'OFF'}" style="width:100%">
                </div>
            </div>
        `;
    }
    // VIRTUAL_BUTTON
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON) {
        const actionConfig = virtualWidget.actionConfig || {};
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Button Appearance Type</label>
                <select id="vw-config-buttontype" style="width:100%">
                    <option value="button" ${virtualWidget.config?.buttonType === 'button' ? 'selected' : ''}>🔘 Standard Button</option>
                    <option value="toggle" ${virtualWidget.config?.buttonType === 'toggle' ? 'selected' : ''}>🔄 Toggle Switch</option>
                    <option value="checkbox" ${virtualWidget.config?.buttonType === 'checkbox' ? 'selected' : ''}>☑️ Checkbox</option>
                    <option value="radio" ${virtualWidget.config?.buttonType === 'radio' ? 'selected' : ''}>🔘 Radio Button</option>
                    <option value="switch" ${virtualWidget.config?.buttonType === 'switch' ? 'selected' : ''}>⚡ Modern Switch</option>
                    <option value="icon" ${virtualWidget.config?.buttonType === 'icon' ? 'selected' : ''}>🎯 Icon Button</option>
                </select>
            </div>
            
            <!-- Icon field for icon button type -->
            <div class="a11-setting-row" id="vw-config-icon-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px; display:${virtualWidget.config?.buttonType === 'icon' ? 'flex' : 'none'}">
                <label>Icon (emoji or text)</label>
                <input type="text" id="vw-config-icon" value="${virtualWidget.config?.icon || '⚡'}" style="width:100%" placeholder="⚡">
                <small style="color:var(--a11-desc)">Use emoji (⚡, 🚀, 🔥) or single character</small>
            </div>
            
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Button Action Type</label>
                <select id="vw-config-actiontype" style="width:100%">
                    <option value="launch_workflow" ${actionConfig.actionType === 'launch_workflow' ? 'selected' : ''}>🚀 Launch Workflow</option>
                    <option value="launch_node" ${actionConfig.actionType === 'launch_node' ? 'selected' : ''}>▶️ Execute Specific Node</option>
                    <option value="launch_to_node" ${actionConfig.actionType === 'launch_to_node' ? 'selected' : ''}>⏭️ Execute Up To Node</option>
                    <option value="bypass_nodes" ${actionConfig.actionType === 'bypass_nodes' ? 'selected' : ''}>⏩ Bypass Nodes</option>
                    <option value="mute_nodes" ${actionConfig.actionType === 'mute_nodes' ? 'selected' : ''}>🔇 Mute Nodes</option>
                    <option value="toggle_bypass" ${actionConfig.actionType === 'toggle_bypass' ? 'selected' : ''}>🔁 Toggle Bypass</option>
                    <option value="toggle_mute" ${actionConfig.actionType === 'toggle_mute' ? 'selected' : ''}>🔀 Toggle Mute</option>
                    <option value="reset_widgets" ${actionConfig.actionType === 'reset_widgets' ? 'selected' : ''}>🔄 Reset All Widgets</option>
                    <option value="save_preset" ${actionConfig.actionType === 'save_preset' ? 'selected' : ''}>💾 Save Preset</option>
                    <option value="load_preset" ${actionConfig.actionType === 'load_preset' ? 'selected' : ''}>📂 Load Preset</option>
                    <option value="copy_values" ${actionConfig.actionType === 'copy_values' ? 'selected' : ''}>📋 Copy Values</option>
                    <option value="paste_values" ${actionConfig.actionType === 'paste_values' ? 'selected' : ''}>📄 Paste Values</option>
                    <option value="sync_all" ${actionConfig.actionType === 'sync_all' ? 'selected' : ''}>🔁 Sync All Connected</option>
                    <option value="clear_cache" ${actionConfig.actionType === 'clear_cache' ? 'selected' : ''}>🗑️ Clear Cache</option>
                    <option value="export_config" ${actionConfig.actionType === 'export_config' ? 'selected' : ''}>📤 Export Config</option>
                    <option value="import_config" ${actionConfig.actionType === 'import_config' ? 'selected' : ''}>📥 Import Config</option>
                    <option value="toggle_collapse" ${actionConfig.actionType === 'toggle_collapse' ? 'selected' : ''}>📌 Toggle Collapse</option>
                    <option value="custom_script" ${actionConfig.actionType === 'custom_script' || !actionConfig.actionType ? 'selected' : ''}>⚙️ Custom Script</option>
                </select>
            </div>
            
            <!-- Target Node Selection (for launch_node, launch_to_node) -->
            <div class="a11-setting-row" id="vw-config-targetnode-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px; display:${['launch_node', 'launch_to_node'].includes(actionConfig.actionType) ? 'flex' : 'none'}">
                <label>Target Node ID</label>
                <input type="text" id="vw-config-targetnode" value="${actionConfig.targetNodeId || ''}" style="width:100%" placeholder="Enter node ID (e.g., 5)">
                <small style="color:var(--a11-desc)">The specific node to execute when button is clicked</small>
            </div>
            
            <!-- Node IDs for bypass/mute actions -->
            <div class="a11-setting-row" id="vw-config-targetnodes-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px; display:${['bypass_nodes', 'mute_nodes', 'toggle_bypass', 'toggle_mute'].includes(actionConfig.actionType) ? 'flex' : 'none'}">
                <label>Target Node IDs (comma-separated)</label>
                <input type="text" id="vw-config-targetnodes" value="${(actionConfig.targetNodes || []).join(',')}" style="width:100%" placeholder="e.g., 1,2,3">
                <small style="color:var(--a11-desc)">Comma-separated list of node IDs to affect</small>
            </div>
            
            <!-- Preset ID Selection (for save/load preset) -->
            <div class="a11-setting-row" id="vw-config-presetid-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px; display:${['save_preset', 'load_preset'].includes(actionConfig.actionType) ? 'flex' : 'none'}">
                <label>Preset ID (optional)</label>
                <input type="text" id="vw-config-presetid" value="${actionConfig.presetId || ''}" style="width:100%" placeholder="Leave empty for auto-generated">
                <small style="color:var(--a11-desc)">Unique identifier for the preset</small>
            </div>
            
            <!-- Custom Script (for custom_script) -->
            <div class="a11-setting-row" id="vw-config-script-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px; display:${actionConfig.actionType === 'custom_script' || !actionConfig.actionType ? 'flex' : 'none'}">
                <label>Custom JavaScript</label>
                <textarea id="vw-config-script" rows="6" style="width:100%; font-family:monospace; font-size:11px;" placeholder="console.log('Button clicked!');">${actionConfig.script || 'console.log("Button clicked!");'}</textarea>
                <small style="color:var(--a11-desc)">Available variables: widget, container, virtualWidgetStates, console, Date, Math, JSON</small>
            </div>
            
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Confirm Before Execution</label>
                <input type="checkbox" id="vw-config-confirm" ${actionConfig.confirmBeforeExec ? 'checked' : ''} style="margin-right:8px;">
                <span>Show confirmation dialog before executing action</span>
            </div>
            
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Button Label</label>
                <input type="text" id="vw-config-label" value="${virtualWidget.config?.label || 'Button'}" style="width:100%" placeholder="Button text">
            </div>
            
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Accent Color</label>
                <input type="color" id="vw-config-accentcolor" value="${virtualWidget.config?.accentColor || '#ea580c'}" style="width:100%; height:40px;">
            </div>
        `;
        
        // Add event listener for action type change to show/hide relevant fields
        setTimeout(() => {
            const actionSelect = configModal.querySelector('#vw-config-actiontype');
            const targetNodeRow = configModal.querySelector('#vw-config-targetnode-row');
            const targetNodesRow = configModal.querySelector('#vw-config-targetnodes-row');
            const presetIdRow = configModal.querySelector('#vw-config-presetid-row');
            const scriptRow = configModal.querySelector('#vw-config-script-row');
            const buttonTypeSelect = configModal.querySelector('#vw-config-buttontype');
            const iconRow = configModal.querySelector('#vw-config-icon-row');
            
            if (actionSelect) {
                actionSelect.onchange = () => {
                    const selectedType = actionSelect.value;
                    if (targetNodeRow) targetNodeRow.style.display = ['launch_node', 'launch_to_node'].includes(selectedType) ? 'flex' : 'none';
                    if (targetNodesRow) targetNodesRow.style.display = ['bypass_nodes', 'mute_nodes', 'toggle_bypass', 'toggle_mute'].includes(selectedType) ? 'flex' : 'none';
                    if (presetIdRow) presetIdRow.style.display = ['save_preset', 'load_preset'].includes(selectedType) ? 'flex' : 'none';
                    if (scriptRow) scriptRow.style.display = selectedType === 'custom_script' ? 'flex' : 'none';
                };
            }
            
            // Show/hide icon field based on button appearance type
            if (buttonTypeSelect) {
                buttonTypeSelect.onchange = () => {
                    if (iconRow) iconRow.style.display = buttonTypeSelect.value === 'icon' ? 'flex' : 'none';
                };
            }
        }, 0);
    }
    // VIRTUAL_DISPLAY
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Display Type</label>
                <select id="vw-config-disptype" style="width:100%">
                    <option value="digital" ${virtualWidget.config?.displayType === 'digital' ? 'selected' : ''}>Digital (7-Segment)</option>
                    <option value="led" ${virtualWidget.config?.displayType === 'led' ? 'selected' : ''}>LED Dot Matrix</option>
                    <option value="lcd" ${virtualWidget.config?.displayType === 'lcd' ? 'selected' : ''}>LCD Text</option>
                    <option value="plain" ${virtualWidget.config?.displayType === 'plain' ? 'selected' : ''}>Plain Text</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>LED Color</label>
                <input type="color" id="vw-config-ledcolor" value="${virtualWidget.config?.ledColor || '#ff0000'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Background Color</label>
                <input type="color" id="vw-config-bgcolor" value="${virtualWidget.config?.bgColor || '#111111'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Font Size (px)</label>
                <input type="number" id="vw-config-fontsize" value="${virtualWidget.config?.fontSize ?? 24}" min="10" max="72" style="width:100%">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Alignment</label>
                <select id="vw-config-align" style="width:100%">
                    <option value="left" ${virtualWidget.config?.align === 'left' ? 'selected' : ''}>Left</option>
                    <option value="center" ${virtualWidget.config?.align === 'center' ? 'selected' : ''}>Center</option>
                    <option value="right" ${virtualWidget.config?.align === 'right' ? 'selected' : ''}>Right</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Blink on Alarm</label>
                <select id="vw-config-blink" style="width:100%">
                    <option value="false" ${virtualWidget.config?.blinkAlarm === false ? 'selected' : ''}>No</option>
                    <option value="true" ${virtualWidget.config?.blinkAlarm === true ? 'selected' : ''}>Yes</option>
                </select>
            </div>
        `;
    }
    // VIRTUAL_IMAGE
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Image Source (URL or Node Path)</label>
                <input type="text" id="vw-config-src" value="${virtualWidget.config?.src || ''}" style="width:100%" placeholder="/images/logo.png">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Fit Mode</label>
                <select id="vw-config-fit" style="width:100%">
                    <option value="contain" ${virtualWidget.config?.fit === 'contain' ? 'selected' : ''}>Contain</option>
                    <option value="cover" ${virtualWidget.config?.fit === 'cover' ? 'selected' : ''}>Cover</option>
                    <option value="fill" ${virtualWidget.config?.fit === 'fill' ? 'selected' : ''}>Fill (Stretch)</option>
                    <option value="none" ${virtualWidget.config?.fit === 'none' ? 'selected' : ''}>None</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Overlay Opacity (0-1)</label>
                <input type="range" id="vw-config-overlay" min="0" max="1" step="0.1" value="${virtualWidget.config?.overlayOpacity ?? 0}" style="width:100%">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Overlay Color</label>
                <input type="color" id="vw-config-overlaycolor" value="${virtualWidget.config?.overlayColor || '#000000'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Grayscale (%)</label>
                <input type="range" id="vw-config-gray" min="0" max="100" value="${virtualWidget.config?.grayscale ?? 0}" style="width:100%">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Border Radius (px)</label>
                <input type="number" id="vw-config-radius" value="${virtualWidget.config?.radius ?? 0}" min="0" max="100" style="width:100%">
            </div>
        `;
    }
    // VIRTUAL_CHART
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_CHART) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Chart Type</label>
                <select id="vw-config-charttype" style="width:100%">
                    <option value="line" ${virtualWidget.config?.chartType === 'line' ? 'selected' : ''}>Line Chart</option>
                    <option value="bar" ${virtualWidget.config?.chartType === 'bar' ? 'selected' : ''}>Bar Chart</option>
                    <option value="pie" ${virtualWidget.config?.chartType === 'pie' ? 'selected' : ''}>Pie Chart</option>
                    <option value="gauge" ${virtualWidget.config?.chartType === 'gauge' ? 'selected' : ''}>Gauge</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Line Color</label>
                <input type="color" id="vw-config-linecolor" value="${virtualWidget.config?.lineColor || '#ea580c'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Fill Area</label>
                <select id="vw-config-fill" style="width:100%">
                    <option value="none" ${virtualWidget.config?.fill === 'none' ? 'selected' : ''}>No Fill</option>
                    <option value="solid" ${virtualWidget.config?.fill === 'solid' ? 'selected' : ''}>Solid Fill</option>
                    <option value="gradient" ${virtualWidget.config?.fill === 'gradient' ? 'selected' : ''}>Gradient Fill</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Show Grid</label>
                <select id="vw-config-grid" style="width:100%">
                    <option value="true" ${virtualWidget.config?.showGrid !== false ? 'selected' : ''}>Yes</option>
                    <option value="false" ${virtualWidget.config?.showGrid === false ? 'selected' : ''}>No</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Max Points</label>
                <input type="number" id="vw-config-maxpoints" value="${virtualWidget.config?.maxPoints ?? 50}" min="10" max="500" style="width:100%">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Y-Min</label>
                    <input type="number" id="vw-config-ymin" value="${virtualWidget.config?.yMin ?? 0}" style="width:100%">
                </div>
                <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                    <label>Y-Max</label>
                    <input type="number" id="vw-config-ymax" value="${virtualWidget.config?.yMax ?? 100}" style="width:100%">
                </div>
            </div>
        `;
    }
    // VIRTUAL_PROGRESS
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Style</label>
                <select id="vw-config-pstyle" style="width:100%">
                    <option value="bar" ${virtualWidget.config?.pStyle === 'bar' ? 'selected' : ''}>Horizontal Bar</option>
                    <option value="circle" ${virtualWidget.config?.pStyle === 'circle' ? 'selected' : ''}>Circular</option>
                    <option value="striped" ${virtualWidget.config?.pStyle === 'striped' ? 'selected' : ''}>Striped</option>
                </select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
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
                <label>Bar Color</label>
                <input type="color" id="vw-config-pcolor" value="${virtualWidget.config?.pColor || '#28a745'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Background Color</label>
                <input type="color" id="vw-config-pbg" value="${virtualWidget.config?.pBg || '#333333'}" style="width:100%; height:40px;">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Show Percentage Text</label>
                <select id="vw-config-showtext" style="width:100%">
                    <option value="inside" ${virtualWidget.config?.showText === 'inside' ? 'selected' : ''}>Inside</option>
                    <option value="outside" ${virtualWidget.config?.showText === 'outside' ? 'selected' : ''}>Outside</option>
                    <option value="none" ${virtualWidget.config?.showText === 'none' ? 'selected' : ''}>Hidden</option>
                </select>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Stroke Width (px)</label>
                <input type="number" id="vw-config-stroke" value="${virtualWidget.config?.strokeWidth ?? 10}" min="1" max="50" style="width:100%">
            </div>
        `;
    }
    // CUSTOM_HTML
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.CUSTOM_HTML) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>HTML Content</label>
                <textarea id="vw-config-html" style="width:100%; min-height:150px; font-family:monospace; background:var(--a11-input); color:var(--a11-text); border:1px solid var(--a11-border); border-radius:4px; padding:8px;">${virtualWidget.config?.html || '<div>Hello</div>'}</textarea>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>CSS Styles</label>
                <textarea id="vw-config-styles" style="width:100%; min-height:80px; font-family:monospace; background:var(--a11-input); color:var(--a11-text); border:1px solid var(--a11-border); border-radius:4px; padding:8px;">${virtualWidget.config?.styles || 'color: white;'}</textarea>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Sanitize HTML</label>
                <select id="vw-config-sanitize" style="width:100%">
                    <option value="true" ${virtualWidget.config?.sanitize !== false ? 'selected' : ''}>Yes (Safe)</option>
                    <option value="false" ${virtualWidget.config?.sanitize === false ? 'selected' : ''}>No (Raw)</option>
                </select>
            </div>
        `;
    }
    // VIRTUAL_DROPDOWN
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN) {
        const optionsStr = (virtualWidget.config?.options || []).join(', ');
        const aliasesStr = virtualWidget.config?.aliases ? 
            (typeof virtualWidget.config.aliases === 'string' ? virtualWidget.config.aliases : JSON.stringify(virtualWidget.config.aliases)) 
            : '';
        
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Options (comma-separated)</label>
                <input type="text" id="vw-config-options" value="${optionsStr}" style="width:100%" placeholder="Option1, Option2, Option3">
                <small style="opacity:0.7; margin-top:4px;">Used only if Aliases is empty</small>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Aliases (JSON format)</label>
                <textarea id="vw-config-aliases" rows="5" style="width:100%; font-family:monospace; font-size:12px;" placeholder='{"Display Label": "internal_value", "Speed Low": 10, "Speed High": 100}'>${aliasesStr}</textarea>
                <small style="opacity:0.7; margin-top:4px;">Format: {"Display Text": internal_value}. Keys are shown to user, values are stored/synced.</small>
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Placeholder</label>
                <input type="text" id="vw-config-placeholder" value="${virtualWidget.config?.placeholder || 'Select...'}" style="width:100%">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Allow Custom Input</label>
                <select id="vw-config-custom" style="width:100%">
                    <option value="false" ${virtualWidget.config?.allowCustom === false ? 'selected' : ''}>No</option>
                    <option value="true" ${virtualWidget.config?.allowCustom === true ? 'selected' : ''}>Yes</option>
                </select>
            </div>
        `;
    }
    // VIRTUAL_TEXT
    else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT) {
        configFields += `
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <label>Placeholder</label>
                <input type="text" id="vw-config-placeholder" value="${virtualWidget.config?.placeholder || ''}" style="width:100%" placeholder="Enter placeholder text">
            </div>
            <div class="a11-setting-row" style="flex-direction:column; align-items:flex-start; gap:8px; margin-top:10px;">
                <label>Rows</label>
                <input type="number" id="vw-config-rows" value="${virtualWidget.config?.rows ?? 3}" min="1" max="20" style="width:100%">
            </div>
        `;
    }
    
    configModal.innerHTML = `
        <div class="a11-modal-content" style="width:550px; max-width:90vw;">
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
    
    // Update width display
    const widthSlider = configModal.querySelector('#vw-config-width');
    const widthVal = configModal.querySelector('#vw-width-val');
    if (widthSlider && widthVal) {
        widthSlider.oninput = () => widthVal.textContent = widthSlider.value + '%';
    }
    
    configModal.querySelector('#vw-config-cancel').onclick = () => configModal.remove();
    
    configModal.querySelector('#vw-config-save').onclick = () => {
        // Save common config
        virtualWidget.config.label = configModal.querySelector('#vw-config-label').value;
        virtualWidget.config.width = parseInt(configModal.querySelector('#vw-config-width').value) || 100;
        
        // Save type-specific config
        if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_NUMBER) {
            virtualWidget.config.min = parseFloat(configModal.querySelector('#vw-config-min').value) || 0;
            virtualWidget.config.max = parseFloat(configModal.querySelector('#vw-config-max').value) || 100;
            virtualWidget.config.decimals = parseInt(configModal.querySelector('#vw-config-decimals').value) || 0;
            virtualWidget.config.prefix = configModal.querySelector('#vw-config-prefix').value;
            virtualWidget.config.suffix = configModal.querySelector('#vw-config-suffix').value;
            virtualWidget.config.colorMode = configModal.querySelector('#vw-config-colormode').value;
            if (virtualWidget.config.colorMode === 'static') {
                virtualWidget.config.color = configModal.querySelector('#vw-config-color').value;
            } else if (virtualWidget.config.colorMode === 'alarm') {
                virtualWidget.config.highLimit = parseFloat(configModal.querySelector('#vw-config-highlimit').value) || 90;
                virtualWidget.config.highColor = configModal.querySelector('#vw-config-highcolor').value;
                virtualWidget.config.lowLimit = parseFloat(configModal.querySelector('#vw-config-lowlimit').value) || 10;
                virtualWidget.config.lowColor = configModal.querySelector('#vw-config-lowcolor').value;
            }
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_SLIDER) {
            virtualWidget.config.min = parseFloat(configModal.querySelector('#vw-config-min').value) || 0;
            virtualWidget.config.max = parseFloat(configModal.querySelector('#vw-config-max').value) || 100;
            virtualWidget.config.step = parseFloat(configModal.querySelector('#vw-config-step').value) || 1;
            virtualWidget.config.orientation = configModal.querySelector('#vw-config-orient').value;
            virtualWidget.config.trackColor = configModal.querySelector('#vw-config-trackcolor').value;
            virtualWidget.config.thumbColor = configModal.querySelector('#vw-config-thumbcolor').value;
            virtualWidget.config.showTooltip = configModal.querySelector('#vw-config-tooltip').value;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_TOGGLE) {
            virtualWidget.config.style = configModal.querySelector('#vw-config-style').value;
            virtualWidget.config.onColor = configModal.querySelector('#vw-config-oncolor').value;
            virtualWidget.config.offColor = configModal.querySelector('#vw-config-offcolor').value;
            virtualWidget.config.onLabel = configModal.querySelector('#vw-config-onlabel').value;
            virtualWidget.config.offLabel = configModal.querySelector('#vw-config-offlabel').value;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_BUTTON) {
            // Save new action config for buttons
            virtualWidget.actionConfig = virtualWidget.actionConfig || {};
            virtualWidget.actionConfig.actionType = configModal.querySelector('#vw-config-actiontype').value;
            virtualWidget.actionConfig.targetNodeId = configModal.querySelector('#vw-config-targetnode')?.value || null;
            virtualWidget.actionConfig.presetId = configModal.querySelector('#vw-config-presetid')?.value || null;
            virtualWidget.actionConfig.script = configModal.querySelector('#vw-config-script')?.value || 'console.log("Button clicked!");';
            virtualWidget.actionConfig.confirmBeforeExec = configModal.querySelector('#vw-config-confirm')?.checked || false;
            
            // Parse target nodes for bypass/mute actions
            const targetNodesStr = configModal.querySelector('#vw-config-targetnodes')?.value || '';
            virtualWidget.actionConfig.targetNodes = targetNodesStr.split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .map(s => parseInt(s) || s);
            
            // Also save common button config
            virtualWidget.config.buttonType = configModal.querySelector('#vw-config-buttontype').value;
            virtualWidget.config.label = configModal.querySelector('#vw-config-label').value;
            virtualWidget.config.accentColor = configModal.querySelector('#vw-config-accentcolor').value;
            virtualWidget.config.icon = configModal.querySelector('#vw-config-icon')?.value || '⚡';
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DISPLAY) {
            virtualWidget.config.displayType = configModal.querySelector('#vw-config-disptype').value;
            virtualWidget.config.ledColor = configModal.querySelector('#vw-config-ledcolor').value;
            virtualWidget.config.bgColor = configModal.querySelector('#vw-config-bgcolor').value;
            virtualWidget.config.fontSize = parseInt(configModal.querySelector('#vw-config-fontsize').value) || 24;
            virtualWidget.config.align = configModal.querySelector('#vw-config-align').value;
            virtualWidget.config.blinkAlarm = configModal.querySelector('#vw-config-blink').value === 'true';
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_IMAGE) {
            virtualWidget.config.src = configModal.querySelector('#vw-config-src').value;
            virtualWidget.config.fit = configModal.querySelector('#vw-config-fit').value;
            virtualWidget.config.overlayOpacity = parseFloat(configModal.querySelector('#vw-config-overlay').value) || 0;
            virtualWidget.config.overlayColor = configModal.querySelector('#vw-config-overlaycolor').value;
            virtualWidget.config.grayscale = parseInt(configModal.querySelector('#vw-config-gray').value) || 0;
            virtualWidget.config.radius = parseInt(configModal.querySelector('#vw-config-radius').value) || 0;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_CHART) {
            virtualWidget.config.chartType = configModal.querySelector('#vw-config-charttype').value;
            virtualWidget.config.lineColor = configModal.querySelector('#vw-config-linecolor').value;
            virtualWidget.config.fill = configModal.querySelector('#vw-config-fill').value;
            virtualWidget.config.showGrid = configModal.querySelector('#vw-config-grid').value === 'true';
            virtualWidget.config.maxPoints = parseInt(configModal.querySelector('#vw-config-maxpoints').value) || 50;
            virtualWidget.config.yMin = parseFloat(configModal.querySelector('#vw-config-ymin').value) || 0;
            virtualWidget.config.yMax = parseFloat(configModal.querySelector('#vw-config-ymax').value) || 100;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_PROGRESS) {
            virtualWidget.config.min = parseFloat(configModal.querySelector('#vw-config-min').value) || 0;
            virtualWidget.config.max = parseFloat(configModal.querySelector('#vw-config-max').value) || 100;
            virtualWidget.config.pStyle = configModal.querySelector('#vw-config-pstyle').value;
            virtualWidget.config.pColor = configModal.querySelector('#vw-config-pcolor').value;
            virtualWidget.config.pBg = configModal.querySelector('#vw-config-pbg').value;
            virtualWidget.config.showText = configModal.querySelector('#vw-config-showtext').value;
            virtualWidget.config.strokeWidth = parseInt(configModal.querySelector('#vw-config-stroke').value) || 10;
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.CUSTOM_HTML) {
            virtualWidget.config.html = configModal.querySelector('#vw-config-html').value;
            virtualWidget.config.styles = configModal.querySelector('#vw-config-styles').value;
            virtualWidget.config.sanitize = configModal.querySelector('#vw-config-sanitize').value === 'true';
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_DROPDOWN) {
            virtualWidget.config.options = configModal.querySelector('#vw-config-options').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            
            // Parse aliases JSON
            const aliasesInput = configModal.querySelector('#vw-config-aliases').value.trim();
            if (aliasesInput) {
                try {
                    virtualWidget.config.aliases = JSON.parse(aliasesInput);
                } catch (e) {
                    console.error('Invalid aliases JSON', e);
                    alert('Invalid JSON format for aliases. Aliases will not be saved.');
                    virtualWidget.config.aliases = {};
                }
            } else {
                virtualWidget.config.aliases = {};
            }
            
            virtualWidget.config.placeholder = configModal.querySelector('#vw-config-placeholder').value;
            virtualWidget.config.allowCustom = configModal.querySelector('#vw-config-custom').value === 'true';
        } else if (virtualWidget.type === SPECIAL_WIDGET_TYPES.VIRTUAL_TEXT) {
            virtualWidget.config.placeholder = configModal.querySelector('#vw-config-placeholder').value;
            virtualWidget.config.rows = parseInt(configModal.querySelector('#vw-config-rows').value) || 3;
        }

        refreshVirtualWidgetsList(currentEditingConfig, modal);
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
    
    // Close modal smoothly
    closeModalSmooth(modal);
}
