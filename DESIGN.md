---
name: Private Apply
description: Privacy-first on-device job application assistant
colors:
  text-primary: "var(--text-900)"
  text-muted: "var(--text-600)"
  bg-base: "var(--background-50)"
  bg-surface: "var(--background-100)"
  border: "var(--background-200)"
  primary: "var(--primary-600)"
  primary-hover: "var(--primary-700)"
  secondary: "var(--secondary-600)"
  accent: "var(--accent-600)"
typography:
  fontFamily:
    heading: "'Hind Vadodara', sans-serif"
    body: "'Hind Vadodara', sans-serif"
  fontWeight:
    normal: 400
    bold: 700
  fontSize:
    sm: "0.618rem"
    base: "1rem"
    xl: "1.618rem"
    "2xl": "2.618rem"
    "3xl": "4.236rem"
    "4xl": "6.854rem"
    "5xl": "11.090rem"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "var(--primary-600)"
    textColor: "var(--background-50)"
    rounded: "8px"
    padding: "10px 16px"
  card:
    backgroundColor: "var(--background-100)"
    borderColor: "var(--background-200)"
    rounded: "8px"
    padding: "12px 14px"
  input:
    backgroundColor: "var(--background-50)"
    borderColor: "var(--background-200)"
    textColor: "var(--text-900)"
    rounded: "6px"
    padding: "8px 12px"
---

# Design System: Private Apply (Realtime Olive & Sage)

## Overview

**Creative North Star: "The Olive Atelier"**

Private Apply is designed with an organic, high-clarity earthy palette grounded in nature and computational precision. Drawn directly from the **Realtime Colors** palette and a mathematical **Golden Ratio modular typographic scale ($\phi \approx 1.618$)**, the interface projects confidence, serenity, and complete user sovereignty.

The design eliminates artificial AI neon glows and corporate enterprise blues. Instead, it pairs soft sage creams (`#f3f5f0`), muted moss greens (`#8c9867`), and deep olive charcoals (`#1d1f14` / `#0e0f0a`) with the clean, modern geometric curves of **Hind Vadodara**.

**Key Characteristics:**
- **Golden Ratio Typography:** Typographic sizes scale along the divine proportion ($\phi = 1.618$): `0.618rem` (sm), `1.0rem` (base), `1.618rem` (xl), `2.618rem` (2xl), `4.236rem` (3xl), `6.854rem` (4xl), and `11.090rem` (5xl).
- **Single Typeface Harmony:** **Hind Vadodara** across headings, metrics, and body text with weights 400 (normal) and 700 (bold), delivering rhythmic unity and effortless legibility.
- **Earthy 11-Step Tonal Scales:** Curated 50–950 ramps for `text`, `background`, `primary`, `secondary`, and `accent`.
- **Symmetric Dark Mode Architecture:** Clean inverted luminosity mapping that transforms soft sage cream into a deep, velvety forest nightscape without losing tonal contrast.

---

## Colors

### Tonal Scales (Light Mode)

```css
:root {
  /* Text */
  --text-50: #f4f5f0;
  --text-100: #e9ebe0;
  --text-200: #d2d6c2;
  --text-300: #bcc2a3;
  --text-400: #a5ad85;
  --text-500: #8f9966;
  --text-600: #727a52;
  --text-700: #565c3d;
  --text-800: #393d29;
  --text-900: #1d1f14;
  --text-950: #0e0f0a;

  /* Background */
  --background-50: #f3f5f0;
  --background-100: #e7ebe0;
  --background-200: #cfd6c2;
  --background-300: #b8c2a3;
  --background-400: #a0ad85;
  --background-500: #889966;
  --background-600: #6d7a52;
  --background-700: #525c3d;
  --background-800: #363d29;
  --background-900: #1b1f14;
  --background-950: #0e0f0a;

  /* Primary (Moss / Olive) */
  --primary-50: #f3f5f0;
  --primary-100: #e8eae1;
  --primary-200: #d1d6c2;
  --primary-300: #bac1a4;
  --primary-400: #a3ac86;
  --primary-500: #8c9867;
  --primary-600: #707953;
  --primary-700: #545b3e;
  --primary-800: #383d29;
  --primary-900: #1c1e15;
  --primary-950: #0e0f0a;

  /* Secondary (Sage Forest) */
  --secondary-50: #f1f5f0;
  --secondary-100: #e4eae1;
  --secondary-200: #c8d6c2;
  --secondary-300: #adc1a4;
  --secondary-400: #91ac86;
  --secondary-500: #769867;
  --secondary-600: #5e7953;
  --secondary-700: #475b3e;
  --secondary-800: #2f3d29;
  --secondary-900: #181e15;
  --secondary-950: #0c0f0a;

  /* Accent (Fresh Leaf Sage) */
  --accent-50: #f1f5f0;
  --accent-100: #e2eae1;
  --accent-200: #c6d6c2;
  --accent-300: #a9c1a4;
  --accent-400: #8cac86;
  --accent-500: #6f9867;
  --accent-600: #597953;
  --accent-700: #435b3e;
  --accent-800: #2d3d29;
  --accent-900: #161e15;
  --accent-950: #0b0f0a;
}
```

