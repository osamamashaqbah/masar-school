import * as XLSX from 'xlsx'
import { DAYS } from './timetable'

// نظّف نص عربي للمطابقة: شيل تشكيل، وحّد الألف/التاء المربوطة، شيل مسافات زايدة
function normalize(text) {
  return String(text || '')
    .trim()
    .replace(/[ً-ْ]/g, '') // تشكيل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function mapTimetableHeaders(headerRow) {
  return headerRow.map((cell, colIdx) => {
    if (colIdx === 0) return null // العمود الأول = رقم الحصة
    const norm = normalize(cell)
    if (!norm) return null
    const dayIdx = DAYS.findIndex((d) => normalize(d) === norm || normalize(d).includes(norm) || norm.includes(normalize(d)))
    return dayIdx >= 0 ? dayIdx : null
  })
}

// يقرأ ملف Excel لجدول حصص شعبة وحدة: الصف الأول = أيام (رؤوس أعمدة)، العمود الأول = رقم الحصة،
// وباقي الخلايا = اسم المادة. يطابق كل خلية مع مواد الشعبة (sectionSubjects) بمطابقة نص مرنة.
// يرجع { slots: [{day, period, subjectId}], unmatched: [{period, dayLabel, text}] }
export function parseTimetableExcel(file, sectionSubjects) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        if (rows.length < 2) {
          reject(new Error('الملف فاضي أو ناقص صفوف. لازم صف رؤوس (أيام) وصف حصة على الأقل.'))
          return
        }

        const headerRow = rows[0]
        // نطابق كل عمود برأسه مع أقرب اسم يوم من DAYS (مرن — ما لازم تطابق حرفي)
        const dayColumns = mapTimetableHeaders(headerRow)

        if (dayColumns.every((d) => d === null)) {
          reject(new Error('ما قدرنا نتعرف على أي عمود يوم بالصف الأول. تأكد الرؤوس مكتوبة بأسماء الأيام (الأحد، الاثنين...).'))
          return
        }

        const subjectByName = new Map(sectionSubjects.map((s) => [normalize(s.name), s]))
        const slots = []
        const unmatched = []

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const period = Number(row[0])
          if (!period || Number.isNaN(period)) continue

          row.forEach((cellText, colIdx) => {
            if (colIdx === 0) return
            const dayIdx = dayColumns[colIdx]
            if (dayIdx === null || dayIdx === undefined) return
            const text = String(cellText || '').trim()
            if (!text) return

            const subject = subjectByName.get(normalize(text))
            if (subject) {
              slots.push({ day: dayIdx, period, subjectId: subject.id })
            } else {
              unmatched.push({ period, dayLabel: DAYS[dayIdx], text })
            }
          })
        }

        resolve({ slots, unmatched })
      } catch (err) {
        console.error('[الجدول] فشل تحليل ملف Excel:', err)
        reject(new Error('صار خطأ بقراءة الملف. تأكد إنه ملف Excel صحيح (.xlsx).'))
      }
    }

    reader.onerror = () => reject(new Error('ما قدرنا نفتح الملف.'))
    reader.readAsBinaryString(file)
  })
}
