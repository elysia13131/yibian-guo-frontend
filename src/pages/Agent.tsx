import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAgentSession, type NormalSession, type Message } from '../contexts/AgentSessionContext'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useApiKeyContext } from '../contexts/ApiKeyContext'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, MessageSquare, Bot, Sparkles, Send, Paperclip, Loader2, X, StopCircle, PanelRightOpen, Plus, History, Zap, Award, BookOpen, ChartColumn, Check, BrainCircuit, ImageIcon, Download, FileText, ExternalLink, Maximize2, Camera } from 'lucide-react'
import ParticleField from '../components/ParticleField'
import AgentHeroGlow from '../components/AgentHeroGlow'
import AgentBubble from '../components/AgentBubble'
import ToolAgentBubble from '../components/ToolAgentBubble'
import TodoPanel from '../components/TodoPanel'
import FlowPanel from '../components/FlowPanel'
import ArtifactsPanel from '../components/ArtifactsPanel'
import FormattedText from '../components/FormattedText'
import HistoryDrawer from '../components/HistoryDrawer'
import ThinkingBlock from '../components/ThinkingBlock'
import BouncingDots from '../components/BouncingDots'
import { visionEngine } from '../ai/VisionEngine'
import { miniCPMApi } from '../ai/MiniCPMApi'
import type { FileArtifact } from '../components/ArtifactsPanel'
import type { ChartImage } from '../components/ChartGrid'
import { api } from '../api'

interface Stage {
  id: string
  label: string
  status: 'pending' | 'active' | 'completed'
  content?: string
}

const STAGE_LABELS: { id: string; label: string }[] = [
  { id: 'understanding', label: '意图理解' },
  { id: 'planning', label: '任务规划' },
  { id: 'execution', label: '并行执行' },
  { id: 'assembly', label: '结果汇编' },
]

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8080/ws'

const AGENT_NAME_MAP: Record<string, string> = {
  knowledge_agent: '知识管家',
  tutor_agent: '教学导师',
  quiz_agent: '题库专家',
  review_planner: '复习规划师',
  companion_agent: '陪伴使者',
  clinical_agent: '临床思维教练',
  analytics_agent: '学情分析师',
  methods_agent: '方法论教练',
  ppt_agent: 'PPT设计师',
  pdf_word_agent: '文档助手',
  chart_agent: '图表专家',
  discussion: '专家讨论',
}

interface PendingAttachment {
  id: string
  file: File
  previewUrl: string
  imageData?: ArrayBuffer
  type: 'image' | 'video' | 'document'
  name: string
  status: 'pending' | 'processing' | 'done' | 'error'
  parsedContent?: string
  error?: string
}

