import * as XLSX from 'xlsx'

// يقرأ ملف Excel، يتوقع أعمدة بعناوين: الاسم | الصف | الشعبة
export function parseStudentsExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(firstSheet)

        const students = rows
          .map((row) => ({
            name: String(row['الاسم'] || '').trim(),
            gradeName: String(row['الصف'] || '').trim(),
            sectionName: String(row['الشعبة'] || '').trim(),
          }))
          .filter((r) => r.name !== '')

        if (students.length === 0) {
          reject(new Error('ما لقينا صفوف صالحة. تأكد إنه الملف فيه أعمدة "الاسم" و"الصف" و"الشعبة".'))
          return
        }

        resolve(students)
      } catch (err) {
        reject(new Error('صار خطأ بقراءة الملف. تأكد إنه ملف Excel صحيح (.xlsx).'))
      }
    }

    reader.onerror = () => reject(new Error('ما قدرنا نفتح الملف.'))
    reader.readAsBinaryString(file)
  })
}