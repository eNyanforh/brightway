import { createGlobalStyle } from "styled-components";

export const GlobalStyles = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :root {
    --bw-primary: ${({ theme }) => theme.colors.primary};
    --bw-primary-hover: ${({ theme }) => theme.colors.primaryHover};
    --bw-selected: ${({ theme }) => theme.colors.primaryLight};
    --bw-ink: ${({ theme }) => theme.colors.text};
    --bw-muted: ${({ theme }) => theme.colors.textMuted};
    --bw-line: ${({ theme }) => theme.colors.border};
    --bw-surface: ${({ theme }) => theme.colors.surface};
    --bw-subtle: ${({ theme }) => theme.colors.background};
    --bw-space-1: 4px;
    --bw-space-2: 8px;
    --bw-space-3: 12px;
    --bw-space-4: 16px;
    --bw-space-6: 24px;
    --bw-radius: 8px;
    --bw-target: 44px;
    --bw-page-title: clamp(24px, 2.5vw, 32px);
    --bw-section-title: 20px;
    --bw-caption: 13px;
    color-scheme: light;
  }

  html {
    font-family: "Inter Variable", Inter, ui-sans-serif, system-ui,
      -apple-system, "Segoe UI", sans-serif;
  }

  body {
    margin: 0;
    min-width: 320px;
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    line-height: 1.5;
  }

  .bw-app-shell {
    font-family: "Inter Variable", Inter, ui-sans-serif, system-ui,
      -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.55;
  }

  .bw-app-shell .bw-design-header,
  .bw-app-shell .bw-design-sidebar {
    font-family: inherit;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }
`;