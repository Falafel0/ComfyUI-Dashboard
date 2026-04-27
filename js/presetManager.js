/**
 * A11 Studio - Preset Manager Module
 * Надежная система управления пресетами с сортировкой, валидацией и CSV импортом/экспортом
 */


export const PRESET_CATEGORIES = {
    GENERAL: "General",
    STYLES: "Styles",
    RESOLUTIONS: "Resolutions",
    SAMPLERS: "Samplers",
    PROMPTS: "Prompts",
    WORKFLOWS: "Workflows",
    CUSTOM: "Custom"
};

export const PRESET_SORT_OPTIONS = {
    NAME_ASC: 'name_asc',
    NAME_DESC: 'name_desc',
    CATEGORY_ASC: 'category_asc',
    CATEGORY_DESC: 'category_desc',
    DATE_CREATED: 'date_created',
    DATE_MODIFIED: 'date_modified'
};

export const DEFAULT_SORT_ORDER = PRESET_SORT_OPTIONS.NAME_ASC;


/**
 * Извлекает ID из preset ID (удаляет префикс времени)
 */
export function extractPresetId(presetId) {
    if (!presetId) return '';
    const parts = presetId.split('_');
    return parts.length > 1 ? parts.slice(1).join('_') : presetId;
}

/**
 * Создает уникальный ID для пресета с временной меткой
 */
export function generatePresetId(name) {
    const sanitizedName = (name || 'preset').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `p_${Date.now()}_${sanitizedName}`;
}

/**
 * Санитизирует имя пресета (удаляет опасные символы)
 */
