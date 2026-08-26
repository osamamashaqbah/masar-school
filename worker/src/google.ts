import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const IDENTITYTOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1/projects'

// كاش مفاتيح Google العامة (JWKS) للتحقق من Firebase ID tokens — إنشاء مرة وحدة لكل isolate
// ومشاركته بين كل الطلبات مقصود؛ هيك jose نفسها بتكاش المفاتيح داخليًا بدل ما تجيبها كل مرة.
const GOOGLE_SECURETOKEN_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
)

export interface ServiceAccount {
  client_email: string
  private_key: string
}

export async function getAccessToken(serviceAccount: ServiceAccount, scopes: string[]): Promise<string> {
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: scopes.join(' ') })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`فشل الحصول على access token: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<{ uid: string; authTime?: number }> {
  const { payload } = await jwtVerify(idToken, GOOGLE_SECURETOKEN_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  })
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('توكن بدون sub صالح')
  return { uid: payload.sub, authTime: typeof payload.auth_time === 'number' ? payload.auth_time : undefined }
}

export interface IdentityUser {
  localId: string
  email: string
}

export interface IdentityUserStatus {
  disabled: boolean
  validSince?: number
}

export function isIdentityUserActive(user: IdentityUserStatus | null, authTime: unknown): boolean {
  if (!user || typeof authTime !== 'number') return false
  return user.disabled !== true && (user.validSince === undefined || authTime >= user.validSince)
}

// إنشاء حساب Auth بصلاحية إدارية — google.identity.toolkit.v1.AccountManagementService.CreateAccount
// (نفس الـ RPC يلي بيستخدمه firebase-admin داخليًا): POST /v1/projects/{projectId}/accounts
export async function createIdentityUser(
  accessToken: string,
  projectId: string,
  input: { email: string; password: string; displayName: string }
): Promise<IdentityUser> {
  const res = await fetch(`${IDENTITYTOOLKIT_BASE}/${projectId}/accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json()) as { localId?: string; email?: string; error?: { message?: string } }
  if (!res.ok || !data.localId) {
    throw new Error(data.error?.message || `فشل إنشاء حساب Auth: ${res.status}`)
  }
  return { localId: data.localId, email: data.email || input.email }
}

export async function lookupIdentityUserByEmail(
  accessToken: string, projectId: string, email: string
): Promise<IdentityUser | null> {
  const res = await fetch(`${IDENTITYTOOLKIT_BASE}/${projectId}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  })
  const data = (await res.json()) as { users?: Array<{ localId?: string; email?: string }>; error?: { message?: string } }
  if (res.status === 400 && ['USER_NOT_FOUND', 'EMAIL_NOT_FOUND'].includes(data.error?.message || '')) return null
  if (!res.ok) throw new Error(data.error?.message || `فشل البحث عن حساب Auth: ${res.status}`)
  const user = data.users?.[0]
  return user?.localId ? { localId: user.localId, email: user.email || email } : null
}

export async function lookupIdentityUserStatus(
  accessToken: string, projectId: string, localId: string,
): Promise<IdentityUserStatus | null> {
  const res = await fetch(`${IDENTITYTOOLKIT_BASE}/${projectId}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [localId] }),
  })
  const data = (await res.json()) as { users?: Array<{ disabled?: boolean; validSince?: string }>; error?: { message?: string } }
  if (res.status === 400 && data.error?.message === 'USER_NOT_FOUND') return null
  if (!res.ok) throw new Error(data.error?.message || `فشل التحقق من حساب Auth: ${res.status}`)
  const user = data.users?.[0]
  if (!user) return null
  const validSince = Number(user.validSince)
  return { disabled: user.disabled === true, ...(Number.isFinite(validSince) ? { validSince } : {}) }
}

export async function updateIdentityUser(
  accessToken: string,
  projectId: string,
  localId: string,
  input: { disableUser?: boolean; password?: string },
): Promise<void> {
    const res = await fetch(`${IDENTITYTOOLKIT_BASE}/${projectId}/accounts:update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId, ...input }),
  })
  if (!res.ok) throw new Error(`فشل تحديث حساب Auth ${localId}: ${res.status} ${await res.text()}`)
}

// حذف حساب Auth — نستخدمها للتراجع لو فشلت كتابة الملف الشخصي بعد نجاح إنشاء الحساب
// (Bug 2.1: حساب يتيم بلا ملف Firestore وبريد محجوز للأبد)
export async function deleteIdentityUser(accessToken: string, projectId: string, localId: string): Promise<void> {
  const res = await fetch(`${IDENTITYTOOLKIT_BASE}/${projectId}/accounts:delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId }),
  })
  if (!res.ok) throw new Error(`فشل حذف حساب Auth ${localId}: ${res.status} ${await res.text()}`)
}
