/**
 * A11 Studio - Preset Manager UI
 * Единое модальное окно: Capture → Save → List → Apply
 * Лёгкое, интуитивное, без лишних абстракций.
 */

import { state, saveValuePresets, applyValuePreset, canUndoPreset, undoLastPreset } from "../state.js";
import {
    createContainerPreset,
    updateContainerPreset,
    deletePresetById,
    filterValuePresets,
    filterPresetsBySearch,
    sortPresets,
    PRESET_CATEGORIES
} from "../presetManager.js";

// ─── Public API ──────────────────────────────────────────────────

/**
 * Открыть модальное окно управления пресетами.
 * @param {Object} [ctx] - контекст вызова
 * @param {Object} [ctx.widgetRef] - { nodeId, widgetIndex, name } — если вызвано с кнопки 🔖 виджета
 * @param {Object} [ctx.widget]     - сам объект виджета
 * @param {Object} [ctx.node]       - объект ноды
 * @param {Object} [ctx.containerConfig] - конфиг контейнера (если вызвано с 📦)
 * @param {HTMLElement} [ctx.domElement] - DOM-элемент контейнера
 */
export function openPresetManagerModal(ctx) {
    // Убрать существующее окно
    var existing = document.getElementById('pm-modal');
    if (existing) existing.remove();

    var modal = buildModal(ctx);
    document.body.appendChild(modal);
    requestAnimationFrame(function() { modal.classList.add('pm-visible'); });
    return modal;
}

// ─── Построение модального окна ─────────────────────────────────

function buildModal(ctx) {
    var modal = document.createElement('div');
    modal.id = 'pm-modal';
    modal.className = 'pm-modal';

    modal.innerHTML =
        '<div class="pm-modal-content">' +
            '<div class="pm-modal-header">' +
                '<h3>💾 Preset Manager</h3>' +
                '<div class="pm-header-actions">' +
                    '<button class="pm-btn" id="pm-undo-btn" disabled title="Undo last applied preset">↩ Undo</button>' +
                    '<button class="pm-btn" id="pm-import-export-btn" title="Import / Export">📥📤</button>' +
                    '<button class="pm-btn pm-btn-close" id="pm-close-btn">✕</button>' +
                '</div>' +
            '</div>' +
            '<div class="pm-modal-toolbar">' +
                '<input type="text" class="pm-search" id="pm-search" placeholder="🔍 Search presets...">' +
                '<button class="pm-btn pm-btn-primary" id="pm-capture-btn">📸 Capture Current State</button>' +
            '</div>' +
            '<div class="pm-modal-body" id="pm-body"></div>' +
        '</div>';

    // Close handlers
    var closeModal = function() { modal.remove(); };
    modal.querySelector('#pm-close-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    var escHandler = function(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    // Undo button
    var undoBtn = modal.querySelector('#pm-undo-btn');
    undoBtn.disabled = !canUndoPreset();
    undoBtn.addEventListener('click', async function() {
        var ok = await undoLastPreset();
        if (ok) { undoBtn.disabled = !canUndoPreset(); showToast('Preset undone', 'info'); }
        else showToast('Nothing to undo', 'warning');
    });

    // Import/Export
    modal.querySelector('#pm-import-export-btn').addEventListener('click', function() {
        renderImportExport(modal.querySelector('#pm-body'));
    });

    // Capture button
    modal.querySelector('#pm-capture-btn').addEventListener('click', function() {
        renderCapture(modal);
    });

    // Search
    var searchEl = modal.querySelector('#pm-search');
    var searchTimer;
    searchEl.addEventListener('input', function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function() {
            renderPresetList(modal.querySelector('#pm-body'), modal, searchEl.value);
        }, 200);
    });

    // Initial render: preset list
    renderPresetList(modal.querySelector('#pm-body'), modal, '');

    // If called with context (🔖 or 📦), auto-open capture
    if (ctx && (ctx.widgetRef || ctx.containerConfig)) {
        setTimeout(function() { renderCapture(modal, ctx); }, 100);
    }

    return modal;
}

