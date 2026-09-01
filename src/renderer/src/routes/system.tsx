import { createFileRoute } from '@tanstack/react-router'
import SystemView from '@/features/system/SystemView'

export const Route = createFileRoute('/system')({ component: SystemView })
