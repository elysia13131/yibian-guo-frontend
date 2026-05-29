import { registerPlugin } from '@capacitor/core'

export interface AppUpdatePluginDefinitions {
  getCurrentVersion(): Promise<{ version: string }>
  setCurrentVersion(options: { version: string }): Promise<void>
  writeFile(options: { path: string; content: string }): Promise<void>
  deleteFile(options: { path: string }): Promise<void>
  getFileHash(options: { path: string }): Promise<{ exists: boolean; sha256?: string }>
}

export const AppUpdate = registerPlugin<AppUpdatePluginDefinitions>('AppUpdate')