// ─── Список пресетов ────────────────────────────────────────────

function renderPresetList(container, modal, search) {
    var presets = filterValuePresets(state.settings.valuePresets?.containers || []);
    if (search) presets = filterPresetsBySearch(presets, search);
    presets = sortPresets(presets, 'date_created');

    if (presets.length === 0) {
        container.innerHTML =
            '<div class="pm-empty">' +
                '<div class="pm-empty-icon">📦</div>' +
                '<div class="pm-empty-text">' + (search ? 'No presets match your search' : 'No presets yet. Click "📸 Capture Current State" to create one.') + '</div>' +
            '</div>';
        return;
    }

    var html = '<div class="pm-list">';
    for (var i = 0; i < presets.length; i++) {
        var p = presets[i];
        var valCount = (p.values || []).length;
        var dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
        html +=
            '<div class="pm-card" data-id="' + escAttr(p.id) + '">' +
                '<div class="pm-card-info">' +
                    '<div class="pm-card-name">' + escHtml(p.name) + '</div>' +
                    '<div class="pm-card-meta">' +
                        '<span>' + valCount + ' value' + (valCount !== 1 ? 's' : '') + '</span>' +
                        '<span>·</span>' +
                        '<span>' + escHtml(p.category || 'General') + '</span>' +
                        (dateStr ? '<span>·</span><span>' + dateStr + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="pm-card-actions">' +
                    '<button class="pm-btn pm-btn-sm pm-btn-apply" data-action="apply" data-id="' + escAttr(p.id) + '">▶ Apply</button>' +
                    '<button class="pm-btn pm-btn-sm" data-action="dup" data-id="' + escAttr(p.id) + '" title="Duplicate">📋</button>' +
                    '<button class="pm-btn pm-btn-sm pm-btn-danger" data-action="del" data-id="' + escAttr(p.id) + '" title="Delete">🗑</button>' +
                '</div>' +
            '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    // Event listeners
    container.querySelectorAll('[data-action="apply"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var pid = btn.dataset.id;
            var preset = presets.find(function(p) { return p.id === pid; });
            if (preset) showApplyPreview(modal, preset);
        });
    });

    container.querySelectorAll('[data-action="dup"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var pid = btn.dataset.id;
            var preset = presets.find(function(p) { return p.id === pid; });
            if (preset) duplicatePreset(preset, modal);
        });
    });

    container.querySelectorAll('[data-action="del"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var pid = btn.dataset.id;
            var preset = presets.find(function(p) { return p.id === pid; });
            if (preset && confirm('Delete "' + preset.name + '"?')) {
                var result = deletePresetById(state.settings.valuePresets.containers, pid);
                if (result.success) {
                    state.settings.valuePresets.containers = result.presets;
                    saveValuePresets();
                    showToast('"' + preset.name + '" deleted', 'info');
                    renderPresetList(container, modal, modal.querySelector('#pm-search').value);
                }
            }
        });
    });
}

// ─── Capture (Захват значений с графа) ──────────────────────────

