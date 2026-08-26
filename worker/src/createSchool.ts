export interface CreateSchoolInput {
  requestId: string
  schoolName: string
  adminName: string
  adminEmail: string
}

export interface ProvisioningMarker {
  requestId: string
  schoolId: string
  schoolName: string
  adminName: string
  adminEmail: string
  status: 'provisioning' | 'completed'
  adminUid?: string
  createdAt: string
  updateTime?: string
}

export interface IdentityUser {
  localId: string
  email: string
}

export interface FirestoreWrite {
  path: string
  data: Record<string, unknown>
  precondition?: { exists?: boolean; updateTime?: string }
}

export interface CreateSchoolDependencies {
  now: () => Date
  generateTemporaryPassword: () => string
  getRequest: (requestId: string) => Promise<ProvisioningMarker | null>
  reserveRequest: (marker: ProvisioningMarker) => Promise<ProvisioningMarker>
  deleteRequest: (requestId: string, updateTime?: string) => Promise<void>
  getDoc: (path: string) => Promise<Record<string, unknown> | null>
  lookupUserByEmail: (email: string) => Promise<IdentityUser | null>
  createUser: (input: { email: string; password: string; displayName: string }) => Promise<IdentityUser>
  deleteUser: (uid: string) => Promise<void>
  updateUserPassword: (uid: string, password: string) => Promise<void>
  patchDoc: (path: string, data: Record<string, unknown>) => Promise<void>
  commit: (writes: FirestoreWrite[]) => Promise<void>
}

export class CreateSchoolError extends Error {
  public readonly code: 'provisioning_in_progress' | 'idempotency_conflict' | 'email_exists' | 'auth_error' | 'provisioning_failed' | 'provisioning_rollback_failed'

  constructor(
    code: 'provisioning_in_progress' | 'idempotency_conflict' | 'email_exists' | 'auth_error' | 'provisioning_failed' | 'provisioning_rollback_failed',
    message: string,
  ) {
    super(message)
    this.name = 'CreateSchoolError'
    this.code = code
  }
}

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROVISIONING_LEASE_MS = 5 * 60 * 1000
const RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60

export function isRecentAuth(authTime: unknown, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return typeof authTime === 'number'
    && authTime <= nowSeconds + 60
    && nowSeconds - authTime <= RECENT_AUTH_MAX_AGE_SECONDS
}

export function normalizeCreateSchoolInput(body: unknown): { input?: CreateSchoolInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'بيانات الطلب غير صالحة' }
  const value = body as Record<string, unknown>
  const requestId = typeof value.requestId === 'string' ? value.requestId.trim() : ''
  const schoolName = typeof value.schoolName === 'string' ? value.schoolName.trim() : ''
  const adminName = typeof value.adminName === 'string' ? value.adminName.trim() : ''
  const adminEmail = typeof value.adminEmail === 'string' ? value.adminEmail.trim().toLowerCase() : ''

  if (!REQUEST_ID_RE.test(requestId)) return { error: 'معرّف الطلب غير صالح' }
  if (!schoolName || schoolName.length > 120) return { error: 'اسم المدرسة مطلوب وبحد أقصى 120 حرفًا' }
  if (!adminName || adminName.length > 80) return { error: 'اسم المدير مطلوب وبحد أقصى 80 حرفًا' }
  if (!EMAIL_RE.test(adminEmail) || adminEmail.length > 254) return { error: 'بريد المدير الإلكتروني غير صالح' }

  return { input: { requestId, schoolName, adminName, adminEmail } }
}

export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*_-+'
  const all = upper + lower + digits + symbols
  const random = (source: string) => source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length]
  const chars = [random(upper), random(lower), random(digits), random(symbols)]
  while (chars.length < 20) chars.push(random(all))
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function sameRequest(marker: ProvisioningMarker, input: CreateSchoolInput): boolean {
  return marker.requestId === input.requestId
    && marker.schoolName === input.schoolName
    && marker.adminName === input.adminName
    && marker.adminEmail === input.adminEmail
}

function markerFor(input: CreateSchoolInput, now: Date): ProvisioningMarker {
  return {
    ...input,
    schoolId: `school-${input.requestId}`,
    status: 'provisioning',
    createdAt: now.toISOString(),
  }
}

function authErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return ['EMAIL_EXISTS', 'INVALID_EMAIL', 'WEAK_PASSWORD', 'OPERATION_NOT_ALLOWED']
    .find((code) => message.includes(code)) || ''
}

async function deleteMarkerIfOwned(marker: ProvisioningMarker, deps: CreateSchoolDependencies): Promise<boolean> {
  if (!marker.updateTime) return false
  return deps.deleteRequest(marker.requestId, marker.updateTime).then(() => true).catch(() => false)
}

interface AuthAccountInspection {
  user: IdentityUser
  reusable: boolean
}

