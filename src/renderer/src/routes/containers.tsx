import { createFileRoute } from '@tanstack/react-router'
import ContainersView from '@/features/containers/ContainersView'

export const Route = createFileRoute('/containers')({ component: ContainersView })
