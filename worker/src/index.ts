import { getAccessToken, verifyFirebaseIdToken, createIdentityUser, lookupIdentityUserByEmail, lookupIdentityUserStatus, isIdentityUserActive, updateIdentityUser, deleteIdentityUser, type ServiceAccount } from './google'
import { firestoreGetDoc, firestoreGetDocWithMeta, firestoreCreateDoc, firestoreCreateDocIfAbsent, firestorePatchDoc, firestoreDeleteDoc, firestoreRunQuery, firestoreRunQueryWithIds, firestoreUpsertDoc, firestoreCommit, type FirestoreWrite as WorkerFirestoreWrite } from './firestore'
import { CreateSchoolError, generateTemporaryPassword, isRecentAuth, normalizeCreateSchoolInput, provisionSchool, type CreateSchoolDependencies, type ProvisioningMarker } from './createSchool'

interface Env extends Cloudflare.Env {
  FIREBASE_SERVICE_ACCOUNT_KEY: string
}

interface CreateUserBody {
  name?: unknown
  email?: unknown
  password?: unknown
  role?: unknown
  childUids?: unknown
  bulk?: unknown
  sectionId?: unknown
}

interface UpdateUserBody {
  uid?: unknown
  action?: unknown
}

interface ChangePasswordBody {
  newPassword?: unknown
}

interface AuditBody {
  schoolId?: unknown
  action?: unknown
  targetType?: unknown
  targetId?: unknown
  details?: unknown
}

const VALID_ROLES = ['student', 'instructor', 'parent'] as const
type ValidRole = (typeof VALID_ROLES)[number]

const VALID_AUDIT_ACTIONS = new Set([
  'set_mark', 'set_attendance', 'update_attendance_excuse', 'remove_attendance',
  'archive_subject', 'restore_subject', 'set_feature', 'set_ramadan_schedule', 'set_currency',
  'set_payment_info', 'set_branding', 'lock_gradebook', 'unlock_gradebook', 'export_school_data',
  'create_feedback', 'reply_feedback', 'escalate_feedback', 'assign_feedback', 'resolve_feedback',
  'reopen_feedback', 'close_feedback', 'update_feedback_status', 'set_teacher_availability',
  'report_teacher_absence', 'assign_substitute', 'cover_teacher_absence', 'create_intervention',
  'note_intervention', 'reopen_intervention', 'progress_intervention', 'resolve_intervention',
  'close_intervention', 'reassign_intervention', 'create_exam_period', 'set_exam_period_status',
  'add_exam_slot', 'delete_exam_slot', 'create_user', 'user_deactivate', 'user_activate',
  'user_reset-password', 'user_delete', 'platform_admin_full_access',
])

const ADMIN_ONLY_AUDIT_ACTIONS = new Set([
  'archive_subject', 'restore_subject', 'set_feature', 'set_ramadan_schedule', 'set_currency',
  'set_payment_info', 'set_branding', 'lock_gradebook', 'unlock_gradebook', 'export_school_data',
  'set_teacher_availability', 'report_teacher_absence', 'assign_substitute', 'cover_teacher_absence',
  'create_intervention', 'note_intervention', 'reopen_intervention', 'progress_intervention',
  'resolve_intervention', 'close_intervention', 'reassign_intervention', 'create_exam_period',
  'set_exam_period_status', 'add_exam_slot', 'delete_exam_slot', 'create_user', 'user_deactivate',
  'user_activate', 'user_reset-password', 'user_delete',
])

const INSTRUCTOR_AUDIT_ACTIONS = new Set([
  'set_mark', 'set_attendance', 'update_attendance_excuse', 'remove_attendance',
])

const FEEDBACK_AUDIT_ACTIONS = new Set([
  'create_feedback', 'reply_feedback', 'escalate_feedback', 'assign_feedback', 'resolve_feedback',
  'reopen_feedback', 'close_feedback', 'update_feedback_status',
])

const MAX_REQUEST_BODY_BYTES = 32 * 1024
const MAX_CHILD_UIDS = 100
const MAX_DRILLDOWN_USERS = 500

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

