import { getAccessToken, verifyFirebaseIdToken, createIdentityUser, lookupIdentityUserByEmail, updateIdentityUser, deleteIdentityUser, type ServiceAccount } from './google'
import { firestoreGetDoc, firestoreGetDocWithMeta, firestoreCreateDoc, firestoreCreateDocIfAbsent, firestorePatchDoc, firestoreDeleteDoc, firestoreRunQuery, firestoreUpsertDoc, firestoreCommit, type FirestoreWrite as WorkerFirestoreWrite } from './firestore'
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
}

interface UpdateUserBody {
  uid?: unknown
  action?: unknown
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
  if (typeof body.name !== 'string' || !body.name.trim()) return 'الاسم مطلوب'
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'بريد إلكتروني غير صالح'
  if (typeof body.password !== 'string' || body.password.length < 6) return 'كلمة السر لازم 6 أحرف على الأقل'
  if (typeof body.role !== 'string' || !VALID_ROLES.includes(body.role as ValidRole)) return 'دور غير صالح'
  if (body.childUids !== undefined) {
    if (!Array.isArray(body.childUids)) return 'childUids لازم تكون مصفوفة'
    if (body.role !== 'parent') return 'childUids مسموحة لولي الأمر فقط'
    if (body.childUids.some((uid) => typeof uid !== 'string' || !uid.trim())) return 'كل childUids لازم تكون معرّفات صحيحة'
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
    if (request.method !== 'POST' || !['/create-school', '/create-school-user', '/update-school-user', '/audit-log', '/refresh-platform-stats'].includes(url.pathname)) {
      return json({ error: 'not_found' }, 404, origin)
    }

    const edgeLimitResponse = await enforceEdgeLimit(request, env, url.pathname, origin)
    if (edgeLimitResponse) return edgeLimitResponse

    try {
      if (url.pathname === '/create-school') return await handleCreateSchool(request, env, origin)
      if (url.pathname === '/create-school-user') return await handleCreateSchoolUser(request, env, origin)
      if (url.pathname === '/update-school-user') return await handleUpdateSchoolUser(request, env, origin)
      if (url.pathname === '/refresh-platform-stats') return await handleRefreshPlatformStats(request, env, origin)
      return await handleWriteAuditLog(request, env, origin)
    } catch (err) {
      console.error('[admin-ops] خطأ غير متوقع:', err)
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

async function handleRefreshPlatformStats(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  try {
    callerUid = (await verifyFirebaseIdToken(idToken, projectId)).uid
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/refresh-platform-stats', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, ['https://www.googleapis.com/auth/datastore'])
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.role !== 'admin' || typeof callerProfile.schoolId !== 'string') {
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

async function handleCreateSchoolUser(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  try {
    callerUid = (await verifyFirebaseIdToken(idToken, projectId)).uid
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

  // ما بنثق بأي schoolId جاي من العميل — منجيبه من ملف تعريف المدير نفسه، المكتوب أصلًا
  // بصلاحية إدارية (Admin SDK/سكربتات)، مو من شي قابل للتعديل من المتصفح.
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.role !== 'admin' || typeof callerProfile.schoolId !== 'string') {
    return json({ error: 'permission_denied' }, 403, origin)
  }
  const schoolId = callerProfile.schoolId

  const body = (await request.json().catch(() => ({}))) as CreateUserBody
  const validationError = validateInput(body)
  if (validationError) return json({ error: 'invalid_input', message: validationError }, 400, origin)

  const name = (body.name as string).trim()
  const email = (body.email as string).trim()
  const password = body.password as string
  const role = body.role as ValidRole
  const childUids = (body.childUids as string[] | undefined) || []

  if (role === 'parent' && childUids.length > 0) {
    for (const childUid of childUids) {
      const child = await firestoreGetDoc(accessToken, projectId, `users/${childUid}`)
      if (!child || child.schoolId !== schoolId) {
        return json({ error: 'invalid_input', message: `الطالب ${childUid} مو من نفس المدرسة` }, 400, origin)
      }
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

  const patchedChildren: Array<{ path: string; parentUids: string[] }> = []
  let profileCreated = false
  try {
    await firestoreCreateDoc(accessToken, projectId, 'users', created.localId, {
      name, role, email, schoolId, mustChangePassword: true, status: 'active',
      ...(role === 'parent' ? { childUids } : {}),
    })
    profileCreated = true

    if (role === 'parent') {
      for (const childUid of childUids) {
        const child = await firestoreGetDoc(accessToken, projectId, `users/${childUid}`)
        const parentUids = Array.isArray(child?.parentUids) ? (child.parentUids as string[]) : []
        patchedChildren.push({ path: `users/${childUid}`, parentUids })
        if (!parentUids.includes(created.localId)) {
          await firestorePatchDoc(accessToken, projectId, `users/${childUid}`, { parentUids: [...parentUids, created.localId] })
        }
      }
    }
  } catch (profileErr) {
    // نرجّع كل الآثار الجزئية: روابط الأبناء، ملف Firestore، ثم حساب Auth.
    await Promise.all(patchedChildren.map(({ path, parentUids }) =>
      firestorePatchDoc(accessToken, projectId, path, { parentUids }).catch((rollbackErr) => {
        console.error('[create-school-user] فشل تراجع رابط ولي الأمر:', path, rollbackErr)
      })
    ))
    if (profileCreated) {
      await firestoreDeleteDoc(accessToken, projectId, `users/${created.localId}`).catch((rollbackErr) => {
        console.error('[create-school-user] فشل حذف ملف المستخدم أثناء التراجع:', created.localId, rollbackErr)
      })
    }
    await deleteIdentityUser(accessToken, projectId, created.localId).catch((rollbackErr) => {
      console.error('[create-school-user] فشل التراجع أيضًا — حساب يتيم فعليًا:', created.localId, rollbackErr)
    })
    console.error('[create-school-user] فشلت كتابة الملف الشخصي، تراجعنا:', profileErr)
    return json({ error: 'profile_write_failed', message: 'صار خطأ وقت حفظ بيانات الحساب. اتراجعنا عن إنشائه، جرب مرة ثانية.' }, 500, origin)
  }

  await firestoreCreateDoc(accessToken, projectId, 'auditLog', crypto.randomUUID(), {
    schoolId,
    actorUid: callerUid,
    actorName: typeof callerProfile.name === 'string' ? callerProfile.name : '',
    action: 'create_user',
    targetType: role,
    targetId: created.localId,
    details: `${name} (${email})`,
    createdAt: new Date().toISOString(),
  }).catch((err) => console.error('[audit] فشل التسجيل:', err))

  return json({ uid: created.localId }, 200, origin)
}

function rateLimited(origin: string): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', message: 'طلبات كثيرة خلال وقت قصير. حاول بعد قليل.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...corsHeaders(origin) },
  })
}

async function enforceEdgeLimit(request: Request, env: Env, pathname: string, origin: string): Promise<Response | null> {
  const contentLength = Number(request.headers.get('Content-Length') || 0)
  if (contentLength > MAX_REQUEST_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin)
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
  try {
    callerUid = (await verifyFirebaseIdToken(idToken, projectId)).uid
  } catch {
    return json({ error: 'unauthenticated' }, 401, origin)
  }
  const actorLimitResponse = await enforceActorLimit(env, '/audit-log', callerUid, origin)
  if (actorLimitResponse) return actorLimitResponse

  const body = (await request.json().catch(() => ({}))) as AuditBody
  const validationError = validateAuditInput(body)
  if (validationError) return json({ error: 'invalid_input', message: validationError }, 400, origin)

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, ['https://www.googleapis.com/auth/datastore'])
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  const platformProfile = callerProfile ? null : await firestoreGetDoc(accessToken, projectId, `platformAdmins/${callerUid}`)
  const isPlatformAdmin = Boolean(platformProfile)
  const role = typeof callerProfile?.role === 'string' ? callerProfile.role : ''
  if (!callerProfile && !platformProfile) return json({ error: 'permission_denied' }, 403, origin)
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

async function handleUpdateSchoolUser(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!idToken) return json({ error: 'unauthenticated' }, 401, origin)

  const projectId = env.FIREBASE_PROJECT_ID
  let callerUid: string
  try {
    callerUid = (await verifyFirebaseIdToken(idToken, projectId)).uid
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

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY) as ServiceAccount
  const accessToken = await getAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ])
  const callerProfile = await firestoreGetDoc(accessToken, projectId, `users/${callerUid}`)
  if (!callerProfile || callerProfile.role !== 'admin' || typeof callerProfile.schoolId !== 'string') {
    return json({ error: 'permission_denied' }, 403, origin)
  }

