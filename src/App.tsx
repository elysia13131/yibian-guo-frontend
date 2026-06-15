import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ApiKeyProvider } from './contexts/ApiKeyContext'
import { AgentSessionProvider } from './contexts/AgentSessionContext'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import Home from './pages/Home'
import Analytics from './pages/Analytics'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Documents from './pages/Documents'
import DocumentReader from './pages/DocumentReader'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import Flashcards from './pages/Flashcards'
import FlashcardReview from './pages/FlashcardReview'
import ExperimentReport from './pages/ExperimentReport'
import AgentPage from './pages/Agent'
import GameHome from './pages/game/GameHome'
import GameSelect from './pages/game/GameSelect'
import GameSceneSelect from './pages/game/GameSceneSelect'
import GamePlay from './pages/game/GamePlay'
import GameSaves from './pages/game/GameSaves'
import GameCharacterSelect from './pages/game/GameCharacterSelect'
import GameCharacterCreate from './pages/game/GameCharacterCreate'
import GameCharacterManage from './pages/game/GameCharacterManage'
import BottomNav from './components/BottomNav'
import LoginPrompt from './components/LoginPrompt'
import UpdatePrompt from './components/UpdatePrompt'
import Toast from './components/Toast'
import Live2DOverlay from './components/Live2DOverlay'
import LandingPage from './pages/LandingPage'
import CompanionPage from './pages/Companion'
import DocumentGraph from './pages/DocumentGraph'
import KnowledgeGraphPage from './pages/KnowledgeGraphPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

function LoginPromptWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, loginPromptDismissed, dismissLoginPrompt } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated && !loginPromptDismissed) {
    return <LoginPrompt onDismiss={dismissLoginPrompt}>{children}</LoginPrompt>
  }

  return <>{children}</>
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()
  const isAuthRoute = ['/auth', '/register', '/reset-password'].includes(location.pathname)
  const isFullPageRoute = ['/documents', '/documents/', '/document-graph', '/knowledge-graph', '/game', '/game/', '/experiment', '/agent', '/landing', '/test', '/companion'].some(path =>
    location.pathname.startsWith(path)
  )

  // 检测外部分享的文件（"用其他应用打开"）
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const checkShared = async () => {
      try {
        const { IntentHandler } = await import('./plugins/IntentHandler')
        const result = await IntentHandler.getPendingSharedFile()
        if (result.hasFile && result.path) {
          navigate('/documents', { state: { sharedFilePath: result.path, sharedFileName: result.name, sharedFileMime: result.mimeType } })
        }
      } catch {
        // 非原生环境或插件未就绪，忽略
      }
    }
    // 延迟检查，等 Capacitor 插件加载完成
    const timer = setTimeout(checkShared, 500)
    return () => clearTimeout(timer)
  }, [])

  if (isAuthRoute && isAuthenticated && !loading) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UpdatePrompt />
      <div className={isFullPageRoute ? '' : 'pb-20'}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/register" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/" element={<LoginPromptWrapper><Home /></LoginPromptWrapper>} />
          <Route path="/analytics" element={<LoginPromptWrapper><Analytics /></LoginPromptWrapper>} />
          <Route path="/profile" element={<LoginPromptWrapper><Profile /></LoginPromptWrapper>} />
          <Route path="/settings" element={<LoginPromptWrapper><Settings /></LoginPromptWrapper>} />
          <Route path="/documents" element={<LoginPromptWrapper><Documents /></LoginPromptWrapper>} />
          <Route path="/documents/:id" element={<LoginPromptWrapper><DocumentReader /></LoginPromptWrapper>} />
          <Route path="/flashcards" element={<LoginPromptWrapper><Flashcards /></LoginPromptWrapper>} />
          <Route path="/flashcards/:id/review" element={<LoginPromptWrapper><FlashcardReview /></LoginPromptWrapper>} />
          <Route path="/experiment" element={<LoginPromptWrapper><ExperimentReport /></LoginPromptWrapper>} />
          <Route path="/agent" element={<LoginPromptWrapper><AgentPage /></LoginPromptWrapper>} />

          <Route path="/game" element={<GameHome />} />
          <Route path="/game/select" element={<LoginPromptWrapper><GameSelect /></LoginPromptWrapper>} />
          <Route path="/game/scene" element={<LoginPromptWrapper><GameSceneSelect /></LoginPromptWrapper>} />
          <Route path="/game/character" element={<LoginPromptWrapper><GameCharacterSelect /></LoginPromptWrapper>} />
          <Route path="/game/character/create" element={<LoginPromptWrapper><GameCharacterCreate /></LoginPromptWrapper>} />
          <Route path="/game/character/manage" element={<LoginPromptWrapper><GameCharacterManage /></LoginPromptWrapper>} />
          <Route path="/game/play/save/:saveId" element={<LoginPromptWrapper><GamePlay /></LoginPromptWrapper>} />
          <Route path="/game/play/:docId" element={<LoginPromptWrapper><GamePlay /></LoginPromptWrapper>} />
          <Route path="/game/saves" element={<LoginPromptWrapper><GameSaves /></LoginPromptWrapper>} />

          <Route path="/document-graph" element={<LoginPromptWrapper><DocumentGraph /></LoginPromptWrapper>} />
          <Route path="/knowledge-graph" element={<LoginPromptWrapper><KnowledgeGraphPage /></LoginPromptWrapper>} />

          <Route path="/landing" element={<LandingPage />} />
          <Route path="/companion" element={<LoginPromptWrapper><CompanionPage /></LoginPromptWrapper>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {!isFullPageRoute && isAuthenticated && <BottomNav />}
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiKeyProvider>
          <AgentSessionProvider>
            <AppContent />
            <Toast />
            <Live2DOverlay />
          </AgentSessionProvider>
        </ApiKeyProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