function validateInput(body: CreateUserBody): string | null {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80) return 'الاسم مطلوب وبحد أقصى 80 حرفًا'
  if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'بريد إلكتروني غير صالح'
  if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128)) return 'كلمة السر لازم تكون بين 6 و128 حرفًا'
  if (body.password === undefined && body.bulk !== true) return 'كلمة السر مطلوبة'
  if (typeof body.role !== 'string' || !VALID_ROLES.includes(body.role as ValidRole)) return 'دور غير صالح'
  if (body.sectionId !== undefined && (typeof body.sectionId !== 'string' || !body.sectionId.trim() || body.sectionId.length > 120)) return 'الشعبة غير صالحة'
  if (body.sectionId !== undefined && body.role !== 'student') return 'sectionId مسموحة للطالب فقط'
  if (body.childUids !== undefined) {
    if (!Array.isArray(body.childUids)) return 'childUids لازم تكون مصفوفة'
    if (body.role !== 'parent') return 'childUids مسموحة لولي الأمر فقط'
    if (body.childUids.length > MAX_CHILD_UIDS) return `عدد الأبناء لا يتجاوز ${MAX_CHILD_UIDS}`
    if (body.childUids.some((uid) => typeof uid !== 'string' || !uid.trim())) return 'كل childUids لازم تكون معرّفات صحيحة'
    if (new Set(body.childUids as string[]).size !== body.childUids.length) return 'لا تكرر معرّف الابن'
    if ((body.childUids as string[]).some((uid) => uid.length > 128)) return 'معرّف ابن غير صالح'
  }
  return null
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const url = new URL(request.url)
    if (request.method !== 'POST' || !['/create-school', '/create-school-user', '/update-school-user', '/change-password', '/audit-log', '/refresh-platform-stats', '/platform-school-drilldown'].includes(url.pathname)) {
      return json({ error: 'not_found' }, 404, origin)
    }

    const edgeLimitResponse = await enforceEdgeLimit(request, env, url.pathname, origin)
    if (edgeLimitResponse) return edgeLimitResponse

    try {
      if (url.pathname === '/create-school') return await handleCreateSchool(request, env, origin)
      if (url.pathname === '/create-school-user') return await handleCreateSchoolUser(request, env, origin)
      if (url.pathname === '/update-school-user') return await handleUpdateSchoolUser(request, env, origin)
      if (url.pathname === '/change-password') return await handleChangePassword(request, env, origin)
      if (url.pathname === '/refresh-platform-stats') return await handleRefreshPlatformStats(request, env, origin)
      if (url.pathname === '/platform-school-drilldown') return await handlePlatformSchoolDrilldown(request, env, origin)
      return await handleWriteAuditLog(request, env, origin)
    } catch (err) {
      console.error('[admin-ops] خطأ غير متوقع:', err)
      if (err instanceof Error && err.message === 'audit_unavailable') return json({ error: 'audit_unavailable', message: 'خدمة التدقيق غير متاحة؛ لم يتم فتح البيانات.' }, 503, origin)
      return json({ error: 'internal', message: 'حدث خطأ داخلي. حاول مرة ثانية.' }, 500, origin)
    }
  },
} satisfies ExportedHandler<Env>

async function handleCreateSchool(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  if (!isRecentAuth(authTime)) {
    return json({ error: 'recent_login_required', message: 'لأمان الحساب، أعد تسجيل الدخول ثم حاول مرة ثانية.' }, 403, origin)
  }

  const actorLimitResponse = await enforceActorLimit(env, '/create-school', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const body = await request.json().catch(() => ({}))
  const normalized = normalizeCreateSchoolInput(body)
  if (!normalized.input) return json({ error: 'invalid_input', message: normalized.error }, 400, origin)

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) {
    return json({ error: 'account_inactive' }, 403, origin)
  }
  const platformProfile = await firestoreGetDoc(accessToken, projectId, `platformAdmins/${callerUid}`)
  if (!platformProfile) return json({ error: 'permission_denied' }, 403, origin)

  const actorName = typeof platformProfile.name === 'string' ? platformProfile.name : ''
  const deps: CreateSchoolDependencies = {
    now: () => new Date(),
    generateTemporaryPassword,
    getRequest: async (requestId) => {
      const stored = await firestoreGetDocWithMeta(accessToken, projectId, `schoolProvisioningRequests/${requestId}`)
      if (!stored) return null
      return { ...stored.data, updateTime: stored.updateTime } as ProvisioningMarker
    },
    reserveRequest: async (marker) => {
      const updateTime = await firestoreCreateDocIfAbsent(
        accessToken,
        projectId,
        `schoolProvisioningRequests/${marker.requestId}`,
        marker as unknown as Record<string, unknown>,
      )
      return { ...marker, updateTime }
    },
    deleteRequest: (requestId, updateTime) => firestoreDeleteDoc(
      accessToken,
      projectId,
      `schoolProvisioningRequests/${requestId}`,
      updateTime ? { updateTime } : undefined,
    ),
    getDoc: (path) => firestoreGetDoc(accessToken, projectId, path),
    lookupUserByEmail: (email) => lookupIdentityUserByEmail(accessToken, projectId, email),
    createUser: (input) => createIdentityUser(accessToken, projectId, input),
    deleteUser: (uid) => deleteIdentityUser(accessToken, projectId, uid),
    updateUserPassword: (uid, password) => updateIdentityUser(accessToken, projectId, uid, { password }),
    patchDoc: (path, data) => firestorePatchDoc(accessToken, projectId, path, data),
    commit: (writes) => firestoreCommit(accessToken, projectId, writes as WorkerFirestoreWrite[]).then(() => undefined),
  }

  try {
    const result = await provisionSchool(normalized.input, deps, callerUid, actorName)
    return json(result, 200, origin)
  } catch (error) {
    if (!(error instanceof CreateSchoolError)) throw error
    const status = error.code === 'provisioning_in_progress' || error.code === 'idempotency_conflict' ? 409 : error.code === 'email_exists' || error.code === 'auth_error' ? 400 : 500
    const responseCode = error.code === 'email_exists' ? 'EMAIL_EXISTS' : error.code
    return json({ error: responseCode, message: error.message }, status, origin)
  }
}

