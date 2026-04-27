// Enhanced Settings System for A11 Studio
// Provides unified management for all settings categories

import { state, saveSettings, resetSettings, saveValuePresets } from "./state.js";

export const SETTINGS_CATEGORIES = {
    GLOBAL: 'global',
    TAB: 'tab',
    GROUPS: 'groups',
    CONTAINER_ADVANCED: 'container_advanced',
    CONTAINER_PRESETS: 'container_presets',
    LAYOUT_TEMPLATES: 'layout_templates'
};

// Layout Template Management
export class LayoutTemplateManager {
    static saveTemplate(name, tabData, options = {}) {
        const template = {
            id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name || 'Untitled Template',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: '1.0',
            tabData: {
                name: tabData.name,
                generateBtnText: tabData.generateBtnText,
                presetCategory: tabData.presetCategory,
                gallerySources: tabData.gallerySources || [],
                layout: this.enrichLayout(tabData.layout),
                activeGroups: tabData.activeGroups || []
            },
            metadata: {
                description: options.description || '',
                tags: options.tags || [],
                thumbnail: null,
                isFavorite: false,
                usageCount: 0
            },
            compatibility: {
                minVersion: '1.0',
                requiredExtensions: []
            }
        };
        
        if (!state.settings.layoutTemplates) {
            state.settings.layoutTemplates = [];
        }
        
        state.settings.layoutTemplates.push(template);
        saveSettings();
        return template;
    }
    
    static updateTemplate(templateId, updates) {
        const template = this.getTemplate(templateId);
        if (!template) return null;
        
        Object.assign(template, updates);
        template.updatedAt = new Date().toISOString();
        saveSettings();
        return template;
    }
    
    static deleteTemplate(templateId) {
        if (!state.settings.layoutTemplates) return false;
        const idx = state.settings.layoutTemplates.findIndex(t => t.id === templateId);
        if (idx === -1) return false;
        
        state.settings.layoutTemplates.splice(idx, 1);
        saveSettings();
        return true;
    }
    
    static getTemplate(templateId) {
        if (!state.settings.layoutTemplates) return null;
        return state.settings.layoutTemplates.find(t => t.id === templateId);
    }
    
    static getAllTemplates() {
        return state.settings.layoutTemplates || [];
    }
    
    static applyTemplate(templateId, targetTabIdx = null) {
        const template = this.getTemplate(templateId);
        if (!template) return false;
        
        const targetIdx = targetTabIdx !== null ? targetTabIdx : state.appData.activeIdx;
        const currentTab = state.appData.tabs[targetIdx];
        
        if (!currentTab) return false;
        
        // Apply template data
        currentTab.name = template.tabData.name;
        currentTab.generateBtnText = template.tabData.generateBtnText;
        currentTab.presetCategory = template.tabData.presetCategory;
        currentTab.gallerySources = template.tabData.gallerySources;
        currentTab.layout = JSON.parse(JSON.stringify(template.tabData.layout));
        currentTab.activeGroups = template.tabData.activeGroups;
        
        // Update usage count
        template.metadata.usageCount = (template.metadata.usageCount || 0) + 1;
        template.updatedAt = new Date().toISOString();
        
        saveSettings();
        return true;
    }
    
