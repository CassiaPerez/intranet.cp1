// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Add error boundary for development
if (import.meta.env.DEV) {
  window.addEventListener('error', (event) => {
    console.error('[REACT] Global error:', event.error);
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[REACT] Unhandled promise rejection:', event.reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
