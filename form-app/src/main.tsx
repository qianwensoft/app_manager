import React from 'react'
import ReactDOM from 'react-dom'
import 'antd/dist/antd.css'
import App from './App'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const urlToken = params.get('_token')
if (urlToken) {
  localStorage.setItem('token', urlToken)
  params.delete('_token')
  const newSearch = params.toString()
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
  window.history.replaceState(null, '', newUrl)
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root'),
)
