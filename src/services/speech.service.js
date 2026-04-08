// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: { 
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => {}
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: { 
      createElement: (tagName) => {
        const element = {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => {},
          removeChild: () => {},
          insertBefore: () => {},
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => {},
          click: () => {},
          focus: () => {},
          blur: () => {}
        };
        
        // Special handling for audio elements
        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => {},
            load: () => {},
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }
        
        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      }
    },
    location: { 
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    // Add console methods if not available
    console: global.console || {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    AudioContext: class AudioContext {
      constructor() { 
        this.state = 'running'; 
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = { 
          connect: () => {}, 
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) { 
        return { 
          connect: () => {}, 
          disconnect: () => {},
          mediaStream: stream
        }; 
      }
      createGain() { 
        return { 
          connect: () => {}, 
          disconnect: () => {}, 
          gain: { 
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        }; 
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) { 
        return { 
          connect: () => {}, 
          disconnect: () => {}, 
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        }; 
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData(audioData) {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() { 
        this.state = 'suspended';
        return Promise.resolve(); 
      }
      resume() { 
        this.state = 'running';
        return Promise.resolve(); 
      }
      close() { 
        this.state = 'closed';
        return Promise.resolve(); 
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() { 
        this.state = 'running'; 
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = { 
          connect: () => {}, 
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) { 
        return { 
          connect: () => {}, 
          disconnect: () => {},
          mediaStream: stream
        }; 
      }
      createGain() { 
        return { 
          connect: () => {}, 
          disconnect: () => {}, 
          gain: { 
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        }; 
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) { 
        return { 
          connect: () => {}, 
          disconnect: () => {}, 
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        }; 
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData(audioData) {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() { 
        this.state = 'suspended';
        return Promise.resolve(); 
      }
      resume() { 
        this.state = 'running';
        return Promise.resolve(); 
      }
      close() { 
        this.state = 'closed';
        return Promise.resolve(); 
      }
    },
    // Add additional globals that might be needed
    URL: class URL {
      constructor(url, base) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() { return this.href; }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() { return new Blob(); }
      stream() { return new ReadableStream(); }
      text() { return Promise.resolve(''); }
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() { return new File([], this.name); }
      stream() { return new ReadableStream(); }
      text() { return Promise.resolve(''); }
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;
  
  // Additional polyfills that might be needed
  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      clearMarks: () => {},
      clearMeasures: () => {},
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }
  
  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const sdk = require('microsoft-cognitiveservices-speech-sdk');
const recorder = require('node-record-lpcm16');
const { EventEmitter } = require('events');
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');


class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false; // track availability
    this.provider = process.env.STT_PROVIDER || 'azure';
    this.localWhisperReady = false;
    this.whisperBootstrapInProgress = false;
    this.localWhisperChunks = [];
    this.localWhisperTempFile = null;
    this.localWhisperTranscriptBuffer = [];
    this.whisperStreamProcess = null;
    this.whisperCaptureDevicesCache = [];
    this.whisperCaptureDevicesCacheAt = 0;

    this.initializeClient();
  }

  getWhisperCacheDir() {
    return path.join(os.homedir(), '.OpenCluely', 'stt', 'whisper');
  }

  getWhisperRunDir() {
    return path.join(os.homedir(), '.OpenCluely', 'stt', 'runtime');
  }

  getWhisperModelName() {
    const requested = String(process.env.WHISPER_MODEL || 'ggml-base.en.bin').trim();
    const allowed = new Set(['ggml-tiny.en.bin', 'ggml-base.en.bin', 'ggml-small.en.bin']);
    return allowed.has(requested) ? requested : 'ggml-small.en.bin';
  }

  getWhisperModelPath() {
    return path.join(this.getWhisperCacheDir(), this.getWhisperModelName());
  }

  getWhisperBinaryCandidates() {
    const runDir = this.getWhisperRunDir();
    const candidates = [];

    if (process.platform === 'win32') {
      candidates.push(path.join(runDir, 'whisper-cli.exe'));
      candidates.push(path.join(runDir, 'main.exe'));
      candidates.push('whisper-cli.exe');
      candidates.push('main.exe');
    } else {
      candidates.push(path.join(runDir, 'whisper-cli'));
      candidates.push(path.join(runDir, 'main'));
      candidates.push('whisper-cli');
      candidates.push('main');
    }

    return candidates;
  }

  findWhisperBinaryPath() {
    const candidates = this.getWhisperBinaryCandidates();
    for (const candidate of candidates) {
      if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const runtimeDir = this.getWhisperRunDir();
    if (!fs.existsSync(runtimeDir)) {
      return null;
    }

    const targetNames = process.platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe']
      : ['whisper-cli', 'main'];

    const stack = [runtimeDir];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (targetNames.includes(entry.name)) {
          return fullPath;
        }
      }
    }

    return null;
  }

  getWhisperRuntimeAssetUrl() {
    const override = (process.env.WHISPER_RUNTIME_ZIP_URL || '').trim();
    if (override) {
      return override;
    }

    if (process.platform === 'win32') {
      const arch = process.arch;
      if (arch === 'x64') {
        return 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip';
      }
      return 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-Win32.zip';
    }

    throw new Error('Automatic whisper runtime download is currently supported on Windows only');
  }

  async extractZip(zipPath, destinationDir) {
    if (process.platform !== 'win32') {
      throw new Error('Zip extraction helper currently supports Windows only');
    }

    await new Promise((resolve, reject) => {
      const command = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`;
      const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `Zip extraction failed with exit code ${code}`));
      });
    });
  }

  async ensureWhisperRuntimeInstalled() {
    const runtimeDir = this.getWhisperRunDir();
    fs.mkdirSync(runtimeDir, { recursive: true });

    const existing = this.findWhisperBinaryPath();
    if (existing) {
      return { ready: true, source: 'existing', binaryPath: existing };
    }

    const zipUrl = this.getWhisperRuntimeAssetUrl();
    const zipPath = path.join(runtimeDir, 'whisper-runtime.zip');

    this.emit('status', 'Downloading Whisper runtime...');
    await this.downloadFile(zipUrl, zipPath);

    this.emit('status', 'Installing Whisper runtime...');
    await this.extractZip(zipPath, runtimeDir);

    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (_) {}

    const installedBinary = this.findWhisperBinaryPath();
    if (!installedBinary) {
      throw new Error('Whisper runtime installed but CLI binary not found');
    }

    return { ready: true, source: 'downloaded', binaryPath: installedBinary };
  }

  async resolveWhisperCli() {
    const explicit = (process.env.WHISPER_CLI_PATH || '').trim();
    if (explicit && fs.existsSync(explicit)) {
      return explicit;
    }

    const discovered = this.findWhisperBinaryPath();
    if (discovered) {
      return discovered;
    }

    throw new Error('whisper.cpp CLI binary not found. Set WHISPER_CLI_PATH or place whisper-cli in ~/.OpenCluely/stt/runtime');
  }

  buildWavFromPcmBuffer(pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmBuffer.copy(buffer, 44);

    return buffer;
  }

  async downloadFile(url, destinationPath) {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destinationPath);
      const request = https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          fileStream.close();
          try { fs.unlinkSync(destinationPath); } catch (_) {}
          this.downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          fileStream.close();
          try { fs.unlinkSync(destinationPath); } catch (_) {}
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destinationPath));
        });
      });

      request.on('error', (error) => {
        fileStream.close();
        try { fs.unlinkSync(destinationPath); } catch (_) {}
        reject(error);
      });

      fileStream.on('error', (error) => {
        fileStream.close();
        try { fs.unlinkSync(destinationPath); } catch (_) {}
        reject(error);
      });
    });
  }

  resolveWhisperStreamExecutable() {
    const explicit = (process.env.WHISPER_STREAM_PATH || '').trim();
    if (explicit && fs.existsSync(explicit)) {
      return explicit;
    }

    const runtimeDir = this.getWhisperRunDir();
    const candidates = process.platform === 'win32'
      ? [path.join(runtimeDir, 'whisper-stream.exe'), path.join(runtimeDir, 'stream.exe')]
      : [path.join(runtimeDir, 'whisper-stream'), path.join(runtimeDir, 'stream')];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const discoveredCli = this.findWhisperBinaryPath();
    if (discoveredCli) {
      const dir = path.dirname(discoveredCli);
      const nearby = process.platform === 'win32'
        ? [path.join(dir, 'whisper-stream.exe'), path.join(dir, 'stream.exe')]
        : [path.join(dir, 'whisper-stream'), path.join(dir, 'stream')];
      for (const candidate of nearby) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  sanitizeWhisperStreamText(rawText) {
    const text = String(rawText || '');
    if (!text.trim()) return '';

    const withoutAnsi = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ' ');
    const normalized = withoutAnsi.replace(/\r/g, '\n');
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);

    const cleanedLines = lines.map((line) => {
      return line
        .replace(/\[BLANK_AUDIO\]/gi, ' ')
        .replace(/\[Start speaking\]/gi, ' ')
        .replace(/\[\d+[A-Za-z]?\]/g, ' ')
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }).filter((line) => {
      if (!line) return false;
      const lower = line.toLowerCase();
      if (lower.startsWith('init:')) return false;
      if (lower.startsWith('sdl_main:')) return false;
      if (lower.startsWith('whisper_')) return false;
      if (lower.startsWith('usage:')) return false;
      if (lower.includes('capture device #')) return false;
      if (lower.includes('warning: the binary')) return false;
      return true;
    });

    const merged = cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
    if (!merged) return '';
    if (/^[\W_]+$/.test(merged)) return '';
    return merged;
  }

  parseWhisperCaptureDevices(outputText) {
    const lines = String(outputText || '').split(/\r?\n/);
    const deviceRegex = /capture device #(\d+):\s*'([^']+)'/i;
    const devices = [];

    for (const line of lines) {
      const match = line.match(deviceRegex);
      if (!match) continue;
      devices.push({ index: Number(match[1]), name: String(match[2] || '') });
    }

    return devices;
  }

  _probeWhisperCaptureDevices() {
    const streamExe = this.resolveWhisperStreamExecutable();
    if (!streamExe) return [];

    const probe = spawnSync(streamExe, ['-m', this.getWhisperModelPath(), '--step', '800', '--length', '1600', '--keep', '100'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 1200
    });

    const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
    return this.parseWhisperCaptureDevices(output);
  }

  _getCachedWhisperCaptureDevices() {
    const now = Date.now();
    if (now - this.whisperCaptureDevicesCacheAt < 5000 && this.whisperCaptureDevicesCache.length) {
      return this.whisperCaptureDevicesCache;
    }

    try {
      const devices = this._probeWhisperCaptureDevices();
      this.whisperCaptureDevicesCache = devices;
      this.whisperCaptureDevicesCacheAt = now;
      return devices;
    } catch (_) {
      return this.whisperCaptureDevicesCache || [];
    }
  }

  getWhisperCaptureDevices(source = 'microphone') {
    try {
      const devices = this._getCachedWhisperCaptureDevices();
      const mode = String(source || 'microphone').toLowerCase();

      const isOutputLike = (name) => {
        const n = String(name || '').toLowerCase();
        return (
          n.includes('stereo mix') ||
          n.includes('loopback') ||
          n.includes('what u hear') ||
          n.includes('virtual audio') ||
          n.includes('speaker') ||
          n.includes('output') ||
          n.includes('monitor') ||
          n.includes('sonar') ||
          n.includes('line out') ||
          n.includes('headphone') ||
          n.includes('headset earphone')
        );
      };

      if (mode === 'system') {
        return devices.filter((d) => isOutputLike(d.name));
      }

      return devices.filter((d) => !isOutputLike(d.name) || String(d.name || '').toLowerCase().includes('microphone'));
    } catch (_) {
      return [];
    }
  }

  getWhisperCaptureSelection(streamExe) {
    const source = String(process.env.WHISPER_AUDIO_SOURCE || 'microphone').toLowerCase();
    const manual = String(process.env.WHISPER_CAPTURE_DEVICE || 'auto').trim();

    if (manual !== 'auto') {
      const parsedManual = Number(manual);
      if (Number.isFinite(parsedManual) && parsedManual >= 0) {
        return { index: parsedManual, mode: 'manual', source };
      }
    }

    if (source !== 'system') {
      return { index: -1, mode: 'default-mic', source };
    }

    try {
      const candidates = this._getCachedWhisperCaptureDevices();

      if (!candidates.length) {
        return { index: -1, mode: 'system-missing', source };
      }

      const score = (name) => {
        const n = name.toLowerCase();
        let s = 0;
        if (n.includes('stereo mix')) s += 10;
        if (n.includes('loopback')) s += 10;
        if (n.includes('what u hear')) s += 9;
        if (n.includes('speaker')) s += 7;
        if (n.includes('output')) s += 7;
        if (n.includes('monitor')) s += 6;
        if (n.includes('line out')) s += 6;
        if (n.includes('virtual audio')) s += 5;
        if (n.includes('headphone')) s += 4;
        if (n.includes('sonar')) s += 2;
        if (n.includes('microphone')) s -= 9;
        return s;
      };

      candidates.sort((a, b) => score(b.name) - score(a.name));
      if (score(candidates[0].name) <= 2) {
        return { index: -1, mode: 'system-missing', source };
      }
      return { index: candidates[0].index, mode: 'system-auto', source };
    } catch (_) {
      return { index: -1, mode: 'system-missing', source };
    }
  }

  startWhisperStreamCapture() {
    const streamExe = this.resolveWhisperStreamExecutable();
    if (!streamExe) {
      throw new Error('whisper-stream executable not found in runtime');
    }

    const modelPath = this.getWhisperModelPath();
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Whisper model missing at ${modelPath}`);
    }

    const stepMs = Math.max(600, Number(process.env.WHISPER_INTERVAL_MS || 2000));
    const lengthMs = Math.max(stepMs * 2, 6000);
    const keepMs = Math.max(100, Math.round(stepMs / 4));
    const capture = this.getWhisperCaptureSelection(streamExe);

    if (capture.source === 'system' && capture.index < 0) {
      throw new Error('System loopback device not found. Select Whisper Capture Device manually.');
    }

    this.localWhisperTranscriptBuffer = [];
    const args = ['-m', modelPath, '-l', 'en', '--step', String(stepMs), '--length', String(lengthMs), '--keep', String(keepMs), '--max-tokens', '64'];
    if (capture.index >= 0) {
      args.push('--capture', String(capture.index));
      this.emit('status', capture.source === 'system'
        ? `Whisper using system audio device #${capture.index}`
        : `Whisper using capture device #${capture.index}`);
    }
    this.whisperStreamProcess = spawn(streamExe, args, { windowsHide: true });

    this.whisperStreamProcess.stdout.on('data', (chunk) => {
      const text = this.sanitizeWhisperStreamText(chunk);
      if (!text) return;
      const last = this.localWhisperTranscriptBuffer[this.localWhisperTranscriptBuffer.length - 1] || '';
      if (text === last) return;
      this.localWhisperTranscriptBuffer.push(text);
      this.emit('interim-transcription', text);
    });

    this.whisperStreamProcess.stderr.on('data', (chunk) => {
      const text = this.sanitizeWhisperStreamText(chunk);
      if (!text) return;

      const last = this.localWhisperTranscriptBuffer[this.localWhisperTranscriptBuffer.length - 1] || '';
      if (text !== last && !text.toLowerCase().includes('error')) {
        this.localWhisperTranscriptBuffer.push(text);
        this.emit('interim-transcription', text);
      }

      if (text.toLowerCase().includes('error')) {
        logger.warn('Whisper stream stderr', { message: text });
      }
    });

    this.whisperStreamProcess.on('error', (error) => {
      this.emit('error', `Whisper stream error: ${error.message}`);
    });
  }

  stopWhisperStreamCapture() {
    const transcript = this.localWhisperTranscriptBuffer.join(' ').replace(/\s+/g, ' ').trim();

    if (this.whisperStreamProcess) {
      try {
        this.whisperStreamProcess.kill();
      } catch (_) {}
      this.whisperStreamProcess = null;
    }

    this.localWhisperTranscriptBuffer = [];
    return transcript;
  }

  async runWhisperTranscription(audioFilePath) {
    const whisperCli = await this.resolveWhisperCli();
    const modelPath = this.getWhisperModelPath();
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Whisper model missing at ${modelPath}`);
    }

    const tempOutPrefix = path.join(this.getWhisperCacheDir(), `whisper-out-${Date.now()}`);
    const args = [
      '-m', modelPath,
      '-f', audioFilePath,
      '-l', 'en',
      '-otxt',
      '-of', tempOutPrefix,
      '-nt'
    ];

    await new Promise((resolve, reject) => {
      const proc = spawn(whisperCli, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `whisper process exited with code ${code}`));
        }
      });
    });

    const textPath = `${tempOutPrefix}.txt`;
    const result = fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf8') : '';

    try { if (fs.existsSync(textPath)) fs.unlinkSync(textPath); } catch (_) {}

    return String(result || '').trim();
  }

  startLocalWhisperCapture() {
    this.localWhisperChunks = [];

    this.recording = recorder.record({
      sampleRateHertz: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: process.platform === 'win32' ? 'sox' : 'sox',
      silence: '30.0'
    });

    if (!this.recording) {
      throw new Error('Failed to create local whisper recording stream');
    }

    this.recording.stream().on('data', (chunk) => {
      if (!this.isRecording || !chunk) return;
      this.localWhisperChunks.push(Buffer.from(chunk));
    });

    this.recording.stream().on('error', (error) => {
      logger.error('Whisper recording stream error', { error: error.message });
      this.emit('error', `Whisper recording failed: ${error.message}`);
      this.stopRecording();
    });
  }

  async finalizeLocalWhisperCapture() {
    if (!this.localWhisperChunks.length) {
      return '';
    }

    const pcmBuffer = Buffer.concat(this.localWhisperChunks);
    const wavBuffer = this.buildWavFromPcmBuffer(pcmBuffer, 16000, 1, 16);
    const tempFilePath = path.join(this.getWhisperCacheDir(), `capture-${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, wavBuffer);
    this.localWhisperTempFile = tempFilePath;

    try {
      const text = await this.runWhisperTranscription(tempFilePath);
      return text;
    } finally {
      try {
        if (this.localWhisperTempFile && fs.existsSync(this.localWhisperTempFile)) {
          fs.unlinkSync(this.localWhisperTempFile);
        }
      } catch (_) {}
      this.localWhisperTempFile = null;
      this.localWhisperChunks = [];
    }
  }

  async ensureWhisperInstalled() {
    const currentModelPath = this.getWhisperModelPath();
    if (this.localWhisperReady && fs.existsSync(currentModelPath) && this.findWhisperBinaryPath()) {
      return { ready: true, source: 'cached', modelPath: currentModelPath };
    }

    if (this.whisperBootstrapInProgress) {
      return { ready: false, pending: true };
    }

    this.whisperBootstrapInProgress = true;
    try {
      const modelsDir = this.getWhisperCacheDir();
      fs.mkdirSync(modelsDir, { recursive: true });

      const model = process.env.WHISPER_MODEL || 'ggml-base.en.bin';
      const modelPath = path.join(modelsDir, model);
      const modelExists = fs.existsSync(modelPath);

      if (!modelExists) {
        const primaryBaseUrl = (process.env.WHISPER_MODEL_BASE_URL || 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main').trim();
        const backupBaseUrl = 'https://huggingface.co/ggml-org/whisper.cpp/resolve/main';
        const sources = [primaryBaseUrl, backupBaseUrl];

        this.emit('status', `Downloading Whisper model (${model})...`);
        let downloaded = false;
        let lastError = null;
        for (const baseUrl of sources) {
          try {
            const downloadUrl = `${baseUrl}/${encodeURIComponent(model)}`;
            await this.downloadFile(downloadUrl, modelPath);
            downloaded = true;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!downloaded) {
          throw new Error(`Failed to download model ${model}: ${lastError ? lastError.message : 'unknown error'}`);
        }
      }

      const runtimeSetup = await this.ensureWhisperRuntimeInstalled();
      const cliPath = await this.resolveWhisperCli();

      this.localWhisperReady = true;
      return {
        ready: true,
        source: modelExists && runtimeSetup.source === 'existing' ? 'existing' : 'downloaded',
        modelPath,
        cliPath,
        runtimeSetup
      };
    } catch (error) {
      this.localWhisperReady = false;
      this.emit('error', `Whisper setup failed: ${error.message}`);
      return { ready: false, error: error.message };
    } finally {
      this.whisperBootstrapInProgress = false;
    }
  }

  async setProvider(provider) {
    const normalized = String(provider || 'azure').trim();
    if (!['azure', 'local-whisper'].includes(normalized)) {
      throw new Error(`Unsupported STT provider: ${normalized}`);
    }

    this.provider = normalized;

    if (this.provider === 'local-whisper') {
      this.speechConfig = null;
      const whisperSetup = await this.ensureWhisperInstalled();
      this.available = !!whisperSetup.ready;

      if (this.available) {
        if (whisperSetup.source === 'existing' || whisperSetup.source === 'cached') {
          this.emit('status', 'Whisper Local ready (model already downloaded)');
        } else {
          this.emit('status', 'Whisper Local ready (model downloaded)');
        }
      } else {
        this.emit('status', 'Whisper Local unavailable');
      }

      return { provider: this.provider, whisperSetup, available: this.isAvailable() };
    }

    this.initializeClient();
    return { provider: this.provider, available: this.isAvailable() };
  }

  initializeClient() {
    try {
      if (this.provider === 'local-whisper') {
        this.speechConfig = null;
        this.available = !!this.localWhisperReady;
        this.emit('status', this.available ? 'Whisper Local ready' : 'Whisper Local not installed yet');
        return;
      }

      // Get Azure Speech credentials from environment variables
      const subscriptionKey = process.env.AZURE_SPEECH_KEY;
      const region = process.env.AZURE_SPEECH_REGION;
      
      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing credentials)');
        this.available = false;
        this.emit('status', reason);
        return;
      }


      // Validate region format
      const validRegions = ['eastus', 'westus', 'westus2', 'eastus2', 'centralus', 'northcentralus', 'southcentralus', 'westcentralus', 'canadacentral', 'canadaeast', 'brazilsouth', 'northeurope', 'westeurope', 'uksouth', 'ukwest', 'francecentral', 'germanywestcentral', 'norwayeast', 'switzerlandnorth', 'switzerlandwest', 'swedencentral', 'uaenorth', 'southafricanorth', 'centralindia', 'southindia', 'westindia', 'eastasia', 'southeastasia', 'japaneast', 'japanwest', 'koreacentral', 'koreasouth', 'australiaeast', 'australiasoutheast'];
      
      if (!validRegions.includes(region.toLowerCase())) {
        logger.warn('Potentially invalid Azure region specified', { region });
      }

      // Initialize Azure Speech configuration
      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      
      // Configure speech recognition settings with better defaults
      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      
      // Set additional properties for better recognition
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000");
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "2000");
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "2000");
      
      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }
      
      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }
      
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      
      this.available = true;
      this.emit('status', 'Azure Speech Services ready');
      
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', { error: error.message, stack: error.stack });
      this.available = false;
      this.emit('status', 'Speech recognition unavailable');
    }
  }

  startRecording() {
    try {
      if (this.provider === 'local-whisper') {
        if (!this.localWhisperReady) {
          this.emit('error', 'Whisper Local is not installed yet');
          return;
        }

        if (this.isRecording) {
          logger.warn('Recording already in progress');
          return;
        }

        this.isRecording = true;
        this.sessionStartTime = Date.now();
        try {
          this.startWhisperStreamCapture();
          this.emit('status', 'Whisper Local live stream started');
        } catch (streamError) {
          logger.warn('Whisper stream capture unavailable, falling back to PCM capture', { error: streamError.message });
          this.startLocalWhisperCapture();
          this.emit('status', 'Whisper Local fallback capture started');
        }
        this.emit('recording-started');
        if (global.windowManager) {
          global.windowManager.handleRecordingStarted();
        }
        return;
      }

      if (!this.speechConfig) {
        const errorMsg = 'Azure Speech client not initialized';
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }


      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      this._attemptRecording();
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _attemptRecording() {
    try {
      this.isRecording = true;
      this.emit('recording-started');

      // Clean up any existing resources
      this._cleanup();

             // Use push stream with Node.js audio capture (more reliable for Electron main process)
       try {
         this.pushStream = sdk.AudioInputStream.createPushStream();
         this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
         
         // Start capturing real microphone audio
         this._startMicrophoneCapture();
         
       } catch (audioError) {
         logger.error('Failed to create audio config', { error: audioError.message });
         this.emit('error', 'Audio configuration failed. Please check microphone permissions.');
         this.isRecording = false;
         return;
       }
             
       // Create speech recognizer
       try {
         this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
       } catch (recognizerError) {
         throw recognizerError;
       }

             // Set up event handlers with better error handling
       this.recognizer.recognizing = (s, e) => {
         try {
           if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
             logger.debug('Interim transcription received', { 
               text: e.result.text,
               offset: e.result.offset,
               duration: e.result.duration
             });
             this.emit('interim-transcription', e.result.text);
           }
         } catch (error) {
           logger.error('Error in recognizing handler', { error: error.message });
         }
       };

       this.recognizer.recognized = (s, e) => {
         try {
           if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
             const sessionDuration = Date.now() - this.sessionStartTime;
             
             // Only emit transcription if there's actual text content
             if (e.result.text && e.result.text.trim().length > 0) {
               logger.info('Final transcription received', {
                 text: e.result.text,
                 sessionDuration: `${sessionDuration}ms`,
                 textLength: e.result.text.length,
                 confidence: e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
               });
               
               this.emit('transcription', e.result.text);
             } else {
               logger.debug('Empty transcription result ignored', {
                 sessionDuration: `${sessionDuration}ms`,
                 confidence: e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
               });
             }
           } else if (e.result.reason === sdk.ResultReason.NoMatch) {
             logger.debug('No speech pattern detected in audio');
             
             // Check if there's detailed no-match information
             const noMatchDetails = e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
             if (noMatchDetails) {
               logger.debug('No match details', { details: noMatchDetails });
             }
           }
         } catch (error) {
           logger.error('Error in recognized handler', { error: error.message });
         }
       };

      this.recognizer.canceled = (s, e) => {
        logger.warn('Recognition session canceled', { 
          reason: e.reason,
          errorCode: e.errorCode,
          errorDetails: e.errorDetails 
        });
        
        if (e.reason === sdk.CancellationReason.Error) {
          const errorMsg = `Recognition error: ${e.errorDetails}`;
          
          // Check for specific error types and provide better messages
          if (e.errorDetails.includes('1006')) {
            this.emit('error', 'Network connection failed. Please check your internet connection.');
          } else if (e.errorDetails.includes('InvalidServiceCredentials')) {
            this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
          } else if (e.errorDetails.includes('Forbidden')) {
            this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
          } else if (e.errorDetails.includes('AudioInputMicrophone_InitializationFailure')) {
            this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
          } else {
            this.emit('error', errorMsg);
          }
          
          // Attempt retry for transient errors
          if (this.retryCount < this.maxRetries && (
            e.errorDetails.includes('1006') || 
            e.errorDetails.includes('timeout') || 
            e.errorDetails.includes('network')
          )) {
            this.retryCount++;
            logger.info(`Retrying recognition (attempt ${this.retryCount}/${this.maxRetries})`);
            setTimeout(() => {
              if (!this.isRecording) {
                this._attemptRecording();
              }
            }, 1000 * this.retryCount);
            return;
          }
        }
        this.stopRecording();
      };

      this.recognizer.sessionStarted = (s, e) => {
        logger.info('Recognition session started', { sessionId: e.sessionId });
      };

      this.recognizer.sessionStopped = (s, e) => {
        logger.info('Recognition session ended', { sessionId: e.sessionId });
        this.stopRecording();
      };

       // Start continuous recognition with timeout
       const startTimeout = setTimeout(() => {
         logger.error('Recognition start timeout');
         this.emit('error', 'Speech recognition start timeout. Please try again.');
         this.stopRecording();
       }, 10000); // 10 second timeout

       this.recognizer.startContinuousRecognitionAsync(
         () => {
           clearTimeout(startTimeout);
           logger.info('Continuous speech recognition started successfully');
           if (global.windowManager) {
             global.windowManager.handleRecordingStarted();
           }
         },
         (error) => {
           clearTimeout(startTimeout);
           logger.error('Failed to start continuous recognition', { 
             error: error.toString(),
             retryCount: this.retryCount 
           });
           
           // Attempt retry for initialization failures
           if (this.retryCount < this.maxRetries) {
             this.retryCount++;
             logger.info(`Retrying recognition start (attempt ${this.retryCount}/${this.maxRetries})`);
             this.isRecording = false;
             setTimeout(() => {
               this._attemptRecording();
             }, 2000 * this.retryCount);
           } else {
             this.emit('error', `Recognition startup failed after ${this.maxRetries} attempts: ${error}`);
             this.isRecording = false;
           }
         }
       );

    } catch (error) {
      logger.error('Failed to start recording session', { 
        error: error.message, 
        stack: error.stack 
      });
      this.emit('error', `Recording startup failed: ${error.message}`);
      this.isRecording = false;
    }
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    if (this.provider === 'local-whisper') {
      this.isRecording = false;

      const streamTranscript = this.stopWhisperStreamCapture();

      if (this.recording) {
        try {
          this.recording.stop();
        } catch (_) {}
        this.recording = null;
      }

      this.emit('recording-stopped');

      if (global.windowManager) {
        global.windowManager.handleRecordingStopped();
      }

      if (streamTranscript) {
        this.emit('transcription', streamTranscript);
        this.emit('status', 'Whisper Local transcription complete');
        return;
      }

      if (String(process.env.WHISPER_AUDIO_SOURCE || '').toLowerCase() === 'system') {
        this.emit('status', 'No system audio captured. Pick a loopback/output device in Whisper Capture Device.');
        return;
      }

      this.emit('status', 'Whisper Local processing transcription...');
      this.finalizeLocalWhisperCapture().then((text) => {
        if (text && text.trim()) {
          this.emit('transcription', text.trim());
          this.emit('status', 'Whisper Local transcription complete');
        } else {
          this.emit('status', 'Whisper Local found no speech');
        }
      }).catch((error) => {
        logger.error('Whisper transcription failed', { error: error.message });
        this.emit('error', `Whisper transcription failed: ${error.message}`);
      });

      return;
    }

    this.isRecording = false;

    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    
    logger.info('Stopping speech recognition session', { 
      sessionDuration: `${sessionDuration}ms` 
    });

    // Stop continuous recognition
    if (this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            logger.info('Speech recognition stopped successfully');
            this.emit('recording-stopped');
            this.emit('status', 'Recording stopped');
            if (global.windowManager) {
              global.windowManager.handleRecordingStopped();
            }
            this._cleanup();
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._cleanup();
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._cleanup();
      }
    } else {
      this._cleanup();
    }
  }

  _cleanup() {
    // Clean up recognizer
    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

         // Clean up audio config
     if (this.audioConfig) {
       try {
         // Check if close method exists and call it appropriately
         if (typeof this.audioConfig.close === 'function') {
           try {
             const closeResult = this.audioConfig.close();
             // If it returns a promise, handle it, otherwise just continue
             if (closeResult && typeof closeResult.then === 'function') {
               // It's a promise, but we don't need to wait for it in cleanup
               closeResult.catch((error) => {
                logger.error('Error closing audio config', { error: error.message });
               });
             }
           } catch (closeError) {
            logger.error('Error closing audio config', { error: closeError.message });
           }
         }
       } catch (error) {
         logger.error('Error closing audio config', { error: error.message });
       }
       this.audioConfig = null;
     }

     // Stop audio recording
     if (this.recording) {
       try {
         this.recording.stop();
         this.recording = null;
       } catch (error) {
         logger.error('Error stopping audio recording', { error: error.message });
       }
     }

     // Clean up push stream
     if (this.pushStream) {
       try {
         // Check if close method exists and call it appropriately
         if (typeof this.pushStream.close === 'function') {
           const closeResult = this.pushStream.close();
           // If it returns a promise, we can await it, otherwise just continue
           if (closeResult && typeof closeResult.then === 'function') {
             // It's a promise, but we don't need to wait for it in cleanup
             closeResult.catch((error) => {
             });
           }
         }
       } catch (error) {
         logger.error('Error closing push stream', { error: error.message });
       }
       this.pushStream = null;
     }

     // Reset audio data logging flag
     this._audioDataLogged = false;
  }

  async recognizeFromFile(audioFilePath) {
    if (!this.speechConfig) {
      throw new Error('Speech service not initialized');
    }

    const startTime = Date.now();
    
    try {
      // Validate file exists and is readable
      const fs = require('fs');
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File recognition timeout'));
          recognizer.close();
        }, 30000); // 30 second timeout

        recognizer.recognizeOnceAsync(
          (result) => {
            clearTimeout(timeout);
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve(result.text);
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              resolve(''); // No speech detected in file
            } else {
              reject(new Error(`File recognition failed: ${result.reason}`));
            }
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            clearTimeout(timeout);
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });

      logger.logPerformance('File speech recognition', startTime, {
        filePath: audioFilePath,
        textLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('File recognition failed', { 
        filePath: audioFilePath, 
        error: error.message 
      });
      throw error;
    }
  }

  getStatus() {
    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isInitialized: this.provider === 'local-whisper' ? this.localWhisperReady : !!this.speechConfig,
      whisperReady: !!this.localWhisperReady,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      config: config.get('speech.azure') || {}
    };
  }


     // Test connection method
   async testConnection() {
     if (!this.speechConfig) {
       throw new Error('Speech service not initialized');
     }

     try {
       // Create a simple test recognizer
       const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
       const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
       
       // Test by attempting to create the recognizer (this validates credentials)
       recognizer.close();
       audioConfig.close();
       
       return { success: true, message: 'Connection test successful' };
     } catch (error) {
       return { success: false, message: error.message };
     }
   }

   // Start capturing real microphone audio using node-record-lpcm16
   _startMicrophoneCapture() {
     if (!this.pushStream) return;
          
     try {
       // Check if recorder is available
       if (!recorder || typeof recorder.record !== 'function') {
         throw new Error('node-record-lpcm16 not available or not properly installed');
       }

       // Configure audio recording with error handling
       this.recording = recorder.record({
         sampleRateHertz: 16000,  // Azure Speech SDK prefers 16kHz
         threshold: 0,            // No silence threshold
         verbose: false,          // Quiet logging
         recordProgram: 'sox',    // Try 'sox' first (most common on macOS)
         silence: '10.0s'         // Longer silence threshold
       });

       if (!this.recording) {
         throw new Error('Failed to create audio recording instance');
       }

       // Add error handler for the recording stream before using it
       this.recording.stream().on('error', (error) => {
         logger.error('Audio recording stream error', { error: error.message });
         
         // Don't emit error immediately, try to recover
         this._handleAudioError(error);
       });

       // Pipe audio data to Azure Speech SDK
       this.recording.stream().on('data', (chunk) => {
         if (this.pushStream && this.isRecording) {
           try {
             this.pushStream.write(chunk);
             // Console log only first few chunks to avoid spam
             if (!this._audioDataLogged) {
               this._audioDataLogged = true;
             }
           } catch (error) {
           }
         }
       });

     } catch (error) {
       logger.error('Failed to start microphone capture', { error: error.message, stack: error.stack });
       
       // Fall back to no audio capture (Azure SDK will still work without audio)
       this.emit('error', `Microphone capture failed: ${error.message}. Speech recognition may not work properly.`);
     }
   }

   // Handle audio recording errors with recovery attempts
   _handleAudioError(error) {
     
     // Try to restart recording with different program
     if (this.recording) {
       try {
         this.recording.stop();
       } catch (stopError) {
       }
       this.recording = null;
     }

     // Try with different recording program
     setTimeout(() => {
       if (this.isRecording) {
         this._startMicrophoneCaptureWithFallback();
       }
     }, 1000);
   }

   // Try microphone capture with different programs as fallback
   _startMicrophoneCaptureWithFallback() {
     const programs = ['sox', 'rec', 'arecord'];
     let currentProgramIndex = 0;

     const tryNextProgram = () => {
       if (currentProgramIndex >= programs.length) {
         this.emit('error', 'Could not start microphone capture with any audio program');
         return;
       }

       const program = programs[currentProgramIndex];

       try {
         this.recording = recorder.record({
           sampleRateHertz: 16000,
           threshold: 0,
           verbose: false,
           recordProgram: program,
           silence: '10.0s'
         });

         this.recording.stream().on('error', (error) => {
           currentProgramIndex++;
           tryNextProgram();
         });

         this.recording.stream().on('data', (chunk) => {
           if (this.pushStream && this.isRecording) {
             try {
               this.pushStream.write(chunk);
               if (!this._audioDataLogged) {
                 this._audioDataLogged = true;
               }
             } catch (error) {
              logger.error('Error writing audio data', { error: error.message });
             }
           }
         });
       } catch (error) {
         logger.error(`${program} configuration failed`, { error: error.message });
         currentProgramIndex++;
         tryNextProgram();
       }
     };

     tryNextProgram();
   }

  getSTTDiagnostics() {
    const modelPath = this.getWhisperModelPath();
    const runtimeDir = this.getWhisperRunDir();
    const cliCandidates = this.getWhisperBinaryCandidates();

    let resolvedCli = null;
    let cliError = null;
    try {
      const explicit = (process.env.WHISPER_CLI_PATH || '').trim();
      if (explicit && fs.existsSync(explicit)) {
        resolvedCli = explicit;
      } else {
        resolvedCli = this.findWhisperBinaryPath();
      }
      if (!resolvedCli) {
        cliError = 'CLI binary not found';
      }
    } catch (error) {
      cliError = error.message;
    }

    const hasSox = (() => {
      try {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        const res = spawnSync(cmd, ['sox'], { windowsHide: true, encoding: 'utf8' });
        return res.status === 0;
      } catch (_) {
        return false;
      }
    })();

    const streamExe = this.resolveWhisperStreamExecutable();

    return {
      provider: this.provider,
      isAvailable: this.isAvailable(),
      isRecording: this.isRecording,
      whisper: {
        ready: this.localWhisperReady,
        model: this.getWhisperModelName(),
        intervalMs: Number(process.env.WHISPER_INTERVAL_MS || 2000),
        audioSource: process.env.WHISPER_AUDIO_SOURCE || 'microphone',
        captureDevice: process.env.WHISPER_CAPTURE_DEVICE || 'auto',
        modelPath,
        modelExists: fs.existsSync(modelPath),
        runtimeDir,
        runtimeDirExists: fs.existsSync(runtimeDir),
        cliCandidates,
        resolvedCli,
        resolvedStreamExe: streamExe,
        cliError,
        bootstrapInProgress: this.whisperBootstrapInProgress
      },
      recorder: {
        nodeRecordInstalled: !!recorder,
        soxInPath: hasSox
      },
      azure: {
        keyPresent: !!process.env.AZURE_SPEECH_KEY,
        regionPresent: !!process.env.AZURE_SPEECH_REGION,
        initialized: !!this.speechConfig
      }
    };
  }

  // Expose availability to UI
  isAvailable() {
    if (this.provider === 'local-whisper') {
      return !!this.localWhisperReady;
    }
    return !!this.speechConfig && !!this.available;
  }
}

module.exports = new SpeechService();
