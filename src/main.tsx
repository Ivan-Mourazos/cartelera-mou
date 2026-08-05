import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { branding } from "./app/branding";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/features.css";

const rootElement = document.getElementById("root");

document.title = branding.productName;

if (!rootElement) {
  throw new Error("No se encontró el elemento raíz de la aplicación.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
