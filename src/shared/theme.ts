/**
 * Private Apply Design System - Color Theme ("The Olive Atelier")
 * 
 * Centralized color constants for consistent branding across all UI surfaces.
 * DO NOT use inline hex values - always import from this file.
 */

export const colors = {
  // Primary Brand Colors (Warm Moss / Olive)
  accent: '#707953',
  accentHover: '#545b3e',
  accentDark: '#8c9867',
  green: '#707953',
  greenDark: '#545b3e',
  white: '#ffffff',
  
  // Neutral Olive-Toned Grays
  grayLight: '#f3f5f0',
  grayMedium: '#cfd6c2',
  grayDark: '#727a52',
  charcoal: '#1d1f14',
  
  // Semantic Colors
  success: '#707953',
  error: '#a84242',
  warning: '#8c9867',
  info: '#5e7953',
  
  // Status Colors (for dashboard)
  statusSubmitted: '#5e7953',
  statusInterviewing: '#8c9867',
  statusRejected: '#a84242',
  statusAccepted: '#707953',
  statusWithdrawn: '#a5ad85',
  
  // Text Colors
  textPrimary: '#1d1f14',
  textSecondary: '#727a52',
  textDisabled: '#a5ad85',
  textInverse: '#f3f5f0',
  
  // Background Colors
  bgPrimary: '#e7ebe0',
  bgSecondary: '#f3f5f0',
  bgDark: '#0e0f0a',
  bgSurfaceDark: '#1b1f14',
  bgGreenTint: '#e4eae1',
  
  // Border Colors
  borderLight: '#cfd6c2',
  borderMedium: '#b8c2a3',
  borderAccent: '#707953',
  borderDark: '#2d3420',
} as const;

/**
 * Computed colors (derived from primary colors)
 */
export const computed = {
  greenHover: '#545b3e',
  greenActive: '#383d29',
  greenDisabled: '#cfd6c2',
  
  navyLight: '#5e7953',
  navyDark: '#1d1f14',
  
  // Opacity variants
  accentAlpha10: 'rgba(112, 121, 83, 0.10)',
  accentAlpha15: 'rgba(112, 121, 83, 0.15)',
  accentAlpha20: 'rgba(112, 121, 83, 0.20)',
  accentAlpha30: 'rgba(112, 121, 83, 0.30)',
} as const;

/**
 * CSS custom properties for use in stylesheets
 */
export function getCSSVariables(): string {
  return `
    --color-accent: ${colors.accent};
    --color-green: ${colors.green};
    --color-white: ${colors.white};
    
    --color-gray-light: ${colors.grayLight};
    --color-gray-medium: ${colors.grayMedium};
    --color-gray-dark: ${colors.grayDark};
    
    --color-success: ${colors.success};
    --color-error: ${colors.error};
    --color-warning: ${colors.warning};
    --color-info: ${colors.info};
    
    --color-text-primary: ${colors.textPrimary};
    --color-text-secondary: ${colors.textSecondary};
    --color-text-disabled: ${colors.textDisabled};
    --color-text-inverse: ${colors.textInverse};
    
    --color-bg-primary: ${colors.bgPrimary};
    --color-bg-secondary: ${colors.bgSecondary};
    --color-bg-dark: ${colors.bgDark};
    --color-bg-green-tint: ${colors.bgGreenTint};
    
    --color-border-light: ${colors.borderLight};
    --color-border-medium: ${colors.borderMedium};
    --color-border-accent: ${colors.borderAccent};
    
    --color-green-hover: ${computed.greenHover};
    --color-green-active: ${computed.greenActive};
    --color-green-disabled: ${computed.greenDisabled};
  `.trim();
}

/**
 * Helper function to inject CSS variables into a style element
 */
export function injectThemeCSS(): void {
  const styleId = 'privateapply-theme';
  
  // Remove existing theme if present
  document.getElementById(styleId)?.remove();
  
  // Inject new theme
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `:root { ${getCSSVariables()} }`;
  document.head.appendChild(style);
}

/**
 * Typography
 */
export const typography = {
  fontFamily: "'Hind Vadodara', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSizes: {
    xs: '11px',
    sm: '12px',
    base: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '24px',
    '3xl': '28px',
  },
} as const;

/**
 * Spacing
 */
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
} as const;

/**
 * Border radius
 */
export const borderRadius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;
