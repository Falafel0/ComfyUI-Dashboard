/**
 * A11 Studio - Preset Manager UI
 * Полноценный интерфейс для управления пресетами: создание, редактирование, удаление, экспорт/импорт
 */

import { state, saveValuePresets, undoLastPreset, canUndoPreset, broadcastWidgetUpdate } from "../state.js";
import {
    PRESET_CATEGORIES,
    PRESET_SORT_OPTIONS,
    createContainerPreset,
    updateContainerPreset,
    deletePresetById,
    sortPresets,
    filterPresetsBySearch,
    getUniqueCategories,
    exportStyleCSV,
    parseStyleCSV,
    createPresetBackup,
    restorePresetBackup,
    sanitizePresetName,
    sanitizeCategoryName
} from "../presetManager.js";

/**
 * Открыть модальное окно управления пресетами
 */
export function openPresetManagerModal(options = {}) {
    const existing = document.getElementById('preset-manager-modal');
    if (existing) {
        existing.remove();
    }

    const modal = createModalShell();
    document.body.appendChild(modal);

    initModalContent(modal);

    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });

    return modal;
}

/**
 * Создает базовую структуру модального окна
 */
function createModalShell() {
    const modal = document.createElement('div');
    modal.id = 'preset-manager-modal';
    modal.className = 'preset-manager-modal';

    modal.innerHTML = `
        <div class="preset-manager-content">
            <div class="preset-manager-header">
                <h3>🎨 Preset Manager</h3>
                <div class="header-actions">
                    <button class="pm-btn pm-btn-undo" id="pm-undo-btn" disabled title="Undo last applied preset">
                        ↩️ Undo
                    </button>
                    <button class="pm-btn pm-btn-close" id="pm-close-btn" title="Close">✕</button>
                </div>
            </div>
            <div class="preset-manager-body">
                <div class="preset-manager-toolbar">
                    <div class="toolbar-left">
                        <button class="pm-btn pm-btn-primary" id="pm-create-btn">➕ Create Preset</button>
                        <button class="pm-btn" id="pm-capture-btn" title="Capture current widget values">📸 Capture</button>
                    </div>
                    <div class="toolbar-center">
                        <input type="text" class="pm-search-input" id="pm-search-input" placeholder="🔍 Search presets...">
                    </div>
                    <div class="toolbar-right">
                        <select class="pm-filter-select" id="pm-category-filter">
                            <option value="">All Categories</option>
                        </select>
                        <select class="pm-filter-select" id="pm-sort-order">
                            <option value="name_asc">Name A-Z</option>
                            <option value="name_desc">Name Z-A</option>
                            <option value="category_asc">Category A-Z</option>
                            <option value="date_created">Date Created</option>
                            <option value="date_modified">Date Modified</option>
                        </select>
                        <div class="pm-dropdown">
                            <button class="pm-btn" id="pm-import-btn">📥 Import</button>
                            <div class="pm-dropdown-content" id="pm-import-menu">
                                <button class="pm-dropdown-item" data-action="import-json">📄 Import JSON</button>
                                <button class="pm-dropdown-item" data-action="import-csv">📊 Import CSV (Styles)</button>
                                <button class="pm-dropdown-item" data-action="import-backup">💾 Import Backup</button>
                            </div>
                        </div>
                        <div class="pm-dropdown">
                            <button class="pm-btn" id="pm-export-btn">📤 Export</button>
                            <div class="pm-dropdown-content" id="pm-export-menu">
                                <button class="pm-dropdown-item" data-action="export-json">📄 Export JSON</button>
                                <button class="pm-dropdown-item" data-action="export-csv">📊 Export CSV (Styles)</button>
                                <button class="pm-dropdown-item" data-action="export-backup">💾 Export Backup</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="preset-manager-list" id="pm-preset-list"></div>
            </div>
            <div class="preset-manager-footer">
                <span class="pm-stats" id="pm-stats-info">0 presets</span>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Инициализирует содержимое модального окна
 */
function initModalContent(modal) {
    // Close button
    modal.querySelector('#pm-close-btn').addEventListener('click', () => modal.remove());

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Close on Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Undo button
    const undoBtn = modal.querySelector('#pm-undo-btn');
    undoBtn.disabled = !canUndoPreset();
    undoBtn.addEventListener('click', async () => {
        const success = await undoLastPreset();
        if (success) {
            undoBtn.disabled = !canUndoPreset();
            // Обновляем UI после undo
            const { app } = await import("../../scripts/app.js");
            if (app.canvas?.getCanvasInfo) {
                app.graph.setDirtyCanvas(true, true);
            }
        }
    });

    // Create button
    modal.querySelector('#pm-create-btn').addEventListener('click', () => {
        openCreatePresetDialog(modal);
    });

    // Capture button
    modal.querySelector('#pm-capture-btn').addEventListener('click', () => {
        captureCurrentValues(modal);
    });

    // Search
    const searchInput = modal.querySelector('#pm-search-input');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderPresetList(modal), 300);
    });

    // Category filter
    modal.querySelector('#pm-category-filter').addEventListener('change', () => {
        renderPresetList(modal);
    });

    // Sort order
    modal.querySelector('#pm-sort-order').addEventListener('change', () => {
        state.settings.presetSortOrder = modal.querySelector('#pm-sort-order').value;
        renderPresetList(modal);
    });

    // Import/Export dropdowns
    setupDropdowns(modal);

    // Load saved sort order
    if (state.settings.presetSortOrder) {
        modal.querySelector('#pm-sort-order').value = state.settings.presetSortOrder;
    }

    // Render list and update categories
    renderPresetList(modal);
    updateCategoryFilter(modal);
}

/**
 * Настраивает dropdown меню импорта/экспорта
 */
function setupDropdowns(modal) {
    const importBtn = modal.querySelector('#pm-import-btn');
    const importMenu = modal.querySelector('#pm-import-menu');
    const exportBtn = modal.querySelector('#pm-export-btn');
    const exportMenu = modal.querySelector('#pm-export-menu');

    // Закрываем все dropdowns при клике вне
    document.addEventListener('click', (e) => {
        if (!importBtn.contains(e.target) && !importMenu.contains(e.target)) {
            importMenu.style.display = 'none';
        }
        if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
            exportMenu.style.display = 'none';
        }
    });

    importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = importMenu.style.display === 'block';
        importMenu.style.display = isVisible ? 'none' : 'block';
        exportMenu.style.display = 'none';
    });

    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = exportMenu.style.display === 'block';
        exportMenu.style.display = isVisible ? 'none' : 'block';
        importMenu.style.display = 'none';
    });

    // Обработка действий
    importMenu.querySelectorAll('.pm-dropdown-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            importMenu.style.display = 'none';

            switch (action) {
                case 'import-json': await importJSONFile(modal); break;
                case 'import-csv': await importCSVFile(modal); break;
                case 'import-backup': await importBackupFile(modal); break;
            }
        });
    });

    exportMenu.querySelectorAll('.pm-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            exportMenu.style.display = 'none';

            switch (action) {
                case 'export-json': exportJSON(); break;
                case 'export-csv': exportCSV(); break;
                case 'export-backup': exportBackup(); break;
            }
        });
    });
}

/**
 * Обновляет фильтр категорий
 */
function updateCategoryFilter(modal) {
    const containers = state.settings.valuePresets?.containers || [];
    const categories = getUniqueCategories(containers);
    const select = modal.querySelector('#pm-category-filter');
    const currentValue = select.value;

    select.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });

    select.value = currentValue;
}

/**
 * Рендерит список пресетов
 */
export function renderPresetList(modal) {
    if (!modal) return;
    
    const listEl = modal.querySelector('#pm-preset-list');
    const statsEl = modal.querySelector('#pm-stats-info');
    const searchQuery = modal.querySelector('#pm-search-input')?.value || '';
    const categoryFilter = modal.querySelector('#pm-category-filter')?.value || '';
    const sortOrder = modal.querySelector('#pm-sort-order')?.value || 'name_asc';

    let containers = state.settings.valuePresets?.containers || [];

    // Filter by category
    if (categoryFilter) {
        containers = containers.filter(p => p.category === categoryFilter);
    }

    // Filter by search
    if (searchQuery) {
        containers = filterPresetsBySearch(containers, searchQuery);
    }

    // Sort
    containers = sortPresets(containers, sortOrder);

    // Update stats
    const total = state.settings.valuePresets?.containers?.length || 0;
    statsEl.textContent = `${containers.length} shown, ${total} total`;

    if (containers.length === 0) {
        listEl.innerHTML = `
            <div class="pm-empty-state">
                <div class="pm-empty-icon">📦</div>
                <div class="pm-empty-text">No presets found</div>
                <button class="pm-btn pm-btn-primary" id="pm-empty-create-btn">➕ Create First Preset</button>
            </div>
        `;
        const createBtn = listEl.querySelector('#pm-empty-create-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => openCreatePresetDialog(modal));
        }
        return;
    }

    // Render presets
    listEl.innerHTML = '';
    containers.forEach(preset => {
        const presetEl = createPresetCard(preset, modal);
        listEl.appendChild(presetEl);
    });
}

/**
 * Создает карточку пресета
 */
function createPresetCard(preset, modal) {
    const card = document.createElement('div');
    card.className = 'pm-preset-card';

    const valueCount = preset.values?.length || 0;
    const createdAt = preset.createdAt ? new Date(preset.createdAt).toLocaleDateString() : 'Unknown';
    const modifiedAt = preset.modifiedAt ? new Date(preset.modifiedAt).toLocaleDateString() : createdAt;

    card.innerHTML = `
        <div class="pm-preset-header">
            <div class="pm-preset-info">
                <h4 class="pm-preset-name">${escapeHtml(preset.name)}</h4>
                <span class="pm-preset-category">${escapeHtml(preset.category || 'General')}</span>
            </div>
            <div class="pm-preset-actions">
                <button class="pm-btn pm-btn-apply" data-action="apply" title="Apply preset">▶️ Apply</button>
                <button class="pm-btn pm-btn-edit" data-action="edit" title="Edit preset">✏️</button>
                <button class="pm-btn" data-action="duplicate" title="Duplicate preset">📋</button>
                <button class="pm-btn pm-btn-delete" data-action="delete" title="Delete preset">🗑️</button>
            </div>
        </div>
        <div class="pm-preset-meta">
            <span class="pm-meta-item">📊 ${valueCount} widget${valueCount !== 1 ? 's' : ''}</span>
            <span class="pm-meta-item">📅 ${createdAt}</span>
            <span class="pm-meta-item">🔄 ${modifiedAt}</span>
        </div>
        <div class="pm-preset-values">
            ${renderPresetValuesPreview(preset.values)}
        </div>
    `;

    // Event handlers
    card.querySelector('[data-action="apply"]').addEventListener('click', async () => {
        await applyPresetFromCard(preset, modal);
    });

    card.querySelector('[data-action="edit"]').addEventListener('click', () => {
        openEditPresetDialog(preset, modal);
    });

    card.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
        duplicatePreset(preset, modal);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        deletePreset(preset, modal);
    });

    return card;
}

/**
 * Рендерит превью значений пресета
 */
function renderPresetValuesPreview(values) {
    if (!values || values.length === 0) return '<div class="pm-no-values">No values saved</div>';

    // Group by nodeType
    const groupedByType = {};
    values.forEach(v => {
        const nodeType = v.nodeType || 'Unknown';
        if (!groupedByType[nodeType]) groupedByType[nodeType] = [];
        groupedByType[nodeType].push(v);
    });

    const maxShow = 3;
    let typeCount = 0;
    const items = [];

    Object.keys(groupedByType).forEach(nodeType => {
        if (typeCount >= maxShow) return;

        const widgets = groupedByType[nodeType];
        widgets.forEach(v => {
            const valueStr = typeof v.value === 'string' ? v.value.substring(0, 40) : String(v.value);
            items.push(`<div class="pm-value-item">
                <span class="pm-value-node">${escapeHtml(nodeType)}</span>
                <span class="pm-value-widget">${escapeHtml(v.widgetName)}</span>
                <span class="pm-value-data">${escapeHtml(valueStr)}</span>
            </div>`);
        });
        typeCount++;
    });

    const totalTypes = Object.keys(groupedByType).length;
    if (totalTypes > maxShow) {
        items.push(`<div class="pm-value-more">+${totalTypes - maxShow} more node types...</div>`);
    }

    return items.join('');
}

/**
 * Применяет пресет ко всем подходящим виджетам в графе
 */
async function applyPresetFromCard(preset, modal) {
    if (state.settings.confirmActions && !confirm(`Apply preset "${preset.name}" to all matching widgets?`)) {
        return;
    }

    const { app } = await import("../../scripts/app.js");
    const btn = modal.querySelector(`.pm-preset-card[data-preset-id="${preset.id}"] [data-action="apply"]`);
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳...';
        }

        let applied = 0;
        let skipped = 0;

        // Применяем к ВСЕМ подходящим виджетам в графе
        preset.values.forEach(sv => {
            if (!sv.nodeType || !sv.widgetName) return;

            // Ищем все ноды этого типа
            app.graph._nodes.forEach(node => {
                if (node.type !== sv.nodeType) return;
                
                const widget = node.widgets?.find(w => w.name === sv.widgetName);
                if (!widget || widget.value === sv.value) {
                    skipped++;
                    return;
                }

                const oldValue = widget.value;
                widget.value = sv.value;

                if (widget.callback) {
                    try { widget.callback(sv.value); } catch (e) {
                        console.error('[Preset] Callback error:', e);
                    }
                }

                const wIndex = node.widgets.indexOf(widget);
                broadcastWidgetUpdate(node.id, wIndex, sv.value);
                applied++;
            });
        });

        // Обновляем canvas
        if (app.canvas?.getCanvasInfo) {
            app.graph.setDirtyCanvas(true, true);
        }

        alert(`Preset "${preset.name}" applied:\n✅ ${applied} widgets updated\n⏭️ ${skipped} skipped`);
        
        // Обновляем кнопку undo
        const undoBtn = modal.querySelector('#pm-undo-btn');
        if (undoBtn) undoBtn.disabled = !canUndoPreset();

    } catch (e) {
        console.error('[Preset] Apply error:', e);
        alert(`Error applying preset: ${e.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '▶️ Apply';
        }
    }
}

