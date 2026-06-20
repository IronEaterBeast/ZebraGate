import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorLogWindow } from "./ErrorLogWindow";
import { GroupManagementWindow } from "./GroupManagementWindow";
import "./i18n";
import "./styles.css";

// 启动耗时打点：performance.now() 以本页文档开始加载为 0。
// 这里的数值 = WebView2 拿到 HTML 后，到本入口模块真正执行所花的时间，
// 主要反映 Vite 按需转译 / 拉取模块的开销（与 Rust 端 [startup] 日志互补）。
console.log(`[startup-fe] main.tsx module executing: ${performance.now().toFixed(0)} ms since document load`);

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

console.log(`[startup-fe] React render() called: ${performance.now().toFixed(0)} ms since document load`);
