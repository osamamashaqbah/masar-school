// يفحص أي رابط ويحدد نوعه، ويحوّله لرابط "عرض مدمج" مناسب
export function parseMaterialUrl(rawUrl) {
  const url = rawUrl.trim()

  // فيديو يوتيوب (بأي صيغة رابط: watch, youtu.be, embed)
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)
  if (ytMatch) {
    return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}` }
  }

  // ملف Google Drive (PDF, Word, PowerPoint..) بصيغة /file/d/ID
  const driveMatch1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (driveMatch1) {
    return { type: 'drive', embedUrl: `https://drive.google.com/file/d/${driveMatch1[1]}/preview` }
  }

  // ملف Google Drive بصيغة قديمة open?id=ID
  const driveMatch2 = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/)
  if (driveMatch2) {
    return { type: 'drive', embedUrl: `https://drive.google.com/file/d/${driveMatch2[1]}/preview` }
  }

  // رابط صورة مباشر
  if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url)) {
    return { type: 'image', embedUrl: url }
  }

  // أي رابط تاني: نعرضه كزر "افتح الملف" بس
  return { type: 'link', embedUrl: url }
}