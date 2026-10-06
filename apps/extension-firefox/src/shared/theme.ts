/**
 * Offlyn Apply Design System - Color Theme
 * 
 * Centralized color constants for consistent branding across all UI surfaces.
 * DO NOT use inline hex values - always import from this file.
 */

export const colors = {
  // Primary Brand Colors (Refined Pine / Forest Sage)
  accent: '#1E5E41',
  accentHover: '#164932',
  accentDark: '#34A873',
  green: '#1E5E41',
  greenDark: '#164932',
  white: '#FFFFFF',
  
  // Neutral Grays (Warm, human, anti-slop)
  grayLight: '#FAF9F6',
  grayMedium: '#E5E3DC',
  grayDark: '#52525B',
  charcoal: '#18181B',
  
  // Semantic Colors (Desaturated, balanced)
  success: '#1E5E41',
  error: '#B91C1C',
  warning: '#B45309',
  info: '#2D557A',
  
  // Status Colors (for dashboard)
  statusSubmitted: '#2D557A',
  statusInterviewing: '#B45309',
  statusRejected: '#B91C1C',
  statusAccepted: '#1E5E41',
  statusWithdrawn: '#71717A',
  
  // Text Colors
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  textDisabled: '#5C5953',
  textInverse: '#FAF9F6',
  
  // Background Colors
  bgPrimary: '#FFFFFF',
  bgSecondary: '#FAF9F6',
  bgDark: '#121214',
  bgSurfaceDark: '#18181B',
  bgGreenTint: '#EDF6F1',
  
  // Border Colors
  borderLight: '#E5E3DC',
  borderMedium: '#D3CFC5',
  borderAccent: '#1E5E41',
  borderDark: '#2B2B31',
} as const;

/**
 * Computed colors (derived from primary colors)
 */
export const computed = {
  greenHover: '#164932',
  greenActive: '#0F3624',
  greenDisabled: '#D3CFC5',
  
  navyLight: '#2D557A',
  navyDark: '#18181B',
  
  // Opacity variants
  accentAlpha10: 'rgba(30, 94, 65, 0.1)',
  accentAlpha15: 'rgba(30, 94, 65, 0.15)',
  accentAlpha20: 'rgba(30, 94, 65, 0.2)',
  accentAlpha30: 'rgba(30, 94, 65, 0.3)',
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
  const styleId = 'offlyn-apply-theme';
  
  // Remove existing theme if present
  document.getElementById(styleId)?.remove();
  
  // Inject new theme
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `:root { ${getCSSVariables()} }`;
  document.head.appendChild(style);
}

/**
 * Typography (optional - for consistency)
 */
export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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
 * Spacing (optional - for consistency)
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
 * Border radius (optional - for consistency)
 */
export const borderRadius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;
