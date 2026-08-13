import { getAccessToken, verifyFirebaseIdToken, createIdentityUser, deleteIdentityUser, type ServiceAccount } from './google'
import { firestoreGetDoc, firestoreCreateDoc, firestorePatchDoc } from './firestore'

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

const VALID_ROLES = ['student', 'instructor', 'parent'] as const
type ValidRole = (typeof VALID_ROLES)[number]

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
    if (url.pathname !== '/create-school-user' || request.method !== 'POST') {
      return json({ error: 'not_found' }, 404, origin)
    }

    try {
      return await handleCreateSchoolUser(request, env, origin)
    } catch (err) {
      console.error('[create-school-user] خطأ غير متوقع:', err)
      return json({ error: 'internal', message: 'حدث خطأ داخلي. حاول مرة ثانية.' }, 500, origin)
    }
  },
} satisfies ExportedHandler<Env>

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
    return json({ error: 'auth_error', message: err instanceof Error ? err.message : String(err) }, 400, origin)
  }

  try {
    await firestoreCreateDoc(accessToken, projectId, 'users', created.localId, {
      name, role, email, schoolId,
      ...(role === 'parent' ? { childUids } : {}),
    })

    if (role === 'parent') {
      for (const childUid of childUids) {
        const child = await firestoreGetDoc(accessToken, projectId, `users/${childUid}`)
        const parentUids = Array.isArray(child?.parentUids) ? (child.parentUids as string[]) : []
        if (!parentUids.includes(created.localId)) {
          await firestorePatchDoc(accessToken, projectId, `users/${childUid}`, { parentUids: [...parentUids, created.localId] })
        }
      }
    }
  } catch (profileErr) {
    // فشلت كتابة الملف الشخصي بعد نجاح إنشاء حساب Auth — نتراجع فورًا بدل ترك حساب يتيم
    // بلا ملف تعريف وبريد محجوز للأبد (Bug 2.1، MASAR_CRITICAL_BUGS_DETAILED_AR.md)
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
