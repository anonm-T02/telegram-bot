import { init, retrieveRawInitData } from "@telegram-apps/sdk";

export function initTelegram(): void {
  try {
    init();
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
  } catch (error) {
    console.warn("Telegram SDK is unavailable in this browser context.", error);
  }
}

export function getTelegramInitData(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const sdkInitData = retrieveRawInitData();
    if (sdkInitData) return sdkInitData;
  } catch {
    // Fall back to the legacy Telegram WebApp bridge below.
  }

  const initData = window.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 0 ? initData : null;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}