/**
 * Захватывает текущие значения виджетов из графа
 */
async function captureCurrentValues(modal) {
    const { app } = await import("../../scripts/app.js");

    if (!app?.graph?._nodes) {
        alert('Graph not loaded!');
        return;
    }

    const values = [];

    app.graph._nodes.forEach(node => {
        if (!node.widgets) return;

        node.widgets.forEach(widget => {
            // Пропускаем кнопки и изображения
            if (widget.type === 'button' || widget.name === 'Image') return;

            values.push({
                nodeTitle: widget.name,
                nodeType: node.type,
                widgetName: widget.name,
                value: widget.value
            });
        });
    });

    if (values.length === 0) {
        alert('No widget values found in the graph!');
        return;
    }

    // Открываем диалог создания с заполненными значениями
    openCreatePresetDialog(modal);

    // Заполняем JSON
    setTimeout(() => {
        const valuesInput = document.querySelector('#pm-preset-values');
        if (valuesInput) {
            valuesInput.value = JSON.stringify(values, null, 2);
        }
    }, 100);
}

/**
 * Открывает диалог создания пресета
 */
function openCreatePresetDialog(modal) {
    const dialog = createDialogShell('Create Preset');

    dialog.querySelector('.pm-dialog-body').innerHTML = `
        <div class="pm-form-group">
            <label>Preset Name *</label>
            <input type="text" class="pm-input" id="pm-preset-name" placeholder="My Awesome Preset" autofocus>
        </div>
        <div class="pm-form-group">
            <label>Category</label>
            <select class="pm-select" id="pm-preset-category">
                ${Object.values(PRESET_CATEGORIES).map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                <option value="__custom__">+ Custom...</option>
            </select>
        </div>
        <div class="pm-form-group" id="pm-custom-category-group" style="display:none;">
            <label>Custom Category Name</label>
            <input type="text" class="pm-input" id="pm-custom-category" placeholder="My Category">
        </div>
        <div class="pm-form-group">
            <label>Description (optional)</label>
            <textarea class="pm-textarea" id="pm-preset-description" placeholder="What does this preset do?"></textarea>
        </div>
        <div class="pm-form-group">
            <label>Values (JSON array)</label>
            <textarea class="pm-textarea pm-json-input" id="pm-preset-values" placeholder='[{"nodeType":"CheckpointLoaderSimple","widgetName":"ckpt_name","value":"v1-5.safetensors"}]'></textarea>
            <small class="pm-help-text">Format: [{"nodeType":"...","widgetName":"...","value":...}]</small>
        </div>
    `;

    // Custom category toggle
    dialog.querySelector('#pm-preset-category').addEventListener('change', (e) => {
        dialog.querySelector('#pm-custom-category-group').style.display = 
            e.target.value === '__custom__' ? 'block' : 'none';
    });

    // Save handler
    dialog.querySelector('.pm-dialog-save').addEventListener('click', () => {
        saveNewPreset(dialog, modal);
    });

    document.body.appendChild(dialog);
    requestAnimationFrame(() => dialog.classList.add('visible'));
    dialog.querySelector('#pm-preset-name').focus();
}

