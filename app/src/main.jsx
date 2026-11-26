import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PostHogProvider } from '@posthog/react'
import App from './App.jsx'
import { initAnalytics } from './analytics.js'
import './styles.css'

const analytics = initAnalytics()
const app = analytics
  ? <PostHogProvider client={analytics}><App /></PostHogProvider>
  : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {app}
  </StrictMode>,
)