async function renderCapture(modal, ctx) {
    var body = modal.querySelector('#pm-body');
    body.innerHTML = '<div class="pm-capture-loading">⏳ Scanning graph for widgets...</div>';

    var captured;
    try {
        captured = await captureGraphWidgets(ctx);
    } catch (e) {
        console.error('[PresetManager] Capture error:', e);
        body.innerHTML = '<div class="pm-empty"><div class="pm-empty-icon">⚠️</div><div class="pm-empty-text">Failed to scan graph: ' + escHtml(e.message || String(e)) + '</div></div>';
        return;
    }

    if (captured.length === 0) {
        body.innerHTML = '<div class="pm-empty"><div class="pm-empty-icon">📸</div><div class="pm-empty-text">No widgets found on the graph. Add some nodes first.</div></div>';
        return;
    }

    // Build capture UI
    var ctxLabel = '';
    if (ctx?.widgetRef) ctxLabel = ' (Widget: ' + escHtml(ctx.widgetRef.name) + ')';
    else if (ctx?.containerConfig) ctxLabel = ' (Container: ' + escHtml(ctx.containerConfig.title || 'unnamed') + ')';

    var catOpts = '';
    var cats = Object.values(PRESET_CATEGORIES);
    for (var ci = 0; ci < cats.length; ci++) {
        catOpts += '<option value="' + escAttr(cats[ci]) + '">' + escHtml(cats[ci]) + '</option>';
    }

    var html =
        '<div class="pm-capture">' +
            '<div class="pm-capture-header">' +
                '<h4>📸 Capture Current State' + ctxLabel + '</h4>' +
                '<span class="pm-capture-count">' + captured.length + ' widget' + (captured.length !== 1 ? 's' : '') + ' found</span>' +
            '</div>' +
            '<div class="pm-capture-form">' +
                '<input type="text" class="pm-input pm-input-wide" id="pm-cap-name" placeholder="Preset name" autofocus style="width:100%;margin-bottom:8px;">' +
                '<div class="pm-form-row">' +
                    '<select class="pm-select" id="pm-cap-category">' + catOpts + '</select>' +
                '</div>' +
            '</div>' +
            '<div class="pm-capture-table-wrap">' +
                '<table class="pm-capture-table">' +
                    '<thead><tr><th><input type="checkbox" id="pm-cap-select-all" checked></th><th>Node</th><th>Widget</th><th>Value</th></tr></thead>' +
                    '<tbody id="pm-cap-tbody"></tbody>' +
                '</table>' +
            '</div>' +
            '<div class="pm-capture-actions">' +
                '<button class="pm-btn" id="pm-cap-back">← Back to list</button>' +
                '<button class="pm-btn pm-btn-primary" id="pm-cap-save">💾 Save Preset</button>' +
            '</div>' +
        '</div>';

    body.innerHTML = html;

    // Fill table
    var tbody = body.querySelector('#pm-cap-tbody');
    for (var i = 0; i < captured.length; i++) {
        var v = captured[i];
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td><input type="checkbox" class="pm-cap-check" data-idx="' + i + '" checked></td>' +
            '<td><span class="pm-cap-node">' + escHtml(v.nodeTitle || v.nodeType) + '</span><br><small>' + escHtml(v.nodeType) + '</small></td>' +
            '<td><code>' + escHtml(v.widgetName) + '</code></td>' +
            '<td><code class="pm-cap-value">' + escHtml(fmtVal(v.value)) + '</code></td>';
        tbody.appendChild(tr);
    }

    // Select all toggle
    var selectAll = body.querySelector('#pm-cap-select-all');
    selectAll.addEventListener('change', function() {
        body.querySelectorAll('.pm-cap-check').forEach(function(cb) { cb.checked = selectAll.checked; });
    });

    // Back button
    body.querySelector('#pm-cap-back').addEventListener('click', function() {
        renderPresetList(body, modal, modal.querySelector('#pm-search').value);
    });

    // Save button
    body.querySelector('#pm-cap-save').addEventListener('click', function() {
        var name = body.querySelector('#pm-cap-name').value.trim();
        if (!name) { showToast('Enter a preset name', 'warning'); return; }

        var category = body.querySelector('#pm-cap-category').value;

        var selected = [];
        body.querySelectorAll('.pm-cap-check:checked').forEach(function(cb) {
            var idx = parseInt(cb.dataset.idx);
            if (idx >= 0 && idx < captured.length) {
                selected.push({
                    nodeType: captured[idx].nodeType,
                    widgetName: captured[idx].widgetName,
                    value: captured[idx].value
                });
            }
        });

        if (selected.length === 0) { showToast('Select at least one widget', 'warning'); return; }

        try {
            var preset = createContainerPreset(name, category, selected, { source: 'manual_capture' });
            if (!state.settings.valuePresets) state.settings.valuePresets = { containers: [] };
            state.settings.valuePresets.containers.push(preset);
            saveValuePresets();
            showToast('"' + name + '" saved with ' + selected.length + ' values', 'success');

            // Update undo button
            var undoBtn = modal.querySelector('#pm-undo-btn');
            if (undoBtn) undoBtn.disabled = !canUndoPreset();

            // Back to list
            renderPresetList(body, modal, '');
        } catch (e) {
            console.error('[PresetManager] Save error:', e);
            showToast('Error: ' + (e.message || e), 'error');
        }
    });
}