/**
 * Сохраняет новый пресет
 */
function saveNewPreset(dialog, modal) {
    try {
        const name = dialog.querySelector('#pm-preset-name').value.trim();
        if (!name) {
            alert('Preset name is required!');
            return;
        }

        let category = dialog.querySelector('#pm-preset-category').value;
        if (category === '__custom__') {
            category = dialog.querySelector('#pm-custom-category').value.trim() || 'Custom';
        }

        const valuesStr = dialog.querySelector('#pm-preset-values').value.trim();
        let values = [];
        if (valuesStr) {
            values = JSON.parse(valuesStr);
            if (!Array.isArray(values)) {
                alert('Values must be a JSON array!');
                return;
            }
        }

        const description = dialog.querySelector('#pm-preset-description').value.trim();

        const preset = createContainerPreset(name, category, values, { description, source: 'manual_create' });

        if (!state.settings.valuePresets) {
            state.settings.valuePresets = { containers: [] };
        }
        state.settings.valuePresets.containers.push(preset);

        saveValuePresets();
        dialog.remove();
        renderPresetList(modal);
        updateCategoryFilter(modal);

        alert(`Preset "${name}" created successfully!`);
    } catch (e) {
        console.error('[Preset] Create error:', e);
        alert(`Error creating preset: ${e.message}`);
    }
}

