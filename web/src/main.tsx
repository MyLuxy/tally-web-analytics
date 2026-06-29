import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Fonts are bundled and self-hosted on purpose -- a privacy tool shouldn't make
// every visitor's browser phone home to a font CDN just to render the dashboard.
import "@fontsource-variable/space-grotesk";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

import "./styles.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
