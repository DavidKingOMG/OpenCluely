const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.OpenCluely');
    this.loadConfiguration();
  }

  loadConfiguration() {
    this.config = {
      app: {
        name: 'OpenCluely',
        version: '1.0.0',
        processTitle: 'OpenCluely',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      llm: {
        provider: 'gemini',
        model: 'gpt-5.3-codex',
        authModes: {
          gemini: 'apiKey',
          openai: 'apiKey',
          codex: 'oauth',
          anthropic: 'apiKey'
        },
        providers: {
          gemini: {
            models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
            maxRetries: 3,
            timeout: 60000,
            fallbackEnabled: true,
            enableFallbackMethod: true,
            generation: {
              temperature: 0.7,
              topK: 32,
              topP: 0.9,
              maxOutputTokens: 4096
            }
          },
          openai: {
            models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o4-mini'],
            maxRetries: 2,
            timeout: 45000,
            fallbackEnabled: true,
            generation: {
              temperature: 0.6,
              maxOutputTokens: 4096
            }
          },
          codex: {
            models: [
              'gpt-5.3-codex',
              'gpt-5.2-codex',
              'gpt-5.2',
              'gpt-5.2-none',
              'gpt-5.2-low',
              'gpt-5.2-medium',
              'gpt-5.2-high',
              'gpt-5.2-xhigh',
              'gpt-5.1-codex-max',
              'gpt-5.1-codex',
              'gpt-5.1-codex-mini',
              'gpt-5.1-codex-mini-medium',
              'gpt-5.1-codex-mini-high',
              'gpt-5.1',
              'gpt-5.1-none',
              'gpt-5.1-low',
              'gpt-5.1-medium',
              'gpt-5.1-high',
              'gpt-5.1-chat-latest',
              'gpt-5-codex',
              'codex-mini-latest',
              'gpt-5-codex-mini',
              'gpt-5-codex-mini-medium',
              'gpt-5-codex-mini-high',
              'gpt-5',
              'gpt-5-mini',
              'gpt-5-nano'
            ],
            maxRetries: 2,
            timeout: 45000,
            fallbackEnabled: true,
            generation: {
              temperature: 0.6,
              maxOutputTokens: 4096
            }
          },
          anthropic: {
            models: ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest', 'claude-3-7-haiku-latest'],
            maxRetries: 3,
            timeout: 60000,
            fallbackEnabled: true,
            generation: {
              temperature: 0.7,
              topP: 0.9,
              maxOutputTokens: 4096
            }
          }
        }
      },

      speech: {
        provider: 'azure',
        azure: {
          language: 'en-US',
          enableDictation: true,
          enableAudioLogging: false,
          outputFormat: 'detailed'
        },
        whisper: {
          model: 'base',
          language: 'en',
          segmentMs: 4000
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey];
  }

  isFeatureEnabled(feature) {
    return this.get(`features.${feature}`) !== false;
  }
}

module.exports = new ConfigManager();