/**
 * Захват виджетов напрямую с графа ComfyUI.
 * Фикс: правильный путь импорта и прямой обход app.graph._nodes.
 */
async function captureGraphWidgets(ctx) {
    var appModule = await import("../../../scripts/app.js");
    var app = appModule.app;

    var nodes = app?.graph?._nodes;
    if (!nodes || nodes.length === 0) return [];

    var skipTypes = ['button'];
    var skipNames = ['image'];

    // Если контекст — конкретный виджет
    if (ctx?.widgetRef && ctx?.node && ctx?.widget) {
        var w = ctx.widget;
        if (skipTypes.indexOf(w.type) === -1 && skipNames.indexOf(w.name) === -1) {
            return [{
                nodeType: ctx.node.type,
                nodeTitle: ctx.node.title || ctx.node.type,
                widgetName: w.name,
                widgetType: w.type,
                value: w.value
            }];
        }
        return [];
    }

    // Если контекст — контейнер
    if (ctx?.containerConfig?.widgets) {
        var result = [];
        var widgets = ctx.containerConfig.widgets;
        for (var i = 0; i < widgets.length; i++) {
            var wRef = widgets[i];
            if (wRef.widgetIndex === '__preview__') continue;
            var node = app.graph.getNodeById(wRef.nodeId);
            if (!node?.widgets) continue;
            var widget = node.widgets[wRef.widgetIndex];
            if (!widget || widget.name !== wRef.name) {
                widget = node.widgets.find(function(w) { return w.name === wRef.name; });
            }
            if (!widget) continue;
            if (skipTypes.indexOf(widget.type) !== -1 || skipNames.indexOf(widget.name) !== -1) continue;
            result.push({
                nodeType: node.type,
                nodeTitle: node.title || node.type,
                widgetName: widget.name,
                widgetType: widget.type,
                value: widget.value
            });
        }
        return result;
    }

    // Полный обход графа
    var captured = [];
    for (var ni = 0; ni < nodes.length; ni++) {
        var node = nodes[ni];
        if (!node.widgets) continue;
        for (var wi = 0; wi < node.widgets.length; wi++) {
            var w = node.widgets[wi];
            if (skipTypes.indexOf(w.type) !== -1 || skipNames.indexOf(w.name) !== -1) continue;
            captured.push({
                nodeType: node.type,
                nodeTitle: node.title || node.type,
                widgetName: w.name,
                widgetType: w.type,
                value: w.value
            });
        }
    }
    return captured;
}

// ─── Apply Preview (встроенный, без отдельного файла) ────────────