async function hasActiveIdentity(accessToken: string, projectId: string, uid: string, authTime: unknown): Promise<boolean> {
  return isIdentityUserActive(await lookupIdentityUserStatus(accessToken, projectId, uid), authTime)
}

async function handleRefreshPlatformStats(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/refresh-platform-stats', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) {
    return json({ error: 'account_inactive' }, 403, origin)
  }
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.status === 'inactive' || callerProfile.role !== 'admin' || typeof callerProfile.schoolId !== 'string') {
    return json({ error: 'permission_denied' }, 403, origin)
  }

  const schoolId = callerProfile.schoolId
  const [users, school] = await Promise.all([
    firestoreRunQuery(accessToken, projectId, 'users', 'schoolId', schoolId, ['role']),
    firestoreGetDoc(accessToken, projectId, `schools/${schoolId}`),
  ])
  const counts = {
    studentCount: users.filter((user) => user.role === 'student').length,
    instructorCount: users.filter((user) => user.role === 'instructor').length,
    parentCount: users.filter((user) => user.role === 'parent').length,
  }
  const now = new Date().toISOString()
  await firestoreUpsertDoc(accessToken, projectId, `platformStats/${schoolId}`, {
    schoolName: typeof school?.name === 'string' ? school.name : schoolId,
    ...counts,
    currentAcademicYear: typeof school?.currentAcademicYear === 'string' ? school.currentAcademicYear : null,
    lastActivityAt: now,
    updatedAt: now,
    source: 'worker',
    sourceVersion: 1,
  })

  return json({ ok: true, ...counts }, 200, origin)
}

async function handlePlatformSchoolDrilldown(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  if (!isRecentAuth(authTime)) return json({ error: 'recent_login_required' }, 403, origin)
  const actorLimitResponse = await enforceActorLimit(env, '/platform-school-drilldown', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const body = (await request.json().catch(() => ({}))) as { schoolId?: unknown; reason?: unknown }
  const schoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!schoolId || schoolId.length > 120 || !reason || reason.length > 500) {
    return json({ error: 'invalid_input', message: 'المدرسة وسبب الوصول مطلوبان' }, 400, origin)
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) return json({ error: 'account_inactive' }, 403, origin)
  const platformProfile = await firestoreGetDoc(accessToken, projectId, `platformAdmins/${callerUid}`)
  if (!platformProfile) return json({ error: 'permission_denied' }, 403, origin)
  const school = await firestoreGetDoc(accessToken, projectId, `schools/${schoolId}`)
  if (!school) return json({ error: 'invalid_input', message: 'المدرسة غير موجودة' }, 400, origin)

  // The audit is a hard prerequisite: no successful response and no tenant data
  // query if the durable audit record cannot be written.
  await firestoreCreateDoc(accessToken, projectId, 'auditLog', crypto.randomUUID(), {
    schoolId,
    actorUid: callerUid,
    actorName: typeof platformProfile.name === 'string' ? platformProfile.name : '',
    actorRole: 'platformAdmin',
    action: 'platform_admin_full_access',
    targetType: 'school',
    targetId: schoolId,
    details: reason,
    source: 'worker',
    createdAt: new Date().toISOString(),
  }).catch(() => { throw new Error('audit_unavailable') })

  const [userRows, marks, attendance] = await Promise.all([
    firestoreRunQueryWithIds(accessToken, projectId, 'users', 'schoolId', schoolId, ['name', 'role', 'sectionId', 'status'], MAX_DRILLDOWN_USERS),
    firestoreRunQuery(accessToken, projectId, 'marks', 'schoolId', schoolId, ['score', 'maxScore', 'academicYear']),
    firestoreRunQuery(accessToken, projectId, 'attendance', 'schoolId', schoolId, ['excused', 'academicYear']),
  ])
  const currentYear = typeof school.currentAcademicYear === 'string' ? school.currentAcademicYear : null
  const currentMarks = marks.filter((mark) => !currentYear || mark.academicYear === currentYear)
  const currentAttendance = attendance.filter((row) => !currentYear || row.academicYear === currentYear)
  const scored = currentMarks.filter((mark) => typeof mark.score === 'number' && typeof mark.maxScore === 'number' && mark.maxScore > 0)
  const excusedCount = currentAttendance.filter((row) => row.excused === true).length

  return json({
    schoolId,
    schoolName: typeof school.name === 'string' ? school.name : schoolId,
    currentAcademicYear: currentYear,
    truncatedUsers: userRows.length >= MAX_DRILLDOWN_USERS,
    users: userRows.map(({ id, data }) => ({ id, name: data.name || id, role: data.role || '', sectionId: data.sectionId || null, status: data.status || 'active' })),
    summary: {
      marksCount: currentMarks.length,
      avgPct: scored.length ? Math.round((scored.reduce((sum, mark) => sum + (mark.score as number) / (mark.maxScore as number), 0) / scored.length) * 100) : null,
      absencesCount: currentAttendance.length,
      excusedCount,
      unexcusedCount: currentAttendance.length - excusedCount,
    },
  }, 200, origin)
}