    static exportTemplate(templateId) {
        const template = this.getTemplate(templateId);
        if (!template) return null;
        
        const exportData = {
            exportVersion: '1.0',
            exportedAt: new Date().toISOString(),
            template: template
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    static importTemplate(jsonString) {
        try {
            const importData = JSON.parse(jsonString);
            if (!importData.exportVersion || !importData.template) {
                throw new Error('Invalid template format');
            }
            
            const template = importData.template;
            template.id = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            template.updatedAt = new Date().toISOString();
            
            if (!state.settings.layoutTemplates) {
                state.settings.layoutTemplates = [];
            }
            
            state.settings.layoutTemplates.push(template);
            saveSettings();
            return template;
        } catch (e) {
            console.error('Failed to import template:', e);
            return null;
        }
    }
    
    static enrichLayout(layout) {
        const enriched = JSON.parse(JSON.stringify(layout));
        enriched.forEach(item => {
            if (item.config && item.config.widgets) {
                item.config.widgets.forEach(w => {
                    const node = window.app?.graph?.getNodeById(w.nodeId);
                    if (node) {
                        w.nodeTitle = node.title;
                        w.nodeType = node.type;
                    }
                });
            }
        });
        return enriched;
    }
    
    static searchTemplates(query, filters = {}) {
        let results = this.getAllTemplates();
        
        if (query) {
            const q = query.toLowerCase();
            results = results.filter(t => 
                t.name.toLowerCase().includes(q) ||
                t.metadata?.description?.toLowerCase().includes(q) ||
                t.metadata?.tags?.some(tag => tag.toLowerCase().includes(q))
            );
        }
        
        if (filters.category) {
            results = results.filter(t => t.tabData.presetCategory === filters.category);
        }
        
        if (filters.favorite) {
            results = results.filter(t => t.metadata?.isFavorite);
        }
        
        return results;
    }
}

// Enhanced UI Preferences Manager
export class UIPreferencesManager {
    static setPreference(key, value) {
        if (!state.settings.uiPreferences) {
            state.settings.uiPreferences = {};
        }
        state.settings.uiPreferences[key] = value;
        saveSettings();
    }
    
    static getPreference(key, defaultValue = null) {
        return state.settings.uiPreferences?.[key] ?? defaultValue;
    }
    
    static resetPreferences() {
        state.settings.uiPreferences = {};
        saveSettings();
    }
}

// Settings Validation
export function validateSettings(settings) {
    const errors = [];
    const warnings = [];
    
    // Validate grid settings
    if (settings.gridCellHeight < 20 || settings.gridCellHeight > 300) {
        errors.push('Grid cell height must be between 20 and 300');
    }
    
    if (settings.gridMargin < 0 || settings.gridMargin > 100) {
        errors.push('Grid margin must be between 0 and 100');
    }
    
    // Validate shortcuts
    const shortcutFields = ['shortcutToggle', 'shortcutClose', 'shortcutGenerate'];
    shortcutFields.forEach(field => {
        if (settings[field] && !isValidShortcut(settings[field])) {
            warnings.push(`Invalid shortcut format for ${field}: ${settings[field]}`);
        }
    });
    
    // Validate colors
    const colorFields = ['themeColor', 'bgColor', 'panelBg', 'textColor'];
    colorFields.forEach(field => {
        if (settings[field] && !isValidColor(settings[field])) {
            warnings.push(`Invalid color format for ${field}: ${settings[field]}`);
        }
    });
    
    return { valid: errors.length === 0, errors, warnings };
}

function isValidShortcut(shortcut) {
    if (!shortcut) return true;
    const parts = shortcut.split('+').map(p => p.trim().toLowerCase());
    const validKeys = ['shift', 'ctrl', 'control', 'alt', 'meta', 'escape', 'enter', 'space'];
    const key = parts[parts.length - 1];
    return key.length === 1 || validKeys.includes(key);
}

function isValidColor(color) {
    if (!color) return true;
    if (color.startsWith('#')) {
        return /^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color);
    }
    return color.startsWith('rgb') || color.startsWith('hsl');
}

// Settings Migration
export function migrateSettings(oldSettings) {
    const newSettings = { ...oldSettings };
    
    // Migrate old tabPresets to layoutTemplates if needed
    if (oldSettings.tabPresets && oldSettings.tabPresets.length > 0 && !newSettings.layoutTemplates) {
        newSettings.layoutTemplates = oldSettings.tabPresets.map((preset, idx) => ({
            id: `tpl_migrated_${idx}_${Date.now()}`,
            name: preset.name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: '1.0',
            tabData: {
                name: preset.name,
                generateBtnText: preset.generateBtnText || 'Generate',
                presetCategory: '',
                gallerySources: [],
                layout: preset.layout || [],
                activeGroups: []
            },
            metadata: {
                description: 'Migrated from tabPresets',
                tags: ['migrated'],
                isFavorite: false,
                usageCount: 0
            }
        }));
    }
    
    // Ensure uiPreferences exists
    if (!newSettings.uiPreferences) {
        newSettings.uiPreferences = {};
    }
    
    return newSettings;
}
