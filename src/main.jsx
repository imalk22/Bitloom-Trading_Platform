import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DepositPage from './pages/DepositPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import ContactCarePage from './pages/ContactCarePage.jsx'
import WithdrawPage from './pages/WithdrawPage.jsx'
import ChatWidget from './components/chat/ChatWidget.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/deposit" element={<DepositPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/contact-care" element={<ContactCarePage />} />
        <Route path="/withdraw" element={<WithdrawPage />} />
      </Routes>
      <ChatWidget />
    </BrowserRouter>
  </StrictMode>
)