async function handleCreateSchoolUser(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch (err) {
    console.error('[create-school-user] توكن غير صالح:', err)
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/create-school-user', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) {
    return json({ error: 'account_inactive' }, 403, origin)
  }

  // ما بنثق بأي schoolId جاي من العميل — منجيبه من ملف تعريف المدير نفسه، المكتوب أصلًا
  // بصلاحية إدارية (Admin SDK/سكربتات)، مو من شي قابل للتعديل من المتصفح.
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.status === 'inactive' || callerProfile.role !== 'admin' || typeof callerProfile.schoolId !== 'string') {
    return json({ error: 'permission_denied' }, 403, origin)
  }
  const schoolId = callerProfile.schoolId

  const body = (await request.json().catch(() => ({}))) as CreateUserBody
  const validationError = validateInput(body)
  if (validationError) return json({ error: 'invalid_input', message: validationError }, 400, origin)

  const name = (body.name as string).trim()
  const email = (body.email as string).trim()
  const generatedPassword = body.password === undefined
  const password = generatedPassword ? generateTemporaryPassword() : body.password as string
  const role = body.role as ValidRole
  const childUids = (body.childUids as string[] | undefined) || []
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : null

  if (sectionId) {
    const section = await firestoreGetDoc(accessToken, projectId, `sections/${sectionId}`)
    if (!section || section.schoolId !== schoolId) return json({ error: 'invalid_input', message: 'الشعبة ليست من نفس المدرسة' }, 400, origin)
  }

  if (role === 'parent' && childUids.length > 0) {
    for (const childUid of childUids) {
      const child = await firestoreGetDoc(accessToken, projectId, `users/${childUid}`)
      if (!child || child.schoolId !== schoolId || child.role !== 'student') {
        return json({ error: 'invalid_input', message: `الطالب ${childUid} مو من نفس المدرسة` }, 400, origin)
      }
    }
  }

  if (body.bulk === true) {
    const existingAuth = await lookupIdentityUserByEmail(accessToken, projectId, email)
    if (existingAuth) {
      const existingProfile = await firestoreGetDocWithMeta(accessToken, projectId, `users/${existingAuth.localId}`)
      if (existingProfile?.data.schoolId !== schoolId || existingProfile.data.role !== role) {
        return json({ error: 'email_exists', message: 'هذا البريد مستخدم بحساب مختلف.' }, 409, origin)
      }
      if (role === 'parent' && childUids.length > 0) {
        const parentChildren = Array.isArray(existingProfile.data.childUids) ? existingProfile.data.childUids as string[] : []
        const nextChildren = [...new Set([...parentChildren, ...childUids])]
        const linkWrites: WorkerFirestoreWrite[] = [{
          path: `users/${existingAuth.localId}`,
          data: { childUids: nextChildren },
          updateMask: ['childUids'],
          precondition: existingProfile.updateTime ? { updateTime: existingProfile.updateTime } : { exists: true },
        }]
        for (const childUid of childUids) {
          const child = await firestoreGetDocWithMeta(accessToken, projectId, `users/${childUid}`)
          if (!child?.data || child.data.schoolId !== schoolId || child.data.role !== 'student') return json({ error: 'invalid_input', message: 'أحد الأبناء غير صالح' }, 400, origin)
          const parentUids = Array.isArray(child?.data.parentUids) ? child.data.parentUids as string[] : []
          linkWrites.push({
            path: `users/${childUid}`,
            data: { parentUids: parentUids.includes(existingAuth.localId) ? parentUids : [...parentUids, existingAuth.localId] },
            updateMask: ['parentUids'],
            precondition: child?.updateTime ? { updateTime: child.updateTime } : { exists: true },
          })
        }
        linkWrites.push({
          path: `auditLog/${crypto.randomUUID()}`,
          data: {
            schoolId, actorUid: callerUid, actorName: typeof callerProfile.name === 'string' ? callerProfile.name : '',
            action: 'create_user', targetType: role, targetId: existingAuth.localId, details: `${name} (${email})`,
            source: 'worker', createdAt: new Date().toISOString(),
          },
          precondition: { exists: false },
        })
        await firestoreCommit(accessToken, projectId, linkWrites)
      }
      return json({ uid: existingAuth.localId, existing: true, status: 'resumed', temporaryPassword: null }, 200, origin)
    }
  }

  let created
  try {
    created = await createIdentityUser(accessToken, projectId, { email, password, displayName: name })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    const knownError = ['EMAIL_EXISTS', 'INVALID_EMAIL', 'WEAK_PASSWORD', 'OPERATION_NOT_ALLOWED']
      .find((code) => message.includes(code))
    return json({ error: 'auth_error', message: knownError || 'AUTH_ERROR' }, 400, origin)
  }

  const childWrites: WorkerFirestoreWrite[] = []
  const childProfiles: Array<{ path: string; data: Record<string, unknown>; updateTime?: string }> = []
  try {
    if (role === 'parent') {
      for (const childUid of childUids) {
        const child = await firestoreGetDocWithMeta(accessToken, projectId, `users/${childUid}`)
        const childData = child?.data
        const parentUids = Array.isArray(childData?.parentUids) ? (childData.parentUids as string[]) : []
        childProfiles.push({ path: `users/${childUid}`, data: childData || {}, updateTime: child?.updateTime })
        childWrites.push({
          path: `users/${childUid}`,
          data: { parentUids: parentUids.includes(created.localId) ? parentUids : [...parentUids, created.localId] },
          updateMask: ['parentUids'],
          precondition: child?.updateTime ? { updateTime: child.updateTime } : { exists: true },
        })
      }
    }
    await firestoreCommit(accessToken, projectId, [
      {
        path: `users/${created.localId}`,
        data: {
          name, role, email, schoolId, mustChangePassword: true, status: 'active',
          ...(role === 'parent' ? { childUids } : {}),
          ...(sectionId ? { sectionId } : {}),
        },
        precondition: { exists: false },
      },
      {
        path: `userDirectory/${created.localId}`,
        data: { name, role, schoolId, sectionId, status: 'active', contactUids: [] },
        precondition: { exists: false },
      },
      ...childWrites,
      {
        path: `auditLog/${crypto.randomUUID()}`,
        data: {
          schoolId,
          actorUid: callerUid,
          actorName: typeof callerProfile.name === 'string' ? callerProfile.name : '',
          action: 'create_user',
          targetType: role,
          targetId: created.localId,
          details: `${name} (${email})`,
          source: 'worker',
          createdAt: new Date().toISOString(),
        },
        precondition: { exists: false },
      },
    ])
  } catch (profileErr) {
    try {
      await deleteIdentityUser(accessToken, projectId, created.localId)
    } catch (rollbackErr) {
      console.error('[create-school-user] فشل التراجع عن Auth:', created.localId, rollbackErr)
      return json({ error: 'rollback_failed', message: 'فشل التراجع عن إنشاء الحساب. أوقف المحاولة واطلب فحصًا يدويًا.' }, 500, origin)
    }
    console.error('[create-school-user] فشل الـcommit الذري:', profileErr, childProfiles.length)
    return json({ error: 'profile_write_failed', message: 'صار خطأ وقت حفظ بيانات الحساب. لم يُترك ملف مدرسي جزئي.' }, 500, origin)
  }

  return json({ uid: created.localId, ...(generatedPassword ? { temporaryPassword: password } : {}) }, 200, origin)
}