async function inspectReusableAuthAccount(
  email: string,
  deps: CreateSchoolDependencies,
): Promise<AuthAccountInspection | null> {
  const user = await deps.lookupUserByEmail(email)
  if (!user) return null
  const [schoolProfile, platformProfile] = await Promise.all([
    deps.getDoc(`users/${user.localId}`),
    deps.getDoc(`platformAdmins/${user.localId}`),
  ])
  return { user, reusable: !schoolProfile && !platformProfile }
}

function finalWrites(
  marker: ProvisioningMarker,
  adminUid: string,
  input: CreateSchoolInput,
  now: Date,
  actorUid: string,
  actorName: string,
): FirestoreWrite[] {
  const nowIso = now.toISOString()
  const { updateTime: _updateTime, ...markerData } = marker
  const completedMarker = { ...markerData, status: 'completed', adminUid }
  return [
    {
      path: `schoolProvisioningRequests/${input.requestId}`,
      data: completedMarker,
      ...(marker.updateTime ? { precondition: { updateTime: marker.updateTime } } : {}),
    },
    {
      path: `schools/${marker.schoolId}`,
      data: { name: input.schoolName, adminUid, createdAt: now },
      precondition: { exists: false },
    },
    {
      path: `users/${adminUid}`,
      data: {
        name: input.adminName,
        role: 'admin',
        email: input.adminEmail,
        schoolId: marker.schoolId,
        status: 'active',
        mustChangePassword: true,
      },
      precondition: { exists: false },
    },
    {
      path: `platformStats/${marker.schoolId}`,
      data: {
        schoolName: input.schoolName,
        studentCount: 0,
        instructorCount: 0,
        parentCount: 0,
        currentAcademicYear: null,
        lastActivityAt: nowIso,
        updatedAt: nowIso,
        source: 'worker',
        sourceVersion: 1,
      },
      precondition: { exists: false },
    },
    {
      path: `auditLog/create-school-${input.requestId}`,
      data: {
        schoolId: marker.schoolId,
        actorUid,
        actorName,
        actorRole: 'platformAdmin',
        action: 'create_school',
        targetType: 'school',
        targetId: marker.schoolId,
        details: `${input.schoolName} (${input.adminEmail})`,
        source: 'worker',
        createdAt: nowIso,
      },
      precondition: { exists: false },
    },
  ]
}

async function issueRetryCredentials(
  marker: ProvisioningMarker,
  deps: CreateSchoolDependencies,
): Promise<{ schoolId: string; schoolName: string; adminName: string; adminEmail: string; temporaryPassword: string }> {
  if (!marker.adminUid) throw new CreateSchoolError('provisioning_failed', 'بيانات إنشاء المدرسة غير مكتملة')
  const profile = await deps.getDoc(`users/${marker.adminUid}`)
  if (!profile) throw new CreateSchoolError('provisioning_failed', 'ملف مدير المدرسة غير موجود')

  const previousMustChangePassword = profile.mustChangePassword === true
  const temporaryPassword = deps.generateTemporaryPassword()
  await deps.patchDoc(`users/${marker.adminUid}`, { mustChangePassword: true })
  try {
    await deps.updateUserPassword(marker.adminUid, temporaryPassword)
  } catch {
    await deps.patchDoc(`users/${marker.adminUid}`, { mustChangePassword: previousMustChangePassword }).catch(() => {})
    throw new CreateSchoolError('provisioning_failed', 'تعذّر إصدار بيانات دخول جديدة')
  }
  return {
    schoolId: marker.schoolId,
    schoolName: marker.schoolName,
    adminName: marker.adminName,
    adminEmail: marker.adminEmail,
    temporaryPassword,
  }
}

async function recoverStaleProvisioning(
  marker: ProvisioningMarker,
  input: CreateSchoolInput,
  deps: CreateSchoolDependencies,
  actorUid: string,
  actorName: string,
): Promise<{ schoolId: string; schoolName: string; adminName: string; adminEmail: string; temporaryPassword: string }> {
  const inspection = await inspectReusableAuthAccount(input.adminEmail, deps)
  if (!inspection) {
    const markerDeleted = await deleteMarkerIfOwned(marker, deps)
    if (!markerDeleted) throw new CreateSchoolError('provisioning_rollback_failed', 'تعذّر تنظيف محاولة الإنشاء القديمة')
    throw new CreateSchoolError('provisioning_failed', 'انتهت محاولة إنشاء سابقة. حاول مرة ثانية.')
  }
  if (!inspection.reusable) throw new CreateSchoolError('email_exists', 'هذا البريد مستخدم مسبقًا في النظام')

  const now = deps.now()
  try {
    await deps.commit(finalWrites(marker, inspection.user.localId, input, now, actorUid, actorName))
  } catch {
    const markerDeleted = await deleteMarkerIfOwned(marker, deps)
    if (!markerDeleted) throw new CreateSchoolError('provisioning_rollback_failed', 'تعذّر تنظيف محاولة الإنشاء القديمة')
    throw new CreateSchoolError('provisioning_failed', 'تعذّر إكمال إنشاء المدرسة')
  }

  const temporaryPassword = deps.generateTemporaryPassword()
  try {
    await deps.updateUserPassword(inspection.user.localId, temporaryPassword)
  } catch {
    throw new CreateSchoolError('provisioning_failed', 'تم حفظ المدرسة لكن تعذّر إصدار كلمة السر')
  }
  return {
    schoolId: marker.schoolId,
    schoolName: input.schoolName,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    temporaryPassword,
  }
}

