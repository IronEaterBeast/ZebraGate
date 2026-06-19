import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorLogWindow } from "./ErrorLogWindow";
import { GroupManagementWindow } from "./GroupManagementWindow";
import "./styles.css";

const isGroupManagementWindow = window.location.hash.startsWith("#/group-management");
const isErrorLogWindow = window.location.hash.startsWith("#/error-log");

function renderApp() {
  if (isGroupManagementWindow) {
    return <GroupManagementWindow />;
  }
  if (isErrorLogWindow) {
    return <ErrorLogWindow />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{renderApp()}</React.StrictMode>
);
