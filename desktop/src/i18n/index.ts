import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN.json";

// 默认且当前唯一语言。后续新增语言时：
// 1. 在 ./locales 下新增对应 json（key 与 zh-CN.json 保持一致）。
// 2. 在 resources 中注册该语言。
// 3. （可选）实现语言切换入口，调用 i18n.changeLanguage(lng)。
export const DEFAULT_LANGUAGE = "zh-CN";

export const resources = {
  "zh-CN": { translation: zhCN }
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    // React 已对插值做转义，关闭 i18next 的二次转义。
    escapeValue: false
  }
});

export default i18n;
