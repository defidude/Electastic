import "leaflet/dist/leaflet.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "./components/Toast";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