async function showApplyPreview(modal, preset) {
    var body = modal.querySelector('#pm-body');

    // Строим diff
    body.innerHTML = '<div class="pm-capture-loading">⏳ Building diff...</div>';

    var diff;
    try {
        diff = await buildDiff(preset);
    } catch (e) {
        body.innerHTML = '<div class="pm-empty"><div class="pm-empty-icon">⚠️</div><div class="pm-empty-text">Failed to build diff: ' + escHtml(e.message || String(e)) + '</div></div>';
        return;
    }

    var changeCount = 0;
    var notFoundCount = 0;
    var rows = '';
    for (var i = 0; i < diff.length; i++) {
        var d = diff[i];
        if (d.willChange) changeCount++;
        if (d.notFound) notFoundCount++;
        var rowClass = d.willChange ? 'pm-diff-change' : (d.notFound ? 'pm-diff-notfound' : 'pm-diff-same');
        rows +=
            '<tr class="' + rowClass + '">' +
                '<td><code>' + escHtml(d.widgetName) + '</code></td>' +
                '<td>' + escHtml(d.nodeTitle) + '</td>' +
                '<td class="pm-diff-old">' + escHtml(fmtVal(d.currentValue)) + '</td>' +
                '<td class="pm-diff-new">' + (d.willChange ? '<strong>' + escHtml(fmtVal(d.presetValue)) + '</strong>' : escHtml(fmtVal(d.presetValue))) + '</td>' +
            '</tr>';
    }

    var html =
        '<div class="pm-apply">' +
            '<div class="pm-apply-header">' +
                '<h4>▶ Apply "' + escHtml(preset.name) + '"</h4>' +
                '<div class="pm-apply-summary">' +
                    '<span class="pm-apply-changes">🔄 ' + changeCount + ' will change</span>' +
                    '<span>·</span>' +
                    '<span>' + (diff.length - changeCount - notFoundCount) + ' unchanged</span>' +
                    (notFoundCount > 0 ? '<span>·</span><span class="pm-apply-warn">⚠️ ' + notFoundCount + ' not found</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="pm-capture-table-wrap">' +
                '<table class="pm-capture-table">' +
                    '<thead><tr><th>Widget</th><th>Node</th><th>Current</th><th>→ Preset</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
            '<div class="pm-capture-actions">' +
                '<button class="pm-btn" id="pm-apply-back">← Back to list</button>' +
                '<button class="pm-btn pm-btn-primary" id="pm-apply-confirm">✅ Apply Now</button>' +
            '</div>' +
        '</div>';

    body.innerHTML = html;

    body.querySelector('#pm-apply-back').addEventListener('click', function() {
        renderPresetList(body, modal, modal.querySelector('#pm-search').value);
    });

    body.querySelector('#pm-apply-confirm').addEventListener('click', async function() {
        var btn = body.querySelector('#pm-apply-confirm');
        btn.disabled = true;
        btn.textContent = '⏳ Applying...';

        try {
            var result = await applyValuePreset(preset.values, preset.name);
            if (result.applied > 0) {
                showToast('"' + preset.name + '" applied: ' + result.applied + ' updated', 'success');
            } else {
                showToast('"' + preset.name + '": nothing to update', 'warning');
            }
            var undoBtn = modal.querySelector('#pm-undo-btn');
            if (undoBtn) undoBtn.disabled = !canUndoPreset();
            renderPresetList(body, modal, '');
        } catch (e) {
            console.error('[PresetManager] Apply error:', e);
            showToast('Apply failed: ' + (e.message || e), 'error');
            btn.disabled = false;
            btn.textContent = '✅ Apply Now';
        }
    });
}

async function buildDiff(preset) {
    var appModule = await import("../../../scripts/app.js");
    var app = appModule.app;
    var values = preset.values || [];
    var diff = [];

    for (var i = 0; i < values.length; i++) {
        var sv = values[i];
        var targetNode = null;

        if (sv.nodeId) targetNode = app.graph?.getNodeById(sv.nodeId);
        if (!targetNode && sv.nodeType) {
            var matching = (app.graph?._nodes || []).filter(function(n) { return n.type === sv.nodeType; });
            targetNode = matching.length > 0 ? matching[0] : null;
        }

        if (!targetNode) {
            diff.push({
                widgetName: sv.widgetName || '?',
                nodeTitle: sv.nodeType || '?',
                currentValue: '(not found)',
                presetValue: sv.value,
                willChange: false,
                notFound: true
            });
            continue;
        }

        var widget = targetNode.widgets?.find(function(w) { return w.name === sv.widgetName; });
        var currentValue = widget ? widget.value : '(not found)';

        diff.push({
            widgetName: sv.widgetName,
            nodeTitle: targetNode.title || targetNode.type,
            currentValue: currentValue,
            presetValue: sv.value,
            willChange: widget && widget.value !== sv.value,
            notFound: !widget
        });
    }

    return diff;
}

// ─── Duplicate ──────────────────────────────────────────────────

function duplicatePreset(preset, modal) {
    var newPreset = createContainerPreset(
        preset.name + ' (Copy)',
        preset.category,
        JSON.parse(JSON.stringify(preset.values || [])),
        { source: 'duplicate' }
    );
    state.settings.valuePresets.containers.push(newPreset);
    saveValuePresets();
    showToast('"' + newPreset.name + '" duplicated', 'success');
    renderPresetList(modal.querySelector('#pm-body'), modal, modal.querySelector('#pm-search').value);
}

// ─── Import / Export ────────────────────────────────────────────

function renderImportExport(container) {
    container.innerHTML =
        '<div class="pm-import-export">' +
            '<div class="pm-ie-section">' +
                '<h4>📥 Import</h4>' +
                '<p>Drop a JSON file here or click to select.</p>' +
                '<div class="pm-ie-dropzone" id="pm-ie-drop">' +
                    '<span>📂 Drop JSON file here</span>' +
                    '<input type="file" id="pm-ie-file" accept=".json" style="display:none;">' +
                '</div>' +
            '</div>' +
            '<div class="pm-ie-section">' +
                '<h4>📤 Export</h4>' +
                '<p>Download all presets as JSON for backup or sharing.</p>' +
                '<button class="pm-btn pm-btn-primary" id="pm-ie-export">📄 Download JSON</button>' +
            '</div>' +
            '<div class="pm-capture-actions">' +
                '<button class="pm-btn" id="pm-ie-back">← Back to list</button>' +
            '</div>' +
        '</div>';

    var modal = document.getElementById('pm-modal');

    container.querySelector('#pm-ie-back').addEventListener('click', function() {
        renderPresetList(container, modal, modal.querySelector('#pm-search').value);
    });

    var dropzone = container.querySelector('#pm-ie-drop');
    var fileInput = container.querySelector('#pm-ie-file');

    dropzone.addEventListener('click', function() { fileInput.click(); });
    dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('pm-ie-over'); });
    dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('pm-ie-over'); });
    dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('pm-ie-over');
        if (e.dataTransfer.files[0]) doImport(e.dataTransfer.files[0], container, modal);
    });
    fileInput.addEventListener('change', function(e) {
        if (e.target.files[0]) doImport(e.target.files[0], container, modal);
    });

    container.querySelector('#pm-ie-export').addEventListener('click', function() {
        var data = { version: '1.0', exportedAt: new Date().toISOString(), containers: state.settings.valuePresets.containers };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'presets_' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Presets exported', 'info');
    });
}

function doImport(file, container, modal) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            var imported = 0;
            var items = data.containers || (Array.isArray(data) ? data : [data]);
            items.forEach(function(p) {
                if (p.name && p.values) {
                    state.settings.valuePresets.containers.push(p);
                    imported++;
                }
            });
            saveValuePresets();
            showToast('Imported ' + imported + ' preset(s)', 'success');
            renderPresetList(container, modal, '');
        } catch (err) {
            showToast('Import failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ─── Toast (встроенный) ─────────────────────────────────────────

function showToast(msg, type) {
    var existing = document.querySelector('.pm-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'pm-toast pm-toast-' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(function() { toast.classList.add('pm-toast-visible'); });

    setTimeout(function() {
        toast.classList.remove('pm-toast-visible');
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
    }, 2500);
}

// ─── Helpers ────────────────────────────────────────────────────

function escHtml(text) {
    if (!text && text !== 0 && text !== false) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escAttr(text) {
    if (!text && text !== 0 && text !== false) return '';
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtVal(val) {
    if (val === undefined || val === null) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(4);
    var s = String(val);
    return s.length > 35 ? s.substring(0, 32) + '...' : s;
}
