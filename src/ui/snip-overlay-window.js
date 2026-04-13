class SnipOverlayWindowUI {
  constructor() {
    this.root = document.getElementById('snipRoot');
    this.selectionEl = null;
    this.captureHidden = false;
    this.activeSessionId = null;
    this.displayBounds = { width: 0, height: 0 };
    this.isDragging = false;
    this.dragPointerId = null;
    this.startPoint = null;
    this.currentRect = null;
    this.boundHandlers = {};
    this.setupDom();
    this.bindEvents();
  }

  setupDom() {
    if (!this.root) {
      return;
    }

    this.root.classList.add('snip-overlay-root');

    this.selectionEl = document.createElement('div');
    this.selectionEl.className = 'snip-selection';
    this.selectionEl.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.selectionEl);
  }

  bindEvents() {
    if (!this.root || !window.electronAPI) {
      return;
    }

    this.boundHandlers.pointerdown = (event) => this.handlePointerDown(event);
    this.boundHandlers.pointermove = (event) => this.handlePointerMove(event);
    this.boundHandlers.pointerup = (event) => this.handlePointerUp(event);
    this.boundHandlers.pointercancel = (event) => this.handlePointerCancel(event);
    this.boundHandlers.keydown = (event) => this.handleKeyDown(event);

    this.root.addEventListener('pointerdown', this.boundHandlers.pointerdown);
    window.addEventListener('pointermove', this.boundHandlers.pointermove);
    window.addEventListener('pointerup', this.boundHandlers.pointerup);
    window.addEventListener('pointercancel', this.boundHandlers.pointercancel);
    window.addEventListener('keydown', this.boundHandlers.keydown);

    window.electronAPI.onSnipCaptureState((event, payload = {}) => {
      if (payload.phase === 'prepare-to-capture') {
        if (!this.activeSessionId || payload.sessionId === this.activeSessionId) {
          this.hideForCapture(payload);
        }
      } else if (payload.phase === 'started') {
        this.activeSessionId = payload.sessionId || null;
        this.displayBounds = payload.bounds || this.displayBounds;
        this.resetSelection();
        this.showOverlay();
      } else if (payload.phase === 'cancelled') {
        this.activeSessionId = null;
        this.resetSelection();
        this.showOverlay();
      }
    });
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  normalizeRect(startPoint, endPoint) {
    if (!startPoint || !endPoint) {
      return null;
    }

    const left = Math.min(startPoint.x, endPoint.x);
    const top = Math.min(startPoint.y, endPoint.y);
    const right = Math.max(startPoint.x, endPoint.x);
    const bottom = Math.max(startPoint.y, endPoint.y);

    const width = Math.max(1, Math.round(right - left));
    const height = Math.max(1, Math.round(bottom - top));
    const boundedLeft = Math.round(this.clamp(left, 0, Math.max(0, (this.displayBounds.width || 0) - 1)));
    const boundedTop = Math.round(this.clamp(top, 0, Math.max(0, (this.displayBounds.height || 0) - 1)));

    return {
      x: boundedLeft,
      y: boundedTop,
      width: Math.max(1, Math.min(width, Math.max(1, (this.displayBounds.width || width) - boundedLeft))),
      height: Math.max(1, Math.min(height, Math.max(1, (this.displayBounds.height || height) - boundedTop)))
    };
  }

  getPointFromEvent(event) {
    const rect = this.root.getBoundingClientRect();
    return {
      x: this.clamp(event.clientX - rect.left, 0, Math.max(0, rect.width)),
      y: this.clamp(event.clientY - rect.top, 0, Math.max(0, rect.height))
    };
  }

  resetSelection() {
    this.isDragging = false;
    this.dragPointerId = null;
    this.startPoint = null;
    this.currentRect = null;

    if (this.selectionEl) {
      this.selectionEl.style.display = 'none';
      this.selectionEl.style.left = '0px';
      this.selectionEl.style.top = '0px';
      this.selectionEl.style.width = '0px';
      this.selectionEl.style.height = '0px';
    }
  }

  renderSelection(rect) {
    if (!this.selectionEl || !rect) {
      return;
    }

    this.selectionEl.style.display = 'block';
    this.selectionEl.style.left = `${rect.x}px`;
    this.selectionEl.style.top = `${rect.y}px`;
    this.selectionEl.style.width = `${rect.width}px`;
    this.selectionEl.style.height = `${rect.height}px`;
  }

  async requestCancel() {
    this.resetSelection();
    try {
      await window.electronAPI.cancelSnipCapture();
    } catch (error) {
      console.error('Failed to cancel snip capture', error);
    }
  }

  handlePointerDown(event) {
    if (!this.activeSessionId || this.captureHidden || event.button !== 0) {
      return;
    }

    this.isDragging = true;
    this.dragPointerId = event.pointerId;
    this.startPoint = this.getPointFromEvent(event);
    this.currentRect = this.normalizeRect(this.startPoint, this.startPoint);
    this.renderSelection(this.currentRect);

    if (this.root.setPointerCapture) {
      try {
        this.root.setPointerCapture(event.pointerId);
      } catch (error) {
        console.error('Failed to capture pointer for snip overlay', error);
      }
    }

    event.preventDefault();
  }

  handlePointerMove(event) {
    if (!this.isDragging || event.pointerId !== this.dragPointerId) {
      return;
    }

    const point = this.getPointFromEvent(event);
    this.currentRect = this.normalizeRect(this.startPoint, point);
    this.renderSelection(this.currentRect);
    event.preventDefault();
  }

  async handlePointerUp(event) {
    if (!this.isDragging || event.pointerId !== this.dragPointerId) {
      return;
    }

    const rect = this.currentRect || this.normalizeRect(this.startPoint, this.getPointFromEvent(event));
    this.isDragging = false;
    this.dragPointerId = null;

    if (this.root.releasePointerCapture) {
      try {
        this.root.releasePointerCapture(event.pointerId);
      } catch (error) {
        console.error('Failed to release pointer for snip overlay', error);
      }
    }

    if (!rect) {
      await this.requestCancel();
      return;
    }

    this.renderSelection(rect);

    try {
      await window.electronAPI.submitSnipSelection({
        area: rect,
        sessionId: this.activeSessionId
      });
    } catch (error) {
      console.error('Failed to submit snip selection', error);
    }
  }

  handlePointerCancel(event) {
    if (!this.isDragging || event.pointerId !== this.dragPointerId) {
      return;
    }

    this.requestCancel();
  }

  handleKeyDown(event) {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    this.requestCancel();
  }

  hideForCapture(payload = {}) {
    this.captureHidden = true;
    this.resetSelection();
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