function rateLimited(origin: string): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', message: 'طلبات كثيرة خلال وقت قصير. حاول بعد قليل.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...corsHeaders(origin) },
  })
}

async function enforceEdgeLimit(request: Request, env: Env, pathname: string, origin: string): Promise<Response | null> {
  const bodyBytes = await request.clone().arrayBuffer()
  if (bodyBytes.byteLength > MAX_REQUEST_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const { success } = await env.EDGE_REQUEST_LIMITER.limit({ key: `${pathname}:${ip}` })
  return success ? null : rateLimited(origin)
}

async function enforceActorLimit(env: Env, pathname: string, callerUid: string, origin: string): Promise<Response | null> {
  const { success } = await env.ACTOR_OPERATION_LIMITER.limit({ key: `${pathname}:${callerUid}` })
  return success ? null : rateLimited(origin)
}

function validateAuditInput(body: AuditBody): string | null {
  if (typeof body.action !== 'string' || !VALID_AUDIT_ACTIONS.has(body.action)) return 'إجراء التدقيق غير صالح'
  if (typeof body.targetType !== 'string' || !body.targetType.trim() || body.targetType.length > 80) return 'نوع الهدف غير صالح'
  if (body.targetId !== undefined && body.targetId !== null && (typeof body.targetId !== 'string' || body.targetId.length > 200)) return 'معرّف الهدف غير صالح'
  if (body.details !== undefined && (typeof body.details !== 'string' || body.details.length > 500)) return 'تفاصيل التدقيق طويلة أو غير صالحة'
  if (body.schoolId !== undefined && (typeof body.schoolId !== 'string' || !body.schoolId.trim() || body.schoolId.length > 120)) return 'المدرسة غير صالحة'
  return null
}

function canWriteAuditAction(role: string, action: string, isPlatformAdmin: boolean): boolean {
  if (isPlatformAdmin) return action === 'platform_admin_full_access' || action === 'set_branding'
  if (ADMIN_ONLY_AUDIT_ACTIONS.has(action)) return role === 'admin'
  if (INSTRUCTOR_AUDIT_ACTIONS.has(action)) return role === 'admin' || role === 'instructor'
  if (FEEDBACK_AUDIT_ACTIONS.has(action)) return ['admin', 'instructor', 'parent'].includes(role)
  return false
}

async function handleWriteAuditLog(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/audit-log', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const body = (await request.json().catch(() => ({}))) as AuditBody
  const validationError = validateAuditInput(body)
  if (validationError) return json({ error: 'invalid_input', message: validationError }, 400, origin)

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) {
    return json({ error: 'account_inactive' }, 403, origin)
  }
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  const platformProfile = callerProfile ? null : await firestoreGetDoc(accessToken, projectId, `platformAdmins/${callerUid}`)
  const isPlatformAdmin = Boolean(platformProfile)
  const role = typeof callerProfile?.role === 'string' ? callerProfile.role : ''
  if ((!callerProfile && !platformProfile) || callerProfile?.status === 'inactive') return json({ error: 'permission_denied' }, 403, origin)
  if (!canWriteAuditAction(role, body.action as string, isPlatformAdmin)) return json({ error: 'permission_denied' }, 403, origin)

  const profileSchoolId = typeof callerProfile?.schoolId === 'string' ? callerProfile.schoolId : ''
  const schoolId = isPlatformAdmin ? String(body.schoolId || '') : profileSchoolId
  if (!schoolId || (!isPlatformAdmin && body.schoolId !== undefined && body.schoolId !== schoolId)) {
    return json({ error: 'permission_denied' }, 403, origin)
  }
  if (isPlatformAdmin && !(await firestoreGetDoc(accessToken, projectId, `schools/${schoolId}`))) {
    return json({ error: 'invalid_input', message: 'المدرسة غير موجودة' }, 400, origin)
  }

  await firestoreCreateDoc(accessToken, projectId, 'auditLog', crypto.randomUUID(), {
    schoolId,
    actorUid: callerUid,
    actorName: typeof callerProfile?.name === 'string' ? callerProfile.name : (typeof platformProfile?.name === 'string' ? platformProfile.name : ''),
    actorRole: isPlatformAdmin ? 'platformAdmin' : role,
    action: body.action,
    targetType: body.targetType,
    targetId: body.targetId || null,
    details: typeof body.details === 'string' ? body.details : '',
    source: 'worker',
    createdAt: new Date().toISOString(),
  })

  return json({ ok: true }, 200, origin)
}

