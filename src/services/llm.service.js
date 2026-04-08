const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');
const { shell } = require('electron');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService {
  constructor() {
    this.client = null;
    this.model = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.provider = config.get('llm.provider') || 'gemini';
    this.modelName = config.get('llm.model') || this.getProviderDefaultModel(this.provider);
    this.authModes = { ...(config.get('llm.authModes') || {}) };
    this.openaiOAuthToken = null;

    this.loadOAuthTokenFromDisk();
    this.initializeClient();
  }

  getProviderDefaultModel(provider) {
    const models = config.get(`llm.providers.${provider}.models`) || [];
    return models[0] || 'gemini-2.5-flash';
  }

  getCurrentProvider() {
    return this.provider || config.get('llm.provider') || 'gemini';
  }

  getCurrentModel() {
    return this.modelName || config.get('llm.model') || this.getProviderDefaultModel(this.getCurrentProvider());
  }

  getProviderConfig(provider = this.getCurrentProvider()) {
    return config.get(`llm.providers.${provider}`) || {};
  }

  getProviderEndpoint(provider = this.getCurrentProvider(), model = this.getCurrentModel()) {
    if (provider === 'codex') {
      return 'https://chatgpt.com/backend-api/codex/responses';
    }

    const normalizedProvider = provider === 'codex' ? 'openai' : provider;
    if (normalizedProvider === 'openai') {
      return 'https://api.openai.com/v1/chat/completions';
    }
    if (normalizedProvider === 'anthropic') {
      return 'https://api.anthropic.com/v1/messages';
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  getProviderApiKey(provider) {
    const normalizedProvider = provider === 'codex' ? 'openai' : provider;
    const envMap = {
      gemini: 'GEMINI_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY'
    };

    if (provider === 'codex') {
      return this.openaiOAuthToken;
    }

    if (normalizedProvider === 'openai' && this.getProviderAuthMode('openai') === 'oauth') {
      return this.openaiOAuthToken;
    }

    return process.env[envMap[normalizedProvider]];
  }

  getProviderAuthMode(provider) {
    if (provider === 'codex') return 'oauth';
    return this.authModes?.[provider] || 'apiKey';
  }

  getProviderDisplayName(provider = this.getCurrentProvider()) {
    const names = {
      gemini: 'Gemini',
      openai: 'OpenAI',
      codex: 'Codex',
      anthropic: 'Anthropic'
    };
    return names[provider] || provider;
  }


  setProviderAuthMode(provider, mode = 'apiKey') {
    this.authModes = { ...this.authModes, [provider]: mode };
  }

  setAuthModes(modes = {}) {
    this.authModes = { ...(config.get('llm.authModes') || {}), ...modes };
  }

  getAuthModes() {
    return { ...(config.get('llm.authModes') || {}), ...this.authModes };
  }

  getAuthConfigFilePath() {
    const dir = config.get('app.dataDir');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'auth-config.json');
  }

  readAuthConfig() {
    const filePath = this.getAuthConfigFilePath();
    if (!fs.existsSync(filePath)) {
      return { tokens: {} };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') {
        return { tokens: {} };
      }
      if (!parsed.tokens || typeof parsed.tokens !== 'object') {
        parsed.tokens = {};
      }
      return parsed;
    } catch (error) {
      logger.warn('Failed to parse auth config file', { error: error.message });
      return { tokens: {} };
    }
  }

  writeAuthConfig(configObject) {
    try {
      const filePath = this.getAuthConfigFilePath();
      fs.writeFileSync(filePath, JSON.stringify(configObject, null, 2), 'utf8');
    } catch (error) {
      logger.warn('Failed to write auth config file', { error: error.message });
    }
  }

  loadOAuthTokenFromDisk() {
    try {
      const authConfig = this.readAuthConfig();
      this.openaiOAuthToken = String(authConfig.tokens?.openai?.accessToken || '').trim() || null;

      // Backward compatibility for older single-token file.
      if (!this.openaiOAuthToken) {
        const legacyPath = path.join(config.get('app.dataDir'), 'oauth-openai.token');
        if (fs.existsSync(legacyPath)) {
          this.openaiOAuthToken = String(fs.readFileSync(legacyPath, 'utf8') || '').trim() || null;
          if (this.openaiOAuthToken) {
            this.setCodexAuthToken(this.openaiOAuthToken);
            try { fs.unlinkSync(legacyPath); } catch (_) {}
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load Codex auth token', { error: error.message });
    }
  }

  setCodexAuthToken(token) {
    this.openaiOAuthToken = String(token || '').trim() || null;
    const authConfig = this.readAuthConfig();

    if (this.openaiOAuthToken) {
      authConfig.tokens.openai = {
        accessToken: this.openaiOAuthToken,
        updatedAt: new Date().toISOString()
      };
    } else if (authConfig.tokens?.openai) {
      delete authConfig.tokens.openai;
    }

    this.writeAuthConfig(authConfig);
    this.isInitialized = false;
    this.initializeClient();
  }


  base64UrlEncode(buffer) {
    return Buffer.from(buffer)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  createPkcePair() {
    const verifier = this.base64UrlEncode(crypto.randomBytes(64));
    const challenge = this.base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
  }

  buildCodexAuthorizeUrl(options = {}) {
    const clientId = (process.env.CODEX_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann').trim();
    const runtimeRedirectUri = String(options.redirectUri || '').trim();
    const redirectUri = runtimeRedirectUri || (process.env.CODEX_REDIRECT_URI || 'http://localhost:1455/auth/callback').trim();
    const scope = (process.env.CODEX_SCOPE || 'openid profile email offline_access').trim() || 'openid profile email offline_access';
    const authorizeBase = (process.env.CODEX_AUTHORIZE_URL || 'https://auth.openai.com/oauth/authorize').trim();
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = this.createPkcePair();

    const params = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'codex_cli_rs'
    };

    try {
      const url = new URL(authorizeBase);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
      return { url: url.toString(), state, verifier, clientId, redirectUri };
    } catch (error) {
      // Fallback keeps auth usable even if URL parsing fails unexpectedly.
      const qs = querystring.stringify(params);
      const normalizedBase = String(authorizeBase || '').includes('?')
        ? `${authorizeBase}&${qs}`
        : `${authorizeBase}?${qs}`;
      return { url: normalizedBase, state, verifier, clientId, redirectUri };
    }
  }

  async startCodexLoginFlow(options = {}) {
    const shouldOpenBrowser = options.openBrowser !== false;

    try {
      const authRequest = this.buildCodexAuthorizeUrl(options);
      let openedBrowser = false;
      let openBrowserError = null;

      if (shouldOpenBrowser) {
        try {
          await shell.openExternal(authRequest.url);
          openedBrowser = true;
        } catch (error) {
          openBrowserError = error?.message || 'Failed to open browser automatically';
          logger.warn('Failed to open Codex login URL automatically', { error: openBrowserError });
        }
      }

      return {
        success: true,
        loginUrl: authRequest.url,
        state: authRequest.state,
        verifier: authRequest.verifier,
        clientId: authRequest.clientId,
        redirectUri: authRequest.redirectUri,
        openedBrowser,
        openBrowserError,
        instructions: shouldOpenBrowser
          ? (openedBrowser
              ? 'Complete browser login. OAuth callback will finish setup automatically.'
              : 'Browser did not open automatically. Copy this URL and open it manually.')
          : 'Copy this URL, open it in a browser, and complete login.'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        instructions: 'Failed to create OpenAI Authorize URL.'
      };
    }
  }

  async performJsonRequest(url, options = {}) {
    const body = options.body || {};
    const formEncoded = options.formEncoded === true;
    const postData = formEncoded
      ? querystring.stringify(body)
      : JSON.stringify(body);

    const headers = {
      'Content-Type': formEncoded ? 'application/x-www-form-urlencoded' : 'application/json',
      ...(options.headers || {}),
      'Content-Length': Buffer.byteLength(postData)
    };

    const requestOptions = {
      method: options.method || 'POST',
      headers,
      timeout: options.timeout || 15000
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (error) {
            reject(new Error(`Failed to parse JSON response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => reject(new Error(`Login request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Login request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  async exchangeCodexOAuthCode({ code, codeVerifier, clientId, redirectUri }) {
    if (!code || !codeVerifier || !clientId || !redirectUri) {
      throw new Error('Missing OAuth code exchange parameters');
    }

    const tokenEndpoint = (process.env.CODEX_TOKEN_URL || 'https://auth.openai.com/oauth/token').trim();

    return this.performJsonRequest(tokenEndpoint, {
      method: 'POST',
      formEncoded: true,
      body: {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      }
    });
  }


  initializeClient() {
    const provider = this.getCurrentProvider();
    const modelName = this.getCurrentModel();
    const apiKey = this.getProviderApiKey(provider);

    if (!apiKey || String(apiKey).includes('your_')) {
      logger.warn('LLM credentials not configured', {
        provider,
        authMode: this.getProviderAuthMode(provider),
        keyExists: !!apiKey
      });
      this.isInitialized = false;
      return;
    }

    this.provider = provider;
    this.modelName = modelName;
    this.isInitialized = true;

    logger.info('LLM provider initialized successfully', {
      provider,
      model: modelName
    });
  }

  getGenerationConfig(overrides = {}) {
    const provider = this.getCurrentProvider();
    const defaults = config.get(`llm.providers.${provider}.generation`) || {};
    const fallback = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096
    };

    const merged = { ...fallback, ...defaults, ...overrides };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  applyGenerationDefaults(request, overrides = {}) {
    request.generationConfig = this.getGenerationConfig({ ...(request.generationConfig || {}), ...overrides });
    return request;
  }

  extractTextFromCandidates(response) {
    const candidates = Array.isArray(response?.candidates)
      ? response.candidates
      : Array.isArray(response)
        ? response
        : [];

    if (!candidates.length) {
      throw new Error('No candidates in provider response');
    }

    const candidateWithText = candidates.find(candidate => {
      const parts = candidate?.content?.parts;
      return Array.isArray(parts) && parts.some(part => typeof part.text === 'string' && part.text.trim().length > 0);
    });

    if (!candidateWithText) {
      const finishReasons = candidates.map(c => c.finishReason || 'unknown').join(', ');
      throw new Error(`No text parts in candidates. Finish reasons: ${finishReasons}`);
    }

    const textParts = candidateWithText.content.parts
      .filter(part => typeof part.text === 'string' && part.text.trim().length > 0)
      .map(part => part.text.trim());

    if (!textParts.length) {
      throw new Error(`Candidate parts missing text after filtering: ${JSON.stringify(candidateWithText)}`);
    }

    const text = textParts.join('\n');

    return {
      text,
      candidate: candidateWithText,
      finishReason: candidateWithText.finishReason || null
    };
  }

  /**
   * Process an image directly with Gemini using the active skill prompt.
   * The image buffer is sent as inlineData alongside a concise instruction.
   * For image-based queries, we include the skill prompt (e.g., DSA) as systemInstruction.
   * @param {Buffer} imageBuffer - PNG/JPEG image bytes
   * @param {string} mimeType - e.g., 'image/png' or 'image/jpeg'
   * @param {string} activeSkill - current skill (e.g. 'dsa')
   * @param {Array} sessionMemory - optional (not required for image)
   * @param {string|null} programmingLanguage - optional language context for skills that need it
   * @returns {Promise<{response: string, metadata: object}>}
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error(`LLM service not initialized. Check ${this.getProviderDisplayName()} credentials configuration.`);
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      // Build system instruction using the skill prompt (with optional language injection)
      const { promptLoader } = require('../../prompt-loader');
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';

      // Build request with text + image parts
      const base64 = imageBuffer.toString('base64');

      const request = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.formatImageInstruction(activeSkill, programmingLanguage) },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };

      this.applyGenerationDefaults(request);

      if (skillPrompt && skillPrompt.trim().length > 0) {
        request.systemInstruction = { parts: [{ text: skillPrompt }] };
      }

      let responseText = await this.executeRequest(request);

      // Enforce language in code fences if provided
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          provider: this.getCurrentProvider(),
          authMode: this.getProviderAuthMode(this.getCurrentProvider()),
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM image processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      if (this.getProviderConfig().fallbackEnabled !== false) {
        return this.generateFallbackResponse('[image]', activeSkill, error);
      }
      throw error;
    }
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this image for a ${activeSkill.toUpperCase()} question. Extract the problem concisely and provide the best possible solution with explanation and final code.${langNote}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error(`LLM service not initialized. Check ${this.getProviderDisplayName()} credentials configuration.`);
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const response = await this.executeRequest(geminiRequest);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.getProviderConfig().fallbackEnabled !== false) {
        return this.generateFallbackResponse(text, activeSkill, error);
      }
      
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error(`LLM service not initialized. Check ${this.getProviderDisplayName()} credentials configuration.`);
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);

      const response = await this.executeRequest(geminiRequest);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('LLM transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.getProviderConfig().fallbackEnabled !== false) {
        return this.generateIntelligentFallbackResponse(text, activeSkill, error);
      }
      
      throw error;
    }
  }

  /**
   * Normalize all triple-backtick code fences to the selected programming language tag.
   * Does not alter the inner code; only ensures fence language tags are correct.
   */
  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      // Replace all triple-backtick fences' language token with the selected tag
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        // If already the desired fenceTag as the first token, keep as is
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      // Optionally normalize tildes fences to backticks with correct tag
      const normalizedTildes = replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');

      return normalizedTildes;
    } catch (_) {
      return text;
    }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(15);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to old method for compatibility - now with programming language support
    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory,
      programmingLanguage
    );

    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt that already has programming language injected
    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: requestComponents.skillPrompt }]
      };
      
      logger.debug('Using language-enhanced system instruction for skill', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: requestComponents.skillPrompt.length,
        requiresProgrammingLanguage: requestComponents.requiresProgrammingLanguage
      });
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatUserMessage(text, activeSkill) }]
    });

    return request;
  }

  buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Use the skill prompt from context (which may already include programming language)
    if (skillContext.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: skillContext.skillPrompt }]
      };
      
      logger.debug('Using skill context prompt as system instruction', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: skillContext.skillPrompt.length,
        requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false,
        hasLanguageInjection: programmingLanguage && skillContext.requiresProgrammingLanguage
      });
    }

    // Add conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .map(event => {
        const content = event.content.trim();
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      });

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Format and validate the current user input
    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) {
      throw new Error('Failed to format user message or message is empty');
    }

    // Add the current user input
    request.contents.push({
      role: 'user',
      parts: [{ text: formattedMessage }]
    });

    logger.debug('Built Gemini request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSystemInstruction: !!request.systemInstruction,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Validate input text first
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided to buildIntelligentTranscriptionRequest');
    }

    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(10);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to basic intelligent request
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

    // Add intelligent filtering system instruction
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    if (!intelligentPrompt) {
      throw new Error('Failed to generate intelligent transcription prompt');
    }

    request.systemInstruction = {
      parts: [{ text: intelligentPrompt }]
    };

    request.contents.push({
      role: 'user',
      parts: [{ text: cleanText }]
    });

    logger.debug('Built basic intelligent transcription request', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      textLength: cleanText.length,
      hasSystemInstruction: !!request.systemInstruction
    });

    return request;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: []
    };

    this.applyGenerationDefaults(request);

  // For chat/transcription messages, DO NOT include the full skill prompt; use only the intelligent filter prompt
  const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
  request.systemInstruction = { parts: [{ text: intelligentPrompt }] };

    // Add recent conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        // Filter out system messages and ensure content exists and is valid
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .slice(-8) // Keep last 8 exchanges for context
      .map(event => {
        const content = event.content.trim();
        if (!content) {
          logger.warn('Empty content found in conversation history', { event });
          return null;
        }
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      })
      .filter(content => content !== null); // Remove any null entries

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Validate and add the current transcription
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: cleanText }]
    });

    // Ensure we have at least one content item
    if (request.contents.length === 0) {
      throw new Error('No valid content to send to Gemini API');
    }

    logger.debug('Built intelligent transcription request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSkillPrompt: !!skillContext.skillPrompt,
      cleanTextLength: cleanText.length,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    let prompt = `# Intelligent Transcription Response System

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to question/message with appropriate brevity.
Assume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.
Always respond to the point, do not repeat the question or unnecessary information which is not related to ${activeSkill}.`;

    if (activeSkill === 'general') {
  let prompt = `# General Conversation Mode

You are in General mode. General mode is the unrestricted default mode for normal conversation and all-purpose assistance.

Respond naturally to greetings, casual conversation, tests, follow-up messages, and general questions.
Do not redirect the user by saying they must ask something relevant to general.
Do not treat casual conversation as invalid.
If the user says hello, greets you, tests the system, or asks a broad question, respond normally and helpfully.

## Response Rules

- Greetings should receive a normal greeting.
- Test messages should receive a normal confirmation.
- Casual conversation is allowed.
- General questions should be answered directly.
- Complex questions should receive detailed, structured answers when useful.
- Do not reject or redirect messages for being informal, broad, or off-topic.
- General mode should act as a normal all-purpose assistant.`;
    }
    // Add programming language context if provided
    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the transcription IS relevant to ${activeSkill} or is a follow-up question:
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers
- Do not truncate or shorten your response

## Response Style

- Be natural, clear, and useful.
- Keep simple replies short.
- Expand when the question needs detail.
- Use structure only when it improves clarity.

## Response Format:
- Keep responses detailed
- Use bullet points for structured answers
- Be encouraging and helpful
- Stay focused on ${activeSkill}

If the user's input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.

Remember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ${activeSkill}.`;

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  async executeRequest(requestPayload) {
    const provider = this.getCurrentProvider();
    const providerConfig = this.getProviderConfig(provider);
    const maxRetries = providerConfig.maxRetries || 3;
    const timeout = providerConfig.timeout || 60000;

    logger.debug('Executing LLM request', {
      provider,
      model: this.getCurrentModel(),
      timeout,
      maxRetries
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.performPreflightCheck();
        const response = await this.executeProviderRequest(requestPayload, provider, timeout);

        logger.debug('LLM request successful', {
          provider,
          attempt,
          responseLength: response.length
        });

        return response;
      } catch (error) {
        const errorInfo = this.analyzeError(error);

        logger.warn(`LLM API attempt ${attempt} failed`, {
          provider,
          error: error.message,
          errorType: errorInfo.type,
          remainingAttempts: maxRetries - attempt
        });

        if (attempt === maxRetries) {
          const finalError = new Error(`LLM API failed after ${maxRetries} attempts: ${error.message}`);
          finalError.errorAnalysis = errorInfo;
          finalError.originalError = error;
          throw finalError;
        }

        const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
        await this.delay(baseDelay * attempt + Math.random() * 1000);
      }
    }
  }

  async executeProviderRequest(requestPayload, provider, timeout) {
    const apiKey = this.getProviderApiKey(provider);
    const endpoint = this.getProviderEndpoint(provider, this.getCurrentModel());
    const body = this.toProviderPayload(requestPayload, provider);
    const headers = this.getProviderHeaders(provider, apiKey, body);

    const raw = await this.performHttpsPost(endpoint, body, headers, timeout);
    return this.extractProviderText(raw, provider);
  }

  toProviderPayload(geminiRequest, provider) {
    if (provider === 'codex') {
      const instructions = this.extractSystemInstruction(geminiRequest) || 'You are a helpful coding assistant.';
      return {
        model: this.getCurrentModel(),
        instructions,
        input: this.convertToCodexInput(geminiRequest),
        store: false,
        stream: true,
        reasoning: { effort: 'medium', summary: 'auto' },
        text: { verbosity: 'medium' },
        include: ['reasoning.encrypted_content']
      };
    }

    const normalizedProvider = provider === 'codex' ? 'openai' : provider;

    if (normalizedProvider === 'openai') {
      return {
        model: this.getCurrentModel(),
        messages: this.convertToOpenAIMessages(geminiRequest),
        temperature: geminiRequest.generationConfig?.temperature,
        top_p: geminiRequest.generationConfig?.topP,
        max_tokens: geminiRequest.generationConfig?.maxOutputTokens
      };
    }

    if (normalizedProvider === 'anthropic') {
      const messages = this.convertToAnthropicMessages(geminiRequest).filter(msg => msg.role !== 'system');
      const system = this.extractSystemInstruction(geminiRequest) || undefined;
      return {
        model: this.getCurrentModel(),
        max_tokens: geminiRequest.generationConfig?.maxOutputTokens || 4096,
        temperature: geminiRequest.generationConfig?.temperature,
        top_p: geminiRequest.generationConfig?.topP,
        system,
        messages
      };
    }

    return geminiRequest;
  }

  convertToOpenAIMessages(geminiRequest) {
    const messages = [];
    const systemText = this.extractSystemInstruction(geminiRequest);
    if (systemText) {
      messages.push({ role: 'system', content: systemText });
    }

    for (const entry of geminiRequest.contents || []) {
      const role = entry.role === 'model' ? 'assistant' : 'user';
      const content = [];

      for (const part of (entry.parts || [])) {
        if (part.text) {
          content.push({ type: 'text', text: part.text });
        } else if (part.inlineData) {
          const mime = part.inlineData.mimeType || 'image/png';
          content.push({
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${part.inlineData.data}` }
          });
        }
      }

      if (content.length) {
        messages.push({ role, content: content.length === 1 && content[0].type === 'text' ? content[0].text : content });
      }
    }

    return messages;
  }

  convertToAnthropicMessages(geminiRequest) {
    const messages = [];

    for (const entry of geminiRequest.contents || []) {
      const role = entry.role === 'model' ? 'assistant' : 'user';
      const content = [];

      for (const part of (entry.parts || [])) {
        if (part.text) {
          content.push({ type: 'text', text: part.text });
        } else if (part.inlineData) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.inlineData.mimeType || 'image/png',
              data: part.inlineData.data
            }
          });
        }
      }

      if (content.length) {
        messages.push({ role, content });
      }
    }

    return messages;
  }

  convertToCodexInput(geminiRequest) {
    const input = [];

    for (const entry of geminiRequest.contents || []) {
      const role = entry.role === 'model' ? 'assistant' : 'user';
      const content = [];

      for (const part of (entry.parts || [])) {
        if (part.text) {
          const textType = role === 'assistant' ? 'output_text' : 'input_text';
          content.push({ type: textType, text: part.text });
        } else if (part.inlineData && role === 'user') {
          const mime = part.inlineData.mimeType || 'image/png';
          content.push({
            type: 'input_image',
            image_url: `data:${mime};base64,${part.inlineData.data}`
          });
        }
      }

      if (content.length) {
        input.push({ type: 'message', role, content });
      }
    }

    return input;
  }

  extractSystemInstruction(geminiRequest) {
    const parts = geminiRequest.systemInstruction?.parts || [];
    return parts.map(part => part.text || '').filter(Boolean).join('\n').trim();
  }

  getProviderHeaders(provider, apiKey, payload) {
    const postData = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': this.getUserAgent()
    };

    if (provider === 'codex') {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['OpenAI-Beta'] = 'responses=experimental';
      headers.originator = 'codex_cli_rs';
      headers.accept = 'application/json, text/event-stream';
      const accountId = this.getCodexAccountIdFromToken(apiKey);
      if (accountId) {
        headers['chatgpt-account-id'] = accountId;
      }
      return headers;
    }

    const normalizedProvider = provider === 'codex' ? 'openai' : provider;
    if (normalizedProvider === 'openai') {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (normalizedProvider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['x-goog-api-key'] = apiKey;
    }

    return headers;
  }

  performHttpsPost(url, payload, headers, timeout) {
    const postData = JSON.stringify(payload);
    const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });

    const options = {
      method: 'POST',
      headers,
      timeout,
      agent
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }

          try {
            const contentType = String(res.headers['content-type'] || '').toLowerCase();
            const isSse = contentType.includes('text/event-stream') || String(data).includes('\ndata: ');
            if (isSse) {
              const parsed = this.parseSSEToJson(data);
              if (!parsed) {
                const sample = String(data || '').slice(0, 800);
                logger.warn('Unable to parse SSE provider response', {
                  provider: this.getCurrentProvider(),
                  contentType,
                  sample
                });
                reject(new Error('Failed to parse SSE provider response'));
                return;
              }
              resolve(parsed);
              return;
            }

            resolve(JSON.parse(data));
          } catch (parseError) {
            reject(new Error(`Failed to parse provider response: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => reject(new Error(`Provider request failed: ${error.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Provider request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  parseSSEToJson(sseText) {
    try {
      const raw = String(sseText || '').trim();
      if (!raw) return null;

      // Some providers may still return plain JSON even when stream is requested.
      if (raw.startsWith('{')) {
        try {
          return JSON.parse(raw);
        } catch {
          // continue with SSE parsing
        }
      }

      const lines = raw.split(/\r?\n/);
      let deltaText = '';
      let snapshotText = '';
      let finalResponse = null;

      const mergeChunk = (current, incoming) => {
        const next = String(incoming || '');
        if (!next) return current;
        if (!current) return next;

        // Some SSE variants send cumulative chunks; replace instead of append.
        if (next.startsWith(current)) return next;

        // Ignore exact duplicate chunk.
        if (current.endsWith(next)) return current;

        return current + next;
      };

      const extractSnapshotText = (event) => {
        if (typeof event?.response?.output_text === 'string' && event.response.output_text.trim()) {
          return event.response.output_text.trim();
        }
        if (typeof event?.output_text === 'string' && event.output_text.trim()) {
          return event.output_text.trim();
        }

        const content = Array.isArray(event?.item?.content) ? event.item.content : [];
        const parts = content
          .map((part) => {
            if (typeof part?.output_text === 'string') return part.output_text;
            if (typeof part?.text === 'string') return part.text;
            return '';
          })
          .filter(Boolean);

        return parts.join(' ').trim();
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const jsonPart = trimmed.slice(5).trim();
        if (!jsonPart || jsonPart === '[DONE]') continue;

        let event;
        try {
          event = JSON.parse(jsonPart);
        } catch {
          continue;
        }

        const eventType = String(event?.type || '');

        if (eventType === 'response.done' || eventType === 'response.completed') {
          if (event.response && typeof event.response === 'object') {
            finalResponse = event.response;
          } else if (!finalResponse && typeof event === 'object') {
            finalResponse = event;
          }
          continue;
        }

        // Append only true delta chunks to avoid duplicating snapshot text.
        if (eventType.includes('delta') && typeof event?.delta === 'string') {
          deltaText = mergeChunk(deltaText, event.delta);
          continue;
        }

        const snapshot = extractSnapshotText(event);
        if (snapshot && snapshot.length > snapshotText.length) {
          snapshotText = snapshot;
        }
      }

      const finalText = (deltaText.trim() || snapshotText.trim());

      if (finalResponse && typeof finalResponse === 'object') {
        const hasTopLevelText = typeof finalResponse.output_text === 'string' && finalResponse.output_text.trim();
        const hasOutputItems = Array.isArray(finalResponse.output) && finalResponse.output.length > 0;

        if (!hasTopLevelText && !hasOutputItems && finalText) {
          finalResponse.output_text = finalText;
          finalResponse.output = [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: finalText }]
            }
          ];
        }

        return finalResponse;
      }

      if (!finalText) return null;

      return {
        output_text: finalText,
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: finalText }]
          }
        ]
      };
    } catch {
      return null;
    }
  }

  extractProviderText(response, provider) {
    if (provider === 'codex') {
      return this.extractCodexResponseText(response);
    }

    const normalizedProvider = provider === 'codex' ? 'openai' : provider;

    if (normalizedProvider === 'openai') {
      const content = response?.choices?.[0]?.message?.content;
      if (!content) throw new Error('No text in OpenAI response');
      if (Array.isArray(content)) {
        const text = content
          .filter(part => part?.type === 'text' && typeof part.text === 'string')
          .map(part => part.text)
          .join('\n')
          .trim();
        if (!text) throw new Error('No text in OpenAI response content array');
        return text;
      }
      return String(content).trim();
    }

    if (normalizedProvider === 'anthropic') {
      const content = Array.isArray(response?.content) ? response.content : [];
      const text = content.filter(item => item.type === 'text').map(item => item.text).join('\n').trim();
      if (!text) throw new Error('No text in Anthropic response');
      return text;
    }

    const { text } = this.extractTextFromCandidates(response);
    return text;
  }

  extractCodexResponseText(response) {
    const payload = response?.response || response || {};
    const output = Array.isArray(payload?.output) ? payload.output : [];

    const normalize = (value) => String(value || '').replace(/\r\n/g, '\n').trim();

    // Prefer top-level output_text first to avoid double-counting the same text.
    if (Array.isArray(payload?.output_text)) {
      const topLevel = payload.output_text
        .map((chunk) => (typeof chunk === 'string' ? chunk : (chunk?.text || chunk?.value || '')))
        .map(normalize)
        .filter(Boolean)
        .join('\n')
        .trim();
      if (topLevel) return topLevel;
    } else {
      const topLevel = normalize(payload?.output_text);
      if (topLevel) return topLevel;
    }

    const candidates = [];
    const seen = new Set();
    const addCandidate = (value) => {
      const text = normalize(value);
      if (!text) return;
      if (seen.has(text)) return;
      seen.add(text);
      candidates.push(text);
    };

    for (const item of output) {
      addCandidate(item?.output_text);
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        addCandidate(part?.output_text);
        addCandidate(part?.text);
        addCandidate(part?.refusal);
        addCandidate(part?.output_text?.value);
        addCandidate(part?.text?.value);
      }
    }

    const text = candidates.join('\n').trim();
    if (text) return text;

    logger.warn('Codex response had no extractable text', {
      provider: this.getCurrentProvider(),
      keys: Object.keys(payload || {}),
      outputCount: output.length,
      sample: JSON.stringify(payload).slice(0, 1200)
    });

    throw new Error('No text in Codex response');
  }

  getCodexAccountIdFromToken(token) {
    try {
      const jwt = String(token || '').trim();
      const parts = jwt.split('.');
      if (parts.length < 2) return null;

      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      const claims = JSON.parse(decoded);

      return claims?.['https://api.openai.com/auth']?.chatgpt_account_id || null;
    } catch {
      return null;
    }
  }

  async performPreflightCheck() {
    try {
      const provider = this.getCurrentProvider();
      const host = provider === 'codex'
        ? 'chatgpt.com'
        : provider === 'openai'
          ? 'api.openai.com'
          : provider === 'anthropic'
            ? 'api.anthropic.com'
            : 'generativelanguage.googleapis.com';
      await this.testNetworkConnection({ host, port: 443, name: `${provider} API Endpoint` });
    } catch (error) {
      logger.warn('Preflight check failed', {
        error: error.message,
        provider: this.getCurrentProvider()
      });
    }
  }

  getUserAgent() {
    try {
      // Try to get user agent from Electron if available
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return navigator.userAgent;
      }
      return `Node.js/${process.version} (${process.platform}; ${process.arch})`;
    } catch {
      return 'Unknown';
    }
  }

  analyzeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network connectivity errors
    if (errorMessage.includes('fetch failed') || 
        errorMessage.includes('network error') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('timeout')) {
      return {
        type: 'NETWORK_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check internet connection and firewall settings'
      };
    }
    
    // API key errors
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        isNetworkError: false,
        suggestedAction: `Verify ${this.getProviderDisplayName()} credentials configuration`
      };
    }
    
    // Rate limiting
    if (errorMessage.includes('quota') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return {
        type: 'RATE_LIMIT_ERROR',
        isNetworkError: false,
        suggestedAction: 'Wait before retrying or check API quota'
      };
    }
    
    // Timeout errors
    if (errorMessage.includes('request timeout') || errorMessage.includes('etimedout')) {
      return {
        type: 'TIMEOUT_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check network latency or increase timeout'
      };
    }
    
    return {
      type: 'UNKNOWN_ERROR',
      isNetworkError: false,
      suggestedAction: 'Check logs for more details'
    };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = [
      { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
      { host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' }
    ];

    const results = await Promise.allSettled(
      connectivityTests.map(test => this.testNetworkConnection(test))
    );

    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map((result, index) => ({
        ...connectivityTests[index],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };

    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  async testNetworkConnection({ host, port, name }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed to ${host}:${port}: ${error.message}`));
      });

      socket.connect(port, host);
    });
  }

  generateFallbackResponse(text, activeSkill, error = null) {
    const provider = this.getCurrentProvider();
    const providerName = this.getProviderDisplayName(provider);
    const errorAnalysis = error ? this.analyzeError(error) : { type: 'UNKNOWN_ERROR' };
    const errorMessage = String(error?.message || '').toLowerCase();

    logger.info('Generating fallback response', {
      activeSkill,
      provider,
      errorType: errorAnalysis.type
    });

    let defaultMessage = `I can help analyze this content. ${providerName} request failed. Please try again.`;

    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('exceeded your current quota')) {
      defaultMessage = `${providerName} quota exceeded. Add credits/billing on your provider account or switch to another provider in Settings.`;
    } else if (errorAnalysis.type === 'AUTH_ERROR') {
      defaultMessage = `${providerName} authentication failed. Please reconnect login/API key in Settings and try again.`;
    } else if (errorAnalysis.type === 'NETWORK_ERROR' || errorAnalysis.type === 'TIMEOUT_ERROR') {
      defaultMessage = `${providerName} network request failed. Check connection and retry.`;
    }

    const fallbackResponses = {
      dsa: 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      programming: 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      default: defaultMessage
    };

    const response = fallbackResponses[activeSkill] || fallbackResponses.default;

    return {
      response,
      metadata: {
        skill: activeSkill,
        provider,
        authMode: this.getProviderAuthMode(provider),
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        errorType: errorAnalysis.type
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill, error = null) {
    const provider = this.getCurrentProvider();
    const providerName = this.getProviderDisplayName(provider);
    const errorAnalysis = error ? this.analyzeError(error) : { type: 'UNKNOWN_ERROR' };
    const errorMessage = String(error?.message || '').toLowerCase();

    logger.info('Generating intelligent fallback response for transcription', {
      activeSkill,
      provider,
      errorType: errorAnalysis.type
    });

    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('exceeded your current quota')) {
      return {
        response: `${providerName} quota exceeded. Add credits/billing on your provider account or switch provider in Settings.`,
        metadata: {
          skill: activeSkill,
          provider,
          authMode: this.getProviderAuthMode(provider),
          processingTime: 0,
          requestId: this.requestCount,
          usedFallback: true,
          isTranscriptionResponse: true,
          errorType: errorAnalysis.type
        }
      };
    }

    // Simple heuristic to determine if message seems skill-related
    const skillKeywords = {
      dsa: ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      programming: ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'syntax'],
      'system-design': ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache'],
      behavioral: ['interview', 'experience', 'situation', 'leadership', 'conflict', 'team'],
      sales: ['customer', 'deal', 'negotiation', 'price', 'revenue', 'prospect'],
      presentation: ['slide', 'audience', 'public speaking', 'presentation', 'nervous'],
      'data-science': ['data', 'model', 'machine learning', 'statistics', 'analytics', 'python', 'pandas'],
      devops: ['deployment', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'monitoring'],
      negotiation: ['negotiate', 'compromise', 'agreement', 'terms', 'conflict resolution']
    };

    const textLower = String(text || '').toLowerCase();
    const relevantKeywords = skillKeywords[activeSkill] || [];
    const hasRelevantKeywords = relevantKeywords.some(keyword => textLower.includes(keyword));

    // Check for question indicators
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', 'should i', '?'];
    const seemsLikeQuestion = questionIndicators.some(indicator => textLower.includes(indicator));

    let response;
    if (hasRelevantKeywords || seemsLikeQuestion) {
      response = `I'm having trouble processing that right now, but it sounds like a ${activeSkill} question. Could you rephrase or ask more specifically about what you need help with?`;
    } else {
      response = `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;
    }

    return {
      response,
      metadata: {
        skill: activeSkill,
        provider,
        authMode: this.getProviderAuthMode(provider),
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true,
        errorType: errorAnalysis.type
      }
    };
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      const networkCheck = await this.checkNetworkConnectivity();
      const testRequest = { contents: [{ role: 'user', parts: [{ text: 'Test connection. Please respond with "OK".' }] }] };
      this.applyGenerationDefaults(testRequest, { temperature: 0, maxOutputTokens: 24 });

      const startTime = Date.now();
      const response = await this.executeRequest(testRequest);
      const latency = Date.now() - startTime;

      return {
        success: true,
        response,
        latency,
        provider: this.getCurrentProvider(),
        model: this.getCurrentModel(),
        networkConnectivity: networkCheck
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: this.getCurrentProvider(),
        model: this.getCurrentModel(),
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
    }
  }

  updateApiKey(newApiKey, provider = this.getCurrentProvider()) {
    const envKeyMap = {
      gemini: 'GEMINI_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY'
    };
    const envKey = envKeyMap[provider] || 'GEMINI_API_KEY';
    process.env[envKey] = String(newApiKey || '').trim();
    this.isInitialized = false;
    this.initializeClient();
    logger.info('Provider API key updated and client reinitialized', { provider });
  }

  updateProviderModel(provider, model) {
    const requestedProvider = provider || this.getCurrentProvider();
    const providerModels = config.get(`llm.providers.${requestedProvider}.models`) || [];
    const hasRequestedModel = !!model && providerModels.includes(model);

    this.provider = requestedProvider;
    this.modelName = hasRequestedModel
      ? model
      : this.getProviderDefaultModel(requestedProvider);

    config.set('llm.provider', this.provider);
    config.set('llm.model', this.modelName);
    this.isInitialized = false;
    this.initializeClient();
  }

  getStats() {
    const provider = this.getCurrentProvider();
    return {
      isInitialized: this.isInitialized,
      provider,
      providerDisplayName: this.getProviderDisplayName(provider),
      model: this.getCurrentModel(),
      hasApiKey: !!this.getProviderApiKey(provider),
      authMode: this.getProviderAuthMode(provider),
      authModes: this.getAuthModes(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      providers: config.get('llm.providers') || {}
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LLMService();