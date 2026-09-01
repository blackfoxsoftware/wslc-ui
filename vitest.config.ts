import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
          // Os testes de integração FFI abrem a sessão nativa "WslcUi", que só
          // aceita UM processo por vez (ERROR_ALREADY_EXISTS na segunda) —
          // arquivos deste projeto rodam em série.
          fileParallelism: false
        },
        resolve: {
          alias: {
            '@shared': resolve('src/shared')
          }
        }
      },
      {
        // Ferramentas de repositório (scripts/): não são código do app, mas o
        // release depende delas, então correm no mesmo `npm test`.
        test: {
          name: 'ferramentas',
          environment: 'node',
          include: ['scripts/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/renderer/src/test/setup.ts']
        },
        resolve: {
          alias: {
            '@shared': resolve('src/shared'),
            '@renderer': resolve('src/renderer/src'),
            '@': resolve('src/renderer/src')
          }
        }
      }
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/*.test.*',
        'src/renderer/src/test/**',
        'src/main/index.ts',
        'src/main/window.ts',
        'src/preload/**'
      ]
    }
  }
})