const Agent = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showApiKeySetup } = useApiKeyContext()

  const ses = useAgentSession()
  const [isPrefilling, setIsPrefilling] = useState(false)
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [localPanelVisible, setLocalPanelVisible] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])
  const {
    messages, setMessages, messagesRef,
    input, setInput,
    loading, setLoading,
    streamingContent, setStreamingContent,
    isStreaming, setIsStreaming,
    streamingDone, setStreamingDone,
    streamingMsgIdRef, streamContentRef, streamingSessionIdRef, streamBufferBySession,
    uploadingFiles, setUploadingFiles,
    chatMode, setChatMode,
    outputMode, setOutputMode,
    deepThink, setDeepThink,
    currentSessionId, setCurrentSessionId,
    normalSessions, setNormalSessions,
    collabSessions, setCollabSessions,
    currentTaskId, setCurrentTaskId,
    currentDiscussionTodoId, setCurrentDiscussionTodoId,
    todos, setTodos,
    agentsStarted, setAgentsStarted,
    agentReasoning, setAgentReasoning,
    agentFinalContent, setAgentFinalContent,
    agentStreamContent, setAgentStreamContent,
    agentTaskDesc, setAgentTaskDesc,
    thinkingCompleted, setThinkingCompleted,
    thinkingFinished, setThinkingFinished,
    fileArtifacts, setFileArtifacts,
    chartImages, setChartImages,
    pendingArtifacts, setPendingArtifacts,
    artifactsPanelVisible, setArtifactsPanelVisible,
    previewUrl, setPreviewUrl,
    toolagentThinking, setToolagentThinking,
    toolagentProjectPath, setToolagentProjectPath,
    toolagentWaitingFeedback, setToolagentWaitingFeedback,
    toolagentPhase, setToolagentPhase,
    toolagentDesignSpec, setToolagentDesignSpec,
    toolagentDone, setToolagentDone,
    toolagentPptxPath, setToolagentPptxPath,
    toolagentFilename, setToolagentFilename,
    toolagentTitle, setToolagentTitle,
    toolagentTaskType, setToolagentTaskType,
    toolagentPageProgress, setToolagentPageProgress,
    toolagentReasoning, setToolagentReasoning,
    toolagentMsgInsertedRef,
    flowNodes, setFlowNodes,
    flowEdges, setFlowEdges,
    stages, setStages,
    wsConnected, setWsConnected,
    wsRef, abortControllerRef,
    sessionTaskIdRef, pendingArtifactTitlesRef,
    showTodoPanel, setShowTodoPanel,
    userId, nextId,
    saveCurrentSession, handleNewChat, connectWebSocket,
  } = ses

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo')
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  const [historyVisible, setHistoryVisible] = useState(false)

  const token = localStorage.getItem('token')

  const handleModeSwitch = useCallback((mode: 'normal' | 'collaboration') => {
    if (mode === chatMode) return

    // Save current session before switching
    if (messagesRef.current.length > 0) {
      saveCurrentSession(messagesRef.current)
    }

    setChatMode(mode)

    if (mode === 'collaboration') {
      const collabSs = collabSessions
      if (collabSs.length > 0) {
        const latest = collabSs.reduce((a, b) => new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b)
        setMessages(latest.messages)
        messagesRef.current = latest.messages
        setCurrentSessionId(latest.id)
      } else {
        setMessages([])
        messagesRef.current = []
        const newId = `collab-${Date.now()}`
        setCurrentSessionId(newId)
      }
      sessionTaskIdRef.current = ''
    } else {
      setAgentReasoning({})
      setAgentFinalContent({})
      setAgentStreamContent({})
      streamContentRef.current = {}
      setAgentTaskDesc({})
      setThinkingCompleted(false)
      setTodos([])
      setAgentsStarted(false)
      setChartImages([])
      setToolagentThinking([])
      setToolagentWaitingFeedback(false)
      setToolagentDone(false)
      setToolagentPptxPath('')
      setToolagentFilename('')
      setToolagentReasoning('')
      setToolagentTitle('')
      setToolagentTaskType('general')
      setToolagentPhase(null)
      setToolagentDesignSpec(null)
      setStages(STAGE_LABELS.map(s => ({ id: s.id, label: s.label, status: 'pending' as const })))
      toolagentMsgInsertedRef.current = false
      streamingMsgIdRef.current = null
      sessionTaskIdRef.current = ''

      const normalSs = normalSessions
      if (normalSs.length > 0) {
        const latest = normalSs.reduce((a, b) => new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b)
        setMessages(latest.messages)
        messagesRef.current = latest.messages
        setCurrentSessionId(latest.id)
      } else {
        setMessages([])
        messagesRef.current = []
        const newId = `normal-${Date.now()}`
        setCurrentSessionId(newId)
      }
    }
    setStreamingContent('')
    setStreamingDone(false)
    setIsStreaming(false)
    setInput('')
    setLoading(false)
  }, [chatMode, saveCurrentSession, collabSessions, normalSessions])

  useEffect(() => {
    localStorage.setItem('agent-active-mode', chatMode)
    if (chatMode === 'normal' && (localStorage.getItem('agentModelMode') || 'api') === 'local') {
      visionEngine.isReady().then(ready => {
        if (!ready) {
          visionEngine.loadModel().catch(() => {})
        }
      })
    }
  }, [chatMode])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false)
      }
    }
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAttachMenu])

  const handleAbort = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: 'abort' }))
    setLoading(false)
    setToolagentDone(true)
    streamingSessionIdRef.current = null
    streamingMsgIdRef.current = null
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const selectNormalSession = useCallback((session: any) => {
    if (currentSessionId && currentSessionId !== session.id) {
      if (streamingSessionIdRef.current === currentSessionId) {
        const currentMsgs = messagesRef.current
        const placeHolderIdx = currentMsgs.findIndex(m => m.id === streamingMsgIdRef.current)
        if (placeHolderIdx >= 0 && streamingContent) {
          const updatedMsgs = [...currentMsgs]
          updatedMsgs[placeHolderIdx] = { ...updatedMsgs[placeHolderIdx], content: streamingContent, done: true }
          messagesRef.current = updatedMsgs
          try {
            setNormalSessions(prev => prev.map(s => s.id === currentSessionId
              ? { ...s, messages: updatedMsgs, updatedAt: new Date().toISOString() }
              : s))
          } catch {}
        }
      } else {
        const buf = streamBufferBySession.current
        if (streamingContent && currentSessionId) {
          buf[currentSessionId] = { content: streamingContent, messageIds: {} }
        }
      }
    }
    const msgs = session.messages as Message[]
    setMessages(msgs)
    messagesRef.current = msgs
    setCurrentSessionId(session.id)
    setStreamingDone(false)
    setToolagentDone(false)
    setToolagentProjectPath(null)
    setToolagentWaitingFeedback(false)
    setToolagentPhase(null)
    setToolagentDesignSpec(null)
    setToolagentThinking([])
    toolagentMsgInsertedRef.current = false

    const buf = streamBufferBySession.current
    const stashed = buf[session.id]
    if (stashed && stashed.content) {
      setStreamingContent(stashed.content)
      delete buf[session.id]
      streamingSessionIdRef.current = session.id
      streamingMsgIdRef.current = null
    } else {
      setStreamingContent('')
      setStreamingReasoning('')
      streamingMsgIdRef.current = null
      streamingSessionIdRef.current = null
    }

    const fileArts: FileArtifact[] = []
    const chartImgs: ChartImage[] = []
    for (const msg of msgs) {
      if (msg.role === 'artifact_preview' && msg.artifact_url) {
        fileArts.push({
          type: msg.artifact_type || 'file',
          path: msg.artifact_url,
          title: msg.content,
          filename: msg.artifact_filename || '',
          status: 'done' as const,
          expires_at: null,
        })
        if ((msg.artifact_type === 'image' || !!msg.artifact_url.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i)) && (msg.artifact_url.startsWith('http') || msg.artifact_url.startsWith('/'))) {
          chartImgs.push({ url: msg.artifact_url, title: msg.content })
        }
      }
    }
    if (fileArts.length > 0) setFileArtifacts(fileArts)
    if (chartImgs.length > 0) setChartImages(chartImgs)
  }, [setFileArtifacts, setChartImages, currentSessionId, streamingContent])

  const selectCollabSession = useCallback((session: any) => {
    if (currentSessionId && currentSessionId !== session.id) {
      if (streamingSessionIdRef.current === currentSessionId) {
        const currentMsgs = messagesRef.current
        const placeHolderIdx = currentMsgs.findIndex(m => m.id === streamingMsgIdRef.current)
        if (placeHolderIdx >= 0 && streamingContent) {
          const updatedMsgs = [...currentMsgs]
          updatedMsgs[placeHolderIdx] = { ...updatedMsgs[placeHolderIdx], content: streamingContent, done: true }
          messagesRef.current = updatedMsgs
          try {
            setCollabSessions(prev => prev.map(s => s.id === currentSessionId
              ? { ...s, messages: updatedMsgs, updatedAt: new Date().toISOString() }
              : s))
          } catch {}
        }
      } else {
        const buf = streamBufferBySession.current
        if (streamingContent && currentSessionId) {
          buf[currentSessionId] = { content: streamingContent, messageIds: {} }
        }
      }
    }
    const msgs = session.messages as Message[]
    setMessages(msgs)
    messagesRef.current = msgs
    setCurrentSessionId(session.id)
    setStreamingDone(false)
    setToolagentDone(false)
    setToolagentProjectPath(null)
    setToolagentWaitingFeedback(false)
    setToolagentPhase(null)
    setToolagentDesignSpec(null)
    setToolagentThinking([])
    toolagentMsgInsertedRef.current = false

    const buf = streamBufferBySession.current
    const stashed = buf[session.id]
    if (stashed && stashed.content) {
      setStreamingContent(stashed.content)
      delete buf[session.id]
      streamingSessionIdRef.current = session.id
      streamingMsgIdRef.current = null
    } else {
      setStreamingContent('')
      streamingMsgIdRef.current = null
      streamingSessionIdRef.current = null
    }

    const fileArts: FileArtifact[] = []
    const chartImgs: ChartImage[] = []
    for (const msg of msgs) {
      if (msg.role === 'artifact_preview' && msg.artifact_url) {
        fileArts.push({
          type: msg.artifact_type || 'file',
          path: msg.artifact_url,
          title: msg.content,
          filename: msg.artifact_filename || '',
          status: 'done' as const,
          expires_at: null,
        })
        if ((msg.artifact_type === 'image' || !!msg.artifact_url.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i)) && (msg.artifact_url.startsWith('http') || msg.artifact_url.startsWith('/'))) {
          chartImgs.push({ url: msg.artifact_url, title: msg.content })
        }
      }
    }
    if (fileArts.length > 0) setFileArtifacts(fileArts)
    if (chartImgs.length > 0) setChartImages(chartImgs)
  }, [setFileArtifacts, setChartImages, currentSessionId, streamingContent])

  const deleteNormalSession = useCallback((sessionId: string) => {
    setNormalSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId)
      try { localStorage.setItem('normal-chat-sessions', JSON.stringify(updated)) } catch {}
      return updated
    })
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null)
      setMessages([])
      messagesRef.current = []
    }
  }, [currentSessionId])

  const deleteCollabSession = useCallback((sessionId: string) => {
    setCollabSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId)
      try { localStorage.setItem('collaboration-chat-sessions', JSON.stringify(updated)) } catch {}
      return updated
    })
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null)
      setMessages([])
      messagesRef.current = []
    }
  }, [currentSessionId])

  const loadHistory = useCallback(async (taskId: string) => {
    // 先通过 WS 切换会话上下文，实现后端上下文隔离与恢复
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'switch_task', task_id: taskId }))
    }
    try {
      const [taskRes, msgsRes, artifactsRes] = await Promise.all([
        fetch(`/api/v1/agent/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/v1/agent/tasks/${taskId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/v1/agent/tasks/${taskId}/artifacts`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])
      if (!taskRes.ok) throw new Error(`HTTP ${taskRes.status}`)
      const data = await taskRes.json()
      setCurrentTaskId(data.id || taskId)
      setMessages([])

      const restored: Message[] = []

      if (msgsRes.ok) {
        const msgs = await msgsRes.json()
        for (const m of msgs) {
          if (m.from_agent === 'user') {
            restored.push({ id: `hist-u-${Date.now()}-${restored.length}`, role: 'user', content: m.content })
          } else if (m.from_agent === 'orchestrator' && m.type === 'orchestrator_summary') {
            restored.push({ id: `hist-a-${Date.now()}-${restored.length}`, role: 'orchestrator', content: m.content })
          } else if (m.type === 'agent_message') {
             restored.push({ id: `hist-agent-${Date.now()}-${restored.length}`, role: 'agent', content: m.content, agent_id: m.from_agent, agent_name: AGENT_NAME_MAP[m.from_agent] || m.from_agent, done: true })
          }
        }
      }

      if (artifactsRes.ok) {
        const artList = await artifactsRes.json()
        if (artList.length > 0) {
          const loadedFileArts: FileArtifact[] = []
          const loadedChartImgs: ChartImage[] = []
          const seenChartUrls = new Set<string>()
          for (const a of artList) {
            const fa: FileArtifact = {
              type: a.artifact_type,
              path: a.path,
              title: a.title,
              filename: a.filename,
              status: 'done' as const,
              expires_at: a.expires_at || null,
            }
            loadedFileArts.push(fa)
            if (a.artifact_type === 'image' && a.path && (a.path.startsWith('http') || a.path.startsWith('/api/'))) {
              if (!seenChartUrls.has(a.path)) {
                seenChartUrls.add(a.path)
                loadedChartImgs.push({ url: a.path, title: a.title || '' })
              }
            }
          }
          setFileArtifacts(loadedFileArts)
          setChartImages(loadedChartImgs)
          setArtifactsPanelVisible(true)
          setPendingArtifacts([])
          for (const a of artList) {
            restored.push({
              id: `hist-artifact-${Date.now()}-${restored.length}`,
              role: 'artifact_preview' as const,
              content: a.title || a.filename || '产物',
              artifact_url: a.path,
              artifact_type: a.artifact_type,
              artifact_filename: a.filename || '',
            })
          }
        }
      }

      if (restored.length === 0) {
        if (data.query) {
          restored.push({ id: `hist-u-${Date.now()}`, role: 'user', content: data.query })
        }
        if (data.summary) {
          restored.push({ id: `hist-a-${Date.now()}`, role: 'orchestrator', content: data.summary })
        }
      }

      if (restored.length > 0) setMessages(restored)
      setThinkingCompleted(true)
    } catch (err) {
      console.error('加载历史记录失败:', err)
    }
  }, [token])

  const handleNormalSend = useCallback(async (
    text: string,
    attachments?: { imageData: ArrayBuffer; imageUrl: string; name: string }[],
  ) => {
    if (!text.trim()) return
    const uid = nextId('u')
    setInput('')
    const userFiles = attachments?.map(a => ({ name: a.name, type: 'image', url: a.imageUrl }))
    const userMsg: Message = { id: uid, role: 'user', content: text, files: userFiles }
    const streamPlaceholderId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    streamingMsgIdRef.current = streamPlaceholderId
    streamingSessionIdRef.current = currentSessionId

    const newMsgs = [...messagesRef.current, userMsg, { id: streamPlaceholderId, role: 'orchestrator' as const, content: '' }]
    setMessages(newMsgs)
    messagesRef.current = newMsgs

    setLoading(true)
    setStreamingContent('')
    setIsStreaming(true)

    try {
      const modelMode = (localStorage.getItem('agentModelMode') || 'api') as 'api' | 'local'

      if (modelMode === 'local') {
        const ready = await visionEngine.isReady()
        if (!ready) {
          await visionEngine.loadModel()
        }
      }

      const historyMessages = messagesRef.current
        .filter(m => m.role === 'user' || m.role === 'orchestrator')
        .slice(0, -2)
        .map(m => ({ role: (m.role === 'orchestrator' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.content }))

      const controller = new AbortController()
      abortControllerRef.current = controller

      let fullContent = ''
      let fullReasoning = ''
      let prefillDone = false
      const streamOwnerSessionId = currentSessionId
      setIsPrefilling(true)
      setStreamingContent('...')

      const onToken = (token: string) => {
        if (controller.signal.aborted) return
        fullContent += token
        if (!prefillDone) {
          prefillDone = true
          setIsPrefilling(false)
        }
        setStreamingContent(fullContent)
        if (streamingSessionIdRef.current !== streamOwnerSessionId) {
          const buf = streamBufferBySession.current
          if (!buf[streamOwnerSessionId!]) buf[streamOwnerSessionId!] = { content: '', messageIds: {} }
          buf[streamOwnerSessionId!].content += token
          return
        }
      }

      const onReasoning = (token: string) => {
        fullReasoning += token
        setStreamingReasoning(fullReasoning)
        if (!prefillDone) {
          setIsPrefilling(false)
          prefillDone = true
        }
      }

      if (modelMode === 'api') {
        const systemPrompt = deepThink
          ? '你是灵枢（LingShu），一个知识渊博的 AI 学习助手。\n\n你的使命：\n- 以清晰的逻辑深入分析问题本质，逐步展开推理过程\n- 可以检索知识库和互联网来获取最新/专业知识\n- 给出准确、有依据的结论\n\n遇到需要核实或深入的问题，主动使用知识库搜索或网络搜索工具。'
          : '你是灵枢（LingShu），一个知识渊博且乐于助人的 AI 学习助手。\n回答问题简洁清晰、有逻辑。如需核实信息，可以搜索知识库或互联网。'

        if (deepThink) {
          const result = await miniCPMApi.chatWithTools(text, {
            onToken,
            onReasoning,
          }, {
            systemPrompt,
            temperature: 0.3,
            abortSignal: controller.signal,
            historyMessages,
            imagesData: attachments?.map(a => a.imageData),
          })
          fullContent = result.content
          fullReasoning = result.reasoning
        } else {
          const result = await miniCPMApi.chatWithTools(text, {
            onToken,
          }, {
            systemPrompt,
            model: 'MiniCPM-V-4.6-Instruct',
            temperature: 0.7,
            abortSignal: controller.signal,
            historyMessages,
            imagesData: attachments?.map(a => a.imageData),
          })
          fullContent = result.content
        }
      } else {
        await visionEngine.chat(text, onToken, {
          ...(deepThink ? {
            maxTokens: 3072,
            temperature: 0.3,
            topP: 0.85,
            minP: 0.05,
            repeatPenalty: 1.15,
            frequencyPenalty: 0.1,
            seed: 42,
            systemPrompt: '你是灵枢（LingShu），一个知识渊博的 AI 学习助手。\n\n你的使命：\n- 以清晰的逻辑深入分析问题本质，逐步展开推理过程\n- 给出准确、有依据的结论\n\n输出格式要求：\n1. 将你的完整推理过程放在  thinking 标签内\n2. 在标签外给出最终答案',
          } : {
            maxTokens: 2048,
            temperature: 0.7,
            systemPrompt: '你是灵枢（LingShu），一个知识渊博且乐于助人的 AI 学习助手。回答问题简洁清晰、有逻辑。',
          }),
          abortSignal: controller.signal,
          historyMessages,
          imagesData: attachments?.map(a => a.imageData),
        })
      }

      if (controller.signal.aborted) {
        setIsStreaming(false)
        setIsPrefilling(false)
        streamingSessionIdRef.current = null
        return
      }
      setIsStreaming(false)

      const aid = nextId('a')
      const thinkMatch = fullContent.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/)
      if ((thinkMatch || fullReasoning) && deepThink) {
        const reasoning = fullReasoning || thinkMatch?.[1].trim() || ''
        const answer = fullContent || thinkMatch?.[2]?.trim() || fullReasoning || '(无最终回答)'
        setStreamingContent('')
        setStreamingReasoning('')
        streamingMsgIdRef.current = null
        streamingSessionIdRef.current = null
        const placeholderIdx = messagesRef.current.findIndex(m => m.id === streamPlaceholderId)
        const updatedMsgs = [...messagesRef.current]
        const msgPair: Message[] = reasoning
          ? [{ id: nextId('think'), role: 'thinking' as const, title: '深度思考', reasoning, completed: true, content: '' },
             { id: aid, role: 'orchestrator' as const, content: answer }]
          : [{ id: aid, role: 'orchestrator' as const, content: answer }]
        if (placeholderIdx >= 0) {
          updatedMsgs.splice(placeholderIdx, 1, ...msgPair)
        } else {
          updatedMsgs.push(...msgPair)
        }
        setMessages(updatedMsgs)
        messagesRef.current = updatedMsgs
        saveCurrentSession(updatedMsgs)
        return
      }

      setStreamingContent('')
      setStreamingReasoning('')
      streamingMsgIdRef.current = null
      streamingSessionIdRef.current = null
      const placeholderIdx = messagesRef.current.findIndex(m => m.id === streamPlaceholderId)
      const updatedMsgs = [...messagesRef.current]
      if (placeholderIdx >= 0) {
        updatedMsgs[placeholderIdx] = { id: aid, role: 'orchestrator' as const, content: fullContent || '(无回复内容)' }
      } else {
        updatedMsgs.push({ id: aid, role: 'orchestrator' as const, content: fullContent || '(无回复内容)' })
      }
      setMessages(updatedMsgs)
      messagesRef.current = updatedMsgs
      saveCurrentSession(updatedMsgs)
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setIsStreaming(false)
      setIsPrefilling(false)
      setStreamingContent('')
      setStreamingReasoning('')
      streamingMsgIdRef.current = null
      streamingSessionIdRef.current = null
      const errMsg = err?.message || String(err || '未知错误')
      const displayMsg = errMsg.includes('尚未下载')
        ? `❌ 模型未就绪：MiniCPM-V 4.6 尚未下载。请前往 [设置 → AI 模型] 下载后重试。`
        : errMsg.includes('不完整')
          ? `❌ 模型文件不完整：${errMsg}`
          : `❌ 模型回复失败：${errMsg}`
      const placeholderIdx = messagesRef.current.findIndex(m => m.id === streamPlaceholderId)
      const updatedMsgs = [...messagesRef.current]
      if (placeholderIdx >= 0) {
        updatedMsgs[placeholderIdx] = { id: nextId('err'), role: 'system' as const, content: displayMsg }
      } else {
        updatedMsgs.push({ id: nextId('err'), role: 'system' as const, content: displayMsg })
      }
      setMessages(updatedMsgs)
      messagesRef.current = updatedMsgs
    } finally {
      setIsPrefilling(false)
      setLoading(false)
      abortControllerRef.current = null
    }
  }, [deepThink, currentSessionId])

  const handleSend = useCallback(() => {
    const text = input.trim()

    if (!user?.deepseek_api_key) {
      showApiKeySetup(['deepseek'])
      return
    }

    if (chatMode === 'normal') {
      const pending = pendingAttachmentsRef.current
      if (!text && pending.length === 0) return
      setPendingAttachments([])
      setInput('')

      if (pending.length > 0) {
        const attachments = pending
          .filter(a => a.type === 'image' && a.imageData)
          .map(a => ({ imageData: a.imageData!, imageUrl: a.previewUrl, name: a.name }))
        const videoFiles = pending.filter(a => a.type === 'video')

        if (videoFiles.length > 0) {
          ;(async () => {
            try {
              setLoading(true)
              let videoText = ''
              for (const att of videoFiles) {
                const modelMode = (localStorage.getItem('agentModelMode') || 'api') as 'api' | 'local'
                const result = modelMode === 'api'
                  ? await miniCPMApi.understandVideo(att.file, undefined)
                  : await visionEngine.understandImage(att.file, undefined, '请详细描述这段视频的内容，包括画面中的场景、物体、人物、动作和关键事件等信息。')
                videoText += `\n\n📹 ${att.name}:\n${result.description}`
              }
              const finalText = text ? `${text}\n\n---\n${videoText.trim()}` : videoText.trim()
              handleNormalSend(finalText || '请分析上传的文件', attachments.length > 0 ? attachments : undefined)
            } catch (err) {
              console.error('处理视频失败:', err)
              setLoading(false)
            }
          })()
        } else {
          handleNormalSend(text || '请分析上传的图片', attachments.length > 0 ? attachments : undefined)
        }
      } else {
        handleNormalSend(text)
      }
      return
    }

    if (chatMode === 'collaboration') {
      const pending = pendingAttachmentsRef.current
      if (!text && pending.length === 0) return

      setPendingAttachments([])

      // Collect parsed content from attachments
      let attachmentsExtra = ''
      const doneAttachments = pending.filter(a => a.status === 'done' && a.parsedContent)
      if (doneAttachments.length > 0) {
        const parts = doneAttachments.map((a, i) => {
          const typeLabel = a.type === 'image' ? '📷 图片' : a.type === 'video' ? '🎬 视频' : '📄 文档'
          return `【附件 ${i + 1}】[${typeLabel}] ${a.name}\n${a.parsedContent}`
        })
        attachmentsExtra = `\n\n---\n📎 附件内容（${doneAttachments.length}个）：\n${parts.join('\n\n---\n')}`
      }

      const finalText = text ? `${text}${attachmentsExtra}` : (attachmentsExtra.trim() || '请分析上传的文件')

      if (!currentSessionId) {
        setCurrentSessionId(`collab-${Date.now()}`)
      }

      setInput('')
      setLoading(true)
      setTodos([])
      setAgentsStarted(false)
      setAgentReasoning({})
      setAgentFinalContent({})
      setAgentStreamContent({})
      streamContentRef.current = {}
      setAgentTaskDesc({})
      setThinkingCompleted(false)
      // Add user message (show only original text, not parsed content)
      setMessages(prev => [...prev, { id: nextId('u'), role: 'user', content: text || (attachmentsExtra.trim() ? '已上传文件' : '请分析上传的文件') }])

      setInput('')
      setCurrentDiscussionTodoId(null)
      if (!sessionTaskIdRef.current) {
        sessionTaskIdRef.current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
      const currentTaskId = sessionTaskIdRef.current
      setCurrentTaskId(currentTaskId)
      setStreamingContent('')
      setStreamingDone(false)
      setIsStreaming(false)
      streamingSessionIdRef.current = null
      streamingMsgIdRef.current = null
      streamBufferBySession.current = {}
      setToolagentThinking([])
      setToolagentProjectPath(null)
      setToolagentWaitingFeedback(false)
      setToolagentDone(false)
      setToolagentPptxPath('')
      setToolagentFilename('')
      setToolagentReasoning('')
      setToolagentTitle('')
      setToolagentTaskType('general')
      setToolagentPhase(null)
      setToolagentDesignSpec(null)
      setStages(STAGE_LABELS.map(s => ({ id: s.id, label: s.label, status: 'pending' as const })))
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'chat', text: finalText, mode: outputMode, task_id: currentTaskId }))
      } else {
        setLoading(false)
        console.warn('WS 未打开，消息未发送')
      }
      pending.forEach(att => URL.revokeObjectURL(att.previewUrl))
      return
    }
  }, [input, chatMode, outputMode, handleNormalSend, pendingAttachments])

  const handleStop = useCallback(() => {
    if (chatMode === 'normal') {
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      setLoading(false)
      setStreamingContent('')
      setStreamingReasoning('')
      setIsStreaming(false)
      return
    }
    wsRef.current?.send(JSON.stringify({ action: 'abort' }))
    setLoading(false)
    setStreamingContent('')
    setIsStreaming(false)
    streamingSessionIdRef.current = null
    streamingMsgIdRef.current = null
  }, [chatMode])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleImagePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const previewUrl = URL.createObjectURL(file)
        const isImage = item.type.startsWith('image/')
        const att: PendingAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          previewUrl,
          imageData: isImage ? await file.arrayBuffer() : undefined,
          type: isImage ? 'image' : 'video',
          name: file.name || (isImage ? 'clipboard.png' : 'clipboard.webm'),
          status: chatMode === 'collaboration' ? 'processing' : 'pending',
        }
        setPendingAttachments(prev => [...prev, att])
        if (chatMode === 'collaboration' && processAttachment) {
          processAttachment(att)
        }
        return
      }
    }
  }, [chatMode])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3)
    if (files.length === 0) return

    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'avi', 'mkv']
    const DOC_EXTS = ['pdf', 'docx', 'pptx', 'ppt', 'txt', 'csv', 'md', 'xlsx', 'xls']

    const newAttachments: PendingAttachment[] = []

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const isImage = IMAGE_EXTS.includes(ext)
      const isVideo = VIDEO_EXTS.includes(ext)
      const isDocument = DOC_EXTS.includes(ext)

      // Normal mode: skip documents
      if (chatMode === 'normal' && !isImage && !isVideo) continue

      const previewUrl = URL.createObjectURL(file)
      const fileType: PendingAttachment['type'] = isImage ? 'image' : isVideo ? 'video' : 'document'

      const att: PendingAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl,
        type: fileType,
        name: file.name,
        status: chatMode === 'collaboration' ? 'processing' : 'pending',
      }

      if (isImage) {
        att.imageData = await file.arrayBuffer()
      }

      newAttachments.push(att)
    }

    if (newAttachments.length === 0) {
      if (e.target) e.target.value = ''
      return
    }

    setPendingAttachments(prev => [...prev, ...newAttachments])

    // Collaboration mode: process files in background
    if (chatMode === 'collaboration') {
      for (const att of newAttachments) {
        processAttachment(att)
      }
    }

    if (e.target) e.target.value = ''
  }

  const processAttachment = async (att: PendingAttachment) => {
    try {
      let parsedContent = ''
      if (att.type === 'image') {
        const visionPrompt = '请详细描述这张图片的内容，包括画面中的主要元素、场景、文字信息等关键细节。'
        const modelMode = (localStorage.getItem('agentModelMode') || 'api') as 'api' | 'local'
        console.log(`[Agent] Parsing image: ${att.name}, mode: ${modelMode}`)
        const result = modelMode === 'api'
          ? await miniCPMApi.understandImage(att.file, undefined, visionPrompt)
          : await visionEngine.understandImage(att.file, undefined, visionPrompt)
        parsedContent = result.description
        console.log(`[Agent] Image parsed successfully: ${att.name}`)
      } else if (att.type === 'video') {
        const visionPrompt = '请详细描述这段视频的内容，包括画面中的场景、物体、人物、动作和关键事件等信息。'
        const modelMode = (localStorage.getItem('agentModelMode') || 'api') as 'api' | 'local'
        console.log(`[Agent] Parsing video: ${att.name}, mode: ${modelMode}`)
        const result = modelMode === 'api'
          ? await miniCPMApi.understandVideo(att.file, visionPrompt)
          : await visionEngine.understandImage(att.file, undefined, visionPrompt)
        parsedContent = result.description
        console.log(`[Agent] Video parsed successfully: ${att.name}`)
      } else {
        const formData = new FormData()
        formData.append('file', att.file)
        const res = await fetch('/api/v1/image/upload-parse', { method: 'POST', body: formData })
        if (!res.ok) throw new Error(`上传失败: ${att.name}`)
        const data = await res.json()
        if (!data.success) throw new Error(`解析失败: ${att.name}`)
        parsedContent = data.markdown
      }
      setPendingAttachments(prev =>
        prev.map(a => a.id === att.id ? { ...a, status: 'done', parsedContent } : a)
      )
    } catch (err: any) {
      console.error(`[Agent] Parse error for ${att.name}:`, err)
      setPendingAttachments(prev =>
        prev.map(a => a.id === att.id ? { ...a, status: 'error', error: err?.message || '解析失败' } : a)
      )
    }
  }

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: cameraMode === 'video' })
      cameraStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('Camera access error:', err)
    }
  }, [cameraMode])

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop())
      cameraStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsRecording(false)
    recordedChunksRef.current = []
  }, [])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const timestamp = Date.now()
      const file = new File([blob], `photo_${timestamp}.jpg`, { type: 'image/jpeg' })
      const previewUrl = URL.createObjectURL(file)
      const imageData = await file.arrayBuffer()
      const ext = 'jpg'
      const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      const isImage = IMAGE_EXTS.includes(ext)
      const att: PendingAttachment = {
        id: `cam-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl,
        imageData,
        type: 'image',
        name: file.name,
        status: chatMode === 'collaboration' ? 'processing' : 'pending',
      }
      setPendingAttachments(prev => [...prev, att])
      if (chatMode === 'collaboration' && processAttachment) {
        processAttachment(att)
      }
      stopCamera()
      setShowCamera(false)
    }, 'image/jpeg', 0.92)
  }, [chatMode, stopCamera])

  const startRecording = useCallback(() => {
    const stream = cameraStreamRef.current
    if (!stream) return
    recordedChunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }
    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      const timestamp = Date.now()
      const file = new File([blob], `video_${timestamp}.webm`, { type: 'video/webm' })
      const previewUrl = URL.createObjectURL(file)
      const att: PendingAttachment = {
        id: `cam-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl,
        type: 'video',
        name: file.name,
        status: chatMode === 'collaboration' ? 'processing' : 'pending',
      }
      setPendingAttachments(prev => [...prev, att])
      if (chatMode === 'collaboration' && processAttachment) {
        processAttachment(att)
      }
      stopCamera()
      setShowCamera(false)
    }
    recorder.start()
    setIsRecording(true)
  }, [chatMode, stopCamera])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  const handleToolagentSend = useCallback((text: string) => {
    wsRef.current?.send(JSON.stringify({ action: 'toolagent_feedback', text }))
    setToolagentWaitingFeedback(false)
  }, [])

  const hasContent = messages.length > 0 || loading || Object.keys(agentStreamContent).length > 0
  const allFileArtifacts = [...pendingArtifacts, ...fileArtifacts]
  const artifactCount = chartImages.length + allFileArtifacts.length
  const suggestionItems = useMemo(() => [
    { icon: <Zap className="w-3.5 h-3.5" />, text: '帮我制定学习计划', color: 'border-amber-200/60 hover:border-amber-300/80' },
    { icon: <Award className="w-3.5 h-3.5" />, text: '生成思维导图', color: 'border-emerald-200/60 hover:border-emerald-300/80' },
    { icon: <BookOpen className="w-3.5 h-3.5" />, text: '解释这个知识点', color: 'border-blue-200/60 hover:border-blue-300/80' },
    { icon: <ChartColumn className="w-3.5 h-3.5" />, text: '推荐高效复习策略', color: 'border-violet-200/60 hover:border-violet-300/80' },
  ], [])

  return (
    <div className="flex h-screen bg-gradient-to-br from-stone-50 via-amber-50/30 to-stone-100 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[60vw] h-[60vh] bg-gradient-to-br from-amber-200/10 to-orange-300/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[40vw] h-[40vh] bg-gradient-to-tr from-amber-100/10 to-orange-200/5 rounded-full blur-[100px]" />
      </div>
      <ParticleField />

      {/* Todo sidebar — left side, glass */}
      {chatMode === 'collaboration' && todos.length > 0 && showTodoPanel && (
        <div className="relative z-10 flex-shrink-0">
          <div className="w-72 border-r border-stone-200/30 bg-white/50 backdrop-blur-xl flex flex-col h-full shadow-lg shadow-stone-900/5">
            <div className="px-4 py-3 border-b border-stone-200/30 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                待办清单
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 bg-white/60 px-2 py-0.5 rounded-full">
                  {todos.filter(t => t.status === 'done').length}/{todos.length}
                </span>
                <button onClick={() => setShowTodoPanel(false)} className="p-1 rounded-md hover:bg-stone-100/80 transition-colors text-stone-400 hover:text-stone-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              <TodoPanel todos={todos} currentDiscussionTodoId={currentDiscussionTodoId} onTodoClick={(id) => setCurrentDiscussionTodoId(id)} />
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">

      {/* Header */}
      <div className="relative z-10 flex-shrink-0 px-4 py-2.5 border-b border-stone-200/40 bg-white/30 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-stone-100/80 transition-colors text-stone-500">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-stone-700">灵枢</span>
            </div>
            <div className="flex items-center gap-1.5 bg-stone-100/70 rounded-full p-0.5 border border-stone-200/30">
              <button
                onClick={() => handleModeSwitch('normal')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                  chatMode === 'normal' ? 'bg-white text-amber-700 shadow-sm border border-amber-200/40' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                灵枢
              </button>
              <button
                onClick={() => handleModeSwitch('collaboration')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                  chatMode === 'collaboration' ? 'bg-white text-amber-700 shadow-sm border border-amber-200/40' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                协作
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {chatMode === 'collaboration' && (
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} title={wsConnected ? '已连接' : '未连接'} />
            )}
            <button
              onClick={() => setHistoryVisible(true)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100/60 transition-colors"
              title="历史记录"
            >
              <History className="w-4 h-4" />
            </button>
            <button onClick={handleNewChat} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100/60 transition-colors" title="新对话">
              <Plus className="w-4 h-4" />
            </button>
            <button
               onClick={() => setLocalPanelVisible(prev => !prev)}
               className={`relative p-1.5 rounded-lg transition-colors ${
                localPanelVisible ? 'bg-amber-100 text-amber-600' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100/60'
              }`}
              title={artifactCount > 0 ? `产物 (${artifactCount})` : '产物'}
            >
              <PanelRightOpen className="w-4 h-4" />
              {artifactCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {artifactCount > 9 ? '9+' : artifactCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* History Drawer */}
      {historyVisible && chatMode === 'collaboration' && (
        <HistoryDrawer
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          sessions={collabSessions}
          currentSessionId={currentSessionId}
          onSelect={selectCollabSession}
          onDelete={deleteCollabSession}
        />
      )}
      {historyVisible && chatMode === 'normal' && (
        <HistoryDrawer
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          sessions={normalSessions}
          currentSessionId={currentSessionId}
          onSelect={selectNormalSession}
          onDelete={deleteNormalSession}
        />
      )}

      {/* Mode toggles */}
      {chatMode === 'collaboration' && !wsConnected && (
        <div className="relative z-10 flex-shrink-0 px-4 py-1.5 border-b border-stone-200/20 bg-rose-50/80 backdrop-blur-sm">
          <p className="text-xs text-rose-600 text-center">WebSocket 未连接，请稍候或尝试重新进入协作模式</p>
        </div>
      )}

      {/* Message area */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">

        {/* Stages for collaboration mode */}
        {chatMode === 'collaboration' && stages.some(s => s.status !== 'pending') && (
          <div className="flex items-center gap-2 px-1 py-2 overflow-x-auto">
            {stages.map(stage => (
              <div key={stage.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-colors ${
                stage.status === 'active' ? 'bg-amber-50 text-amber-700 border-amber-300/50' :
                stage.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-300/40' :
                'bg-stone-50 text-stone-400 border-stone-200/40'
              }`}>
                {stage.status === 'active' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                 stage.status === 'completed' ? <Check className="w-3 h-3" /> :
                 <div className="w-3 h-3 rounded-full border border-stone-300/50" />}
                {stage.label}
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && !loading && Object.keys(agentStreamContent).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AgentHeroGlow />
            <p className="text-xs text-stone-400 mt-2">和我聊聊你的问题吧</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-md">
              {suggestionItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(item.text)
                    inputRef.current?.focus()
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border bg-white/50 text-stone-600 ${item.color} transition-all`}
                >
                  {item.icon}
                  {item.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
            if (msg.artifact) return null

            if (msg.role === 'user') {
              return (
                <React.Fragment key={msg.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5 justify-end"
                  >
                    <div className="bg-white/80 backdrop-blur-sm border border-stone-200/40 rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[75%] shadow-sm">
                      {msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.files.map((f, i) => (
                            <div key={i} className="relative group">
                              <img
                                src={f.url}
                                alt={f.name}
                                className="w-20 h-20 rounded-lg object-cover border border-stone-200/50"
                              />
                              <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/50 text-white px-1 rounded truncate max-w-[76px]">{f.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap break-words">
                        <FormattedText content={msg.content} navigate={navigate} />
                      </div>
                    </div>
                    </motion.div>
                </React.Fragment>
              )
            }

            if (msg.role === 'thinking') {
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <ThinkingBlock
                    content={msg.reasoning || msg.content}
                    isFinished={msg.completed || false}
                  />
                </motion.div>
              )
            }

            if (msg.role === 'system') {
              return (
                <motion.div key={msg.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
                  <div className={`text-xs px-3 py-1.5 rounded-full ${msg.error ? 'bg-rose-50 text-rose-600 border border-rose-200/50' : 'bg-stone-50 text-stone-500 border border-stone-200/50'}`}>
                    <FormattedText content={msg.content} navigate={navigate} />
                  </div>
                </motion.div>
              )
            }

            if (msg.role === 'agent') {
              const aid = msg.agent_id || ''
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <AgentBubble
                    agentName={msg.agent_name || 'Agent'}
                    agentIcon={msg.agent_icon}
                    reasonContent={agentReasoning[aid] || ''}
                    streamContent={agentStreamContent[aid] || ''}
                    finalContent={msg.done ? (agentFinalContent[aid] || msg.content || '') : ''}
                    isDone={msg.done || false}
                    taskDescription={agentTaskDesc[aid] || ''}
                    navigate={navigate}
                  />
                </motion.div>
              )
            }

            if (msg.role === 'artifact_preview') {
              const isImage = msg.artifact_type === 'image' || !!msg.artifact_url?.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i)
              return (
                <div key={msg.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5 justify-start pl-[42px]"
                  >
                    {isImage ? (
                      <div
                        onClick={() => setPreviewUrl(msg.artifact_url!)}
                        className="bg-white/60 backdrop-blur-sm border border-stone-200/50 rounded-xl overflow-hidden max-w-[280px] shadow-sm cursor-pointer group transition-all hover:shadow-md"
                      >
                        <div className="aspect-[4/3] bg-stone-50 flex items-center justify-center overflow-hidden">
                          <img
                            src={msg.artifact_url}
                            alt={msg.content}
                            className="w-full h-full object-contain p-1"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.fallback')?.classList.remove('hidden') }}
                          />
                          <div className="fallback hidden w-full h-full items-center justify-center text-stone-300 text-[10px]">加载失败</div>
                        </div>
                        <div className="px-2.5 py-1.5 flex items-center justify-between border-t border-stone-100/80">
                          <p className="text-[10px] text-stone-500 truncate flex-1">{msg.content}</p>
                          <Maximize2 className="w-3 h-3 text-stone-300 flex-shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white/60 backdrop-blur-sm border border-stone-200/50 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-3 py-2.5 flex items-center gap-2.5 min-w-[200px]">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-stone-600 truncate">{msg.content}</p>
                            <p className="text-[9px] text-stone-400 truncate">{msg.artifact_filename || '文件'}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>
              )
            }

            if (msg.role === 'toolagent') {
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="pl-[42px]">
                    {toolagentWaitingFeedback || toolagentThinking.length > 0 || toolagentPhase || toolagentDesignSpec ? (
                      <ToolAgentBubble
                        thinkingSteps={toolagentThinking}
                        projectPath={toolagentProjectPath}
                        waitingFeedback={toolagentWaitingFeedback}
                        phase={toolagentPhase}
                        designSpec={toolagentDesignSpec}
                        onSend={handleToolagentSend}
                        isDone={toolagentDone}
                        pptxPath={toolagentPptxPath}
                        filename={toolagentFilename}
                        title={toolagentTitle}
                        taskType={toolagentTaskType}
                        pageProgress={toolagentPageProgress}
                      />
                    ) : msg.done ? (
                      <div className="max-w-3xl bg-emerald-50/70 backdrop-blur-sm border border-emerald-200/40 rounded-xl px-3 py-2">
                        <p className="text-xs text-emerald-600 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          任务完成
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white/60 backdrop-blur-sm border border-stone-200/30 rounded-xl px-3.5 py-2.5">
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400/50" style={{ animation: `bounce 0.6s ${i * 0.15}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            }

            const isStreamPlaceholder = msg.id === streamingMsgIdRef.current

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2.5 justify-start"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/30 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className={`backdrop-blur-sm border rounded-2xl rounded-tl-sm px-3.5 py-2 max-w-[75%] shadow-sm relative overflow-hidden ${streamingDone ? 'bg-white border-amber-200/30' : isStreamPlaceholder ? 'bg-white/70 border-amber-200/30' : 'bg-white/70 border-amber-200/30'}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-400/[0.03] to-orange-500/[0.03] pointer-events-none" />
                  <p className="text-[11px] font-semibold text-amber-700 mb-0.5">灵枢</p>
                  <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap break-words">
                    {isStreamPlaceholder ? (
                      isPrefilling ? <BouncingDots size={4} /> : <FormattedText content={streamingContent} navigate={navigate} />
                    ) : (
                      <FormattedText content={msg.content} navigate={navigate} />
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}

        {/* Streaming thinking bubble */}
        {isStreaming && streamingReasoning && deepThink && (
          <motion.div
            key="streaming-think"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ThinkingBlock
              content={streamingReasoning}
              isFinished={false}
            />
          </motion.div>
        )}

        {chatMode === 'collaboration' && loading && Object.keys(agentStreamContent).length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-white/60 backdrop-blur-sm border border-stone-200/30 rounded-xl px-3.5 py-2.5">
              <BouncingDots />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Flow panel for collaboration mode */}
      {chatMode === 'collaboration' && flowNodes.length > 0 && (
        <div className="relative z-10 flex-shrink-0 px-4 pb-2">
          <FlowPanel nodes={flowNodes} />
        </div>
      )}

      {/* Input area */}
      <div className="relative z-10 flex-shrink-0 px-4 py-3 border-t border-stone-200/40 bg-white/30 backdrop-blur-md">
        <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2">
          {chatMode === 'normal' && (
            <button
              onClick={() => setDeepThink(!deepThink)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                deepThink
                  ? 'bg-amber-100 text-amber-700 border-amber-300/50'
                  : 'text-stone-500 hover:text-stone-700 bg-white/50 border-stone-200/50'
              }`}
            >
              <BrainCircuit className="w-3 h-3" />
              深度思考
            </button>
          )}
          {chatMode === 'collaboration' && (
            <button
              onClick={() => setOutputMode(outputMode === 'detailed' ? 'concise' : 'detailed')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors text-stone-500 hover:text-stone-700 bg-white/50 border-stone-200/50"
            >
              {outputMode === 'detailed' ? '📖 详细' : '📝 简洁'}
            </button>
          )}
        </div>

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
          <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map(att => (
              <div key={att.id} className="relative group rounded-lg border border-stone-200/50 bg-white/70 backdrop-blur-sm overflow-hidden">
                {att.type === 'image' ? (
                  <img src={att.previewUrl} alt={att.name} className="w-20 h-20 object-cover" />
                ) : (
                  <div className="w-20 h-20 flex flex-col items-center justify-center bg-stone-50 gap-1">
                    {att.type === 'video' ? (
                      <div className="w-6 h-6 rounded bg-stone-200 flex items-center justify-center text-[10px] text-stone-500">▶</div>
                    ) : (
                      <FileText className="w-5 h-5 text-stone-400" />
                    )}
                    <span className="text-[8px] text-stone-400 truncate px-1 max-w-full">{att.name}</span>
                  </div>
                )}
                {/* Status badge */}
                {att.status === 'processing' && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                      <span className="text-[8px] text-white">解析中</span>
                    </div>
                  </div>
                )}
                {att.status === 'done' && (
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                {att.status === 'error' && (
                  <div className="absolute bottom-0 left-0 right-0 bg-red-500/80 px-1 py-0.5">
                    <span className="text-[8px] text-white truncate block">{att.error || '解析失败'}</span>
                  </div>
                )}
                <button
                  onClick={() => {
                    setPendingAttachments(prev => prev.filter(a => a.id !== att.id))
                    URL.revokeObjectURL(att.previewUrl)
                  }}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-1 pb-0.5 pt-3 pointer-events-none">
                  <span className="text-[8px] text-white truncate block">{att.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 max-w-3xl mx-auto relative">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={chatMode === 'normal' ? '.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp4,.mov,.webm,.avi,.mkv' : ".pdf,.docx,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp4,.mov,.webm,.mp3,.wav,.m4a,.txt,.csv,.md,.xlsx,.xls"}
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="relative flex-shrink-0" ref={attachMenuRef}>
            <button
              onClick={() => setShowAttachMenu(prev => !prev)}
              disabled={loading}
              className="flex-shrink-0 p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100/60 transition-colors disabled:opacity-40"
              title="添加附件"
            >
              <Plus className="w-5 h-5" />
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-44 bg-white/95 backdrop-blur-xl border border-stone-200/60 rounded-xl shadow-lg shadow-stone-900/10 overflow-hidden z-50">
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false) }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  <Paperclip className="w-4 h-4 text-stone-400" />
                  <span>上传附件</span>
                </button>
                <button
                  onClick={() => { startCamera(); setShowCamera(true); setShowAttachMenu(false) }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  <Camera className="w-4 h-4 text-stone-400" />
                  <span>拍摄</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handleImagePaste}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
              placeholder="输入你的问题..."
              rows={1}
              className="w-full resize-none bg-white/60 backdrop-blur-sm border border-stone-200/40 rounded-xl px-3.5 py-2.5 text-sm text-stone-700 placeholder-stone-400 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition-all max-h-[120px]"
              disabled={loading}
            />
          </div>

          {loading ? (
            <button
              onClick={handleStop}
              className="flex-shrink-0 p-2.5 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 border border-rose-200/50 transition-colors"
              title="停止"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && pendingAttachments.length === 0}
              className="flex-shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      </div>

      {/* Artifacts panel — right sidebar */}
      <AnimatePresence>
        {localPanelVisible && (
          <ArtifactsPanel
            key="artifacts-panel"
            chartImages={chartImages}
            onRemoveChart={(url) => setChartImages(prev => prev.filter(img => img.url !== url))}
            fileArtifacts={allFileArtifacts}
            onClose={() => {
                setLocalPanelVisible(false)
              }}
          />
        )}
      </AnimatePresence>

      {/* Camera modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowCamera(false); stopCamera() }}>
          <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl w-full max-w-lg max-h-[90vh] mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full flex-1 min-h-0 object-cover bg-black"
            />
            <div className="absolute top-0 inset-x-0 flex items-center justify-between p-3 bg-gradient-to-b from-black/50 to-transparent z-10">
              <button
                onClick={() => { setShowCamera(false); stopCamera() }}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex gap-1 bg-white/20 rounded-lg p-0.5">
                <button
                  onClick={() => setCameraMode('photo')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${cameraMode === 'photo' ? 'bg-white text-black' : 'text-white'}`}
                >
                  拍照
                </button>
                <button
                  onClick={() => setCameraMode('video')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${cameraMode === 'video' ? 'bg-white text-black' : 'text-white'}`}
                >
                  录像
                </button>
              </div>
              <div className="w-9" />
            </div>
            <div className="flex items-center justify-center p-4 bg-gradient-to-t from-black/50 to-transparent">
              {cameraMode === 'photo' ? (
                <button
                  onClick={capturePhoto}
                  className="w-14 h-14 rounded-full border-4 border-white bg-transparent hover:bg-white/20 transition-colors"
                />
              ) : (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-red-500' : 'border-4 border-white bg-transparent hover:bg-white/20'}`}
                >
                  {isRecording && <div className="w-4 h-4 bg-white rounded-sm" />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image preview lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={previewUrl}
            alt="预览"
            className="max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

    </div>
  )
}

export default Agent
