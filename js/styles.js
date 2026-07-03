import { state } from "./state.js";

export function updateDynamicStyles() {
    const root = document.documentElement;
    const s = state.settings;

    // ─── Core Theme Colors ───
    root.style.setProperty('--a11-accent', s.themeColor);

    // ─── Background & Surface Colors ───
    root.style.setProperty('--a11-bg', s.bgColor || getComfyVar('--bg-color', '#1a1a1a'));
    root.style.setProperty('--a11-bg-elevated', s.bgElevated || getComfyVar('--comfy-menu-bg', '#242424'));
    root.style.setProperty('--a11-menu', s.menuBg || s.panelBg || getComfyVar('--comfy-menu-bg', '#2a2a2a'));
    root.style.setProperty('--a11-input', s.inputBg || getComfyVar('--comfy-input-bg', '#222222'));

    // ─── Text Colors ───
    root.style.setProperty('--a11-text', s.textColor || getComfyVar('--fg-color', '#ffffff'));
    root.style.setProperty('--a11-text-muted', s.textMuted || getComfyVar('--descrip-text', '#999999'));

    // ─── Border Colors ───
    root.style.setProperty('--a11-border', s.borderColor || getComfyVar('--border-color', '#454545'));

    // ─── State Colors ───
    if (s.successColor) root.style.setProperty('--a11-success', s.successColor);
    if (s.warningColor) root.style.setProperty('--a11-warning', s.warningColor);
    if (s.errorColor) root.style.setProperty('--a11-error', s.errorColor);
    if (s.infoColor) root.style.setProperty('--a11-info', s.infoColor);

    // ─── Typography (applied to ALL overlay children) ───
    const fontFamily = s.fontFamily || getComfyVar('--font-family', "'Inter', 'Segoe UI', sans-serif");
    root.style.setProperty('--a11-font', fontFamily);
    const overlay = document.getElementById("a11-overlay");
    if (overlay) {
        overlay.style.fontFamily = fontFamily;
    }

    const fontSizeBase = (s.fontSizeBase || 12) + 'px';
    root.style.setProperty('--a11-font-size-base', fontSizeBase);
    root.style.setProperty('--a11-font-size-scale', s.fontSizeScale || 1.1);
    root.style.setProperty('--a11-font-weight-base', s.fontWeightBase || 400);

    // ─── Border Radius ───
    const radius = (s.borderRadius || 6) + 'px';
    root.style.setProperty('--a11-radius', radius);
    root.style.setProperty('--a11-button-radius', (s.buttonRadius || s.borderRadius || 6) + 'px');
    root.style.setProperty('--a11-input-radius', (s.inputRadius || 4) + 'px');

    // ─── Spacing Scale ───
    root.style.setProperty('--a11-spacing-scale', s.spacingScale || 1.0);
    root.style.setProperty('--a11-container-padding', (s.containerPadding || 8) + 'px');
    root.style.setProperty('--a11-widget-gap', (s.widgetGap || 8) + 'px');

    // ─── Shadows & Depth (connected to enableShadows) ───
    if (s.enableShadows === false) {
        root.style.setProperty('--a11-shadow-sm', 'none');
        root.style.setProperty('--a11-shadow', 'none');
        root.style.setProperty('--a11-shadow-lg', 'none');
        root.style.setProperty('--a11-shadow-xl', 'none');
        root.style.setProperty('--a11-shadow-glow', 'none');
    } else {
        const si = parseFloat(s.shadowIntensity) || 1.0;
        root.style.setProperty('--a11-shadow-sm', `0 1px 2px rgba(0,0,0,${0.3 * si})`);
        root.style.setProperty('--a11-shadow', `0 2px 8px rgba(0,0,0,${0.4 * si})`);
        root.style.setProperty('--a11-shadow-lg', `0 8px 24px rgba(0,0,0,${0.5 * si})`);
        root.style.setProperty('--a11-shadow-xl', `0 12px 40px rgba(0,0,0,${0.6 * si})`);
    }

    // ─── Glassmorphism Effects ───
    if (s.enableGlassmorphism) {
        const blur = (s.glassBlurAmount || 12) + 'px';
        root.style.setProperty('--a11-glass-blur', blur);
        root.style.setProperty('--a11-glass-bg', 'rgba(0,0,0,0.25)');
    } else {
        root.style.setProperty('--a11-glass-blur', '0px');
        root.style.setProperty('--a11-glass-bg', 'transparent');
    }

    // ─── Animation Settings (connected to enableAnimations) ───
    if (s.enableAnimations === false) {
        root.style.setProperty('--a11-transition-fast', '0s');
        root.style.setProperty('--a11-transition', '0s');
        root.style.setProperty('--a11-transition-slow', '0s');
        root.style.setProperty('--a11-transition-bounce', '0s');
    } else {
        const speed = (s.animationSpeed || 200) + 'ms';
        const easing = s.transitionEasing || 'cubic-bezier(0.4, 0, 0.2, 1)';
        root.style.setProperty('--a11-transition-fast', `calc(0.75 * ${speed}) ${easing}`);
        root.style.setProperty('--a11-transition', `${speed} ${easing}`);
        root.style.setProperty('--a11-transition-slow', `calc(1.5 * ${speed}) ${easing}`);
        root.style.setProperty('--a11-transition-bounce', `calc(2 * ${speed}) cubic-bezier(0.34, 1.56, 0.64, 1)`);
    }

    // ─── Generate Button Color ───
    if (s.generateBtnColor) {
        root.style.setProperty('--a11-btn-generate-bg', s.generateBtnColor);
    }

    // ─── UI Preferences: Compact Mode ───
    const compactMode = s.uiPreferences?.compactMode === true;
    if (overlay) {
        overlay.classList.toggle("a11-compact", compactMode);
    }

    // ─── Borderless Grid ───
    if (overlay) {
        overlay.classList.toggle("a11-borderless", !!s.gridBorderless);
    }

    // ─── UI Preferences: Tooltips ───
    const showTooltips = s.uiPreferences?.showTooltips !== false;
    if (overlay) {
        overlay.classList.toggle("a11-no-tooltips", !showTooltips);
        // Clear/restore title attributes on labels
        const labels = overlay.querySelectorAll(".a11-label");
        labels.forEach(lbl => {
            if (!showTooltips) {
                lbl._savedTitle = lbl.title;
                lbl.removeAttribute("title");
            } else if (lbl._savedTitle !== undefined) {
                lbl.title = lbl._savedTitle;
                delete lbl._savedTitle;
            }
        });
    }

    // ─── ComfyUI Integration ───
    if (s.comfyThemeSync) {
        syncComfyTheme();
    }

    // ─── Right Panel Visibility ───
    applyRightPanelVisibility(s);
}