/**
 * Открывает диалог редактирования пресета
 */
function openEditPresetDialog(preset, modal) {
    const dialog = createDialogShell('Edit Preset');

    const categoryOptions = Object.values(PRESET_CATEGORIES).map(cat => {
        const selected = cat === preset.category ? 'selected' : '';
        return `<option value="${cat}" ${selected}>${cat}</option>`;
    }).join('');

    dialog.querySelector('.pm-dialog-body').innerHTML = `
        <div class="pm-form-group">
            <label>Preset Name *</label>
            <input type="text" class="pm-input" id="pm-preset-name" value="${escapeHtml(preset.name)}" autofocus>
        </div>
        <div class="pm-form-group">
            <label>Category</label>
            <select class="pm-select" id="pm-preset-category">
                ${categoryOptions}
                <option value="__custom__">+ Custom...</option>
            </select>
        </div>
        <div class="pm-form-group" id="pm-custom-category-group" style="display:none;">
            <label>Custom Category Name</label>
            <input type="text" class="pm-input" id="pm-custom-category" placeholder="My Category">
        </div>
        <div class="pm-form-group">
            <label>Description</label>
            <textarea class="pm-textarea" id="pm-preset-description">${escapeHtml(preset.metadata?.description || '')}</textarea>
        </div>
        <div class="pm-form-group">
            <label>Values (JSON array)</label>
            <textarea class="pm-textarea pm-json-input" id="pm-preset-values">${escapeHtml(JSON.stringify(preset.values, null, 2))}</textarea>
        </div>
    `;

    dialog.querySelector('#pm-preset-category').addEventListener('change', (e) => {
        dialog.querySelector('#pm-custom-category-group').style.display = 
            e.target.value === '__custom__' ? 'block' : 'none';
    });

    dialog.querySelector('.pm-dialog-save').addEventListener('click', () => {
        saveEditedPreset(preset, dialog, modal);
    });

    document.body.appendChild(dialog);
    requestAnimationFrame(() => dialog.classList.add('visible'));
    dialog.querySelector('#pm-preset-name').focus();
}

