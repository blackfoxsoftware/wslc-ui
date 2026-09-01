import { createMockWslcService } from './mock'
import { realWslcService } from './real'
import type { WslcService } from './service'

export type { WslcService } from './service'
export type { StreamSink } from './streams'

/** WSLC_UI_MOCK=1 ativa o modo de demonstração; =setup simula ambiente incompleto. */
export function resolveWslcService(env: NodeJS.ProcessEnv = process.env): WslcService {
  const mode = env['WSLC_UI_MOCK']
  return mode === '1' || mode === 'setup' ? createMockWslcService() : realWslcService
}
