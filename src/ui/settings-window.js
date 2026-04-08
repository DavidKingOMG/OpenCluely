document.addEventListener('DOMContentLoaded', () => {    
    const SKILL_LABELS = {
    general: "General",
    dsa: "Data Structures & Algorithms",
    programming: "Programming",
    behavioral: "Behavioral",
    sales: "Sales",
    presentation: "Presentation",
    "data-science": "Data Science",
    devops: "DevOps",
    "system-design": "System Design",
    negotiation: "Negotiation"
};

 function prettifySkillName(skill) {
    return SKILL_LABELS[skill] || skill
        .split("-")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
 }

 function populateModelDropdown(modelSelect, providersConfig, provider, selectedModel, isLinked = true) {
    if (!modelSelect) return;
    const models = providersConfig?.[provider]?.models || [];
    modelSelect.innerHTML = "";

    if (!isLinked || !models.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Link provider first";
        option.selected = true;
        modelSelect.appendChild(option);
        modelSelect.disabled = true;
        return;
    }

    modelSelect.disabled = false;
    models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        option.selected = model === selectedModel;
        modelSelect.appendChild(option);
    });
 }

 function skillRequiresProgrammingLanguage(skill) {
    return ['dsa', 'programming'].includes(String(skill || '').toLowerCase());
  }

  function toggleCodingLanguageUI(activeSkill) {
    if (!codingLanguageRow) return;
    codingLanguageRow.style.display = skillRequiresProgrammingLanguage(activeSkill) ? '' : 'none';
  }

  function getProviderRequiredAuthMode(provider) {
    if (provider === 'codex') return 'oauth';
    if (provider === 'openai') return 'apiKey';
    return 'apiKey';
  }

  function toggleLlmAuthUI(provider) {
    if (!llmApiKeyRow || !llmOauthRow) return;
    const requiredAuth = getProviderRequiredAuthMode(provider);
    const useOauth = requiredAuth === 'oauth';
    llmApiKeyRow.style.display = useOauth ? 'none' : '';
    llmOauthRow.style.display = useOauth ? '' : 'none';
  }

  function toggleSTTProviderUI(provider) {
    const isAzure = provider === 'azure';
    if (azureKeyRow) azureKeyRow.style.display = isAzure ? '' : 'none';
    if (azureRegionRow) azureRegionRow.style.display = isAzure ? '' : 'none';
    if (whisperModelRow) whisperModelRow.style.display = isAzure ? 'none' : '';
    if (whisperIntervalRow) whisperIntervalRow.style.display = isAzure ? 'none' : '';
    if (whisperAudioSourceRow) whisperAudioSourceRow.style.display = isAzure ? 'none' : '';
    if (whisperCaptureDeviceRow) whisperCaptureDeviceRow.style.display = isAzure ? 'none' : '';
  }

  function isProviderLinked(provider, status) {
    if (!provider || !status || provider !== status.provider) {
      return false;
    }

    if (provider === 'codex') {
      return status.authMode === 'oauth' && !!status.hasApiKey;
    }

    if (provider === 'openai') {
      return status.authMode === 'apiKey' && !!status.hasApiKey;
    }

    return !!status.hasApiKey;
  }

 
