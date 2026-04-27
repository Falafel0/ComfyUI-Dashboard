import { state } from "./state.js";

export function updateDynamicStyles() {
    const root = document.documentElement;
    
    // ─── Core Theme Colors ───
    root.style.setProperty('--a11-accent-custom', state.settings.themeColor);
    
    // Accent state colors
    if (state.settings.accentHover) root.style.setProperty('--a11-accent-hover-custom', state.settings.accentHover);
    if (state.settings.accentActive) root.style.setProperty('--a11-accent-active-custom', state.settings.accentActive);
    
    // ─── Background & Surface Colors ───
    root.style.setProperty('--a11-bg-custom', state.settings.bgColor || 'var(--bg-color, #1a1a1a)');
    root.style.setProperty('--a11-bg-elevated-custom', state.settings.bgElevated || 'var(--comfy-menu-bg, #242424)');
    root.style.setProperty('--a11-menu-custom', state.settings.menuBg || state.settings.panelBg || 'var(--comfy-menu-bg, #2a2a2a)');
    root.style.setProperty('--a11-input-custom', state.settings.inputBg || 'var(--comfy-input-bg, #222222)');
    
    // ─── Text Colors ───
    root.style.setProperty('--a11-text-custom', state.settings.textColor || 'var(--fg-color, #ffffff)');
    root.style.setProperty('--a11-text-muted-custom', state.settings.textMuted || 'var(--descrip-text, #999999)');
    
    // ─── Border Colors ───
    if (state.settings.borderColor) root.style.setProperty('--a11-border-custom', state.settings.borderColor);
    if (state.settings.borderLightColor) root.style.setProperty('--a11-border-light-custom', state.settings.borderLightColor);
    
    // ─── State Colors ───
    if (state.settings.successColor) root.style.setProperty('--a11-success-custom', state.settings.successColor);
    if (state.settings.warningColor) root.style.setProperty('--a11-warning-custom', state.settings.warningColor);
    if (state.settings.errorColor) root.style.setProperty('--a11-error-custom', state.settings.errorColor);
    if (state.settings.infoColor) root.style.setProperty('--a11-info-custom', state.settings.infoColor);
    
    // ─── Hover Colors ───
    if (state.settings.hoverColor) root.style.setProperty('--a11-hover-custom', state.settings.hoverColor);
    
    // ─── Typography ───
    root.style.setProperty('--a11-font-custom', state.settings.fontFamily || "var(--font-family, 'Inter', 'Segoe UI', sans-serif)");
    root.style.setProperty('--a11-font-size-base-custom', (state.settings.fontSizeBase || 12) + 'px');
    root.style.setProperty('--a11-font-size-scale-custom', state.settings.fontSizeScale || 1.1);
    root.style.setProperty('--a11-font-weight-base-custom', state.settings.fontWeightBase || 400);
    
    // ─── Border Radius ───
    root.style.setProperty('--a11-radius-custom', (state.settings.borderRadius || 6) + 'px');
    root.style.setProperty('--a11-button-radius-custom', (state.settings.buttonRadius || state.settings.borderRadius || 6) + 'px');
    root.style.setProperty('--a11-input-radius-custom', (state.settings.inputRadius || 4) + 'px');
    
    // ─── Spacing Scale ───
    root.style.setProperty('--a11-spacing-scale-custom', state.settings.spacingScale || 1.0);
    root.style.setProperty('--a11-container-padding-custom', (state.settings.containerPadding || 8) + 'px');
    root.style.setProperty('--a11-widget-gap-custom', (state.settings.widgetGap || 8) + 'px');
    
    // ─── Shadows & Depth ───
    root.style.setProperty('--a11-shadow-intensity-custom', state.settings.shadowIntensity || 1.0);
    
    // ─── Glassmorphism Effects ───
    root.style.setProperty('--a11-glass-blur-custom', (state.settings.glassBlurAmount || 12) + 'px');
    
    // ─── Animation Settings ───
    root.style.setProperty('--a11-animation-speed-custom', (state.settings.animationSpeed || 200) + 'ms');
    root.style.setProperty('--a11-transition-easing-custom', state.settings.transitionEasing || 'cubic-bezier(0.4, 0, 0.2, 1)');
    root.style.setProperty('--a11-animations-enabled-custom', state.settings.enableAnimations ? 1 : 0);
    
    // ─── ComfyUI Integration ───
    if (state.settings.comfyThemeSync) {
        // Sync with ComfyUI theme variables automatically via CSS var() fallbacks
        // No explicit setting needed - CSS handles it
    }
    if (state.settings.comfyMenuBg) root.style.setProperty('--comfy-menu-bg', state.settings.comfyMenuBg);
    if (state.settings.comfyInputBg) root.style.setProperty('--comfy-input-bg', state.settings.comfyInputBg);
    if (state.settings.comfyFgColor) root.style.setProperty('--fg-color', state.settings.comfyFgColor);
    if (state.settings.comfyBorderColor) root.style.setProperty('--border-color', state.settings.comfyBorderColor);
    
    // ─── Floating Button Opacity ───
    const btn = document.getElementById("a11-floating-btn");
    if(btn) btn.style.opacity = state.settings.btnOpacity || state.settings.buttonOpacity || 1.0;
}

// Helper function to apply hover effects based on settings
export function applyHoverEffect(element, effectType = null) {
    const effect = effectType || state.settings.hoverEffect || 'lift';
    const scale = state.settings.hoverScale || 1.02;
    
    switch(effect) {
        case 'lift':
            element.style.transform = `translateY(-2px)`;
            break;
        case 'scale':
            element.style.transform = `scale(${scale})`;
            break;
        case 'glow':
            element.style.boxShadow = `0 0 15px var(--a11-accent)`;
            break;
        case 'none':
            element.style.transform = 'none';
            break;
    }
}
