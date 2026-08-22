const SUCCESS_STATUSES = new Set(['ok', 'resumed', 'linked'])

export function isSuccessfulImportResult(result) {
  return SUCCESS_STATUSES.has(result?.status)
}

export function retryableImportRowIndices(results = []) {
  return [...new Set(
    results
      .filter((result) => result?.status === 'error' && Number.isInteger(result.rowIndex))
      .map((result) => result.rowIndex)
  )]
}

export function mergeImportResults(current = [], updates = []) {
  const merged = new Map(current.map((result) => [`${result.rowIndex}:${result.role}`, result]))
  updates.forEach((result) => {
    const key = `${result.rowIndex}:${result.role}`
    const previous = merged.get(key)
    merged.set(key, {
      ...previous,
      ...result,
      password: result.password ?? previous?.password ?? null,
    })
  })
  return [...merged.values()].sort((a, b) => (a.rowIndex - b.rowIndex) || a.role.localeCompare(b.role))
}
