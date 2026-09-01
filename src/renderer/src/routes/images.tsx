import { createFileRoute } from '@tanstack/react-router'
import ImagesView from '@/features/images/ImagesView'

export const Route = createFileRoute('/images')({ component: ImagesView })
