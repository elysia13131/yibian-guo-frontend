const MINICPM_API_KEY = 'sk-pQ8L2zF3XmR5kY9wV4jB7hN1tC6vM0xG3aD5sH2bJ9lK4cZ8'
const MINICPM_BASE_URL = '/api/modelbest'
const MINICPM_MODEL = 'MiniCPM-V-4.6-Thinking'
const MINICPM_MODEL_INSTRUCT = 'MiniCPM-V-4.6-Instruct'

const IMAGE_FORMATS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export class MiniCPMApi {
  async chat(
    text: string,
    onData?: (token: string) => void,
    options?: {
      systemPrompt?: string
      maxTokens?: number
      temperature?: number
      abortSignal?: AbortSignal
      historyMessages?: { role: 'user' | 'assistant'; content: string }[]
      imagesData?: ArrayBuffer[]
      model?: string
    }
  ): Promise<string> {
    const messages: any[] = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    if (options?.historyMessages) {
      for (const m of options.historyMessages) {
        messages.push({ role: m.role, content: m.content })
      }
    }

    const userContent: any = options?.imagesData && options.imagesData.length > 0 ? [] : text
    if (Array.isArray(userContent)) {
      for (const buf of options!.imagesData!) {
        const mime = this.detectMime(buf)
        const b64 = this.arrayBufferToBase64(buf)
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${b64}` },
        })
      }
      userContent.push({ type: 'text', text })
    }
    messages.push({ role: 'user', content: userContent })

    const body = {
      model: options?.model || MINICPM_MODEL,
      messages,
      stream: true,
    }

    const response = await fetch(`${MINICPM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINICPM_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
      },
      body: JSON.stringify(body),
      signal: options?.abortSignal,
    })

    if (!response.ok) {
      throw new Error(`MiniCPM API error: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let hasToken = false

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const chunk = JSON.parse(payload)
            const delta = chunk.choices?.[0]?.delta || {}
            const token = delta.content || delta.reasoning || ''
            if (token) {
              fullContent += token
              onData?.(token)
              hasToken = true
            }
          } catch {
            // skip parse errors
          }
        }
      }

      if (hasToken) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    return fullContent
  }

  async chatWithTools(
    text: string,
    callbacks?: {
      onToken?: (token: string) => void
      onReasoning?: (token: string) => void
      onToolCall?: (name: string, input: any, result: string) => void
    },
    options?: {
      systemPrompt?: string
      temperature?: number
      abortSignal?: AbortSignal
      historyMessages?: { role: 'user' | 'assistant'; content: string }[]
      imagesData?: ArrayBuffer[]
      userId?: number
      model?: string
    }
  ): Promise<{ reasoning: string; content: string }> {
    const messages: any[] = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    if (options?.historyMessages) {
      for (const m of options.historyMessages) {
        messages.push({ role: m.role, content: m.content })
      }
    }

    const userContent: any = options?.imagesData && options.imagesData.length > 0 ? [] : text
    if (Array.isArray(userContent)) {
      for (const buf of options!.imagesData!) {
        const mime = this.detectMime(buf)
        const b64 = this.arrayBufferToBase64(buf)
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${b64}` },
        })
      }
      userContent.push({ type: 'text', text })
    }
    messages.push({ role: 'user', content: userContent })

    const token = localStorage.getItem('token')
    const response = await fetch(`/api/v1/ai/tool-chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages,
        user_id: options?.userId || 0,
        enable_tools: true,
        temperature: options?.temperature ?? undefined,
        model: options?.model || undefined,
      }),
      signal: options?.abortSignal,
    })

    if (!response.ok) {
      throw new Error(`Tool chat error: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let reasoning = ''
    let content = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let hasToken = false

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const chunk = JSON.parse(payload)
            if (chunk.step === 'tool_call') {
              callbacks?.onToolCall?.(chunk.name, chunk.input, chunk.result || '')
              continue
            }
            if (chunk.step === 'reasoning' && chunk.token) {
              reasoning += chunk.token
              callbacks?.onReasoning?.(chunk.token)
            }
            if (chunk.step === 'thinking_reasoning' && chunk.token) {
              reasoning += chunk.token
              callbacks?.onReasoning?.(chunk.token)
            }
            if (chunk.step === 'content' && chunk.token) {
              content += chunk.token
              callbacks?.onToken?.(chunk.token)
            }
            hasToken = true
          } catch { }
        }
      }

      if (hasToken) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    return { reasoning, content }
  }

  async understandImage(
    imageSource: string | File | Blob,
    modelId?: string,
    userPrompt?: string
  ): Promise<{ description: string; source: string }> {
    let b64: string
    let mime = 'image/png'

    if (imageSource instanceof File || imageSource instanceof Blob) {
      mime = imageSource.type || 'image/png'
      const buf = await imageSource.arrayBuffer()
      b64 = this.arrayBufferToBase64(buf)
    } else {
      if (imageSource.includes('base64,')) {
        const parts = imageSource.split('base64,')
        b64 = parts[1] || parts[0]
        const match = imageSource.match(/^data:(image\/\w+);/)
        if (match) mime = match[1]
      } else {
        const resp = await fetch(imageSource)
        const buf = await resp.arrayBuffer()
        b64 = this.arrayBufferToBase64(buf)
        mime = resp.headers.get('content-type') || 'image/png'
      }
    }

    const prompt = userPrompt || '请用中文简洁描述这张图片的内容'

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: prompt },
        ],
      },
    ]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(`${MINICPM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MINICPM_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept-Encoding': 'identity',
        },
        body: JSON.stringify({
          model: modelId || MINICPM_MODEL,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`MiniCPM understand error: ${response.status} ${errBody.slice(0, 200)}`)
      }

      const result = await response.json()
      const description = result.choices?.[0]?.message?.content || ''
      return { description, source: 'api' }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async understandVideo(
    file: File,
    prompt?: string
  ): Promise<{ description: string; source: string }> {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    try {
      await video.play()
      const duration = video.duration || 10

      // 方案 A: 动态帧数 — 按视频时长决定采样密度
      let targetCount: number
      if (duration < 5) targetCount = 4
      else if (duration <= 30) targetCount = 8
      else targetCount = 16

      // 方案 C: 先密集采样候选帧，检测帧间差异，优先保留场景切换帧
      const candidateCount = Math.min(32, Math.max(targetCount * 2, 12))
      const candidateTimes: number[] = []
      for (let i = 0; i < candidateCount; i++) {
        candidateTimes.push((duration * (i + 0.5)) / candidateCount)
      }

      const fullCanvas = document.createElement('canvas')
      fullCanvas.width = video.videoWidth || 1280
      fullCanvas.height = video.videoHeight || 720
      const fullCtx = fullCanvas.getContext('2d')!

      const thumbCanvas = document.createElement('canvas')
      thumbCanvas.width = 64
      thumbCanvas.height = 36
      const thumbCtx = thumbCanvas.getContext('2d')!

      interface FrameCandidate {
        timestamp: number
        b64: string
        pixels?: Uint8ClampedArray
      }
      const candidates: FrameCandidate[] = []

      for (let i = 0; i < candidateTimes.length; i++) {
        video.currentTime = candidateTimes[i]
        await new Promise<void>((resolve) => {
          video.addEventListener('seeked', () => resolve(), { once: true })
          setTimeout(() => resolve(), 300)
        })

        fullCtx.drawImage(video, 0, 0)
        const blob = await new Promise<Blob | null>((r) => fullCanvas.toBlob(r, 'image/jpeg', 0.8))
        if (!blob) continue

        const buf = await blob.arrayBuffer()
        thumbCtx.drawImage(video, 0, 0, 64, 36)
        candidates.push({
          timestamp: candidateTimes[i],
          b64: this.arrayBufferToBase64(buf),
          pixels: i > 0 ? new Uint8ClampedArray(thumbCtx.getImageData(0, 0, 64, 36).data) : undefined,
        })
      }

      URL.revokeObjectURL(url)

      if (candidates.length < 2) {
        return { description: '(视频帧提取失败)', source: 'api' }
      }

      // 计算帧间差异（像素级灰度变化）
      const diffs: number[] = [0]
      for (let i = 1; i < candidates.length; i++) {
        const prev = candidates[i - 1].pixels
        const curr = candidates[i].pixels
        let diff = 0
        if (prev && curr) {
          for (let j = 0; j < prev.length; j++) {
            diff += Math.abs(prev[j] - curr[j])
          }
          diff /= prev.length
        }
        diffs.push(diff)
      }
      for (const c of candidates) delete c.pixels

      // 贪婪选择：固定首帧，优先选帧间差异大的位置，同时满足最小间距约束
      const selected: FrameCandidate[] = [candidates[0]]
      const remaining = candidates.slice(1, -1).map((c, i) => ({
        frame: c,
        score: diffs[i + 1],
        idx: i + 1,
      }))
      remaining.sort((a, b) => b.score - a.score)

      let spacing = duration / (targetCount + 1)
      for (const item of remaining) {
        if (selected.length >= targetCount) break
        if (selected.some(s => Math.abs(s.timestamp - item.frame.timestamp) < spacing)) continue
        selected.push(item.frame)
      }

      // 如果间距约束太严格导致帧数不够，放宽间距重试
      if (selected.length < Math.min(targetCount, candidates.length)) {
        spacing = duration / (targetCount * 2)
        selected.length = 1
        for (const item of remaining) {
          if (selected.length >= targetCount) break
          if (selected.some(s => Math.abs(s.timestamp - item.frame.timestamp) < spacing)) continue
          selected.push(item.frame)
        }
      }

      // 保证最后一帧也有机会入选
      const last = candidates[candidates.length - 1]
      if (selected.length < targetCount && !selected.includes(last) &&
          Math.abs(last.timestamp - selected[selected.length - 1].timestamp) >= spacing) {
        selected.push(last)
      }

      selected.sort((a, b) => a.timestamp - b.timestamp)

      const userPrompt = prompt || '这些是同一段视频在不同时间的截图，请描述这段视频的内容、场景变化和关键事件。'
      const content: any[] = [
        ...selected.map(f => ({
          type: 'image_url' as const,
          image_url: { url: `data:image/jpeg;base64,${f.b64}` },
        })),
        { type: 'text' as const, text: userPrompt },
      ]

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000)

      try {
        const response = await fetch(`${MINICPM_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MINICPM_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept-Encoding': 'identity',
          },
          body: JSON.stringify({ model: MINICPM_MODEL, messages: [{ role: 'user', content }], stream: false }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errBody = await response.text().catch(() => '')
          throw new Error(`MiniCPM video understand error: ${response.status} ${errBody.slice(0, 200)}`)
        }

        const result = await response.json()
        return { description: result.choices?.[0]?.message?.content || '', source: 'api' }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      URL.revokeObjectURL(url)
      throw err
    }
  }

  private detectMime(buf: ArrayBuffer): string {
    const uint8 = new Uint8Array(buf.slice(0, 4))
    if (uint8[0] === 0x89 && uint8[1] === 0x50) return 'image/png'
    if (uint8[0] === 0xff && uint8[1] === 0xd8) return 'image/jpeg'
    if (uint8[0] === 0x52 && uint8[1] === 0x49) return 'image/webp'
    if (uint8[0] === 0x47 && uint8[1] === 0x49) return 'image/gif'
    return 'image/png'
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
}

export const miniCPMApi = new MiniCPMApi()