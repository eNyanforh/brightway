
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";

import App from "./App";
import { theme } from "./styles/theme";
import { GlobalStyles } from "./styles/GlobalStyles";

/**
 * ThemeProvider makes our design tokens
 * accessible to every styled component.
 *
 * BrowserRouter enables client-side routing.
 */
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyles />

      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
