import { createFileRoute } from '@tanstack/react-router'
import VolumesView from '@/features/volumes/VolumesView'

export const Route = createFileRoute('/volumes')({ component: VolumesView })
