import { registerPlugin } from '@capacitor/core'

export interface IntentHandlerPluginDefinitions {
  getPendingSharedFile(): Promise<{
    hasFile: boolean
    path?: string
    name?: string
    mimeType?: string
  }>
  clearPendingSharedFile(): Promise<void>
}

export const IntentHandler = registerPlugin<IntentHandlerPluginDefinitions>('IntentHandler')
