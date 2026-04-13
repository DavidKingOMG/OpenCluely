class SnipOverlayWindowUI {
  constructor() {
    this.root = document.getElementById('snipRoot');
    this.captureHidden = false;
    this.bindEvents();
  }

  bindEvents() {
    if (!this.root || !window.electronAPI) {
      return;
    }

    window.electronAPI.onSnipCaptureState((event, payload = {}) => {
      if (payload.phase === 'prepare-to-capture') {
        this.hideForCapture(payload);
      } else if (payload.phase === 'started') {
        this.showOverlay();
      } else if (payload.phase === 'cancelled') {
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
