import { useState, useEffect, useCallback } from 'react'
import { updateManager, type UpdateInfo, type DownloadProgress, type UpdateState } from '../services/UpdateManager'

export default function UpdatePrompt() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [state, setState] = useState<UpdateState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsub = updateManager.onStateChange(setState)
    updateManager.init()
    return unsub
  }, [])

  useEffect(() => {
    if (dismissed) return
    const timer = setTimeout(() => {
      updateManager.checkForUpdate().then(setUpdateInfo)
    }, 2000)
    return () => clearTimeout(timer)
  }, [dismissed])

  const handleUpdate = useCallback(async () => {
    if (!updateInfo?.manifest) return
    setError(null)
    try {
      await updateManager.downloadUpdate(updateInfo.manifest, setProgress)
    } catch (err: any) {
      if (err.message !== '更新已取消') {
        setError(err.message || '更新失败')
      }
    }
  }, [updateInfo])

  const handleCancel = useCallback(() => {
    updateManager.cancelDownload()
    setUpdateInfo(null)
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    setUpdateInfo(null)
  }, [])

  if (dismissed) return null

  if (state === 'completed') {
    return (
      <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg z-50">
        <p className="font-medium">更新完成</p>
        <p className="text-sm">请重启应用以生效</p>
        <button onClick={() => setDismissed(true)} className="mt-2 text-xs underline">
          关闭
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 min-w-[250px]">
        <p className="font-medium">更新失败</p>
        <p className="text-sm mt-1">{error || '请稍后重试'}</p>
        <div className="mt-2 flex gap-2">
          <button onClick={handleDismiss} className="text-xs underline">
            关闭
          </button>
          {updateInfo?.manifest && (
            <button onClick={handleUpdate} className="text-xs underline font-medium">
              重试
            </button>
          )}
        </div>
      </div>
    )
  }

  if (state === 'downloading' && progress) {
    return (
      <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-lg shadow-lg z-50 min-w-[300px]">
        <p className="font-medium text-gray-900 dark:text-white">正在下载更新...</p>
        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">{progress.percent}%</p>
        <p className="text-xs text-gray-400 mt-1 truncate">{progress.currentFile}</p>
        <button onClick={handleCancel} className="mt-2 text-xs text-red-500 underline">
          取消
        </button>
      </div>
    )
  }

  if (state === 'checking') {
    return null
  }

  if (updateInfo?.hasUpdate && state === 'available') {
    return (
      <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-lg shadow-lg z-50 min-w-[300px]">
        <p className="font-medium text-gray-900 dark:text-white">
          发现新版本 v{updateInfo.latestVersion}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          大小约 {(updateInfo.totalSize / 1024 / 1024).toFixed(1)} MB
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleUpdate}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
          >
            立即更新
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-sm rounded hover:bg-gray-300"
          >
            稍后
          </button>
        </div>
      </div>
    )
  }

  return null
}