  const uid = body.uid.trim()
  if (uid === callerUid) return json({ error: 'invalid_input', message: 'ما بتقدر تغيّر حالة حسابك من هون' }, 400, origin)
  const target = await firestoreGetDoc(accessToken, projectId, `users/${uid}`)
  if (!target || target.schoolId !== callerProfile.schoolId || !['student', 'instructor', 'parent'].includes(String(target.role))) {
    return json({ error: 'permission_denied' }, 403, origin)
  }

  const action = String(body.action)
  if (action === 'delete') {
    const patchedChildren: Array<{ path: string; parentUids: string[] }> = []
    try {
      const childUids = target.role === 'parent' && Array.isArray(target.childUids) ? target.childUids : []
      for (const childUid of childUids) {
        if (typeof childUid !== 'string') continue
        const childPath = `users/${childUid}`
        const child = await firestoreGetDoc(accessToken, projectId, childPath)
        if (!child || child.schoolId !== callerProfile.schoolId) continue
        const parentUids = Array.isArray(child.parentUids) ? child.parentUids.filter((parentUid) => parentUid !== uid) : []
        const originalParentUids = Array.isArray(child.parentUids) ? child.parentUids : []
        patchedChildren.push({ path: childPath, parentUids: originalParentUids })
        await firestorePatchDoc(accessToken, projectId, childPath, { parentUids })
      }

      await firestoreDeleteDoc(accessToken, projectId, `users/${uid}`)
      try {
        await deleteIdentityUser(accessToken, projectId, uid)
      } catch (err) {
        await firestoreUpsertDoc(accessToken, projectId, `users/${uid}`, target).catch((rollbackErr) => {
          console.error('[update-school-user] فشل استعادة ملف الحساب بعد فشل حذف Auth:', rollbackErr)
        })
        throw err
      }
    } catch (err) {
      await Promise.all(patchedChildren.map(({ path, parentUids }) =>
        firestorePatchDoc(accessToken, projectId, path, { parentUids }).catch((rollbackErr) => {
          console.error('[update-school-user] فشل استعادة رابط ولي الأمر:', path, rollbackErr)
        })
      ))
      console.error('[update-school-user] فشل حذف الحساب:', uid, err)
      return json({ error: 'delete_failed', message: 'تعذّر حذف الحساب بالكامل. لم نكمل العملية.' }, 500, origin)
    }

    await firestoreCreateDoc(accessToken, projectId, 'auditLog', crypto.randomUUID(), {
      schoolId: callerProfile.schoolId,
      actorUid: callerUid,
      actorName: typeof callerProfile.name === 'string' ? callerProfile.name : '',
      action: 'user_delete',
      targetType: target.role,
      targetId: uid,
      details: typeof target.email === 'string' ? target.email : uid,
      createdAt: new Date().toISOString(),
    }).catch((err) => console.error('[audit] فشل تسجيل حذف الحساب:', err))

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
  } catch (err) {
    await firestorePatchDoc(accessToken, projectId, `users/${uid}`, {
      status: previousStatus,
      mustChangePassword: previousMustChangePassword,
    }).catch((rollbackErr) => console.error('[update-school-user] فشل تراجع ملف المستخدم:', rollbackErr))
    throw err
  }

  await firestoreCreateDoc(accessToken, projectId, 'auditLog', crypto.randomUUID(), {
    schoolId: callerProfile.schoolId,
    actorUid: callerUid,
    actorName: typeof callerProfile.name === 'string' ? callerProfile.name : '',
    action: `user_${action}`,
    targetType: target.role,
    targetId: uid,
    details: typeof target.email === 'string' ? target.email : uid,
    createdAt: new Date().toISOString(),
  }).catch((err) => console.error('[audit] فشل تسجيل إجراء الحساب:', err))

  return json({ uid, status: nextStatus, ...(temporaryPassword ? { temporaryPassword } : {}) }, 200, origin)
}
