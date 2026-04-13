class SnipOverlayWindowUI {
  constructor() {
    this.root = document.getElementById('snipRoot');
    this.startPoint = null;
    this.currentRect = null;
    this.bindEvents();
  }

  bindEvents() {
    if (!this.root) {
      return;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.snipOverlayWindowUI = new SnipOverlayWindowUI();
});
