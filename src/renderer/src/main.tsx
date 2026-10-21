import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { ToolbarApp } from './features/toolbar/ToolbarApp'

const isToolbar = window.location.hash === '#toolbar'
if (isToolbar) document.body.classList.add('toolbar-body')

createRoot(document.getElementById('root')!).render(<StrictMode>{isToolbar ? <ToolbarApp /> : <App />}</StrictMode>)
