import { Capacitor } from '@capacitor/core'
import JSZip from 'jszip'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://yibianguo.preview.aliyun-zeabur.cn'

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export interface ManifestFile {
  sha256: string
  size: number
}

export interface UpdateManifest {
  version: string
  versionCode: number
  files: Record<string, ManifestFile>
}

export interface UpdateInfo {
  hasUpdate: boolean
  latestVersion: string
  currentVersion: string
  changedFiles: number
  totalSize: number
  manifest: UpdateManifest | null
}

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'completed' | 'error'

export interface DownloadProgress {
  percent: number
  loadedBytes: number
  totalBytes: number
  currentFile: string
}

type StateCallback = (state: UpdateState) => void

class UpdateManager {
  private state: UpdateState = 'idle'
  private stateListeners: StateCallback[] = []
  private currentVersion = '0.0.0'
  private abortController: AbortController | null = null
  private zipDownloadUrl = ''

  private get isNative(): boolean {
    try {
      return Capacitor.isNativePlatform()
    } catch {
      return false
    }
  }

  onStateChange(cb: StateCallback): () => void {
    this.stateListeners.push(cb)
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== cb)
    }
  }

  private setState(state: UpdateState): void {
    this.state = state
    this.stateListeners.forEach(l => l(state))
  }

  getState(): UpdateState {
    return this.state
  }

  async init(): Promise<void> {
    if (!this.isNative) return
    try {
      const { AppUpdate } = await import('../plugins/AppUpdate')
      const result = await AppUpdate.getCurrentVersion()
      this.currentVersion = result.version || '0.0.0'
      if (this.currentVersion === '0.0.0') {
        try {
          const resp = await fetch('/manifest.json')
          const manifest: UpdateManifest = await resp.json()
          this.currentVersion = manifest.version || '0.0.0'
          await AppUpdate.setCurrentVersion({ version: this.currentVersion })
        } catch {
          /* manifest.json not bundled, keep 0.0.0 */
        }
      }
    } catch {
      this.currentVersion = '0.0.0'
    }
  }

  async checkForUpdate(): Promise<UpdateInfo> {
    if (!this.isNative) {
      return { hasUpdate: false, latestVersion: '', currentVersion: this.currentVersion, changedFiles: 0, totalSize: 0, manifest: null }
    }

    this.setState('checking')

    try {
      this.zipDownloadUrl = `${API_BASE_URL}/update/www.zip`

      const manifestResp = await fetch(`${API_BASE_URL}/update/manifest.json`)
      if (!manifestResp.ok) {
        this.setState('idle')
        return { hasUpdate: false, latestVersion: '', currentVersion: this.currentVersion, changedFiles: 0, totalSize: 0, manifest: null }
      }

      const remoteManifest: UpdateManifest = await manifestResp.json()
      const latestVersion = remoteManifest.version

      const totalSize = Object.values(remoteManifest.files).reduce((s, f) => s + f.size, 0)
      const hasUpdate = compareVersions(latestVersion, this.currentVersion) > 0

      if (hasUpdate) {
        this.setState('available')
      } else {
        this.setState('idle')
      }

      return {
        hasUpdate,
        latestVersion,
        currentVersion: this.currentVersion,
        changedFiles: 0,
        totalSize,
        manifest: remoteManifest,
      }
    } catch (err) {
      this.setState('idle')
      return { hasUpdate: false, latestVersion: '', currentVersion: this.currentVersion, changedFiles: 0, totalSize: 0, manifest: null }
    }
  }

  async downloadUpdate(
    manifest: UpdateManifest,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    if (!this.isNative) return

    this.setState('downloading')
    this.abortController = new AbortController()

    const { AppUpdate } = await import('../plugins/AppUpdate')

    let loadedBytes = 0
    const totalBytes = Object.values(manifest.files).reduce((s, f) => s + f.size, 0)

    try {
      onProgress({
        percent: 0,
        loadedBytes: 0,
        totalBytes,
        currentFile: '正在下载更新包...',
      })

      const response = await fetch(this.zipDownloadUrl, {
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`下载更新包失败 (HTTP ${response.status})`)
      }

      const zipBlob = await response.blob()
      const zip = await JSZip.loadAsync(zipBlob)

      for (const [filePath, fileInfo] of Object.entries(manifest.files)) {
        if (this.abortController.signal.aborted) {
          throw new Error('更新已取消')
        }

        const result = await AppUpdate.getFileHash({ path: filePath })
        if (result.exists && result.sha256 === fileInfo.sha256) {
          loadedBytes += fileInfo.size
          continue
        }

        onProgress({
          percent: totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0,
          loadedBytes,
          totalBytes,
          currentFile: filePath,
        })

        const zipEntry = zip.file(filePath)
        if (!zipEntry) {
          throw new Error(`更新包中缺少文件: ${filePath}`)
        }

        const base64 = await zipEntry.async('base64')
        await AppUpdate.writeFile({ path: filePath, content: base64 })

        loadedBytes += fileInfo.size

        onProgress({
          percent: Math.round((loadedBytes / totalBytes) * 100),
          loadedBytes,
          totalBytes,
          currentFile: filePath,
        })
      }

      await AppUpdate.setCurrentVersion({ version: manifest.version })
      this.currentVersion = manifest.version
      this.setState('completed')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.setState('idle')
      } else {
        this.setState('error')
      }
      throw err
    }
  }

  cancelDownload(): void {
    this.abortController?.abort()
    this.abortController = null
  }
}

export const updateManager = new UpdateManager()
