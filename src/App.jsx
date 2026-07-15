import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from './context/SessionContext'
import { ProgressProvider } from './context/ProgressContext'
import { ThemeProvider } from './context/ThemeContext'
import { NotesProvider } from './context/NotesContext'
import { QuizStatsProvider } from './context/QuizStatsContext'
import { HomeworkProvider } from './context/HomeworkContext'
import { NotificationProvider } from './context/NotificationContext'
import { SchoolStructureProvider } from './context/SchoolStructureContext'
import { BulkImportProvider } from './context/BulkImportContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SubjectPage from './pages/SubjectPage'
import LessonPage from './pages/LessonPage'
import QuizPage from './pages/QuizPage'
import InstructorPage from './pages/InstructorPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import HomeworkPage from './pages/HomeworkPage'
import HomeworkDetailPage from './pages/HomeworkDetailPage'
import SchoolStructurePage from './pages/SchoolStructurePage'
import ParentDashboardPage from './pages/ParentDashboardPage'
import InstructorAddLessonPage from './pages/instructor/InstructorAddLessonPage'
import InstructorMaterialsPage from './pages/instructor/InstructorMaterialsPage'
import InstructorHomeworkPage from './pages/instructor/InstructorHomeworkPage'
import InstructorNotesPage from './pages/instructor/InstructorNotesPage'
import InstructorAnalyticsPage from './pages/instructor/InstructorAnalyticsPage'

import { QuestionsProvider } from './context/QuestionsContext'
import { MarksProvider } from './context/MarksContext'
import InstructorQuestionsPage from './pages/instructor/InstructorQuestionsPage'
import InstructorGradeHomeworkPage from './pages/instructor/InstructorGradeHomeworkPage'
import InstructorManualGradesPage from './pages/instructor/InstructorManualGradesPage'
import StudentGradesPage from './pages/StudentGradesPage'

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ProgressProvider>
          <NotesProvider>
            <QuizStatsProvider>
              <HomeworkProvider>
                <NotificationProvider>
                  <SchoolStructureProvider>
                    <BulkImportProvider>
                      <BrowserRouter>
                      <QuestionsProvider>
                        <MarksProvider>
                        <Routes>
                          <Route path="/" element={<Login />} />
                          <Route path="/app" element={<Layout />}>

                          <Route path="instructor/questions" element={<InstructorQuestionsPage />} />
                            <Route path="instructor/grade-homework" element={<InstructorGradeHomeworkPage />} />
                            <Route path="instructor/manual-grades" element={<InstructorManualGradesPage />} />
                            <Route path="grades" element={<StudentGradesPage />} />
                            <Route path="dashboard" element={<Dashboard />} />
                            <Route path="subject/:subjectId" element={<SubjectPage />} />
                            <Route path="lesson/:subjectId/:lessonIndex" element={<LessonPage />} />
                            <Route path="quiz/:subjectId/:lessonIndex" element={<QuizPage />} />
                            <Route path="instructor" element={<InstructorPage />} />
                            <Route path="instructor/lessons" element={<InstructorAddLessonPage />} />
                            <Route path="instructor/materials" element={<InstructorMaterialsPage />} />
                            <Route path="instructor/homework" element={<InstructorHomeworkPage />} />
                            <Route path="instructor/notes" element={<InstructorNotesPage />} />
                            <Route path="instructor/analytics" element={<InstructorAnalyticsPage />} />
                            <Route path="admin" element={<AdminPage />} />
                            <Route path="settings" element={<SettingsPage />} />
                            <Route path="homework/:subjectId" element={<HomeworkPage />} />
                            <Route path="homework-detail/:homeworkId" element={<HomeworkDetailPage />} />
                            <Route path="school-structure" element={<SchoolStructurePage />} />
                            <Route path="parent-dashboard" element={<ParentDashboardPage />} />
                          </Route>
                        </Routes>
                        </MarksProvider>
                        </QuestionsProvider>
                      </BrowserRouter>
                    </BulkImportProvider>
                  </SchoolStructureProvider>
                </NotificationProvider>
              </HomeworkProvider>
            </QuizStatsProvider>
          </NotesProvider>
        </ProgressProvider>
      </SessionProvider>
    </ThemeProvider>
  )
}