### Dark Mode Ramps (`.dark` / `html.dark`)

In dark mode, values invert systematically to maintain visual hierarchy:
- High-level text shifts to `--text-900` (`#e9ebe0`) and `--text-950` (`#f4f5f0`).
- Canvas backgrounds shift to deep charcoal-olive grounds `--background-50` (`#0e0f0a`) and elevated cards `--background-100` (`#1b1f14`).
- Accent and primary buttons leverage mid-scale moss greens (`#8c9867` / `#a3ac86`) for soft luminous focus.

---

## Typography

**Font Family:** `Hind Vadodara`, system-ui, -apple-system, sans-serif  
**Weights:** `400` (Normal), `700` (Bold)

### Golden Ratio Scale ($\phi \approx 1.618$)

| Token | Value (rem) | Equivalent (px) | Application |
|---|---|---|---|
| `sm` | `0.618rem` | ~9.88px | Micro badges, status pills, keyboard hints |
| `base` | `1.000rem` | 16.00px | Standard body copy, inputs, table cells |
| `xl` | `1.618rem` | ~25.88px | Section anchors, modal headers, major stats |
| `2xl` | `2.618rem` | ~41.88px | Page titles, key metric numbers |
| `3xl` | `4.236rem` | ~67.78px | Hero figures, dashboard summary displays |
| `4xl` | `6.854rem` | ~109.66px | Large editorial display elements |
| `5xl` | `11.090rem` | ~177.44px | Ambient typographic watermarks |

---

## Tailwind Configuration Mapping

```javascript
module.exports = {
  theme: {
    extend: {
      fontSize: {
        sm: '0.618rem',
        base: '1rem',
        xl: '1.618rem',
        '2xl': '2.618rem',
        '3xl': '4.236rem',
        '4xl': '6.854rem',
        '5xl': '11.090rem',
      },
      fontFamily: {
        heading: ['Hind Vadodara', 'sans-serif'],
        body: ['Hind Vadodara', 'sans-serif'],
      },
      fontWeight: {
        normal: '400',
        bold: '700',
      },
      colors: {
        text: {
          50: 'var(--text-50)',
          100: 'var(--text-100)',
          200: 'var(--text-200)',
          300: 'var(--text-300)',
          400: 'var(--text-400)',
          500: 'var(--text-500)',
          600: 'var(--text-600)',
          700: 'var(--text-700)',
          800: 'var(--text-800)',
          900: 'var(--text-900)',
          950: 'var(--text-950)',
        },
        background: {
          50: 'var(--background-50)',
          100: 'var(--background-100)',
          200: 'var(--background-200)',
          300: 'var(--background-300)',
          400: 'var(--background-400)',
          500: 'var(--background-500)',
          600: 'var(--background-600)',
          700: 'var(--background-700)',
          800: 'var(--background-800)',
          900: 'var(--background-900)',
          950: 'var(--background-950)',
        },
        primary: {
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
          950: 'var(--primary-950)',
        },
        secondary: {
          50: 'var(--secondary-50)',
          100: 'var(--secondary-100)',
          200: 'var(--secondary-200)',
          300: 'var(--secondary-300)',
          400: 'var(--secondary-400)',
          500: 'var(--secondary-500)',
          600: 'var(--secondary-600)',
          700: 'var(--secondary-700)',
          800: 'var(--secondary-800)',
          900: 'var(--secondary-900)',
          950: 'var(--secondary-950)',
        },
        accent: {
          50: 'var(--accent-50)',
          100: 'var(--accent-100)',
          200: 'var(--accent-200)',
          300: 'var(--accent-300)',
          400: 'var(--accent-400)',
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
          700: 'var(--accent-700)',
          800: 'var(--accent-800)',
          900: 'var(--accent-900)',
          950: 'var(--accent-950)',
        },
      },
    },
  },
};
```
