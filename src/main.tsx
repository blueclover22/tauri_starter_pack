import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import "@/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("root element를 찾을 수 없습니다.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