export function sanitizePresetName(name) {
    if (!name) return 'Unnamed Preset';
    return name.toString().trim().substring(0, 100).replace(/[<>\"\'&]/g, '');
}

/**
 * Санитизирует название категории
 */
export function sanitizeCategoryName(category) {
    if (!category) return PRESET_CATEGORIES.GENERAL;
    return category.toString().trim().substring(0, 50).replace(/[<>\"\'&]/g, '') || PRESET_CATEGORIES.GENERAL;
}

/**
 * Получает текущую дату в формате ISO для сортировки
 */
export function getCurrentTimestamp() {
    return new Date().toISOString();
}

/**
 * Парсит временную метку из ID пресета
 */
export function parseTimestampFromId(presetId) {
    if (!presetId) return 0;
    const parts = presetId.split('_');
    if (parts.length >= 2 && parts[1]) {
        const timestamp = parseInt(parts[1], 10);
        return isNaN(timestamp) ? 0 : timestamp;
    }
    return 0;
}


/**
 * Сортирует массив пресетов согласно указанному порядку
 * @param {Array} presets - Массив пресетов
 * @param {string} sortOrder - Порядок сортировки из PRESET_SORT_OPTIONS
 * @returns {Array} Отсортированный массив
 */
export function sortPresets(presets, sortOrder = DEFAULT_SORT_ORDER) {
    if (!Array.isArray(presets)) return [];

    const sorted = [...presets];

    switch (sortOrder) {
        case PRESET_SORT_OPTIONS.NAME_ASC:
            return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

        case PRESET_SORT_OPTIONS.NAME_DESC:
            return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' }));

        case PRESET_SORT_OPTIONS.CATEGORY_ASC:
            return sorted.sort((a, b) => {
                const catA = (a.category || PRESET_CATEGORIES.GENERAL).localeCompare(b.category || PRESET_CATEGORIES.GENERAL, undefined, { sensitivity: 'base' });
                if (catA !== 0) return catA;
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });

        case PRESET_SORT_OPTIONS.CATEGORY_DESC:
            return sorted.sort((a, b) => {
                const catB = (b.category || PRESET_CATEGORIES.GENERAL).localeCompare(a.category || PRESET_CATEGORIES.GENERAL, undefined, { sensitivity: 'base' });
                if (catB !== 0) return catB;
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });

        case PRESET_SORT_OPTIONS.DATE_CREATED:
            return sorted.sort((a, b) => {
                const timeA = parseTimestampFromId(a.id);
                const timeB = parseTimestampFromId(b.id);
                return timeB - timeA; // Новые сначала
            });

        case PRESET_SORT_OPTIONS.DATE_MODIFIED:
            return sorted.sort((a, b) => {
                const timeA = a.modifiedAt ? new Date(a.modifiedAt).getTime() : parseTimestampFromId(a.id);
                const timeB = b.modifiedAt ? new Date(b.modifiedAt).getTime() : parseTimestampFromId(b.id);
                return timeB - timeA; // Новые сначала
            });

        default:
            return sorted;
    }
}

/**
 * Группирует пресеты по категориям
 * @param {Array} presets - Массив пресетов
 * @returns {Object} Объект с категориями как ключами
 */
export function groupPresetsByCategory(presets) {
    if (!Array.isArray(presets)) return {};

    return presets.reduce((groups, preset) => {
        const category = preset.category || PRESET_CATEGORIES.GENERAL;
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(preset);
        return groups;
    }, {});
}

/**
 * Получает отсортированный список уникальных категорий
 * @param {Array} presets - Массив пресетов
 * @returns {Array} Массив названий категорий
 */
export function getUniqueCategories(presets) {
    if (!Array.isArray(presets)) return [];

    const categories = new Set(presets.map(p => p.category || PRESET_CATEGORIES.GENERAL));
    return Array.from(categories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}


/**
 * Валидирует структуру пресета контейнера
 * @param {Object} preset - Пресет для валидации
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateContainerPreset(preset) {
    const errors = [];

    if (!preset) {
        return { valid: false, errors: ['Preset is null or undefined'] };
    }

    if (!preset.name || typeof preset.name !== 'string' || preset.name.trim().length === 0) {
        errors.push('Preset name is required and must be a non-empty string');
    }

    if (!preset.values || !Array.isArray(preset.values)) {
        errors.push('Preset values must be an array');
    } else {
        preset.values.forEach((v, idx) => {
            if (!v.nodeTitle) errors.push(`Value[${idx}]: Missing nodeTitle`);
            if (!v.nodeType) errors.push(`Value[${idx}]: Missing nodeType`);
            if (!v.widgetName) errors.push(`Value[${idx}]: Missing widgetName`);
        });
    }

    if (preset.category && typeof preset.category !== 'string') {
        errors.push('Category must be a string');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * P0-3: Валидирует значения пресета перед применением
 * Проверяет min/max/step для чисел, допустимые значения для combo
 * @param {Array} savedValues - массив значений из пресета
 * @param {Object} app - ComfyUI app объект
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validatePresetValues(savedValues, app) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(savedValues)) {
        return { valid: false, errors: ['savedValues must be an array'], warnings: [] };
    }

    if (!app?.graph) {
        return { valid: false, errors: ['App graph not available'], warnings: [] };
    }

    savedValues.forEach((sv, idx) => {
        // Находим ноду по типу
        let targetNode = null;
        
        if (sv.nodeId) {
            targetNode = app.graph.getNodeById(sv.nodeId);
        }

        if (!targetNode && sv.nodeType) {
            const nodes = app.graph._nodes.filter(n =>
                n.type === sv.nodeType
            );
            targetNode = nodes.length > 0 ? nodes[0] : null;
        }

        if (!targetNode) {
            warnings.push(`Value[${idx}]: Node type "${sv.nodeType}" not found`);
            return;
        }

        // Находим виджет
        const widget = targetNode.widgets?.find(w => w.name === sv.widgetName);
        if (!widget) {
            warnings.push(`Value[${idx}]: Widget "${sv.widgetName}" not found in node type ${sv.nodeType}`);
            return;
        }

        // Валидация числовых значений
        if (typeof sv.value === 'number' || widget.type === 'number' || widget.type === 'slider') {
            const numValue = parseFloat(sv.value);
            
            if (isNaN(numValue)) {
                errors.push(`Value[${idx}]: ${sv.widgetName} = "${sv.value}" is not a valid number`);
                return;
            }

            // Проверка min
            if (widget.options?.min !== undefined && numValue < widget.options.min) {
                errors.push(`${sv.widgetName}: ${numValue} < min ${widget.options.min}`);
            }

            // Проверка max
            if (widget.options?.max !== undefined && numValue > widget.options.max) {
                errors.push(`${sv.widgetName}: ${numValue} > max ${widget.options.max}`);
            }

            // Проверка step (предупреждение)
            if (widget.options?.step !== undefined && widget.options.step > 0) {
                const remainder = (numValue - (widget.options.min || 0)) % widget.options.step;
                if (Math.abs(remainder) > 0.0001) {
                    warnings.push(`${sv.widgetName}: ${numValue} is not a multiple of step ${widget.options.step}`);
                }
            }
        }

        // Валидация combo значений
        if (widget.type === 'combo' || widget.options?.values) {
            const validValues = widget.options.values || [];
            if (validValues.length > 0 && !validValues.includes(sv.value)) {
                errors.push(`${sv.widgetName}: "${sv.value}" is not in allowed values [${validValues.join(', ')}]`);
            }
        }

        // Валидация boolean
        if (widget.type === 'toggle' || widget.type === 'boolean') {
            if (typeof sv.value !== 'boolean') {
                warnings.push(`${sv.widgetName}: Converting "${sv.value}" to boolean`);
            }
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Валидирует структуру пресета FSD (группа/пресет)
 * @param {Object} presetData - Данные пресета
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateFsdPreset(presetData) {
    const errors = [];

    if (!presetData || typeof presetData !== 'object') {
        return { valid: false, errors: ['Preset data must be an object'] };
    }

    try {
        JSON.stringify(presetData);
    } catch (e) {
        errors.push(`Preset data contains non-serializable values: ${e.message}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}


/**
 * Парсит CSV строку в массив объектов
 * Ожидает формат: preset name,"prompt","negative"
 * @param {string} csvText - CSV содержимое
 * @returns {Array} Массив пресетов
 */
export function parseStyleCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') {
        return { presets: [], errors: ['Empty or invalid CSV content'] };
    }

    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
        return { presets: [], errors: ['CSV must have header and at least one data row'] };
    }

    const presets = [];
    const errors = [];

    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);

    const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name'));
    const promptIdx = headers.findIndex(h => h.toLowerCase().includes('prompt') && !h.toLowerCase().includes('negative'));
    const negativeIdx = headers.findIndex(h => h.toLowerCase().includes('negative'));

    if (nameIdx === -1) {
        errors.push('Missing "name" column in header');
    }
    if (promptIdx === -1) {
        errors.push('Missing "prompt" column in header');
    }
    if (negativeIdx === -1) {
        errors.push('Missing "negative" column in header');
    }

    if (errors.length > 0) {
        return { presets: [], errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);

        if (values.length < Math.max(nameIdx, promptIdx, negativeIdx) + 1) {
            errors.push(`Line ${i + 1}: Not enough columns`);
            continue;
        }

        const name = values[nameIdx]?.trim();
        const prompt = values[promptIdx]?.trim() || '';
        const negative = values[negativeIdx]?.trim() || '';

        if (!name) {
            errors.push(`Line ${i + 1}: Empty name`);
            continue;
        }

        presets.push({
            id: generatePresetId(name),
            name: sanitizePresetName(name),
            category: PRESET_CATEGORIES.STYLES,
            createdAt: getCurrentTimestamp(),
            values: [{
                nodeTitle: 'Style Selector',
                nodeType: 'A11_StyleSelector',
                widgetName: 'style',
                value: name
            }],
            metadata: {
                prompt: prompt,
                negative: negative,
                source: 'csv_import'
            }
        });
    }

    return { presets, errors };
}

/**
 * Парсит одну строку CSV с учетом кавычек
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

/**
 * Экспортирует пресеты стилей в CSV формат
 * @param {Array} presets - Массив пресетов стилей
 * @returns {string} CSV строка
 */
export function exportStyleCSV(presets) {
    if (!Array.isArray(presets)) return '';

    const stylePresets = presets.filter(p =>
        p.category === PRESET_CATEGORIES.STYLES ||
        (p.metadata && (p.metadata.prompt || p.metadata.negative))
    );

    if (stylePresets.length === 0) return '';

    const lines = ['preset name,"prompt","negative"'];

    stylePresets.forEach(preset => {
        const name = escapeCSVField(preset.name);
        const prompt = escapeCSVField(preset.metadata?.prompt || '');
        const negative = escapeCSVField(preset.metadata?.negative || '');
        lines.push(`${name},"${prompt}","${negative}"`);
    });

    return lines.join('\n');
}

/**
 * Экранирует поле для CSV (добавляет кавычки если нужно)
 */
function escapeCSVField(value) {
    if (!value) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return str.replace(/"/g, '""');
    }
    return str;
}


/**
 * Создает новый пресет контейнера с валидацией
 */
export function createContainerPreset(name, category, values, metadata = {}) {
    const sanitizedName = sanitizePresetName(name);
    const sanitizedCategory = sanitizeCategoryName(category);

    const validation = validateContainerPreset({
        name: sanitizedName,
        category: sanitizedCategory,
        values
    });

    if (!validation.valid) {
        throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
    }

    const now = getCurrentTimestamp();
    return {
        id: generatePresetId(sanitizedName),
        name: sanitizedName,
        category: sanitizedCategory,
        values: [...values],
        metadata: {
            source: 'manual_create',
            ...metadata
        },
        createdAt: now,
        modifiedAt: now
    };
}

/**
 * Обновляет существующий пресет
 */
export function updateContainerPreset(existingPreset, updates) {
    if (!existingPreset || !existingPreset.id) {
        throw new Error('Cannot update: preset not found');
    }

    const updated = {
        ...existingPreset,
        ...updates,
        modifiedAt: getCurrentTimestamp()
    };

    if (updates.name) {
        updated.name = sanitizePresetName(updates.name);
    }
    if (updates.category) {
        updated.category = sanitizeCategoryName(updates.category);
    }

    const validation = validateContainerPreset(updated);
    if (!validation.valid) {
        throw new Error(`Invalid preset after update: ${validation.errors.join(', ')}`);
    }

    return updated;
}

/**
 * Находит пресет по ID
 */
export function findPresetById(presets, presetId) {
    if (!Array.isArray(presets)) return null;
    return presets.find(p => p.id === presetId) || null;
}

/**
 * Находит пресеты по категории
 */
export function findPresetsByCategory(presets, category) {
    if (!Array.isArray(presets)) return [];
    if (!category) return presets;
    return presets.filter(p => (p.category || PRESET_CATEGORIES.GENERAL) === category);
}

/**
 * Фильтрует пресеты по поисковому запросу
 */
export function filterPresetsBySearch(presets, query) {
    if (!Array.isArray(presets)) return [];
    if (!query || query.trim().length === 0) return presets;

    const searchLower = query.toLowerCase();
    return presets.filter(p => {
        const nameMatch = (p.name || '').toLowerCase().includes(searchLower);
        const categoryMatch = (p.category || '').toLowerCase().includes(searchLower);
        return nameMatch || categoryMatch;
    });
}

/**
 * Удаляет пресет по ID из массива
 * @returns {Object} { success: boolean, presets: Array, error?: string }
 */
export function deletePresetById(presets, presetId) {
    if (!Array.isArray(presets)) {
        return { success: false, presets: [], error: 'Invalid presets array' };
    }

    const index = presets.findIndex(p => p.id === presetId);
    if (index === -1) {
        return { success: false, presets, error: 'Preset not found' };
    }

    const newPresets = [...presets];
    newPresets.splice(index, 1);
    return { success: true, presets: newPresets };
}


/**
 * Мигрирует старые пресеты в новый формат
 */
export function migrateOldPresets(oldPresets) {
    if (!oldPresets || !Array.isArray(oldPresets)) {
        return { containers: [] };
    }

    const migrated = oldPresets.map((preset, idx) => {
        if (preset.id && preset.createdAt) {
            return preset;
        }

        return {
            id: preset.id || `cp_migrated_${Date.now()}_${idx}`,
            name: sanitizePresetName(preset.name || `Migrated Preset ${idx + 1}`),
            category: sanitizeCategoryName(preset.category || PRESET_CATEGORIES.GENERAL),
            values: Array.isArray(preset.values) ? preset.values : [],
            metadata: {
                source: 'migration',
                migratedAt: getCurrentTimestamp()
            },
            createdAt: getCurrentTimestamp(),
            modifiedAt: getCurrentTimestamp()
        };
    });

    return { containers: migrated };
}

/**
 * Сливает пресеты из нескольких источников, удаляя дубликаты по имени+категории
 */
export function mergePresets(...presetArrays) {
    const seen = new Map();
    const result = [];

    presetArrays.forEach(arr => {
        if (!Array.isArray(arr)) return;

        arr.forEach(preset => {
            if (!preset || !preset.name) return;

            const key = `${preset.category || PRESET_CATEGORIES.GENERAL}:::${preset.name}`.toLowerCase();

            if (!seen.has(key)) {
                seen.set(key, preset);
                result.push(preset);
            } else {
                const existing = seen.get(key);
                const existingTime = existing.modifiedAt ? new Date(existing.modifiedAt).getTime() : parseTimestampFromId(existing.id);
                const newTime = preset.modifiedAt ? new Date(preset.modifiedAt).getTime() : parseTimestampFromId(preset.id);

                if (newTime > existingTime) {
                    seen.set(key, preset);
                    result[result.indexOf(existing)] = preset;
                }
            }
        });
    });

    return sortPresets(result, DEFAULT_SORT_ORDER);
}

/**
 * Создает резервную копию пресетов
 */
export function createPresetBackup(presets) {
    return {
        version: '1.0',
        exportedAt: getCurrentTimestamp(),
        count: Array.isArray(presets) ? presets.length : 0,
        presets: Array.isArray(presets) ? [...presets] : []
    };
}

/**
 * Восстанавливает пресеты из резервной копии
 */
export function restorePresetBackup(backup) {
    if (!backup || !backup.presets || !Array.isArray(backup.presets)) {
        throw new Error('Invalid backup format');
    }

    return migrateOldPresets(backup.presets);
}
