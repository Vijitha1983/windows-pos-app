import { login as apiLogin, logout as apiLogout, getLoggedInUser, setBaseURL } from './api'

export async function authenticate(url, username, password) {
  const result = await apiLogin(url, username, password)
  if (result.message === 'Logged In') {
    await window.electronAPI.storeSet('erpnextUrl', url)
    await window.electronAPI.storeSet('username', username)
    return { success: true }
  }
  throw new Error(result.message || 'Login failed')
}

export async function restoreSession() {
  const url = await window.electronAPI.storeGet('erpnextUrl')
  if (!url) return null
  setBaseURL(url)
  try {
    const user = await getLoggedInUser()
    if (user && user !== 'Guest') return { url, user }
  } catch {
    // session expired or not yet started
  }
  return null
}

export async function signOut() {
  try {
    await apiLogout()
  } catch {
    // ignore network errors on logout
  }
  await window.electronAPI.storeDelete('username')
}
