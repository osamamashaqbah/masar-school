// يقرأ ملف نصي بسيط: كل سطر = اسم طالب، وبيرجع مصفوفة أسماء نظيفة
export function parseStudentsList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}