import { verifyBearerToken } from './ingestion-auth.mjs'
import {
  WORKFORCE_ROLE,
  clearSessionCookie,
  issueSession,
  roleAllows,
  sessionCookie,
  sessionFromRequest,
  verifyLoginSecret,
} from './session-auth.mjs'

export function createAccessController({
  sessionSecret = '',
  loginSecrets = {},
  viewerToken = '',
  controlToken = '',
  chairmanToken = '',
  secureCookies = true,
  sessionTtlSeconds = 8 * 60 * 60,
} = {}) {
  function principalFor(req) {
    const session = sessionFromRequest(req, sessionSecret)
    if (session) return { ...session, actor: `session:${session.role}` }
    const authorization = req?.headers?.authorization
    if (verifyBearerToken(authorization, chairmanToken)) {
      return { type: 'bearer', role: WORKFORCE_ROLE.CHAIRMAN, actor: 'bearer:chairman' }
    }
    if (verifyBearerToken(authorization, controlToken)) {
      return { type: 'bearer', role: WORKFORCE_ROLE.OPERATOR, actor: 'bearer:operator' }
    }
    if (verifyBearerToken(authorization, viewerToken)) {
      return { type: 'bearer', role: WORKFORCE_ROLE.VIEWER, actor: 'bearer:viewer' }
    }
    return null
  }

  function requireRole(req, requiredRole) {
    const principal = principalFor(req)
    if (!principal) {
      const err = new Error('WorkforceOS authentication required')
      err.statusCode = 401
      throw err
    }
    if (!roleAllows(principal.role, requiredRole)) {
      const err = new Error(`WorkforceOS ${requiredRole} role required`)
      err.statusCode = 403
      throw err
    }
    return principal
  }

  function login(role, suppliedSecret) {
    if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) {
      const err = new Error('WorkforceOS browser session authentication is not configured')
      err.statusCode = 503
      throw err
    }
    if (!verifyLoginSecret(role, suppliedSecret, loginSecrets)) {
      const err = new Error('Invalid WorkforceOS login')
      err.statusCode = 401
      throw err
    }
    const token = issueSession({ role, sessionSecret, ttlSeconds: sessionTtlSeconds })
    return {
      principal: { type: 'session', role, actor: `session:${role}` },
      cookie: sessionCookie(token, { secure: secureCookies, ttlSeconds: sessionTtlSeconds }),
    }
  }

  function logout() {
    return clearSessionCookie({ secure: secureCookies })
  }

  return {
    principalFor,
    requireRole,
    login,
    logout,
  }
}
