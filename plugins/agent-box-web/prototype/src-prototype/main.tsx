import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './styles/ledger.css'
import { PrototypeApp } from './app/PrototypeApp'

createRoot(document.getElementById('root')!).render(<StrictMode><PrototypeApp /></StrictMode>)
