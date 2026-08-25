/**
 * Telegram Mini Apps SDK bootstrap.
 *
 * Runs a no-op outside of Telegram (e.g. plain browser during local dev)
 * so the skeleton is easy to preview without a Telegram client.
 */
export function initTelegram(): void {
  const isInsideTelegram = typeof window !== "undefined" && Boolean(window.Telegram?.WebApp);

  if (!isInsideTelegram) {
    console.warn("Not running inside Telegram — skipping Telegram SDK init.");
    return;
  }

  import("@telegram-apps/sdk")
    .then(({ init }) => {
      init();
    })
    .catch((error) => {
      console.error("Failed to initialize Telegram SDK:", error);
    });
}

declare global {
  interface Window {
    Telegram?: { WebApp?: unknown };
  }
}
