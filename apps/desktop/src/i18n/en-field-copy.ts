import { defineFieldCopy } from './field-copy'

// The English copy every Settings schema field falls back to, and the one the
// search index and the config form read directly when the active locale has no
// override. It lives in the catalog because it IS translation copy: Settings
// consumes these keys (`features/settings/constants.ts` re-exports them), rather
// than the other way round — the reverse edge used to pull the whole Settings
// module — icons, theme modes, provider tables — into `en.ts`, and from there
// into the app's largest import cycle.
//
// A key here is a schema path with `_x` folded to `x` (see `field-copy.ts`).

export const FIELD_LABELS: Record<string, string> = defineFieldCopy({
  model: 'Default Model',
  modelContextLength: 'Context Window',
  fallbackProviders: 'Fallback Models',
  toolsets: 'Enabled Toolsets',
  timezone: 'Timezone',
  display: {
    personality: 'Personality',
    showReasoning: 'Reasoning Blocks'
  },
  desktop: {
    repoScanEnabled: 'Automatic Repository Discovery',
    repoScanRoots: 'Repository Discovery Roots',
    repoScanExcludePaths: 'Excluded Repository Paths'
  },
  agent: {
    maxTurns: 'Max Agent Steps',
    imageInputMode: 'Image Attachments',
    apiMaxRetries: 'API Retries',
    serviceTier: 'Service Tier',
    toolUseEnforcement: 'Tool-Use Enforcement'
  },
  terminal: {
    cwd: 'Working Directory',
    backend: 'Execution Backend',
    timeout: 'Command Timeout',
    persistentShell: 'Persistent Shell',
    envPassthrough: 'Environment Passthrough',
    dockerImage: 'Docker Image',
    singularityImage: 'Singularity Image',
    modalImage: 'Modal Image',
    daytonaImage: 'Daytona Image'
  },
  fileReadMaxChars: 'File Read Limit',
  toolOutput: {
    maxBytes: 'Terminal Output Limit',
    maxLines: 'File Page Limit',
    maxLineLength: 'Line Length Limit'
  },
  codeExecution: {
    mode: 'Code Execution Mode'
  },
  approvals: {
    mode: 'Approval Mode',
    timeout: 'Approval Timeout',
    mcpReloadConfirm: 'Confirm MCP Reloads'
  },
  commandAllowlist: 'Command Allowlist',
  security: {
    redactSecrets: 'Redact Secrets',
    allowPrivateUrls: 'Allow Private URLs'
  },
  browser: {
    allowPrivateUrls: 'Browser Private URLs',
    autoLocalForPrivateUrls: 'Local Browser For Private URLs',
    useRealProfile: 'Use My Real Browser Profile'
  },
  checkpoints: {
    enabled: 'File Checkpoints',
    maxSnapshots: 'Checkpoint Limit'
  },
  voice: {
    recordKey: 'Voice Shortcut',
    maxRecordingSeconds: 'Max Recording Length',
    autoTts: 'Read Responses Aloud'
  },
  stt: {
    enabled: 'Speech To Text',
    echoTranscripts: 'Echo Transcripts',
    provider: 'Speech-To-Text Provider',
    local: {
      model: 'Local Transcription Model',
      language: 'Transcription Language'
    },
    openai: {
      model: 'OpenAI STT Model'
    },
    groq: {
      model: 'Groq STT Model'
    },
    mistral: {
      model: 'Mistral STT Model'
    },
    elevenlabs: {
      modelId: 'ElevenLabs STT Model',
      languageCode: 'ElevenLabs Language',
      tagAudioEvents: 'Tag Audio Events',
      diarize: 'Speaker Diarization'
    }
  },
  tts: {
    provider: 'Text-To-Speech Provider',
    edge: {
      voice: 'Edge Voice'
    },
    openai: {
      model: 'OpenAI TTS Model',
      voice: 'OpenAI Voice'
    },
    elevenlabs: {
      voiceId: 'ElevenLabs Voice',
      modelId: 'ElevenLabs Model'
    },
    xai: {
      voiceId: 'xAI (Grok) Voice',
      language: 'xAI Language',
      speed: 'xAI Playback Speed',
      autoSpeechTags: 'xAI Auto Speech Tags',
      optimizeStreamingLatency: 'xAI Streaming Latency Optimization',
      sampleRate: 'xAI Sample Rate',
      bitRate: 'xAI Bit Rate'
    },
    minimax: {
      model: 'MiniMax TTS Model',
      voiceId: 'MiniMax Voice'
    },
    mistral: {
      model: 'Mistral TTS Model',
      voiceId: 'Mistral Voice'
    },
    gemini: {
      model: 'Gemini TTS Model',
      voice: 'Gemini Voice'
    },
    neutts: {
      model: 'NeuTTS Model',
      device: 'NeuTTS Device'
    },
    kittentts: {
      model: 'KittenTTS Model',
      voice: 'KittenTTS Voice'
    },
    piper: {
      voice: 'Piper Voice'
    },
    deepinfra: {
      model: 'DeepInfra TTS Model',
      voice: 'DeepInfra Voice'
    }
  },
  memory: {
    memoryEnabled: 'Persistent Memory',
    userProfileEnabled: 'User Profile',
    memoryCharLimit: 'Memory Budget',
    userCharLimit: 'Profile Budget',
    provider: 'Memory Provider'
  },
  context: {
    engine: 'Context Engine'
  },
  compression: {
    enabled: 'Auto-Compression',
    threshold: 'Compression Threshold',
    targetRatio: 'Compression Target',
    protectLastN: 'Protected Recent Messages'
  },
  delegation: {
    model: 'Subagent Model',
    provider: 'Subagent Provider',
    maxIterations: 'Subagent Turn Limit',
    maxConcurrentChildren: 'Parallel Subagents',
    childTimeoutSeconds: 'Subagent Timeout',
    reasoningEffort: 'Subagent Reasoning Effort'
  },
  updates: {
    nonInteractiveLocalChanges: 'In-App Update Local Changes'
  }
})

