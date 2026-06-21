const VOLCANO_API_URL = 'https://openspeech.bytedance.com/api/v1/tts'
const CACHE_PREFIX = 'tts_cache_'
const API_KEY_STORAGE_KEY = 'tts_api_key'
const SYSTEM_TTS_API_KEY = '242625ef-dc29-4136-9515-819d7f61242b'

let cachedApiKey: string | null = null

function getCacheKey(text: string, speakerId: string, encoding: string, speedRatio: number): string {
  return `${CACHE_PREFIX}${speakerId}|${text}|${encoding}|${speedRatio}`
}

async function fetchApiKeyFromBackend(): Promise<string | null> {
  try {
    const { authApi } = await import('../api')
    const user = await authApi.getCurrentUser()
    return user.tts_api_key || null
  } catch {
    return null
  }
}

async function ensureApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  const stored = localStorage.getItem(API_KEY_STORAGE_KEY)
  if (stored) {
    cachedApiKey = stored
    return stored
  }
  const fromBackend = await fetchApiKeyFromBackend()
  if (fromBackend) {
    cachedApiKey = fromBackend
    localStorage.setItem(API_KEY_STORAGE_KEY, fromBackend)
    return fromBackend
  }
  throw new Error('TTS API Key 未配置，请在设置页面填写火山引擎 API Key')
}

export function cacheApiKey(apiKey: string): void {
  cachedApiKey = apiKey
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
}

export function clearApiKey(): void {
  cachedApiKey = null
  localStorage.removeItem(API_KEY_STORAGE_KEY)
}

export async function synthesizeTts(
  text: string,
  speakerId: string,
  options?: {
    encoding?: string
    speedRatio?: number
    isDefaultCharacter?: boolean
  },
): Promise<Blob> {
  const encoding = options?.encoding || 'mp3'
  const speedRatio = options?.speedRatio || 1.0
  const isDefault = options?.isDefaultCharacter || false
  const cacheKey = getCacheKey(text, speakerId, encoding, speedRatio)

  const cached = sessionStorage.getItem(cacheKey)
  if (cached) {
    const byteStr = atob(cached)
    const bytes = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    return new Blob([bytes], { type: `audio/${encoding === 'mp3' ? 'mpeg' : encoding}` })
  }

  return synthesizeDirect(text, speakerId, { encoding, speedRatio, cacheKey, isDefault })
}

async function synthesizeDirect(
  text: string,
  speakerId: string,
  options: { encoding: string; speedRatio: number; cacheKey: string; isDefault: boolean },
): Promise<Blob> {
  const apiKey = options.isDefault ? SYSTEM_TTS_API_KEY : await ensureApiKey()
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const response = await fetch(VOLCANO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      app: { cluster: 'volcano_icl' },
      user: { uid: requestId },
      audio: {
        voice_type: speakerId,
        encoding: options.encoding,
        speed_ratio: options.speedRatio,
      },
      request: {
        reqid: requestId,
        text,
        operation: 'query',
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`TTS API 错误 (${response.status}): ${errText}`)
  }

  const blob = await response.blob()
  cacheBlob(blob, options.cacheKey)
  return blob
}

function cacheBlob(blob: Blob, cacheKey: string): void {
  blob.arrayBuffer().then(buf => {
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    try {
      sessionStorage.setItem(cacheKey, btoa(binary))
    } catch {
      // ignore if too large
    }
  }).catch(() => {})
}
