import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// self-hosted fonts, a privacy tool shouldn't make visitors phone home to a font cdn. plex mono just for numbers so counts stay aligned
import "@fontsource-variable/inter";
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
