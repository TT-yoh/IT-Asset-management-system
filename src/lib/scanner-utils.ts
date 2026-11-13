/**
 * Safely stop a camera QR scanner instance (html5-qrcode).
 *
 * The library's stop() throws synchronously, not via its promise, when the
 * camera never started (no camera, permission denied, or the modal closed
 * before start-up finished). An uncaught throw inside a React effect cleanup
 * takes down the surrounding view, so every stop goes through here.
 */
interface StoppableScanner {
  stop: () => Promise<unknown>;
  clear: () => unknown;
}

export function safeStopScanner(instance: StoppableScanner | null | undefined, onStopped?: () => void): void {
  const finish = () => {
    try {
      instance?.clear();
    } catch {
      // Nothing was rendered to clear.
    }
    onStopped?.();
  };

  if (!instance) {
    onStopped?.();
    return;
  }

  try {
    Promise.resolve(instance.stop()).catch(() => undefined).finally(finish);
  } catch {
    finish();
  }
}