/**
 * Сохраняет отредактированный пресет
 */
function saveEditedPreset(oldPreset, dialog, modal) {
    try {
        const name = dialog.querySelector('#pm-preset-name').value.trim();
        if (!name) {
            alert('Preset name is required!');
            return;
        }

        let category = dialog.querySelector('#pm-preset-category').value;
        if (category === '__custom__') {
            category = dialog.querySelector('#pm-custom-category').value.trim() || 'Custom';
        }

        const values = JSON.parse(dialog.querySelector('#pm-preset-values').value.trim());
        if (!Array.isArray(values)) {
            alert('Values must be a JSON array!');
            return;
        }

        const description = dialog.querySelector('#pm-preset-description').value.trim();

        const updated = updateContainerPreset(oldPreset, {
            name, category, values,
            metadata: { ...oldPreset.metadata, description, source: 'manual_edit' }
        });

        const containers = state.settings.valuePresets.containers;
        const idx = containers.findIndex(p => p.id === oldPreset.id);
        if (idx !== -1) containers[idx] = updated;

        saveValuePresets();
        dialog.remove();
        renderPresetList(modal);
        updateCategoryFilter(modal);

        alert(`Preset "${name}" updated successfully!`);
    } catch (e) {
        console.error('[Preset] Edit error:', e);
        alert(`Error editing preset: ${e.message}`);
    }
}

