import { createFileRoute } from '@tanstack/react-router'
import NetworksView from '@/features/networks/NetworksView'

export const Route = createFileRoute('/networks')({ component: NetworksView })
