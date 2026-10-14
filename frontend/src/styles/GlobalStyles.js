import { createGlobalStyle } from "styled-components";

export const GlobalStyles = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
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
  button:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 3px;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }
`;