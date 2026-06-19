import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

const ERROR_LOG_WINDOW_WIDTH = 480;
const ERROR_LOG_WINDOW_MIN_HEIGHT = 0;
const ERROR_LOG_WINDOW_MAX_HEIGHT = 600;
const ERROR_LOG_WINDOW_HEIGHT_PADDING = 16;

function parseErrorsFromHash(hash: string): string[] {
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return [];
  }

  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const errorsParam = params.get("errors");
  if (!errorsParam) {
    return [];
  }

  try {
    const parsed = JSON.parse(errorsParam);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function ErrorLogWindow() {
  const [errors, setErrors] = useState<string[]>(() => parseErrorsFromHash(window.location.hash));
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);
  const titleRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleHashChange(): void {
      setErrors(parseErrorsFromHash(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const title = titleRef.current;
    const list = listRef.current;
    if (!title || !list) {
      return;
    }
    const titleElement = title;
    const listElement = list;

    // `.error-log-list` has `flex: none`, so its height is not stretched by the flex parent.
    // However, its `scrollHeight` still equals `clientHeight` when content is shorter — sum child heights instead.
    let listContentHeight = 0;
    for (const child of listElement.children) {
      listContentHeight += (child as HTMLElement).offsetHeight;
    }
    const contentHeight = titleElement.offsetHeight + listContentHeight + ERROR_LOG_WINDOW_HEIGHT_PADDING;
    const contentWindowHeight = Math.min(
      Math.max(contentHeight, ERROR_LOG_WINDOW_MIN_HEIGHT),
      ERROR_LOG_WINDOW_MAX_HEIGHT
    );
    const nextListMaxHeight =
      contentHeight > ERROR_LOG_WINDOW_MAX_HEIGHT
        ? ERROR_LOG_WINDOW_MAX_HEIGHT - titleElement.offsetHeight - ERROR_LOG_WINDOW_HEIGHT_PADDING
        : null;

    setListMaxHeight(nextListMaxHeight);
    void getCurrentWindow().setSize(new LogicalSize(ERROR_LOG_WINDOW_WIDTH, contentWindowHeight));
  }, [errors]);

  return (
    <div className="error-log-shell">
      <header className="title-bar" ref={titleRef}>
        <span className="account-name">当前错误</span>
      </header>
      <div
        className="info-list error-log-list"
        ref={listRef}
        style={{
          maxHeight: listMaxHeight ?? undefined,
          overflowY: listMaxHeight === null ? "visible" : "auto"
        }}
      >
        {errors.length === 0 ? (
          <div className="error-log-empty muted">当前没有错误。</div>
        ) : (
          errors.map((message, index) => (
            <div className="error-banner error-log-item" key={index}>
              {message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