/**
 * Дублирует пресет
 */
function duplicatePreset(preset, modal) {
    const newName = `${preset.name} (Copy)`;
    const newPreset = createContainerPreset(
        newName,
        preset.category,
        JSON.parse(JSON.stringify(preset.values)),
        { ...preset.metadata, source: 'duplicate', originalId: preset.id }
    );

    state.settings.valuePresets.containers.push(newPreset);
    saveValuePresets();
    renderPresetList(modal);
    updateCategoryFilter(modal);
}

/**
 * Удаляет пресет
 */
function deletePreset(preset, modal) {
    if (!confirm(`Delete preset "${preset.name}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    const result = deletePresetById(state.settings.valuePresets.containers, preset.id);

    if (result.success) {
        state.settings.valuePresets.containers = result.presets;
        saveValuePresets();
        renderPresetList(modal);
        updateCategoryFilter(modal);
    } else {
        alert(`Error: ${result.error}`);
    }
}

/**
 * Импорт из JSON файла
 */
async function importJSONFile(modal) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    let imported = 0;
                    const containers = state.settings.valuePresets.containers;

                    if (Array.isArray(data)) {
                        data.forEach(p => {
                            if (p.name && p.values) { containers.push(p); imported++; }
                        });
                    } else if (data.containers && Array.isArray(data.containers)) {
                        data.containers.forEach(p => {
                            if (p.name && p.values) { containers.push(p); imported++; }
                        });
                    } else if (data.name && data.values) {
                        containers.push(data);
                        imported = 1;
                    }

                    saveValuePresets();
                    renderPresetList(modal);
                    updateCategoryFilter(modal);

                    alert(`Successfully imported ${imported} preset(s)!`);
                } catch (err) {
                    console.error('[Preset] Parse error:', err);
                    alert(`Error parsing JSON: ${err.message}`);
                }
            };
            reader.readAsText(file);
        } catch (e) {
            console.error('[Preset] Import error:', e);
            alert(`Error importing file: ${e.message}`);
        }
    };

    input.click();
}

/**
 * Импорт из CSV файла
 */
async function importCSVFile(modal) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const result = parseStyleCSV(text);

            if (result.errors.length > 0) {
                console.warn('[Preset] CSV warnings:', result.errors);
            }

            if (result.presets.length > 0) {
                state.settings.valuePresets.containers.push(...result.presets);
                saveValuePresets();
                renderPresetList(modal);
                updateCategoryFilter(modal);

                alert(`Successfully imported ${result.presets.length} style preset(s)!`);
            } else {
                alert('No valid presets found in CSV file.');
            }
        } catch (e) {
            console.error('[Preset] CSV import error:', e);
            alert(`Error importing CSV: ${e.message}`);
        }
    };

    input.click();
}

/**
 * Импорт из резервной копии
 */
async function importBackupFile(modal) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            const restored = restorePresetBackup(backup);

            state.settings.valuePresets.containers.push(...restored.containers);
            saveValuePresets();
            renderPresetList(modal);
            updateCategoryFilter(modal);

            alert(`Successfully restored ${restored.containers.length} preset(s)!`);
        } catch (e) {
            console.error('[Preset] Backup import error:', e);
            alert(`Error importing backup: ${e.message}`);
        }
    };

    input.click();
}

/**
 * Экспорт в JSON
 */
function exportJSON() {
    const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        count: state.settings.valuePresets.containers.length,
        containers: state.settings.valuePresets.containers
    };

    downloadJSON(data, `presets_export_${Date.now()}.json`);
}

/**
 * Экспорт в CSV
 */
function exportCSV() {
    const csv = exportStyleCSV(state.settings.valuePresets.containers);

    if (!csv) {
        alert('No style presets to export!');
        return;
    }

    downloadFile(csv, `style_presets_${Date.now()}.csv`, 'text/csv');
}

/**
 * Экспорт резервной копии
 */
function exportBackup() {
    const backup = createPresetBackup(state.settings.valuePresets.containers);
    downloadJSON(backup, `presets_backup_${Date.now()}.json`);
}

/**
 * Скачивает JSON файл
 */
function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, filename, 'application/json');
}

/**
 * Скачивает файл
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Создает базовую структуру диалога
 */
function createDialogShell(title) {
    const dialog = document.createElement('div');
    dialog.className = 'pm-dialog';

    dialog.innerHTML = `
        <div class="pm-dialog-content">
            <div class="pm-dialog-header">
                <h3>${title}</h3>
                <button class="pm-btn pm-btn-close pm-dialog-close">✕</button>
            </div>
            <div class="pm-dialog-body"></div>
            <div class="pm-dialog-footer">
                <button class="pm-btn pm-btn-cancel">Cancel</button>
                <button class="pm-btn pm-btn-primary pm-btn-save">Save</button>
            </div>
        </div>
    `;

    dialog.querySelector('.pm-dialog-close').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.pm-btn-cancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.remove();
    });

    return dialog;
}

/**
 * Экранирует HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}
