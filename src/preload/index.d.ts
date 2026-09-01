import type { WslcApi } from '../shared/ipc/api'

declare global {
  interface Window {
    wslcApi: WslcApi
  }
}