export async function provisionSchool(
  input: CreateSchoolInput,
  deps: CreateSchoolDependencies,
  actorUid: string,
  actorName: string,
): Promise<{ schoolId: string; schoolName: string; adminName: string; adminEmail: string; temporaryPassword: string }> {
  let marker = await deps.getRequest(input.requestId)
  if (marker && !sameRequest(marker, input)) {
    throw new CreateSchoolError('idempotency_conflict', 'معرّف الطلب مستخدم لبيانات مختلفة')
  }

  if (marker?.status === 'completed') return issueRetryCredentials(marker, deps)
  if (marker) {
    const age = deps.now().getTime() - new Date(marker.createdAt).getTime()
    if (age < PROVISIONING_LEASE_MS) throw new CreateSchoolError('provisioning_in_progress', 'العملية قيد التنفيذ. حاول بنفس الطلب بعد قليل.')
    return recoverStaleProvisioning(marker, input, deps, actorUid, actorName)
  }

  const initialMarker = markerFor(input, deps.now())
  try {
    marker = await deps.reserveRequest(initialMarker)
  } catch {
    marker = await deps.getRequest(input.requestId)
    if (!marker) throw new CreateSchoolError('provisioning_failed', 'تعذّر حجز عملية الإنشاء. حاول مرة ثانية.')
    if (!sameRequest(marker, input)) throw new CreateSchoolError('idempotency_conflict', 'معرّف الطلب مستخدم لبيانات مختلفة')
    if (marker.status === 'completed') return issueRetryCredentials(marker, deps)
    throw new CreateSchoolError('provisioning_in_progress', 'العملية قيد التنفيذ. حاول بنفس الطلب بعد قليل.')
  }

  const temporaryPassword = deps.generateTemporaryPassword()
  let created: IdentityUser
  let authCreatedByThisAttempt = false
  try {
    created = await deps.createUser({ email: input.adminEmail, password: temporaryPassword, displayName: input.adminName })
    authCreatedByThisAttempt = true
  } catch (error) {
    if (authErrorCode(error) === 'EMAIL_EXISTS') {
      const inspection = await inspectReusableAuthAccount(input.adminEmail, deps)
      if (inspection?.reusable) {
        created = inspection.user
      } else {
        const markerDeleted = await deleteMarkerIfOwned(marker, deps)
        if (!markerDeleted) throw new CreateSchoolError('provisioning_rollback_failed', 'تعذّر تنظيف محاولة الإنشاء الفاشلة')
        throw new CreateSchoolError('email_exists', 'هذا البريد مستخدم مسبقًا في النظام')
      }
    } else {
      const markerDeleted = await deleteMarkerIfOwned(marker, deps)
      if (!markerDeleted) throw new CreateSchoolError('provisioning_rollback_failed', 'تعذّر تنظيف محاولة الإنشاء الفاشلة')
      throw new CreateSchoolError('auth_error', 'تعذّر إنشاء حساب المدير')
    }
  }

  try {
    await deps.commit(finalWrites(marker, created.localId, input, deps.now(), actorUid, actorName))
  } catch {
    const markerRollback = deleteMarkerIfOwned(marker, deps)
    const authRollback = authCreatedByThisAttempt
      ? deps.deleteUser(created.localId).then(() => true).catch(() => false)
      : Promise.resolve(true)
    const [authRollbackSucceeded, markerRollbackSucceeded] = await Promise.all([authRollback, markerRollback])
    if (!authRollbackSucceeded || !markerRollbackSucceeded) {
      throw new CreateSchoolError('provisioning_rollback_failed', 'فشل إنشاء المدرسة والتراجع عن آثاره بالكامل. يلزم فحص يدوي قبل إعادة المحاولة.')
    }
    throw new CreateSchoolError('provisioning_failed', 'تعذّر حفظ بيانات المدرسة')
  }

  if (!authCreatedByThisAttempt) {
    try {
      await deps.updateUserPassword(created.localId, temporaryPassword)
    } catch {
      throw new CreateSchoolError('provisioning_failed', 'تم حفظ المدرسة لكن تعذّر إصدار كلمة السر')
    }
  }

  return {
    schoolId: marker.schoolId,
    schoolName: input.schoolName,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    temporaryPassword,
  }
}
