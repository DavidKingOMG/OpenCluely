(function () {
  const content = document.getElementById('diagContent');
  const refreshBtn = document.getElementById('refreshBtn');
  const closeBtn = document.getElementById('closeBtn');

  const render = (data) => {
    if (!content) return;
    const now = new Date().toLocaleTimeString();
    content.textContent = `[${now}] STT Diagnostics\n\n${JSON.stringify(data, null, 2)}`;
  };

  const renderError = (error) => {
    if (!content) return;
    const now = new Date().toLocaleTimeString();
    content.textContent = `[${now}] Failed to load diagnostics\n\n${error?.message || String(error)}`;
  };

  const load = async () => {
    try {
      if (!window.electronAPI?.getSTTDiagnostics) {
        throw new Error('STT diagnostics API unavailable');
      }
      const diagnostics = await window.electronAPI.getSTTDiagnostics();
      render(diagnostics);
    } catch (error) {
      renderError(error);
    }
  };

  refreshBtn?.addEventListener('click', load);
  closeBtn?.addEventListener('click', () => {
    window.electronAPI?.closeSTTDiagnostics?.();
  });

  if (window.electronAPI?.onSpeechStatus) {
    window.electronAPI.onSpeechStatus(() => {
      load();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      window.electronAPI?.closeSTTDiagnostics?.();
    }
  });

  load();
})();
