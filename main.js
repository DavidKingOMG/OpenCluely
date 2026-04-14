const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { app, BrowserWindow, globalShortcut, session, ipcMain, screen } = require("electron");
const logger = require("./src/core/logger").createServiceLogger("MAIN");
const config = require("./src/core/config");

// Services
// Screen capture (image-based)
const captureService = require("./src/services/capture.service");
const speechService = require("./src/services/speech.service");
const llmService = require("./src/services/llm.service");

// Managers
const windowManager = require("./src/managers/window.manager");
const sessionManager = require("./src/managers/session.manager");

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.activeSkill = "general";
    this.activeSnipSession = null;
  // Default to C++ so language is enforced from first run
  this.codingLanguage = "cpp";
    this.overlaySurfaceOpacity = 0.82;
    this.speechAvailable = false;
    this.speechProvider = 'azure';
    this.whisperModel = process.env.WHISPER_MODEL || 'ggml-base.en.bin';
    this.whisperIntervalMs = Number(process.env.WHISPER_INTERVAL_MS || 2000);
    this.whisperAudioSource = process.env.WHISPER_AUDIO_SOURCE || 'microphone';
    this.whisperCaptureDevice = process.env.WHISPER_CAPTURE_DEVICE || 'auto';
    this.oauthCallbackServer = null;
    this.oauthCallbackServerReadyPromise = null;
    this.pendingCodexOAuth = null;
    this.codexCallbackPort = null;
    this._oauthRetriedWithEphemeral = false;
    this.llmLastModels = {};
    this.activeLlmRequest = null;
    this.activeLlmRequestSeq = 0;
    this.pendingTranscriptionLlmTimer = null;


    // Window configurations for reference
    this.windowConfigs = {
      main: { title: "OpenCluely" },
      chat: { title: "Chat" },
      llmResponse: { title: "AI Response" },
      settings: { title: "Settings" },
    };

    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get("stealth.disguiseProcess")) {
      process.title = config.get("app.processTitle");
    }

    // Set default stealth app name early
    app.setName("Terminal"); // Default to Terminal stealth mode
    process.title = "Terminal";


    if (
      process.platform === "darwin" &&
      config.get("stealth.noAttachConsole")
    ) {
      process.env.ELECTRON_NO_ATTACH_CONSOLE = "1";
      process.env.ELECTRON_NO_ASAR = "1";
    }
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on("window-all-closed", () => this.onWindowAllClosed());
    app.on("activate", () => this.onActivate());
    app.on("will-quit", () => this.onWillQuit());

    this.setupIPCHandlers();
    this.setupServiceEventHandlers();
  }

  async onAppReady() {
    // Force stealth mode IMMEDIATELY when app is ready
    app.setName("Terminal");
    process.title = "Terminal";


    logger.info("Application starting", {
      version: config.get("app.version"),
      environment: config.get("app.isDevelopment")
        ? "development"
        : "production",
      platform: process.platform,
    });

    try {
      this.loadPersistedSettings();
      await this.applySpeechProvider(this.speechProvider);
      this.setupPermissions();
      this.setupNetworkConfiguration();

      // Small delay to ensure desktop/space detection is accurate
      await new Promise((resolve) => setTimeout(resolve, 200));

      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();
      this.broadcastOverlayOpacity();


      // Initialize default stealth mode with terminal icon
      this.updateAppIcon("terminal");

      this.isReady = true;

      logger.info("Application initialized successfully", {
        windowCount: Object.keys(windowManager.getWindowStats().windows).length,
        currentDesktop: "detected",
      });

      sessionManager.addEvent("Application started");
      this.promptForLlmSetupIfNeeded();
    } catch (error) {
      logger.error("Application initialization failed", {
        error: error.message,
      });
      app.quit();
    }
  }

  setupNetworkConfiguration() {
    // Configure session to handle network requests better
    const ses = session.defaultSession;
    
    const llmHosts = new Set(['generativelanguage.googleapis.com', 'api.openai.com', 'api.anthropic.com']);

    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const hostname = new URL(details.url).hostname;
        if (llmHosts.has(hostname)) {
          details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.156 Safari/537.36';
        }
      } catch (_) {}
      callback({ requestHeaders: details.requestHeaders });
    });

    // Keep default TLS verification; forcing cert outcomes causes intermittent SSL failures.
    ses.setCertificateVerifyProc((request, callback) => {
      callback(-3);
    });

    logger.debug('Network configuration applied for LLM providers');
  }

  setupPermissions() {
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const allowedPermissions = ["microphone", "camera", "display-capture"];
        const granted = allowedPermissions.includes(permission);

        logger.debug("Permission request", { permission, granted });
        callback(granted);
      }
    );
  }

  setupGlobalShortcuts() {
    const shortcuts = {
      "CommandOrControl+Shift+S": () => this.startSnipCapture(),
      "CommandOrControl+Shift+V": () => windowManager.toggleVisibility(),
      "CommandOrControl+Shift+I": () => windowManager.toggleInteraction(),
      "CommandOrControl+Shift+C": () => windowManager.switchToWindow("chat"),
      "CommandOrControl+Shift+X": () => this.cancelActivePrompt(),
      "CommandOrControl+Shift+\\": () => this.clearSessionMemory(),
      "CommandOrControl+,": () => windowManager.showSettings(),
      "Alt+A": () => windowManager.toggleInteraction(),
      "Alt+R": () => this.toggleSpeechRecognition(),
      "CommandOrControl+Shift+T": () => windowManager.forceAlwaysOnTopForAllWindows(),
      "CommandOrControl+Shift+Alt+T": () => {
        const results = windowManager.testAlwaysOnTopForAllWindows();
        logger.info('Always-on-top test triggered via shortcut', results);
      },
      // Context-sensitive shortcuts based on interaction mode
      "CommandOrControl+Up": () => this.handleUpArrow(),
      "CommandOrControl+Down": () => this.handleDownArrow(),
      "CommandOrControl+Left": () => this.handleLeftArrow(),
      "CommandOrControl+Right": () => this.handleRightArrow(),
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.debug("Global shortcut registered", { accelerator, success });
    });
  }

  setupServiceEventHandlers() {
    speechService.on("recording-started", () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-started");
      });
    });

    speechService.on("recording-stopped", () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-stopped");
      });
    });

    speechService.on("transcription", (text) => {      
      // Add transcription to session memory
      sessionManager.addUserInput(text, 'speech');
      
      const windows = BrowserWindow.getAllWindows();
      
      windows.forEach((window) => {
        window.webContents.send("transcription-received", { text });
      });
      
      // Automatically process transcription with LLM for intelligent response
      if (this.pendingTranscriptionLlmTimer) {
        clearTimeout(this.pendingTranscriptionLlmTimer);
      }

      this.pendingTranscriptionLlmTimer = setTimeout(async () => {
        this.pendingTranscriptionLlmTimer = null;
        try {
          const sessionHistory = sessionManager.getOptimizedHistory();
          await this.processTranscriptionWithLLM(text, sessionHistory);
        } catch (error) {
          logger.error("Failed to process transcription with LLM", {
            error: error.message,
            text: text.substring(0, 100)
          });
        }
      }, 500);
    });

    speechService.on("interim-transcription", (text) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("interim-transcription", { text });
      });
    });

    speechService.on("status", (status) => {
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-status", { status, available: this.speechAvailable });
      });
      // Also broadcast availability specifically
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-availability", { available: this.speechAvailable });
      });
    });

    speechService.on("error", (error) => {
      // In error, still compute availability
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-error", { error, available: this.speechAvailable });
      });
    });
  }

  setupIPCHandlers() {
  ipcMain.handle("get-available-skills", () => {
      try {
        const { promptLoader } = require("./prompt-loader");
        return promptLoader.getAvailableSkills();
      } catch (error) {
        logger.error("Failed to get available skills", { error: error.message });
        return ["general", "dsa", "programming"];
      }
  });
  ipcMain.handle("take-screenshot", () => this.startSnipCapture());
  ipcMain.handle("take-full-screenshot", () => this.triggerScreenshotOCR());
  ipcMain.handle("start-snip-capture", () => this.startSnipCapture());
  ipcMain.handle("submit-snip-selection", (event, payload) => this.submitSnipSelection(payload));
  ipcMain.handle("cancel-snip-capture", () => this.cancelSnipCapture());
  ipcMain.handle("list-displays", () => captureService.listDisplays());
  ipcMain.handle("capture-area", (event, options) => captureService.captureAndProcess(options));
    
    // Provide reliable clipboard write via main process
    ipcMain.handle("copy-to-clipboard", (event, text) => {
      try {
        const { clipboard } = require("electron");
        clipboard.writeText(String(text ?? ""));
        return true;
      } catch (e) {
        logger.error("Failed to write to clipboard", { error: e.message });
        return false;
      }
    });
    
    ipcMain.handle("get-speech-availability", () => {
      return speechService.isAvailable ? speechService.isAvailable() : false;
    });

    ipcMain.handle("start-speech-recognition", () => {
      speechService.startRecording();
      return speechService.getStatus();
    });

    ipcMain.handle("stop-speech-recognition", () => {
      speechService.stopRecording();
      return speechService.getStatus();
    });

    // Also handle direct send events for fallback
    ipcMain.on("start-speech-recognition", () => {
      speechService.startRecording();
    });

    ipcMain.on("stop-speech-recognition", () => {
      speechService.stopRecording();
    });



    ipcMain.handle("show-all-windows", () => {
      windowManager.showAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("hide-all-windows", () => {
      windowManager.hideAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("enable-window-interaction", () => {
      windowManager.setInteractive(true);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("disable-window-interaction", () => {
      windowManager.setInteractive(false);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-chat", () => {
      windowManager.switchToWindow("chat");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-skills", () => {
      windowManager.switchToWindow("skills");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("resize-window", (event, { width, height }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        // Enforce horizontal constraints: min ~one icon, max original width
        const minW = 60;
        const maxW = windowManager.windowConfigs?.main?.width || 520;
        const clampedWidth = Math.max(minW, Math.min(maxW, Math.round(width || minW)));
        try {
          // Match content size to the DOM so no extra transparent area remains
          mainWindow.setContentSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        } catch (e) {
          // Fallback in case setContentSize isn’t available on some platform
          mainWindow.setSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        }
        logger.debug("Main window resized (content)", { width: clampedWidth, height });
      }
      return { success: true };
    });

    ipcMain.handle("move-window", (event, { deltaX, deltaY }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        const [currentX, currentY] = mainWindow.getPosition();
        const newX = currentX + deltaX;
        const newY = currentY + deltaY;
        mainWindow.setPosition(newX, newY);
        logger.debug("Main window moved", {
          deltaX,
          deltaY,
          from: { x: currentX, y: currentY },
          to: { x: newX, y: newY },
        });
      }
      return { success: true };
    });

    ipcMain.handle("get-session-history", () => {
      return sessionManager.getOptimizedHistory();
    });

    ipcMain.handle("clear-session-memory", () => {
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      return { success: true };
    });

    ipcMain.handle("force-always-on-top", () => {
      windowManager.forceAlwaysOnTopForAllWindows();
      return { success: true };
    });

    ipcMain.handle("test-always-on-top", () => {
      const results = windowManager.testAlwaysOnTopForAllWindows();
      return { success: true, results };
    });

    ipcMain.handle("send-chat-message", async (event, text) => {
      // Add chat message to session memory
      sessionManager.addUserInput(text, 'chat');
      logger.debug('Chat message added to session memory', { textLength: text.length });

      const tracked = this.beginTrackedLlmRequest('chat');
      try {
        const sessionHistory = sessionManager.getOptimizedHistory();
        const skillsRequiringProgrammingLanguage = ['dsa', 'programming'];
        const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

        const llmResult = await llmService.processTextWithSkill(
          text,
          this.activeSkill,
          sessionHistory.recent,
          needsProgrammingLanguage ? this.codingLanguage : null,
          { signal: tracked.abortController.signal }
        );

        if (!this.isTrackedRequestCurrent(tracked.id)) {
          return { success: false, cancelled: true };
        }

        sessionManager.addModelResponse(llmResult.response, {
          skill: this.activeSkill,
          processingTime: llmResult.metadata.processingTime,
          usedFallback: llmResult.metadata.usedFallback,
        });

        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send('llm-response', {
            response: llmResult.response,
            metadata: llmResult.metadata,
            skill: this.activeSkill,
            requestId: tracked.id
          });
        });

        return { success: true };
      } catch (error) {
        if (/cancelled/i.test(error.message) || !this.isTrackedRequestCurrent(tracked.id)) {
          return { success: false, cancelled: true };
        }

        logger.error("Failed to process chat message with LLM", {
          error: error.message,
          text: String(text || '').substring(0, 100)
        });
        throw error;
      } finally {
        this.clearTrackedLlmRequest(tracked.id);
      }
    });

    ipcMain.handle("cancel-active-prompt", () => this.cancelActivePrompt());

    ipcMain.handle("get-skill-prompt", (event, skillName) => {
      try {
        const { promptLoader } = require('./prompt-loader');
        const skillPrompt = promptLoader.getSkillPrompt(skillName);
        return skillPrompt;
      } catch (error) {
        logger.error('Failed to get skill prompt', { skillName, error: error.message });
        return null;
      }
    });

    ipcMain.handle("set-llm-provider-config", (event, payload = {}) => {
      const provider = payload.provider || config.get('llm.provider') || 'gemini';
      const providerModels = config.get(`llm.providers.${provider}.models`) || [];
      const requestedModel = payload.model || config.get('llm.model') || null;
      const model = providerModels.includes(requestedModel) ? requestedModel : (providerModels[0] || requestedModel);
      const apiKey = payload.apiKey;
      const authMode = provider === 'codex' ? 'oauth' : 'apiKey';

      if (model || provider) {
        llmService.updateProviderModel(provider, model);
      }
      llmService.setProviderAuthMode(provider, authMode);
      if (typeof apiKey === 'string' && apiKey.trim()) {
        llmService.updateApiKey(apiKey, provider);
      }

      const resolvedModel = llmService.getCurrentModel();
      this.llmLastModels = { ...(this.llmLastModels || {}), [provider]: resolvedModel };
      this.saveSettings({
        llmProvider: provider,
        llmModel: resolvedModel,
        llmLastModels: this.llmLastModels,
        llmAuthModes: llmService.getAuthModes(),
        firstRunCompleted: true
      });
      return llmService.getStats();
    });

    ipcMain.handle("get-llm-status", () => llmService.getStats());
    ipcMain.handle("get-llm-providers", () => config.get('llm.providers') || {});
    ipcMain.handle("start-codex-login", async (event, payload = {}) => {
      const requestPayload = (payload && typeof payload === 'object') ? payload : {};
      const mode = String(requestPayload.mode || 'open').toLowerCase();
      const openBrowser = mode !== 'copy';

      const callbackInfo = await this.startCodexOAuthCallbackServer();

      const result = await llmService.startCodexLoginFlow({
        openBrowser,
        redirectUri: callbackInfo?.redirectUri
      });

      if (result?.success) {
        this.pendingCodexOAuth = {
          state: result.state,
          verifier: result.verifier,
          clientId: result.clientId,
          redirectUri: result.redirectUri,
          createdAt: Date.now()
        };
      }

      return result;
    });
    ipcMain.handle("set-codex-auth-token", (event, payload = {}) => {
      const token = payload.token || '';
      if (!token.trim()) {
        return { success: false, error: 'Missing OAuth token' };
      }
      llmService.setProviderAuthMode('openai', 'oauth');
      llmService.setCodexAuthToken(token.trim());
      const codexModel = llmService.getCurrentModel();
      this.llmLastModels = { ...(this.llmLastModels || {}), codex: codexModel };
      this.saveSettings({ llmAuthModes: llmService.getAuthModes(), llmLastModels: this.llmLastModels, firstRunCompleted: true });
      return { success: true, status: { ...llmService.getStats(), llmLastModels: this.llmLastModels } };
    });

    // Backward-compatible aliases
    ipcMain.handle("set-gemini-api-key", (event, apiKey) => {
      llmService.updateProviderModel('gemini', llmService.getCurrentModel());
      llmService.updateApiKey(apiKey, 'gemini');
      this.saveSettings({ llmProvider: 'gemini', llmModel: llmService.getCurrentModel(), firstRunCompleted: true });
      return llmService.getStats();
    });

    ipcMain.handle("get-gemini-status", () => llmService.getStats());

    // Window binding IPC handlers
    ipcMain.handle("set-window-binding", (event, enabled) => {
      return windowManager.setWindowBinding(enabled);
    });

    ipcMain.handle("toggle-window-binding", () => {
      return windowManager.toggleWindowBinding();
    });

    ipcMain.handle("get-window-binding-status", () => {
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("get-window-stats", () => {
      return windowManager.getWindowStats();
    });

    ipcMain.handle("open-stt-diagnostics", () => {
      windowManager.showSTTDiagnostics();
      return { success: true };
    });

    ipcMain.handle("close-stt-diagnostics", () => {
      windowManager.hideSTTDiagnostics();
      return { success: true };
    });

    ipcMain.handle("get-stt-diagnostics", () => {
      if (typeof speechService.getSTTDiagnostics !== 'function') {
        return { error: 'STT diagnostics unavailable' };
      }
      return speechService.getSTTDiagnostics();
    });

    ipcMain.handle("get-whisper-capture-devices", (event, source = 'microphone') => {
      if (typeof speechService.getWhisperCaptureDevices !== 'function') {
        return [];
      }
      return speechService.getWhisperCaptureDevices(source);
    });

 
    ipcMain.handle("set-window-gap", (event, gap) => {

      return windowManager.setWindowGap(gap);
    });

    ipcMain.handle("move-bound-windows", (event, { deltaX, deltaY }) => {
      windowManager.moveBoundWindows(deltaX, deltaY);
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("test-llm-connection", async () => {
      return await llmService.testConnection();
    });

    ipcMain.handle("run-llm-diagnostics", async () => {
      try {
        const connectivity = await llmService.checkNetworkConnectivity();
        const apiTest = await llmService.testConnection();

        return {
          success: true,
          connectivity,
          apiTest,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Backward-compatible aliases
    ipcMain.handle("test-gemini-connection", async () => llmService.testConnection());
    ipcMain.handle("run-gemini-diagnostics", async () => {
      try {
        const connectivity = await llmService.checkNetworkConnectivity();
        const apiTest = await llmService.testConnection();
        return { success: true, connectivity, apiTest, timestamp: new Date().toISOString() };
      } catch (error) {
        return { success: false, error: error.message, timestamp: new Date().toISOString() };
      }
    });

    // Settings handlers
    ipcMain.handle("show-settings", () => {
      windowManager.showSettings();

      // Send current settings to the settings window
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        const currentSettings = this.getSettings();
        setTimeout(() => {
          settingsWindow.webContents.send("load-settings", currentSettings);
        }, 100);
      }

      return { success: true };
    });

    ipcMain.handle("get-settings", () => {
      return this.getSettings();
    });

    ipcMain.handle("save-settings", (event, settings) => {
      return this.saveSettings(settings);
    });

    ipcMain.handle("update-app-icon", (event, iconKey) => {
      return this.updateAppIcon(iconKey);
    });

    ipcMain.handle("update-active-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-changed", { skill });
      return { success: true };
    });

    ipcMain.handle("restart-app-for-stealth", () => {
      // Force restart the app to ensure stealth name changes take effect
      const { app } = require("electron");
      app.relaunch();
      app.exit();
    });

    ipcMain.handle("close-window", (event) => {
      const webContents = event.sender;
      const window = windowManager.windows.forEach((win, type) => {
        if (win.webContents === webContents) {
          win.hide();
          return true;
        }
      });
      return { success: true };
    });

    // LLM window specific handlers
    ipcMain.handle("expand-llm-window", (event, contentMetrics) => {
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("resize-llm-window-for-content", (event, contentMetrics) => {
      // Use the same expansion logic for now, can be enhanced later
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("quit-app", () => {
      logger.info("Quit app requested via IPC");
      try {
        // Force quit the application
        const { app } = require("electron");

        // Close all windows first
        windowManager.destroyAllWindows();

        // Unregister shortcuts
        globalShortcut.unregisterAll();

        // Force quit
        app.quit();

        // If the above doesn't work, force exit
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      } catch (error) {
        logger.error("Error during quit:", error);
        process.exit(1);
      }
    });

    // Handle close settings
    ipcMain.on("close-settings", () => {
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        settingsWindow.hide();
      }
    });

    // Handle save settings (synchronous)
    ipcMain.on("save-settings", (event, settings) => {
      this.saveSettings(settings);
    });

    // Handle update skill
    ipcMain.on("update-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-updated", { skill });
    });

    // Handle quit app (alternative method)
    ipcMain.on("quit-app", () => {
      logger.info("Quit app requested via IPC (on method)");
      try {
        const { app } = require("electron");
        windowManager.destroyAllWindows();
        globalShortcut.unregisterAll();
        app.quit();
        setTimeout(() => process.exit(0), 1000);
      } catch (error) {
        logger.error("Error during quit (on method):", error);
        process.exit(1);
      }
    });
  }

  async applySpeechProvider(provider) {
    const selectedProvider = String(provider || this.speechProvider || 'azure').trim();
    this.speechProvider = selectedProvider;
    process.env.STT_PROVIDER = selectedProvider;

    try {
      const result = await speechService.setProvider(selectedProvider);
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      windowManager.broadcastToAllWindows('speech-availability', { available: this.speechAvailable });
      return { success: true, ...result, available: this.speechAvailable };
    } catch (error) {
      logger.error('Failed to apply speech provider', { provider: selectedProvider, error: error.message });
      return { success: false, provider: selectedProvider, error: error.message };
    }
  }

  toggleSpeechRecognition() {

    const isAvailable = typeof speechService.isAvailable === 'function' ? speechService.isAvailable() : !!speechService.getStatus?.().isInitialized;
    if (!isAvailable) {
      logger.warn("Speech recognition unavailable; toggle ignored");
      try {
        windowManager.broadcastToAllWindows("speech-status", { status: 'Speech recognition unavailable', available: false });
        windowManager.broadcastToAllWindows("speech-availability", { available: false });
      } catch (e) {}
      return;
    }
    const currentStatus = speechService.getStatus();
    if (currentStatus.isRecording) {
      try {
        speechService.stopRecording();
        windowManager.hideChatWindow();
        logger.info("Speech recognition stopped via global shortcut");
      } catch (error) {
        logger.error("Error stopping speech recognition:", error);
      }
    } else {
      try {
        speechService.startRecording();
        windowManager.showChatWindow();
        logger.info("Speech recognition started via global shortcut");
      } catch (error) {
        logger.error("Error starting speech recognition:", error);
      }
    }
  }

  clearSessionMemory() {
    try {
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      logger.info("Session memory cleared via global shortcut");
    } catch (error) {
      logger.error("Error clearing session memory:", error);
    }
  }

  promptForLlmSetupIfNeeded() {
    const status = llmService.getStats();
    const shouldPrompt = !this.firstRunCompleted || !status.isInitialized || !status.hasApiKey;

    if (!shouldPrompt) {
      this.firstRunCompleted = true;
      this.persistSettings({ firstRunCompleted: true });
      return;
    }

    const mainWindow = windowManager.getWindow('main');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-llm-config', {
        provider: status.provider,
        model: status.model,
        hasApiKey: status.hasApiKey,
        providers: status.providers,
        authModes: status.authModes || {}
      });
    }
  }

  startCodexOAuthCallbackServer() {
    if (this.oauthCallbackServerReadyPromise) {
      return this.oauthCallbackServerReadyPromise;
    }

    if (this.oauthCallbackServer && this.codexCallbackPort) {
      return Promise.resolve({
        callbackPort: this.codexCallbackPort,
        redirectUri: process.env.CODEX_REDIRECT_URI || `http://127.0.0.1:${this.codexCallbackPort}/auth/callback`
      });
    }

    const callbackPath = '/auth/callback';
    const requestedPort = Number(process.env.CODEX_CALLBACK_PORT || 1455);

    this.oauthCallbackServer = http.createServer(async (req, res) => {
      try {
        const activePort = this.codexCallbackPort || requestedPort;
        const rawRequestUrl = String(req.url || '/');
        new URL(rawRequestUrl, `http://localhost:${activePort}`);

        // Parse query from raw request URL first to avoid runtime URL/searchParams edge cases.
        const queryIndex = rawRequestUrl.indexOf('?');
        const rawQuery = queryIndex >= 0 ? rawRequestUrl.slice(queryIndex + 1) : '';
        const params = new URLSearchParams(rawQuery);

        const code = (params.get('code') || '').trim();
        const state = (params.get('state') || '').trim();
        const directToken = (
          params.get('token') ||
          params.get('access_token') ||
          params.get('id_token') ||
          ''
        ).trim();

        const hasOAuthPayload = !!(code || directToken || state);
        if (!hasOAuthPayload) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#111;color:#eee;"><h3>Completing login...</h3><p>Processing OAuth callback.</p><script>(function(){try{var h=window.location.hash||'';if(h&&h.length>1){var p=new URLSearchParams(h.substring(1));var t=p.get('access_token')||p.get('id_token')||p.get('token')||'';if(t){var target=(window.location.pathname||'/auth/callback')+'?token='+encodeURIComponent(t);window.location.replace(target);return;}}document.body.innerHTML='<h3>Almost done</h3><p>No OAuth data found in callback URL.</p><p style=\"opacity:.8\">Path: '+(window.location.pathname||'')+'</p><p style=\"opacity:.8\">Query: '+(window.location.search||'')+'</p>';}catch(e){document.body.innerHTML='<h3>OAuth callback error</h3><p>Unable to parse callback.</p>';}})();</script></body></html>`);
          return;
        }

        let token = directToken;
        if (!token && code) {
          const pending = this.pendingCodexOAuth;
          if (!pending) {
            throw new Error('No pending OAuth session found. Start login again.');
          }
          if (!state || state !== pending.state) {
            throw new Error('OAuth state mismatch');
          }

          const tokenResponse = await llmService.exchangeCodexOAuthCode({
            code,
            codeVerifier: pending.verifier,
            clientId: pending.clientId,
            redirectUri: pending.redirectUri
          });

          token = String(
            tokenResponse?.access_token ||
            tokenResponse?.id_token ||
            tokenResponse?.token ||
            ''
          ).trim();

          if (!token) {
            throw new Error('OAuth token exchange succeeded but no access_token returned');
          }
        }

        llmService.setProviderAuthMode('openai', 'oauth');
        llmService.setProviderAuthMode('codex', 'oauth');
        llmService.setCodexAuthToken(token);

        const llmStats = llmService.getStats();
        this.saveSettings({
          llmProvider: 'codex',
          llmModel: llmStats.model,
          llmAuthModes: llmService.getAuthModes(),
          firstRunCompleted: true
        });

        this.pendingCodexOAuth = null;
        windowManager.broadcastToAllWindows('codex-auth-token-updated', {
          provider: 'codex',
          authMode: 'oauth'
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#111;color:#eee;"><h3>Login successful</h3><p>You can close this tab and return to OpenCluely.</p></body></html>`);
      } catch (error) {
        logger.error('OAuth callback processing failed', { error: error.message });
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#111;color:#eee;"><h3>OAuth callback failed</h3><p>${String(error.message || 'Unknown error')}</p></body></html>`);
      }
    });

    this.oauthCallbackServerReadyPromise = new Promise((resolve, reject) => {
      const listenOn = (port) => {
        this.oauthCallbackServer.listen(port, () => {
          const addr = this.oauthCallbackServer.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : port;
          this.codexCallbackPort = actualPort;
          process.env.CODEX_REDIRECT_URI = `http://localhost:${actualPort}${callbackPath}`;
          logger.info('Codex OAuth callback server listening', { callbackPort: actualPort, callbackPath });
          resolve({
            callbackPort: actualPort,
            redirectUri: process.env.CODEX_REDIRECT_URI
          });
        });
      };

      this.oauthCallbackServer.on('error', (error) => {
        if (error && error.code === 'EADDRINUSE' && !this._oauthRetriedWithEphemeral) {
          this._oauthRetriedWithEphemeral = true;
          logger.warn('Codex callback port in use; retrying with ephemeral port', { requestedPort, error: error.message });
          try {
            this.oauthCallbackServer.close();
          } catch (_) {}
          listenOn(0);
          return;
        }

        logger.error('Failed to start Codex OAuth callback server', { error: error.message });
        this.oauthCallbackServer = null;
        this.oauthCallbackServerReadyPromise = null;
        reject(error);
      });

      this._oauthRetriedWithEphemeral = false;
      this.codexCallbackPort = requestedPort;
      listenOn(requestedPort);
    });

    return this.oauthCallbackServerReadyPromise;
  }

  stopCodexOAuthCallbackServer() {
    if (!this.oauthCallbackServer) {
      return;
    }

    try {
      this.oauthCallbackServer.close();
    } catch (error) {
      logger.warn('Failed to stop Codex OAuth callback server cleanly', { error: error.message });
    } finally {
      this.oauthCallbackServer = null;
      this.oauthCallbackServerReadyPromise = null;
      this.pendingCodexOAuth = null;
      this.codexCallbackPort = null;
      this._oauthRetriedWithEphemeral = false;
    }
  }

  handleUpArrow() {

    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to previous skill
      this.navigateSkill(-1);
    } else {
      // Non-interactive mode: Move window up
      windowManager.moveBoundWindows(0, -20);
    }
  }

  handleDownArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to next skill
      this.navigateSkill(1);
    } else {
      // Non-interactive mode: Move window down
      windowManager.moveBoundWindows(0, 20);
    }
  }

  handleLeftArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window left
      windowManager.moveBoundWindows(-20, 0);
    }
    // Interactive mode: Left arrow does nothing
  }

  handleRightArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window right
      windowManager.moveBoundWindows(20, 0);
    }
    // Interactive mode: Right arrow does nothing
  }

  navigateSkill(direction) {
    const { promptLoader } = require("./prompt-loader");
    const availableSkills = promptLoader.getAvailableSkills();

    const currentIndex = availableSkills.indexOf(this.activeSkill);
    if (currentIndex === -1) {
      logger.warn("Current skill not found in available skills", {
        currentSkill: this.activeSkill,
        availableSkills,
      });
      return;
    }

    // Calculate new index with wrapping
    let newIndex = currentIndex + direction;
    if (newIndex >= availableSkills.length) {
      newIndex = 0; // Wrap to beginning
    } else if (newIndex < 0) {
      newIndex = availableSkills.length - 1; // Wrap to end
    }

    const newSkill = availableSkills[newIndex];
    this.activeSkill = newSkill;

    // Update session manager with the new skill
    sessionManager.setActiveSkill(newSkill);

    logger.info("Skill navigated via global shortcut", {
      from: availableSkills[currentIndex],
      to: newSkill,
      direction: direction > 0 ? "down" : "up",
    });

    // Broadcast the skill change to all windows
    windowManager.broadcastToAllWindows("skill-updated", { skill: newSkill });
  }

  beginTrackedLlmRequest(source) {
    if (this.activeLlmRequest?.abortController && !this.activeLlmRequest.abortController.signal.aborted) {
      this.activeLlmRequest.abortController.abort();
    }

    const requestId = `llm-${++this.activeLlmRequestSeq}`;
    const abortController = new AbortController();
    this.activeLlmRequest = {
      id: requestId,
      source,
      abortController,
      startedAt: Date.now()
    };
    return this.activeLlmRequest;
  }

  clearTrackedLlmRequest(requestId) {
    if (this.activeLlmRequest?.id === requestId) {
      this.activeLlmRequest = null;
    }
  }

  isTrackedRequestCurrent(requestId) {
    return this.activeLlmRequest?.id === requestId;
  }

  async cancelActivePrompt() {
    let cancelledPending = false;
    let cancelledActive = false;
    let requestId = null;

    if (this.pendingTranscriptionLlmTimer) {
      clearTimeout(this.pendingTranscriptionLlmTimer);
      this.pendingTranscriptionLlmTimer = null;
      cancelledPending = true;
    }

    if (this.activeLlmRequest) {
      const { id, abortController } = this.activeLlmRequest;
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }
      this.activeLlmRequest = null;
      cancelledActive = true;
      requestId = id;
    }

    if (!cancelledPending && !cancelledActive) {
      return { success: true, cancelled: false };
    }

    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("llm-request-cancelled", { requestId });
    });

    return { success: true, cancelled: true, requestId };
  }

  async triggerScreenshotOCR() {
    if (!this.isReady) {
      logger.warn("Screenshot requested before application ready");
      return;
    }

    const startTime = Date.now();

    try {
      windowManager.showLLMLoading();

  const capture = await captureService.captureAndProcess();

      if (!capture.imageBuffer || !capture.imageBuffer.length) {
        windowManager.hideLLMResponse();
        this.broadcastOCRError("Failed to capture screenshot image");
        return;
      }

      // Use image directly with LLM and active skill; do not send chat messages here
      const llmStatus = llmService.getStats();
      logger.info('Screenshot analysis using provider', {
        provider: llmStatus.provider,
        authMode: llmStatus.authMode,
        model: llmStatus.model,
        hasCredentials: llmStatus.hasApiKey
      });

      const llmOutcome = await this.processCapturedImageWithLLM(capture);
      if (llmOutcome?.cancelled) {
        windowManager.hideLLMResponse();
      }
    } catch (error) {
      logger.error("Screenshot OCR process failed", {
        error: error.message,
        duration: Date.now() - startTime,
      });

      windowManager.hideLLMResponse();
      this.broadcastOCRError(error.message);
      
      sessionManager.addConversationEvent({
        role: 'system',
        content: `Screenshot OCR failed: ${error.message}`,
        action: 'ocr_error',
        metadata: {
          error: error.message
        }
      });
    }
  }

  async startSnipCapture() {
    const overlay = await windowManager.createSnipOverlayWindow();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sessionId = crypto.randomUUID();
    this.activeSnipSession = { displayId: display.id, startedAt: Date.now(), sessionId };
    overlay.setBounds(display.bounds);
    overlay.showInactive();
    overlay.webContents.send('snip-capture-state', {
      phase: 'started',
      sessionId,
      displayId: display.id,
      bounds: display.bounds
    });
    return { success: true, displayId: display.id, sessionId };
  }

  async submitSnipSelection(payload = {}) {
    if (!this.activeSnipSession) {
      return { success: false, error: 'No active snip session' };
    }

    const { displayId, sessionId } = this.activeSnipSession;
    const overlay = windowManager.getWindow('snipOverlay');

    try {
      if (overlay && !overlay.isDestroyed()) {
        const overlayHiddenAck = this.waitForSnipOverlayAck(sessionId);
        overlay.webContents.send('snip-capture-state', {
          phase: 'prepare-to-capture',
          sessionId,
          displayId
        });

        await overlayHiddenAck;
        await this.hideSnipOverlayWindowAndWait(overlay);
      }

      const result = await captureService.captureAndProcess({
        displayId,
        area: payload.area
      });

      await this.processCapturedImageWithLLM(result);
      return { success: true };
    } catch (error) {
      logger.error("Snip capture process failed", {
        error: error.message,
      });

      windowManager.hideLLMResponse();
      this.broadcastOCRError(error.message);

      sessionManager.addConversationEvent({
        role: 'system',
        content: `Snip capture failed: ${error.message}`,
        action: 'ocr_error',
        metadata: {
          error: error.message
        }
      });

      return { success: false, error: error.message };
    } finally {
      await this.cancelSnipCapture({ silent: true });
    }
  }

  async cancelSnipCapture(options = {}) {
    const overlay = windowManager.getWindow('snipOverlay');
    if (overlay && !overlay.isDestroyed()) {
      await this.hideSnipOverlayWindowAndWait(overlay);
      if (!options.silent) {
        overlay.webContents.send('snip-capture-state', { phase: 'cancelled' });
      }
    }
    this.activeSnipSession = null;
    return { success: true, silent: !!options.silent };
  }

  waitForSnipOverlayAck(sessionId, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        ipcMain.removeListener('snip-overlay-hidden', handleHidden);
      };

      const handleHidden = (event, payload = {}) => {
        if (sessionId != null && payload.sessionId != null && payload.sessionId !== sessionId) {
          return;
        }
        cleanup();
        resolve();
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for snip overlay to hide'));
      }, timeoutMs);

      ipcMain.on('snip-overlay-hidden', handleHidden);
    });
  }

  hideSnipOverlayWindowAndWait(overlay, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      if (!overlay || overlay.isDestroyed()) {
        resolve();
        return;
      }

      if (!overlay.isVisible()) {
        resolve();
        return;
      }

      let settled = false;

      const cleanup = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        overlay.removeListener('hide', handleHide);
      };

      const handleHide = () => {
        cleanup();
        resolve();
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for snip overlay window to hide'));
      }, timeoutMs);

      overlay.once('hide', handleHide);
      overlay.hide();
    });
  }

  async processCapturedImageWithLLM(captureResult) {
    const tracked = this.beginTrackedLlmRequest('screenshot');
    try {
      const sessionHistory = sessionManager.getOptimizedHistory();

      const skillsRequiringProgrammingLanguage = ['dsa', 'programming'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      const llmResult = await llmService.processImageWithSkill(
        captureResult.imageBuffer,
        captureResult.mimeType || 'image/png',
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null,
        { signal: tracked.abortController.signal }
      );

      if (!this.isTrackedRequestCurrent(tracked.id)) {
        return { success: false, cancelled: true };
      }

      // Record model response in session
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true
      });

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true,
        requestId: tracked.id
      });

      this.broadcastLLMSuccess(llmResult, tracked.id);
      return { success: true };
    } catch (error) {
      if (/cancelled/i.test(error.message) || !this.isTrackedRequestCurrent(tracked.id)) {
        return { success: false, cancelled: true };
      }
      throw error;
    } finally {
      this.clearTrackedLlmRequest(tracked.id);
    }
  }
  async processWithLLM(text, sessionHistory) {
    try {
      // Add user input to session memory
      sessionManager.addUserInput(text, 'llm_input');

      // Check if current skill needs programming language context
      const skillsRequiringProgrammingLanguage = ['dsa', 'programming'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);
      
      const llmResult = await llmService.processTextWithSkill(
        text,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null
      );

      logger.info("LLM processing completed, showing response", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime,
        responsePreview: llmResult.response.substring(0, 200) + "...",
      });

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
      });

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
      });

      this.broadcastLLMSuccess(llmResult);
    } catch (error) {
      logger.error("LLM processing failed", {
        error: error.message,
        skill: this.activeSkill,
      });

      windowManager.hideLLMResponse();
      sessionManager.addConversationEvent({
        role: 'system',
        content: `LLM processing failed: ${error.message}`,
        action: 'llm_error',
        metadata: {
          error: error.message,
          skill: this.activeSkill
        }
      });

      this.broadcastLLMError(error.message);
    }
  }

  async processTranscriptionWithLLM(text, sessionHistory) {
    // Validate input text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      logger.warn("Skipping LLM processing for empty or invalid transcription", {
        textType: typeof text,
        textLength: text ? text.length : 0
      });
      return;
    }

    const cleanText = text.trim();
    if (cleanText.length < 2) {
      logger.debug("Skipping LLM processing for very short transcription", {
        text: cleanText
      });
      return;
    }

    const tracked = this.beginTrackedLlmRequest('transcription');
    try {
      logger.info("Processing transcription with intelligent LLM response", {
        skill: this.activeSkill,
        textLength: cleanText.length,
        textPreview: cleanText.substring(0, 100) + "..."
      });

      // Check if current skill needs programming language context
      const skillsRequiringProgrammingLanguage = ['dsa', 'programming'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      const llmResult = await llmService.processTranscriptionWithIntelligentResponse(
        cleanText,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null,
        { signal: tracked.abortController.signal }
      );

      if (!this.isTrackedRequestCurrent(tracked.id)) {
        return { success: false, cancelled: true };
      }

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isTranscriptionResponse: true
      });

      // Send response to chat windows
      this.broadcastTranscriptionLLMResponse(llmResult, tracked.id);

      logger.info("Transcription LLM response completed", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime
      });
    } catch (error) {
      if (/cancelled/i.test(error.message) || !this.isTrackedRequestCurrent(tracked.id)) {
        return { success: false, cancelled: true };
      }

      logger.error("Transcription LLM processing failed", {
        error: error.message,
        errorStack: error.stack,
        skill: this.activeSkill,
        text: text ? text.substring(0, 100) : 'undefined'
      });

      // Try to provide a fallback response
      try {
        const fallbackResult = llmService.generateIntelligentFallbackResponse(text, this.activeSkill);

        if (!this.isTrackedRequestCurrent(tracked.id)) {
          return { success: false, cancelled: true };
        }

        sessionManager.addModelResponse(fallbackResult.response, {
          skill: this.activeSkill,
          processingTime: fallbackResult.metadata.processingTime,
          usedFallback: true,
          isTranscriptionResponse: true,
          fallbackReason: error.message
        });

        this.broadcastTranscriptionLLMResponse(fallbackResult, tracked.id);

        logger.info("Used fallback response for transcription", {
          skill: this.activeSkill,
          fallbackResponse: fallbackResult.response
        });
      } catch (fallbackError) {
        logger.error("Fallback response also failed", {
          fallbackError: fallbackError.message
        });

        sessionManager.addConversationEvent({
          role: 'system',
          content: `Transcription LLM processing failed: ${error.message}`,
          action: 'transcription_llm_error',
          metadata: {
            error: error.message,
            skill: this.activeSkill
          }
        });
      }
    } finally {
      this.clearTrackedLlmRequest(tracked.id);
    }
  }

  broadcastOCRSuccess(ocrResult) {
    windowManager.broadcastToAllWindows("ocr-completed", {
      text: ocrResult.text,
      metadata: ocrResult.metadata,
    });
  }

  broadcastOCRError(errorMessage) {
    windowManager.broadcastToAllWindows("ocr-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLLMSuccess(llmResult, requestId = null) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill, // Add the current active skill to the top level
      requestId
    };

    logger.info("Broadcasting LLM success to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      dataKeys: Object.keys(broadcastData),
      responsePreview: llmResult.response.substring(0, 100) + "...",
    });

    windowManager.broadcastToAllWindows("llm-response", broadcastData);
  }

  broadcastLLMError(errorMessage) {
    windowManager.broadcastToAllWindows("llm-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastTranscriptionLLMResponse(llmResult, requestId = null) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill,
      isTranscriptionResponse: true,
      requestId
    };

    logger.info("Broadcasting transcription LLM response to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      responsePreview: llmResult.response.substring(0, 100) + "..."
    });

    windowManager.broadcastToAllWindows("transcription-llm-response", broadcastData);
  }

  broadcastOverlayOpacity() {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("overlay-opacity-changed", {
        value: this.overlaySurfaceOpacity,
      });
    });
  }

  onWindowAllClosed() {
    if (process.platform !== "darwin") {
      app.quit();
    }
  }

  onActivate() {
    if (!this.isReady) {
      this.onAppReady();
    } else {
      // When app is activated, ensure windows appear on current desktop
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow && mainWindow.isVisible()) {
        windowManager.showOnCurrentDesktop(mainWindow);
      }

      // Also handle other visible windows
      windowManager.windows.forEach((window, type) => {
        if (window.isVisible()) {
          windowManager.showOnCurrentDesktop(window);
        }
      });

      logger.debug("App activated - ensured windows appear on current desktop");
    }
  }

  onWillQuit() {
    globalShortcut.unregisterAll();
    this.stopCodexOAuthCallbackServer();
    windowManager.destroyAllWindows();

    const sessionStats = sessionManager.getMemoryUsage();

    logger.info("Application shutting down", {
      sessionEvents: sessionStats.eventCount,
      sessionSize: sessionStats.approximateSize,
    });
  }

  getSettings() {
    return {
      codingLanguage: this.codingLanguage || "cpp",
      activeSkill: this.activeSkill || "general",
      appIcon: this.appIcon || "terminal",
      selectedIcon: this.appIcon || "terminal",
      llmProvider: this.llmProvider || config.get('llm.provider') || 'gemini',
      llmModel: this.llmModel || config.get('llm.model') || 'gemini-2.5-flash',
      llmLastModels: this.llmLastModels || {},
      llmAuthModes: this.llmAuthModes || llmService.getAuthModes(),
      firstRunCompleted: !!this.firstRunCompleted,
      azureConfigured: !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
      speechProvider: this.speechProvider || 'azure',
      whisperModel: process.env.WHISPER_MODEL || this.whisperModel || 'ggml-base.en.bin',
      whisperIntervalMs: Number(process.env.WHISPER_INTERVAL_MS || this.whisperIntervalMs || 2000),
      whisperAudioSource: process.env.WHISPER_AUDIO_SOURCE || this.whisperAudioSource || 'microphone',
      whisperCaptureDevice: process.env.WHISPER_CAPTURE_DEVICE || this.whisperCaptureDevice || 'auto',
      whisperInstalled: !!speechService.getStatus?.().whisperReady,
      speechAvailable: this.speechAvailable,
      overlaySurfaceOpacity: this.overlaySurfaceOpacity
    };
  }
  
  saveSettings(settings) {
    try {
      // Update application settings
      if (settings.codingLanguage) {
        this.codingLanguage = settings.codingLanguage;
        // Broadcast language change to all windows for sync
        windowManager.broadcastToAllWindows("coding-language-changed", {
          language: settings.codingLanguage,
        });
      }
      if (settings.activeSkill) {
        this.activeSkill = settings.activeSkill;
        // Broadcast skill change to all windows
        windowManager.broadcastToAllWindows("skill-updated", {
          skill: settings.activeSkill,
        });
      }
      if (settings.appIcon) {
        this.appIcon = settings.appIcon;
      }

      if (settings.llmLastModels && typeof settings.llmLastModels === 'object') {
        this.llmLastModels = { ...(this.llmLastModels || {}), ...settings.llmLastModels };
      }

      if (settings.llmProvider || settings.llmModel) {
        const provider = settings.llmProvider || this.llmProvider || config.get('llm.provider') || 'gemini';
        const model = settings.llmModel || this.llmModel || this.llmLastModels?.[provider] || config.get('llm.model') || null;
        this.llmProvider = provider;
        this.llmModel = model;
        llmService.updateProviderModel(provider, model);
        this.llmLastModels = { ...(this.llmLastModels || {}), [provider]: llmService.getCurrentModel() };
      }

      if (settings.llmAuthModes && typeof settings.llmAuthModes === 'object') {
        this.llmAuthModes = settings.llmAuthModes;
        llmService.setAuthModes(settings.llmAuthModes);
      }

      if (typeof settings.firstRunCompleted === 'boolean') {
        this.firstRunCompleted = settings.firstRunCompleted;
      }

      if (typeof settings.azureKey === 'string') {
        process.env.AZURE_SPEECH_KEY = settings.azureKey;
      }

      if (typeof settings.azureRegion === 'string') {
        process.env.AZURE_SPEECH_REGION = settings.azureRegion;
      }

      let shouldReconfigureSpeech = false;

      if (typeof settings.whisperModel === 'string' && settings.whisperModel.trim()) {
        const requestedModel = settings.whisperModel.trim();
        const allowedModels = new Set(['ggml-tiny.en.bin', 'ggml-base.en.bin', 'ggml-small.en.bin']);
        const nextModel = allowedModels.has(requestedModel) ? requestedModel : 'ggml-small.en.bin';
        if (nextModel !== this.whisperModel) {
          this.whisperModel = nextModel;
          shouldReconfigureSpeech = true;
        }
        process.env.WHISPER_MODEL = this.whisperModel;
      }

      if (settings.whisperIntervalMs !== undefined) {
        const parsedInterval = Number(settings.whisperIntervalMs);
        const nextInterval = Number.isFinite(parsedInterval) ? Math.max(600, parsedInterval) : 2000;
        if (nextInterval !== this.whisperIntervalMs) {
          this.whisperIntervalMs = nextInterval;
          shouldReconfigureSpeech = true;
        }
        process.env.WHISPER_INTERVAL_MS = String(this.whisperIntervalMs);
      }

      if (typeof settings.whisperAudioSource === 'string' && settings.whisperAudioSource.trim()) {
        const nextSource = settings.whisperAudioSource.trim();
        if (nextSource !== this.whisperAudioSource) {
          this.whisperAudioSource = nextSource;
          shouldReconfigureSpeech = true;
        }
        process.env.WHISPER_AUDIO_SOURCE = this.whisperAudioSource;
      }

      if (typeof settings.whisperCaptureDevice === 'string' && settings.whisperCaptureDevice.trim()) {
        const nextCapture = settings.whisperCaptureDevice.trim();
        if (nextCapture !== this.whisperCaptureDevice) {
          this.whisperCaptureDevice = nextCapture;
          shouldReconfigureSpeech = true;
        }
        process.env.WHISPER_CAPTURE_DEVICE = this.whisperCaptureDevice;
      }

      if (typeof settings.speechProvider === 'string' && settings.speechProvider.trim()) {
        const nextProvider = settings.speechProvider.trim();
        if (nextProvider !== this.speechProvider) {
          this.speechProvider = nextProvider;
          shouldReconfigureSpeech = true;
        }
      }

      if (shouldReconfigureSpeech) {
        this.applySpeechProvider(this.speechProvider);
      }

      if (settings.overlaySurfaceOpacity != null) {
        const parsedOpacity = Number(settings.overlaySurfaceOpacity);
        const nextOpacity = Number.isFinite(parsedOpacity)
          ? Math.max(0.35, Math.min(1, parsedOpacity))
          : 0.82;
        this.overlaySurfaceOpacity = nextOpacity;
        settings.overlaySurfaceOpacity = nextOpacity;
        this.broadcastOverlayOpacity();
      }

      // Handle icon change specifically
      if (settings.selectedIcon) {
        this.appIcon = settings.selectedIcon;
        this.updateAppIcon(settings.selectedIcon);
      }

      // Persist settings to file
      this.persistSettings(settings);

      logger.info("Settings saved successfully", settings);
      return { success: true };
    } catch (error) {
      logger.error("Failed to save settings", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  getSettingsFilePath() {
    const dir = config.get('app.dataDir');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'settings.json');
  }

  loadPersistedSettings() {
    try {
      const filePath = this.getSettingsFilePath();
      const envProvider = (process.env.LLM_PROVIDER || '').trim();
      const envModel = (process.env.LLM_MODEL || '').trim();

      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const saved = JSON.parse(raw);
        this.codingLanguage = saved.codingLanguage || this.codingLanguage;
        this.activeSkill = saved.activeSkill || this.activeSkill;
        this.appIcon = saved.selectedIcon || saved.appIcon || this.appIcon;
        this.llmProvider = saved.llmProvider || this.llmProvider;
        this.llmModel = saved.llmModel || this.llmModel;
        this.llmLastModels = saved.llmLastModels || this.llmLastModels || {};
        this.llmAuthModes = saved.llmAuthModes || config.get('llm.authModes') || { gemini: 'apiKey', openai: 'apiKey', anthropic: 'apiKey' };
        this.firstRunCompleted = !!saved.firstRunCompleted;
        this.speechProvider = saved.speechProvider || this.speechProvider || 'azure';
        const savedWhisperModel = saved.whisperModel || this.whisperModel || process.env.WHISPER_MODEL || 'ggml-base.en.bin';
        const allowedWhisperModels = new Set(['ggml-tiny.en.bin', 'ggml-base.en.bin', 'ggml-small.en.bin']);
        this.whisperModel = allowedWhisperModels.has(savedWhisperModel) ? savedWhisperModel : 'ggml-small.en.bin';
        this.whisperIntervalMs = Number(saved.whisperIntervalMs || this.whisperIntervalMs || process.env.WHISPER_INTERVAL_MS || 2000);
        this.whisperAudioSource = saved.whisperAudioSource || this.whisperAudioSource || process.env.WHISPER_AUDIO_SOURCE || 'microphone';
        this.whisperCaptureDevice = saved.whisperCaptureDevice || this.whisperCaptureDevice || process.env.WHISPER_CAPTURE_DEVICE || 'auto';
        const parsedOverlayOpacity = Number(saved.overlaySurfaceOpacity);
        this.overlaySurfaceOpacity = Number.isFinite(parsedOverlayOpacity)
          ? Math.max(0.35, Math.min(1, parsedOverlayOpacity))
          : 0.82;
        process.env.WHISPER_MODEL = this.whisperModel;
        process.env.WHISPER_INTERVAL_MS = String(this.whisperIntervalMs);
        process.env.WHISPER_AUDIO_SOURCE = this.whisperAudioSource;
        process.env.WHISPER_CAPTURE_DEVICE = this.whisperCaptureDevice;
        if (typeof saved.azureKey === 'string') {
          process.env.AZURE_SPEECH_KEY = saved.azureKey;
        }
        if (typeof saved.azureRegion === 'string') {
          process.env.AZURE_SPEECH_REGION = saved.azureRegion;
        }
      }


      // Startup sequence has priority: allow distributables to choose provider via env.
      if (envProvider) {
        this.llmProvider = envProvider;
      }
      if (envModel) {
        this.llmModel = envModel;
      }

      this.llmProvider = this.llmProvider || config.get('llm.provider') || 'gemini';
      this.llmLastModels = this.llmLastModels || {};
      this.llmModel = this.llmModel || this.llmLastModels[this.llmProvider] || config.get('llm.model') || null;
      this.llmAuthModes = this.llmAuthModes || config.get('llm.authModes') || { gemini: 'apiKey', openai: 'apiKey', anthropic: 'apiKey' };

      llmService.setAuthModes(this.llmAuthModes);
      llmService.updateProviderModel(this.llmProvider, this.llmModel);
      this.llmLastModels[this.llmProvider] = llmService.getCurrentModel();
      this.llmModel = llmService.getCurrentModel();

      logger.info('Loaded startup/provider settings', {
        llmProvider: this.llmProvider,
        llmModel: this.llmModel,
        source: envProvider ? 'env' : 'settings-or-default',
        firstRunCompleted: this.firstRunCompleted
      });
    } catch (error) {
      logger.warn('Failed to load persisted settings', { error: error.message });
    }
  }

  persistSettings(settings) {
    try {
      const filePath = this.getSettingsFilePath();
      const current = this.getSettings();
      const merged = { ...current, ...settings };
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
      logger.debug("Settings persisted", { filePath });
    } catch (error) {
      logger.error('Failed to persist settings to disk', { error: error.message });
    }
  }

  updateAppIcon(iconKey) {
    try {
      const { app } = require("electron");
      const path = require("path");
      const fs = require("fs");

      // Icon mapping for available icons in assests/icons folder
      const iconPaths = {
        terminal: "assests/icons/terminal.png",
        activity: "assests/icons/activity.png",
        settings: "assests/icons/settings.png",
      };

      // App name mapping for stealth mode
      const appNames = {
        terminal: "Terminal",
        activity: "Activity Monitor",
        settings: "System Settings",
      };


      const iconPath = iconPaths[iconKey];
      const appName = appNames[iconKey];

      if (!iconPath) {
        logger.error("Invalid icon key", { iconKey });
        return { success: false, error: "Invalid icon key" };
      }

      const fullIconPath = path.resolve(iconPath);

      if (!fs.existsSync(fullIconPath)) {
        logger.error("Icon file not found", {
          iconKey,
          iconPath: fullIconPath,
        });
        return { success: false, error: "Icon file not found" };
      }

      // Set app icon for dock/taskbar
      if (process.platform === "darwin") {
        // macOS - update dock icon
        app.dock.setIcon(fullIconPath);

        // Force dock refresh with multiple attempts
        setTimeout(() => {
          app.dock.setIcon(fullIconPath);
        }, 100);

        setTimeout(() => {
          app.dock.setIcon(fullIconPath);
        }, 500);
      } else {
        // Windows/Linux - update window icons
        windowManager.windows.forEach((window, type) => {
          if (window && !window.isDestroyed()) {
            window.setIcon(fullIconPath);
          }
        });
      }

      // Update app name for stealth mode
      this.updateAppName(appName, iconKey);

      logger.info("App icon and name updated successfully", {
        iconKey,
        appName,
        iconPath: fullIconPath,
        platform: process.platform,
        fileExists: fs.existsSync(fullIconPath),
      });

      this.appIcon = iconKey;
      return { success: true };
    } catch (error) {
      logger.error("Failed to update app icon", {
        error: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  updateAppName(appName, iconKey) {
    try {
      const { app } = require("electron");

      // Force update process title for Activity Monitor stealth - CRITICAL
      process.title = appName;

      // Set app name in dock (macOS) - this affects the dock and Activity Monitor
      if (process.platform === "darwin") {
        // Multiple attempts to ensure the name sticks
        app.setName(appName);

        // Force update the bundle name for macOS stealth
        const { execSync } = require("child_process");
        try {
          // Update the app's Info.plist CFBundleName in memory
          if (process.mainModule && process.mainModule.filename) {
            const appPath = process.mainModule.filename;
            // Force set the bundle name directly
            process.env.CFBundleName = appName.trim();
          }
        } catch (e) {
          // Silently fail if we can't modify bundle info
        }

        // Clear dock badge and reset
        if (app.dock) {
          app.dock.setBadge("");
          // Force dock refresh
          setTimeout(() => {
            app.dock.setIcon(
              require("path").resolve(`assests/icons/${iconKey}.png`)
            );
          }, 50);
        }
      }

      // Set app user model ID for Windows taskbar grouping
      app.setAppUserModelId(`${appName.trim()}-${iconKey}`);

      // Update all window titles to match the new app name
      const windows = windowManager.windows;
      windows.forEach((window, type) => {
        if (window && !window.isDestroyed()) {
          // Use stealth name for all windows
          const stealthTitle = appName.trim();
          window.setTitle(stealthTitle);
        }
      });

      // Multiple force refreshes with increasing delays
      const refreshTimes = [50, 100, 200, 500];
      refreshTimes.forEach((delay) => {
        setTimeout(() => {
          process.title = appName;
          if (process.platform === "darwin") {
            app.setName(appName);
            // Force update bundle display name
            if (app.getName() !== appName) {
              app.setName(appName);
            }
          }
        }, delay);
      });

      logger.info("App name updated for stealth mode", {
        appName,
        processTitle: process.title,
        appGetName: app.getName(),
        iconKey,
        platform: process.platform,
      });
    } catch (error) {
      logger.error("Failed to update app name", { error: error.message });
    }
  }
}

new ApplicationController();