export const FIELD_DESCRIPTIONS: Record<string, string> = defineFieldCopy({
  model: 'Used for new chats unless you pick a different model in the composer.',
  modelContextLength: "Leave at 0 to use the selected model's detected context window.",
  fallbackProviders: 'Backup provider:model entries to try if the default model fails.',
  display: {
    personality: 'Default assistant style for new sessions.',
    showReasoning: 'Show reasoning sections when the backend provides them.'
  },
  desktop: {
    repoScanEnabled: 'Scan local folders for Git repositories to show in Projects.',
    repoScanRoots: 'Folders to scan. Leave empty to scan your home directory.',
    repoScanExcludePaths: 'Folders and their descendants to skip during repository discovery.'
  },
  timezone: 'IANA timezone identifier. Blank uses the system timezone.',
  browser: {
    useRealProfile:
      "Local browsing uses your real logins. Hermes copies your default browser's profile (cookies, logins, preferences) into a managed snapshot and drives it with its packaged Chromium — your live profile is never opened directly, and the copy is refreshed from it on each run. Also lets the agent open a local real-profile session on request even when a cloud browser backend is configured. Only Chromium browsers (Chrome, Edge, Brave, Brave Origin, Chromium) are supported; a non-Chromium default fails with a clear message. Off by default."
  },
  agent: {
    imageInputMode: 'Controls how image attachments are sent to the model.',
    maxTurns: 'Upper bound for tool-calling turns before Hermes stops a run.'
  },
  terminal: {
    cwd: 'Default project folder for tool and terminal work.',
    persistentShell: 'Keep shell state between commands when the backend supports it.',
    envPassthrough: 'Environment variables to pass into tool execution.',
    dockerImage: 'Container image used when the execution backend is Docker.',
    singularityImage: 'Image used when the execution backend is Singularity.',
    modalImage: 'Image used when the execution backend is Modal.',
    daytonaImage: 'Image used when the execution backend is Daytona.'
  },
  codeExecution: {
    mode: 'How strictly code execution is scoped to the current project.'
  },
  fileReadMaxChars: 'Maximum characters Hermes can read from one file request.',
  approvals: {
    mode: 'How Hermes handles commands that need explicit approval.',
    timeout: 'How long approval prompts wait before timing out.'
  },
  security: {
    redactSecrets: 'Hide detected secrets from model-visible content when possible.'
  },
  checkpoints: {
    enabled: 'Create rollback snapshots before file edits.'
  },
  memory: {
    memoryEnabled: 'Save durable memories that can help future sessions.',
    userProfileEnabled: 'Maintain a compact profile of user preferences.'
  },
  context: {
    engine: 'Strategy for managing long conversations near the context limit.'
  },
  compression: {
    enabled: 'Summarize older context when conversations get large.'
  },
  voice: {
    autoTts: 'Automatically speak assistant responses.'
  },
  tts: {
    xai: {
      voiceId: 'xAI voice ID (e.g. eve) or a custom voice ID.',
      language: 'Spoken language code (e.g. en, pt-BR) or "auto" for auto-detection.',
      speed: 'Playback speed. 0.7 = slower, 1.0 = normal, 1.5 = faster.',
      autoSpeechTags: 'Let an LLM insert expressive audio tags ([laughing], [sighs]) into the script before synthesis.',
      optimizeStreamingLatency: 'Latency vs. quality trade-off. 0 = best quality, 2 = lowest latency.',
      sampleRate: 'Audio sample rate in Hz. Higher = better quality, larger files.',
      bitRate: 'MP3 bitrate in bps. Only applies when codec is mp3.'
    },
    neutts: {
      device: 'Local inference device for NeuTTS.'
    }
  },
  stt: {
    enabled: 'Enable local or provider-backed speech transcription.',
    echoTranscripts: 'Post the raw 🎙️ transcript of voice messages back to the chat.',
    elevenlabs: {
      languageCode: 'Optional ISO-639-3 language code. Blank lets ElevenLabs auto-detect.'
    }
  },
  updates: {
    nonInteractiveLocalChanges:
      'When Hermes updates itself from the app (no terminal prompt), keep local source edits (stash) or throw them away (discard). Terminal updates always ask.'
  }
})
