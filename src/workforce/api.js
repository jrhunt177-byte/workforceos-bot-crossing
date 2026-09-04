async function jsonResponse(response, label) {
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const error = new Error(body?.error || `${label} failed (${response.status})`)
    error.status = response.status
    error.body = body
    throw error
  }
  return body
}

export async function fetchWorkforceSnapshot({ signal } = {}) {
  const response = await fetch('/api/workforce/snapshot', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  })
  return jsonResponse(response, 'WorkforceOS snapshot')
}

export async function fetchWorkforceSession({ signal } = {}) {
  const response = await fetch('/api/workforce/session', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  })
  return jsonResponse(response, 'WorkforceOS session')
}

export async function loginWorkforce({ role, secret, signal } = {}) {
  const response = await fetch('/api/workforce/session', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ role, secret }),
    signal,
  })
  return jsonResponse(response, 'WorkforceOS login')
}

export async function logoutWorkforce({ signal } = {}) {
  const response = await fetch('/api/workforce/session', {
    method: 'DELETE',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  })
  return jsonResponse(response, 'WorkforceOS logout')
}
