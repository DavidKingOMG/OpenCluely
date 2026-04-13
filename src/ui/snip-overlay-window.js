class SnipOverlayWindowUI {
  constructor() {
    this.root = document.getElementById('snipRoot');
    this.captureHidden = false;
    this.activeSessionId = null;
    this.bindEvents();
  }

  bindEvents() {
    if (!this.root || !window.electronAPI) {
      return;
    }

    window.electronAPI.onSnipCaptureState((event, payload = {}) => {
      if (payload.phase === 'prepare-to-capture') {
        if (!this.activeSessionId || payload.sessionId === this.activeSessionId) {
          this.hideForCapture(payload);
        }
      } else if (payload.phase === 'started') {
        this.activeSessionId = payload.sessionId || null;
        this.showOverlay();
      } else if (payload.phase === 'cancelled') {
        this.activeSessionId = null;
        this.showOverlay();
      }
    });
  }

  hideForCapture(payload = {}) {
    this.captureHidden = true;
    this.root.style.display = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.electronAPI.notifySnipOverlayHidden({
          sessionId: payload.sessionId,
          displayId: payload.displayId
        });
      });
    });
  }

  showOverlay() {
    this.captureHidden = false;
    this.root.style.display = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.snipOverlayWindowUI = new SnipOverlayWindowUI();
});