async function populateActiveSkillDropdown(activeSkillSelect, selectedSkill) {

    if (!activeSkillSelect) return;

    try {
        const skills = await window.electronAPI.invoke("get-available-skills");

        activeSkillSelect.innerHTML = "";

        skills.forEach((skill) => {
            const option = document.createElement("option");
            option.value = skill;
            option.textContent = prettifySkillName(skill);

            if (skill === selectedSkill) {
                option.selected = true;
            }

            activeSkillSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Failed to populate skill dropdown:", error);
    }
}
    const logger = {
        info: (...args) => console.log('[SettingsWindowUI]', ...args)
    };

    // Get DOM elements
    const closeButton = document.getElementById('closeButton');
    const quitButton = document.getElementById('quitButton');
    const speechProviderSelect = document.getElementById('speechProvider');
    const openSTTDiagnosticsBtn = document.getElementById('openSTTDiagnosticsBtn');
    const azureKeyRow = document.getElementById('azureKeyRow');
    const azureRegionRow = document.getElementById('azureRegionRow');
    const whisperModelRow = document.getElementById('whisperModelRow');
    const whisperIntervalRow = document.getElementById('whisperIntervalRow');
    const whisperAudioSourceRow = document.getElementById('whisperAudioSourceRow');
    const whisperCaptureDeviceRow = document.getElementById('whisperCaptureDeviceRow');
    const whisperModelSelect = document.getElementById('whisperModel');
    const whisperIntervalSelect = document.getElementById('whisperInterval');
    const whisperAudioSourceSelect = document.getElementById('whisperAudioSource');
    const whisperCaptureDeviceSelect = document.getElementById('whisperCaptureDevice');
    const azureKeyInput = document.getElementById('azureKey');
    const azureRegionInput = document.getElementById('azureRegion');

    const llmProviderSelect = document.getElementById('llmProvider');
    const llmModelSelect = document.getElementById('llmModel');
    const llmApiKeyRow = document.getElementById('llmApiKeyRow');
    const llmOauthRow = document.getElementById('llmOauthRow');
    const codexCopyLinkBtn = document.getElementById('codexCopyLinkBtn');
    const codexOpenLinkBtn = document.getElementById('codexOpenLinkBtn');
    const llmApiKeyInput = document.getElementById('llmApiKey');
    const windowGapInput = document.getElementById('windowGap');
    const codingLanguageRow = document.getElementById('codingLanguageRow');
    const codingLanguageSelect = document.getElementById('codingLanguage');
    let currentLlmAuthModes = {};
    const activeSkillSelect = document.getElementById('activeSkill');
    const iconGrid = document.getElementById('iconGrid');

    // Check if window.api exists
    if (!window.api) {
        console.error('window.api not available');
        return;
    }

    // Request current settings when window opens
    const requestCurrentSettings = () => {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings().then(settings => {
                loadSettingsIntoUI(settings);
            }).catch(error => {
                console.error('Failed to get settings:', error);
            });
        }
    };

    // Close button handler
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.api.send('close-settings');
        });
    }

    // Quit button handler with multiple attempts
    if (quitButton) {
        quitButton.addEventListener('click', () => {
            try {
                // Try multiple ways to quit the app
                if (window.api && window.api.send) {
                    window.api.send('quit-app');
                }
                
                // Also try the electron API if available
                if (window.electronAPI && window.electronAPI.quit) {
                    window.electronAPI.quit();
                }
                
                // Fallback: close the window
                setTimeout(() => {
                    window.close();
                }, 500);
                
            } catch (error) {
                console.error('Error quitting app:', error);
                window.close();
            }
        });
    }

    let refreshWhisperDevicesToken = 0;

    let refreshWhisperDevicesTimer = null;

    const scheduleWhisperCaptureRefresh = (selectedValue = 'auto') => {
        if (refreshWhisperDevicesTimer) {
            clearTimeout(refreshWhisperDevicesTimer);
        }
        refreshWhisperDevicesTimer = setTimeout(() => {
            refreshWhisperCaptureDevices(selectedValue);
            refreshWhisperDevicesTimer = null;
        }, 60);
    };

    const refreshWhisperCaptureDevices = async (selectedValue = 'auto') => {
        if (!whisperCaptureDeviceSelect) return;
        if (!speechProviderSelect || speechProviderSelect.value !== 'local-whisper') {
            whisperCaptureDeviceSelect.innerHTML = '';
            const disabledOption = document.createElement('option');
            disabledOption.value = 'auto';
            disabledOption.textContent = 'Available when STT Provider is Whisper Local';
            whisperCaptureDeviceSelect.appendChild(disabledOption);
            whisperCaptureDeviceSelect.value = 'auto';
            return;
        }

        const token = ++refreshWhisperDevicesToken;

        const keep = String(selectedValue || 'auto');
        whisperCaptureDeviceSelect.innerHTML = '';
        const autoOption = document.createElement('option');
        autoOption.value = 'auto';
        autoOption.textContent = 'Auto Select';
        whisperCaptureDeviceSelect.appendChild(autoOption);

        if (!window.electronAPI?.getWhisperCaptureDevices) {
            whisperCaptureDeviceSelect.value = 'auto';
            return;
        }

        try {
            const source = whisperAudioSourceSelect ? whisperAudioSourceSelect.value : 'microphone';
            const devices = await window.electronAPI.getWhisperCaptureDevices(source);
            if (token !== refreshWhisperDevicesToken) {
                return;
            }
            if ((devices || []).length === 0) {
                const noneOption = document.createElement('option');
                noneOption.value = 'auto';
                noneOption.textContent = source === 'system'
                    ? 'No system output devices detected (choose Microphone or install loopback device)'
                    : 'No microphone devices detected';
                whisperCaptureDeviceSelect.appendChild(noneOption);
                whisperCaptureDeviceSelect.value = 'auto';
                return;
            }

            (devices || []).forEach((device) => {
                const option = document.createElement('option');
                option.value = String(device.index);
                option.textContent = `#${device.index} ${device.name}`;
                whisperCaptureDeviceSelect.appendChild(option);
            });

            whisperCaptureDeviceSelect.value = Array.from(whisperCaptureDeviceSelect.options).some(o => o.value === keep) ? keep : 'auto';
        } catch (error) {
            console.error('Failed to list whisper capture devices:', error.message);
            const failedOption = document.createElement('option');
            failedOption.value = 'auto';
            failedOption.textContent = 'Failed to load capture devices';
            whisperCaptureDeviceSelect.appendChild(failedOption);
            whisperCaptureDeviceSelect.value = 'auto';
        }
    };

    // Function to load settings into UI
    const loadSettingsIntoUI = async (settings) => {

    if (speechProviderSelect) speechProviderSelect.value = settings.speechProvider || 'azure';
    if (whisperModelSelect) whisperModelSelect.value = settings.whisperModel || 'ggml-base.en.bin';
    if (whisperIntervalSelect) whisperIntervalSelect.value = String(settings.whisperIntervalMs || 2000);
    if (whisperAudioSourceSelect) whisperAudioSourceSelect.value = settings.whisperAudioSource || 'microphone';
    toggleSTTProviderUI(speechProviderSelect ? speechProviderSelect.value : 'azure');
    if (speechProviderSelect && speechProviderSelect.value === 'local-whisper') {
        await refreshWhisperCaptureDevices(settings.whisperCaptureDevice || 'auto');
    }
    if (settings.azureKey && azureKeyInput) azureKeyInput.value = settings.azureKey;
    if (settings.azureRegion && azureRegionInput) azureRegionInput.value = settings.azureRegion;

    if (settings.windowGap && windowGapInput) windowGapInput.value = settings.windowGap;

    if (codingLanguageSelect) {
        codingLanguageSelect.value = settings.codingLanguage || "cpp";
    }

    if (activeSkillSelect) {
        const selectedSkill = settings.activeSkill || "general";
        await populateActiveSkillDropdown(activeSkillSelect, selectedSkill);
        toggleCodingLanguageUI(selectedSkill);
    }

    if (llmProviderSelect && window.electronAPI?.getLlmProviders) {
        const providersConfig = await window.electronAPI.getLlmProviders();
        const status = await window.electronAPI.getLlmStatus();
        const authModes = settings.llmAuthModes || status.authModes || {};
        currentLlmAuthModes = authModes;
        llmProviderSelect.value = settings.llmProvider || status.provider || 'gemini';

        const provider = llmProviderSelect.value;
        const requiredAuthMode = getProviderRequiredAuthMode(provider);
        const providerLinked = isProviderLinked(provider, status);
        const lastModels = settings.llmLastModels || status.llmLastModels || {};
        const preferredModel = lastModels[provider] || settings.llmModel || status.model || null;

        populateModelDropdown(llmModelSelect, providersConfig, provider, providerLinked ? preferredModel : null, providerLinked);
        toggleLlmAuthUI(provider);

        currentLlmAuthModes = { ...currentLlmAuthModes, [provider]: requiredAuthMode };
    }

    const selectedIcon = settings.selectedIcon || settings.appIcon;
    if (selectedIcon && iconGrid) {
        const iconOptions = iconGrid.querySelectorAll('.icon-option');
        iconOptions.forEach(option => {
            if (option.dataset.icon === selectedIcon) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }
};

    // Load settings when window opens
    window.api.receive('load-settings', (settings) => {
        loadSettingsIntoUI(settings);
    });

    // Listen for settings window shown event
    if (window.electronAPI && window.electronAPI.receive) {
        window.electronAPI.receive('settings-window-shown', () => {
            requestCurrentSettings();
        });

    // Listen for coding language changes from other windows via helper
    window.electronAPI.onCodingLanguageChanged((event, data) => {
            if (data && data.language && codingLanguageSelect) {
                codingLanguageSelect.value = data.language;
                console.log('Language updated from overlay window:', data.language);
            }
    });
    }

    let saveSettingsTimer = null;

    // Save settings helper function
    const saveSettings = () => {
        const settings = {};

        if (speechProviderSelect) settings.speechProvider = speechProviderSelect.value;
        if (whisperModelSelect) settings.whisperModel = whisperModelSelect.value;
        if (whisperIntervalSelect) settings.whisperIntervalMs = Number(whisperIntervalSelect.value) || 2000;
        if (whisperAudioSourceSelect) settings.whisperAudioSource = whisperAudioSourceSelect.value;
        if (whisperCaptureDeviceSelect) settings.whisperCaptureDevice = whisperCaptureDeviceSelect.value;
        if (azureKeyInput) settings.azureKey = azureKeyInput.value;
        if (azureRegionInput) settings.azureRegion = azureRegionInput.value;

        if (windowGapInput) settings.windowGap = windowGapInput.value;
        if (activeSkillSelect) settings.activeSkill = activeSkillSelect.value;
        if (codingLanguageSelect && skillRequiresProgrammingLanguage(settings.activeSkill)) {
            settings.codingLanguage = codingLanguageSelect.value;
        }
        if (llmProviderSelect) settings.llmProvider = llmProviderSelect.value;
        if (llmModelSelect) settings.llmModel = llmModelSelect.value;

        const selectedProvider = settings.llmProvider || 'gemini';
        const selectedAuthMode = getProviderRequiredAuthMode(selectedProvider);

        settings.llmAuthModes = { ...currentLlmAuthModes, [selectedProvider]: selectedAuthMode };
        currentLlmAuthModes = settings.llmAuthModes;

        if (saveSettingsTimer) {
            clearTimeout(saveSettingsTimer);
        }
        saveSettingsTimer = setTimeout(() => {
            window.api.send('save-settings', settings);
            saveSettingsTimer = null;
        }, 120);
    };


    const applyLlmConfig = () => {
        if (!window.electronAPI?.setLlmProviderConfig || !llmProviderSelect) {
            return;
        }

        const provider = llmProviderSelect.value || 'gemini';
        const authMode = getProviderRequiredAuthMode(provider);
        const model = llmModelSelect?.disabled ? null : llmModelSelect?.value;
        const apiKey = authMode === 'apiKey' && llmApiKeyInput ? llmApiKeyInput.value : '';

        window.electronAPI.setLlmProviderConfig({ provider, model, authMode, apiKey }).then((status) => {
            if (!window.electronAPI?.getLlmProviders) return;
            window.electronAPI.getLlmProviders().then((providersConfig) => {
                const linked = isProviderLinked(provider, status);
                const preferredModel = status?.llmLastModels?.[provider] || status?.model || null;
                populateModelDropdown(llmModelSelect, providersConfig, provider, linked ? preferredModel : null, linked);
            }).catch(() => {});
        }).catch((error) => {
            console.error('Failed to apply provider config:', error.message);
        });
    };

    // Add event listeners for all inputs

    const inputs = [
        speechProviderSelect,
        whisperModelSelect,
        whisperIntervalSelect,
        whisperAudioSourceSelect,
        whisperCaptureDeviceSelect,
        azureKeyInput,
        azureRegionInput,
        llmApiKeyInput,
        windowGapInput
    ];


    inputs.forEach(input => {
        if (input) {
            input.addEventListener('change', () => saveSettings());
        }
    });

    if (speechProviderSelect) {
        speechProviderSelect.addEventListener('change', () => {
            const provider = speechProviderSelect.value;
            toggleSTTProviderUI(provider);
            if (provider === 'local-whisper') {
                scheduleWhisperCaptureRefresh(whisperCaptureDeviceSelect ? whisperCaptureDeviceSelect.value : 'auto');
                showTempFeedback('Preparing Whisper Local. First setup may take a moment.');
            }
        });
    }

    if (whisperAudioSourceSelect) {
        whisperAudioSourceSelect.addEventListener('change', () => {
            scheduleWhisperCaptureRefresh(whisperCaptureDeviceSelect ? whisperCaptureDeviceSelect.value : 'auto');
        });
    }

    if (whisperModelSelect) {
        whisperModelSelect.addEventListener('change', () => {
            scheduleWhisperCaptureRefresh(whisperCaptureDeviceSelect ? whisperCaptureDeviceSelect.value : 'auto');
        });
    }

    if (openSTTDiagnosticsBtn && window.electronAPI?.openSTTDiagnostics) {
        openSTTDiagnosticsBtn.addEventListener('click', async () => {
            try {
                await window.electronAPI.openSTTDiagnostics();
            } catch (error) {
                showTempFeedback(error.message || 'Failed to open STT diagnostics', true);
            }
        });
    }


    // Language selection handler
    if (codingLanguageSelect) {
        codingLanguageSelect.addEventListener('change', (e) => {
            const lang = e.target.value;
            // use electronAPI so main broadcast is consistent
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({ codingLanguage: lang });
            } else {
                // fallback
                saveSettings();
            }
        });
    }

    // Skill selection handler
    if (activeSkillSelect) {
        activeSkillSelect.addEventListener('change', (e) => {
            toggleCodingLanguageUI(e.target.value);
            saveSettings();
            window.api.send('update-skill', e.target.value);
        });
    }

    if (llmProviderSelect && llmModelSelect) {
        llmProviderSelect.addEventListener('change', async () => {
            const providersConfig = await window.electronAPI.getLlmProviders();
            const status = await window.electronAPI.getLlmStatus();
            const provider = llmProviderSelect.value;
            const providerLinked = isProviderLinked(provider, status);
            const preferredModel = status?.llmLastModels?.[provider] || null;
            populateModelDropdown(llmModelSelect, providersConfig, provider, providerLinked ? preferredModel : null, providerLinked);
            toggleLlmAuthUI(provider);

            if (provider === 'codex') {
                try {
                    await fetchCodexLink('copy');
                    showTempFeedback('Codex login link created. Use Copy Link or Open Link.');
                } catch (error) {
                    console.error('Failed to pre-create Codex login link:', error.message);
                    showTempFeedback(error.message || 'Failed to create Codex login link', true);
                }
            }

            saveSettings();
            applyLlmConfig();
        });

        llmModelSelect.addEventListener('change', () => {
            saveSettings();
            applyLlmConfig();
        });
    }

    if (llmApiKeyInput) {
        llmApiKeyInput.addEventListener('change', () => {
            saveSettings();
            applyLlmConfig();
        });
    }

    const showTempFeedback = (message, isError = false) => {
        let feedback = document.getElementById('tempFeedback');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = 'tempFeedback';
            feedback.style.position = 'fixed';
            feedback.style.bottom = '12px';
            feedback.style.right = '12px';
            feedback.style.zIndex = '9999';
            feedback.style.color = isError ? '#ffb4b4' : '#c8ffd8';
            document.body.appendChild(feedback);
        }
        feedback.style.color = isError ? '#ffb4b4' : '#c8ffd8';
        feedback.textContent = message;
        clearTimeout(showTempFeedback._timer);
        showTempFeedback._timer = setTimeout(() => {
            if (feedback && feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 2400);
    };

    let latestCodexLoginUrl = '';

    const fetchCodexLink = async (mode = 'open') => {
        const starter = window.electronAPI?.startCodexLogin;
        if (!starter) {
            throw new Error('Codex login API not available');
        }
        const result = await starter({ mode });
        if (!result?.success || !result?.loginUrl) {
            throw new Error(result?.instructions || result?.error || 'Failed to create login link');
        }
        latestCodexLoginUrl = result.loginUrl;
        return result.loginUrl;
    };

    if (codexCopyLinkBtn) {
        codexCopyLinkBtn.addEventListener('click', async () => {
            try {
                const url = latestCodexLoginUrl || await fetchCodexLink('copy');
                let copied = false;

                if (window.electronAPI?.copyToClipboard) {
                    copied = !!(await window.electronAPI.copyToClipboard(url));
                }

                if (!copied && navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    copied = true;
                }

                if (!copied) {
                    throw new Error('Clipboard write failed');
                }

                showTempFeedback('Codex login link copied.');
            } catch (error) {
                console.error('Failed to copy Codex login URL:', error.message);
                showTempFeedback(error.message || 'Failed to copy login link', true);
            }
        });
    }

    if (codexOpenLinkBtn) {
        codexOpenLinkBtn.addEventListener('click', async () => {
            try {
                await fetchCodexLink('open');
                showTempFeedback('Opened Codex login in browser.');
            } catch (error) {
                console.error('Failed to open Codex login URL:', error.message);
                showTempFeedback(error.message || 'Failed to open login link', true);
            }
        });
    }

    // Initialize icon grid with correct paths
    const initializeIconGrid = () => {
        if (!iconGrid) return;

        const icons = [
            { key: 'terminal', name: 'Terminal', src: './assests/icons/terminal.png' },
            { key: 'activity', name: 'Activity', src: './assests/icons/activity.png' },
            { key: 'settings', name: 'Settings', src: './assests/icons/settings.png' }
        ];

        iconGrid.innerHTML = '';

        icons.forEach(icon => {
            const iconElement = document.createElement('div');
            iconElement.className = 'icon-option';
            iconElement.dataset.icon = icon.key;
            
            const img = document.createElement('img');
            img.src = icon.src;
            img.alt = icon.name;
            img.onload = () => {
                logger.info('Icon loaded successfully:', icon.src);
            };
            img.onerror = () => {
                console.error('Failed to load icon:', icon.src);
                // Try alternative paths
                const altPaths = [
                    `./assests/${icon.key}.png`,
                    `./assets/icons/${icon.key}.png`,
                    `./assets/${icon.key}.png`
                ];
                
                let pathIndex = 0;
                const tryNextPath = () => {
                    if (pathIndex < altPaths.length) {
                        img.src = altPaths[pathIndex];
                        pathIndex++;
                    } else {
                        img.style.display = 'none';
                        console.error('All icon paths failed for:', icon.key);
                    }
                };
                
                img.onload = () => {
                    logger.info('Icon loaded with alternative path:', img.src);
                };
                
                img.onerror = tryNextPath;
                tryNextPath();
            };
            
            const label = document.createElement('div');
            label.textContent = icon.name;
            
            iconElement.appendChild(img);
            iconElement.appendChild(label);
            
            // Click handler for icon selection
            iconElement.addEventListener('click', () => {                
                // Remove selection from all icons
                iconGrid.querySelectorAll('.icon-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Add selection to clicked icon
                iconElement.classList.add('selected');
                
                // Save the selection - this should trigger the app icon change
                window.api.send('save-settings', { selectedIcon: icon.key });
                
                // Show visual feedback
                iconElement.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    iconElement.style.transform = 'scale(1)';
                }, 100);
            });
            
            iconGrid.appendChild(iconElement);
        });
    };

    if (window.electronAPI?.onCodexAuthTokenUpdated) {
        window.electronAPI.onCodexAuthTokenUpdated(() => {
            if (llmProviderSelect && llmProviderSelect.value === 'codex') {
                saveSettings();
            }
        });
    }

    if (window.electronAPI?.onSpeechStatus) {
        window.electronAPI.onSpeechStatus((event, data) => {
            const msg = String(data?.status || '').trim();
            if (!msg) return;
            if (msg.toLowerCase().includes('whisper')) {
                showTempFeedback(msg, false);
            }
        });
    }

    // Initialize icon grid
    initializeIconGrid();


    // Request settings on load
    setTimeout(() => {
        toggleCodingLanguageUI(activeSkillSelect ? activeSkillSelect.value : 'general');
        requestCurrentSettings();
    }, 200);


    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.api.send('close-settings');
        }
}); 

}); 
