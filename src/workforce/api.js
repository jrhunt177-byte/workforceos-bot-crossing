export async function fetchWorkforceSnapshot({ signal } = {}) {
  const response = await fetch('/api/workforce/snapshot', {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`WorkforceOS snapshot failed (${response.status})`)
  return response.json()
}
