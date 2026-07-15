export const courses = [
  {
    id: 1,
    title: 'React من الصفر',
    tag: 'React',
    tagClass: 'tag-sunset',
    color: 'var(--sunset)',
    icon: 'ti-brand-react',
    instructor: 'أحمد سالم',
    lessons: [
      {
        title: 'مقدمة عن React و JSX',
        content:
          'React مكتبة جافاسكريبت لبناء واجهات المستخدم عن طريق تقسيمها إلى مكونات (Components) صغيرة قابلة لإعادة الاستخدام. بدل ما تكتب HTML منفصل عن المنطق، JSX بيخليك تكتبهم مع بعض بطريقة واضحة.',
        quiz: {
          q: 'ما هو JSX؟',
          options: ['لغة برمجة مستقلة', 'امتداد صياغي يمزج HTML مع JavaScript', 'مكتبة قواعد بيانات'],
          correct: 1,
        },
      },
      {
        title: 'Components و Props',
        content:
          'الـ Component هو دالة جافاسكريبت بترجع JSX. الـ Props هي الطريقة اللي بيستقبل فيها الـ Component بيانات من الأب، بشكل يشبه تمرير معاملات لدالة عادية.',
        quiz: {
          q: 'من أين تأتي بيانات الـ Props؟',
          options: ['من الـ Component نفسه', 'من الـ Component الأب', 'من قاعدة البيانات مباشرة'],
          correct: 1,
        },
      },
      {
        title: 'State و useState',
        content:
          'الـ state هو الطريقة اللي بيحتفظ فيها الـ Component بمعلومات ممكن تتغير مع الوقت، متل عداد أو نص مدخل. useState بيرجع array فيه القيمة الحالية ودالة لتحديثها.',
        quiz: {
          q: 'شو بيرجع useState؟',
          options: ['قيمة واحدة بس', 'array فيه القيمة ودالة تحديثها', 'كائن فيه كل الـ props'],
          correct: 1,
        },
      },
      {
        title: 'useEffect و الـ Lifecycle',
        content:
          'useEffect بيسمحلك تنفذ كود بعد ما يترسم الـ Component، متل جلب بيانات من API أو الاشتراك بحدث. بتقدر تتحكم متى ينفذ عن طريق الـ dependency array.',
        quiz: {
          q: 'متى ينفذ useEffect بدون dependency array؟',
          options: ['مرة وحدة بس', 'بعد كل رندر', 'أبداً'],
          correct: 1,
        },
      },
    ],
  },
  {
    id: 2,
    title: 'قواعد بيانات Firestore',
    tag: 'Firebase',
    tagClass: 'tag-pine',
    color: 'var(--pine)',
    icon: 'ti-flame',
    instructor: 'لينا حداد',
    lessons: [
      {
        title: 'مقدمة عن NoSQL و Firestore',
        content:
          'Firestore قاعدة بيانات NoSQL بتخزن البيانات على شكل مستندات (documents) داخل مجموعات (collections)، بعكس قواعد البيانات العلائقية اللي بتعتمد على جداول وعلاقات.',
        quiz: {
          q: 'كيف تُخزَّن البيانات في Firestore؟',
          options: ['جداول وأعمدة', 'مستندات داخل مجموعات', 'ملفات نصية منفصلة'],
          correct: 1,
        },
      },
      {
        title: 'القراءة والكتابة',
        content:
          'تقدر تقرأ بيانات مرة وحدة (get) أو تشترك بتحديثات لحظية (onSnapshot). الكتابة بتصير عن طريق set أو update أو addDoc حسب الحاجة.',
        quiz: {
          q: 'أي دالة بتخليك تستقبل تحديثات لحظية؟',
          options: ['get()', 'onSnapshot()', 'addDoc()'],
          correct: 1,
        },
      },
    ],
  },
  {
    id: 3,
    title: 'Git و GitHub للمبتدئين',
    tag: 'Git',
    tagClass: 'tag-sky',
    color: 'var(--sky)',
    icon: 'ti-git-branch',
    instructor: 'أحمد سالم',
    lessons: [
      {
        title: 'مفهوم التحكم بالإصدارات',
        content:
          'Git بيسمحلك تتتبع كل تغيير صار على الكود عبر الزمن، وترجع لأي نسخة سابقة، وتشتغل بالتوازي مع فريق بدون ما تخرب شغل بعض.',
        quiz: {
          q: 'ما فائدة Git الأساسية؟',
          options: ['تسريع الكود', 'تتبع التغييرات عبر الزمن', 'تصميم الواجهات'],
          correct: 1,
        },
      },
    ],
  },
]

// تقدم تجريبي: كم درس خلّص كل مستخدم بكل كورس
export const initialProgress = { 1: 2, 2: 1, 3: 1 }