async function commitInChunks(accessToken: string, projectId: string, writes: WorkerFirestoreWrite[]): Promise<void> {
  for (let i = 0; i < writes.length; i += 450) {
    await firestoreCommit(accessToken, projectId, writes.slice(i, i + 450))
  }
}

async function unlinkDeletedUserReferences(
  accessToken: string,
  projectId: string,
  schoolId: string,
  uid: string,
): Promise<WorkerFirestoreWrite[]> {
  const [users, directories, subjects] = await Promise.all([
    firestoreRunQueryWithIds(accessToken, projectId, 'users', 'schoolId', schoolId, ['childUids', 'parentUids', 'messageContactUids']),
    firestoreRunQueryWithIds(accessToken, projectId, 'userDirectory', 'schoolId', schoolId, ['contactUids']),
    firestoreRunQueryWithIds(accessToken, projectId, 'subjects', 'schoolId', schoolId, ['teacherUid', 'teacherName']),
  ])
  const writes: WorkerFirestoreWrite[] = []
  const rollbackWrites: WorkerFirestoreWrite[] = []
  const addArrayRemoval = (row: { id: string; data: Record<string, unknown> }, field: string) => {
    const original = row.data[field]
    if (!Array.isArray(original) || !original.includes(uid)) return
    const next = original.filter((value) => value !== uid)
    writes.push({ path: `users/${row.id}`, data: { [field]: next }, updateMask: [field] })
    rollbackWrites.push({ path: `users/${row.id}`, data: { [field]: original }, updateMask: [field] })
  }
  users.forEach((row) => {
    if (row.id === uid) return
    addArrayRemoval(row, 'childUids')
    addArrayRemoval(row, 'parentUids')
    addArrayRemoval(row, 'messageContactUids')
  })
  directories.forEach((row) => {
    const original = row.data.contactUids
    if (!Array.isArray(original) || !original.includes(uid)) return
    writes.push({ path: `userDirectory/${row.id}`, data: { contactUids: original.filter((value) => value !== uid) }, updateMask: ['contactUids'] })
    rollbackWrites.push({ path: `userDirectory/${row.id}`, data: { contactUids: original }, updateMask: ['contactUids'] })
  })
  subjects.forEach((row) => {
    if (row.data.teacherUid !== uid) return
    writes.push({ path: `subjects/${row.id}`, data: { teacherUid: null, teacherName: null }, updateMask: ['teacherUid', 'teacherName'] })
    rollbackWrites.push({ path: `subjects/${row.id}`, data: { teacherUid: row.data.teacherUid, teacherName: row.data.teacherName || null }, updateMask: ['teacherUid', 'teacherName'] })
  })
  if (writes.length === 0) return []
  try {
    await commitInChunks(accessToken, projectId, writes)
  } catch (error) {
    try { await commitInChunks(accessToken, projectId, rollbackWrites) } catch (rollbackError) { console.error('[update-school-user] فشل تراجع الروابط:', rollbackError) }
    throw error
  }
  return rollbackWrites
}