function getComfyVar(name, fallback) {
    try {
        const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return val || fallback;
    } catch (e) {
        return fallback;
    }
}

function syncComfyTheme() {
    const styles = getComputedStyle(document.documentElement);
    const root = document.documentElement;
    const s = state.settings;

    const get = (name) => {
        const val = styles.getPropertyValue(name).trim();
        return val || null;
    };

    // Map ComfyUI native CSS variables → dashboard --a11-* variables
    const map = (comfyVar, a11Var, fallback) => {
        const val = get(comfyVar) || fallback;
        if (val) root.style.setProperty(a11Var, val);
    };

    // Override dashboard colors with ComfyUI native theme
    map('--bg-color', '--a11-bg', '#1a1a1a');
    map('--fg-color', '--a11-text', '#ffffff');
    map('--comfy-menu-bg', '--a11-menu', '#2a2a2a');
    map('--comfy-menu-bg', '--a11-bg-elevated', '#242424');
    map('--comfy-input-bg', '--a11-input', '#222222');
    map('--border-color', '--a11-border', '#454545');
    map('--descrip-text', '--a11-text-muted', '#999999');

    // Sync accent/primary color for Generate button and other accents
    const accent = get('--p-primary-color') || get('--p-button-text-primary-color');
    if (accent) {
        root.style.setProperty('--a11-accent', accent);
        if (!s.generateBtnColor) {
            root.style.setProperty('--a11-btn-generate-bg', accent);
        }
    }
}

// Apply hover effects to grid items based on settings
export function applyHoverEffect(element, effectType = null) {
    const s = state.settings;
    const effect = effectType || s.hoverEffect || 'lift';
    const scale = parseFloat(s.hoverScale) || 1.02;

    // Remove previous hover styles
    element.style.removeProperty('--hover-transform');

    switch (effect) {
        case 'lift':
            element.style.setProperty('--hover-transform', 'translateY(-2px)');
            break;
        case 'scale':
            element.style.setProperty('--hover-transform', `scale(${scale})`);
            break;
        case 'glow':
            element.style.setProperty('--hover-transform', 'none');
            element.style.boxShadow = '0 0 15px var(--a11-accent)';
            return;
        case 'none':
        default:
            element.style.setProperty('--hover-transform', 'none');
            return;
    }
    element.style.boxShadow = '';
}

function applyRightPanelVisibility(s) {
    const previewWrap = document.getElementById("a11-preview-wrapper");
    const previewResizer = document.getElementById("a11-preview-resizer");
    const galleryHeader = document.getElementById("a11-gallery-header");
    const gallery = document.getElementById("a11-gallery");
    const sendBar = document.querySelector(".a11-send-bar");

    if (s.rpShowPreview === false) {
        if (previewWrap) previewWrap.style.display = "none";
        if (previewResizer) previewResizer.style.display = "none";
    }
    if (s.rpShowGallery === false) {
        if (galleryHeader) galleryHeader.style.display = "none";
        if (gallery) gallery.style.display = "none";
    }
    if (s.rpShowSendBar === false) {
        if (sendBar) sendBar.style.display = "none";
    }
}
