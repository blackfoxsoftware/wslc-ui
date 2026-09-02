import React from 'react'
import ReactDOM from 'react-dom/client'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { navTransitionTypes } from './navigation'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

// Hash history: em produção o renderer é carregado via file://, sem servidor.
//
// defaultViewTransition: o roteador embrulha a navegação em
// `document.startViewTransition` e — o que importa — só captura o estado novo
// depois do React comitar. O tipo diz o SENTIDO da troca (subiu ou desceu no
// rail), e é ele que a coreografia em design/motion.css lê.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => navTransitionTypes(fromLocation, toLocation)
  }
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
