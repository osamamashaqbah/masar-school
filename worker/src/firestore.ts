// عميل REST خفيف لـ Firestore (بدل firebase-admin يلي ما بيشتغل على Workers). Firestore REST
// بيستخدم صيغة قيم مكتوبة ({stringValue: "..."} بدل "..." مباشرة) — الدوال هون تحوّل تلقائيًا.

type FirestoreValue = Record<string, unknown>

export interface FirestoreWrite {
  path: string
  data: Record<string, unknown>
  precondition?: { exists?: boolean; updateTime?: string }
}

export interface FirestoreDoc {
  data: Record<string, unknown>
  updateTime?: string
}

function toFirestoreValue(v: unknown): FirestoreValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } }
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v as Record<string, unknown>) } }
  throw new Error(`نوع غير مدعوم لقيمة Firestore: ${typeof v}`)
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    fields[k] = toFirestoreValue(v)
  }
  return fields
}

function fromFirestoreValue(v: FirestoreValue): unknown {
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) {
    const values = (v.arrayValue as { values?: FirestoreValue[] })?.values ?? []
    return values.map(fromFirestoreValue)
  }
  if ('mapValue' in v) {
    const fields = (v.mapValue as { fields?: Record<string, FirestoreValue> })?.fields ?? {}
    return fromFirestoreFields(fields)
  }
  return null
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) obj[k] = fromFirestoreValue(v)
  return obj
}

const BASE = (projectId: string) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

function documentName(projectId: string, path: string): string {
  return `${BASE(projectId)}/${path}`
}

export async function firestoreCommit(
  accessToken: string, projectId: string, writes: FirestoreWrite[]
): Promise<string[]> {
  const res = await fetch(`${BASE(projectId)}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: writes.map(({ path, data, precondition }) => ({
        update: { name: documentName(projectId, path), fields: toFirestoreFields(data) },
        ...(precondition ? { currentDocument: precondition } : {}),
      })),
    }),
  })
  if (!res.ok) throw new Error(`فشل commit Firestore: ${res.status}`)
  const data = (await res.json()) as { writeResults?: Array<{ updateTime?: string }> }
  return (data.writeResults || []).map((result) => result.updateTime || '')
}

export async function firestoreCreateDocIfAbsent(
  accessToken: string, projectId: string, path: string, data: Record<string, unknown>
): Promise<string | undefined> {
  const [updateTime] = await firestoreCommit(accessToken, projectId, [{ path, data, precondition: { exists: false } }])
  return updateTime || undefined
}

export async function firestoreGetDocWithMeta(
  accessToken: string, projectId: string, path: string
): Promise<FirestoreDoc | null> {
  const res = await fetch(documentName(projectId, path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`فشلت قراءة ${path}: ${res.status}`)
  const data = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime?: string }
  return { data: fromFirestoreFields(data.fields || {}), updateTime: data.updateTime }
}

export async function firestoreGetDoc(
  accessToken: string, projectId: string, path: string
): Promise<Record<string, unknown> | null> {
  const doc = await firestoreGetDocWithMeta(accessToken, projectId, path)
  return doc?.data || null
}

export async function firestoreCreateDoc(
  accessToken: string, projectId: string, collectionPath: string, docId: string, data: Record<string, unknown>
): Promise<void> {
  const url = `${BASE(projectId)}/${collectionPath}?documentId=${encodeURIComponent(docId)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (!res.ok) throw new Error(`فشلت كتابة ${collectionPath}/${docId}: ${res.status} ${await res.text()}`)
}

export async function firestorePatchDoc(
  accessToken: string, projectId: string, path: string, data: Record<string, unknown>
): Promise<void> {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  const url = `${BASE(projectId)}/${path}?${mask}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (!res.ok) throw new Error(`فشل تحديث ${path}: ${res.status} ${await res.text()}`)
}

export async function firestoreRunQuery(
  accessToken: string,
  projectId: string,
  collectionId: string,
  fieldPath: string,
  fieldValue: string,
  selectFields: string[] = [],
): Promise<Record<string, unknown>[]> {
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: fieldValue } } },
  }
  if (selectFields.length > 0) structuredQuery.select = { fields: selectFields.map((fieldPath) => ({ fieldPath })) }

  const res = await fetch(`${BASE(projectId)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  if (!res.ok) throw new Error(`فشل الاستعلام عن ${collectionId}: ${res.status} ${await res.text()}`)
  const rows = (await res.json()) as Array<{ document?: { fields?: Record<string, FirestoreValue> } }>
  return rows.filter((row) => row.document).map((row) => fromFirestoreFields(row.document?.fields || {}))
}

export async function firestoreUpsertDoc(
  accessToken: string, projectId: string, path: string, data: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${BASE(projectId)}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (res.ok) return
  if (res.status === 404) {
    const slash = path.lastIndexOf('/')
    await firestoreCreateDoc(accessToken, projectId, path.slice(0, slash), path.slice(slash + 1), data)
    return
  }
  throw new Error(`فشل حفظ ${path}: ${res.status} ${await res.text()}`)
}

export async function firestoreDeleteDoc(
  accessToken: string, projectId: string, path: string, precondition?: { updateTime?: string }
): Promise<void> {
  const query = precondition?.updateTime
    ? `?currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`
    : ''
  const res = await fetch(`${BASE(projectId)}/${path}${query}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return
  if (!res.ok) throw new Error(`فشل حذف ${path}: ${res.status} ${await res.text()}`)
}