async function rollbackDeletedUserReferences(accessToken: string, projectId: string, writes: WorkerFirestoreWrite[]): Promise<void> {
  if (writes.length > 0) await commitInChunks(accessToken, projectId, writes)
}

async function handleUpdateSchoolUser(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch (err) {
    console.error('[update-school-user] توكن غير صالح:', err)
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/update-school-user', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const body = (await request.json().catch(() => ({}))) as UpdateUserBody
  if (typeof body.uid !== 'string' || !body.uid.trim()) return json({ error: 'invalid_input', message: 'uid مطلوب' }, 400, origin)
  if (!['deactivate', 'activate', 'reset-password', 'delete'].includes(String(body.action))) {
    return json({ error: 'invalid_input', message: 'إجراء الحساب غير صالح' }, 400, origin)
  }
  if (!isRecentAuth(authTime)) {
    return json({ error: 'recent_login_required', message: 'لأمان الحساب، أعد تسجيل الدخول ثم حاول مرة ثانية.' }, 403, origin)
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) {
    return json({ error: 'account_inactive' }, 403, origin)
  }
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.status === 'inactive' || callerProfile.role !== 'admin' || typeof callerProfile.schoolId !== 'string') {
    return json({ error: 'permission_denied' }, 403, origin)
  }

  const uid = body.uid.trim()
  if (uid === callerUid) return json({ error: 'invalid_input', message: 'ما بتقدر تغيّر حالة حسابك من هون' }, 400, origin)
  const target = await firestoreGetDoc(accessToken, projectId, `users/${uid}`)
  if (!target || target.schoolId !== callerProfile.schoolId || !['student', 'instructor', 'parent'].includes(String(target.role))) {
    return json({ error: 'permission_denied' }, 403, origin)
  }

  const action = String(body.action)
  const auditAction = action === 'delete' ? 'user_delete' : `user_${action}`
  try {
    await firestoreCreateDoc(accessToken, projectId, 'auditLog', crypto.randomUUID(), {
      schoolId: callerProfile.schoolId,
      actorUid: callerUid,
      actorName: typeof callerProfile.name === 'string' ? callerProfile.name : '',
      action: auditAction,
      targetType: target.role,
      targetId: uid,
      details: typeof target.email === 'string' ? target.email : uid,
      source: 'worker',
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[audit] فشل تسجيل الإجراء قبل تنفيذه:', err)
    return json({ error: 'audit_unavailable', message: 'خدمة التدقيق غير متاحة؛ لم يتم تنفيذ الإجراء.' }, 503, origin)
  }

  const directory = await firestoreGetDoc(accessToken, projectId, `userDirectory/${uid}`)
  if (action === 'delete') {
    let referenceRollback: WorkerFirestoreWrite[] = []
    let profileDeleted = false
    let directoryDeleted = false
    let authDeleted = false
    try {
      referenceRollback = await unlinkDeletedUserReferences(accessToken, projectId, callerProfile.schoolId, uid)
      await firestoreDeleteDoc(accessToken, projectId, `users/${uid}`)
      profileDeleted = true
      await firestoreDeleteDoc(accessToken, projectId, `userDirectory/${uid}`)
      directoryDeleted = true
      await deleteIdentityUser(accessToken, projectId, uid)
      authDeleted = true
    } catch (err) {
      if (!authDeleted && profileDeleted) await firestoreUpsertDoc(accessToken, projectId, `users/${uid}`, target).catch((rollbackErr) => console.error('[update-school-user] فشل استعادة ملف الحساب:', rollbackErr))
      if (!authDeleted && directoryDeleted && directory) await firestoreUpsertDoc(accessToken, projectId, `userDirectory/${uid}`, directory).catch((rollbackErr) => console.error('[update-school-user] فشل استعادة دليل المستخدم:', rollbackErr))
      await rollbackDeletedUserReferences(accessToken, projectId, referenceRollback).catch((rollbackErr) => console.error('[update-school-user] فشل استعادة الروابط:', rollbackErr))
      console.error('[update-school-user] فشل حذف الحساب:', uid, err)
      return json({ error: 'delete_failed', message: 'تعذّر حذف الحساب بالكامل. لم نكمل العملية.' }, 500, origin)
    }

    return json({ uid, deleted: true }, 200, origin)
  }

  const previousStatus = target.status === 'inactive' ? 'inactive' : 'active'
  const previousMustChangePassword = target.mustChangePassword === true
  const temporaryPassword = action === 'reset-password' ? `Temp-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}` : undefined
  const nextStatus = action === 'deactivate' ? 'inactive' : action === 'activate' ? 'active' : previousStatus
  const disabled = nextStatus === 'inactive'
  await firestorePatchDoc(accessToken, projectId, `users/${uid}`, {
    status: nextStatus,
    ...(temporaryPassword ? { mustChangePassword: true } : {}),
  })
  try {
    await updateIdentityUser(accessToken, projectId, uid, {
      disableUser: disabled,
      ...(temporaryPassword ? { password: temporaryPassword } : {}),
    })
    if (directory) await firestorePatchDoc(accessToken, projectId, `userDirectory/${uid}`, { status: nextStatus })
  } catch (err) {
    await firestorePatchDoc(accessToken, projectId, `users/${uid}`, {
      status: previousStatus,
      mustChangePassword: previousMustChangePassword,
    }).catch((rollbackErr) => console.error('[update-school-user] فشل تراجع ملف المستخدم:', rollbackErr))
    if (directory) await firestorePatchDoc(accessToken, projectId, `userDirectory/${uid}`, { status: previousStatus }).catch((rollbackErr) => console.error('[update-school-user] فشل تراجع دليل المستخدم:', rollbackErr))
    throw err
  }

  return json({ uid, status: nextStatus, ...(temporaryPassword ? { temporaryPassword } : {}) }, 200, origin)
}

async function handleChangePassword(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  let authTime: number | undefined
  try {
    const verified = await verifyFirebaseIdToken(idToken, projectId)
    callerUid = verified.uid
    authTime = verified.authTime
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  if (!isRecentAuth(authTime)) {
    return json({ error: 'recent_login_required', message: 'لأمان الحساب، أعد تسجيل الدخول ثم حاول مرة ثانية.' }, 403, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/change-password', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const body = (await request.json().catch(() => ({}))) as ChangePasswordBody
  if (typeof body.newPassword !== 'string' || body.newPassword.length < 6 || body.newPassword.length > 128) {
    return json({ error: 'invalid_input', message: 'كلمة السر الجديدة لازم تكون بين 6 و128 حرفًا.' }, 400, origin)
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  if (!(await hasActiveIdentity(accessToken, projectId, callerUid, authTime))) {
    return json({ error: 'account_inactive' }, 403, origin)
  }
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.status === 'inactive') return json({ error: 'permission_denied' }, 403, origin)

  await updateIdentityUser(accessToken, projectId, callerUid, { password: body.newPassword })
  await firestorePatchDoc(accessToken, projectId, `users/${callerUid}`, { mustChangePassword: false })
  return json({ ok: true }, 200, origin)
}
