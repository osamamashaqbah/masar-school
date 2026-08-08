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
import SuperAdminPage from './pages/SuperAdminPage'
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
import { AttendanceProvider } from './context/AttendanceContext'
import InstructorQuestionsPage from './pages/instructor/InstructorQuestionsPage'
import InstructorGradeHomeworkPage from './pages/instructor/InstructorGradeHomeworkPage'
import InstructorManualGradesPage from './pages/instructor/InstructorManualGradesPage'
import InstructorAttendancePage from './pages/instructor/InstructorAttendancePage'
import StudentGradesPage from './pages/StudentGradesPage'
import { MessagesProvider } from './context/MessagesContext'
import MessagesPage from './pages/MessagesPage'
import AdminInsightsPage from './pages/AdminInsightsPage'
import AdminRolloverPage from './pages/AdminRolloverPage'
import { AnnouncementsProvider } from './context/AnnouncementsContext'
import AnnouncementsPage from './pages/AnnouncementsPage'
import { ExcuseRequestProvider } from './context/ExcuseRequestContext'
import AdminAuditLogPage from './pages/AdminAuditLogPage'
import AdminExportPage from './pages/AdminExportPage'
import { TimetableProvider } from './context/TimetableContext'
import TimetablePage from './pages/TimetablePage'
import { FeedbackProvider } from './context/FeedbackContext'
import FeedbackPage from './pages/FeedbackPage'
import AdminFeedbackPage from './pages/AdminFeedbackPage'
import { ScheduleOpsProvider } from './context/ScheduleOpsContext'
import ScheduleOpsPage from './pages/ScheduleOpsPage'
import { InterventionProvider } from './context/InterventionContext'
import StudentProfilePage from './pages/StudentProfilePage'
import { ExamCenterProvider } from './context/ExamCenterContext'
import ExamCenterPage from './pages/ExamCenterPage'
import { QuestionBankProvider } from './context/QuestionBankContext'
import InstructorQuestionBankPage from './pages/instructor/InstructorQuestionBankPage'

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <SchoolStructureProvider>
        <ProgressProvider>
          <NotesProvider>
            <QuizStatsProvider>
              <HomeworkProvider>
                <NotificationProvider>
                  <AnnouncementsProvider>
                    <BulkImportProvider>
                    <TimetableProvider>
                      <BrowserRouter>
                      <QuestionsProvider>
                        <MarksProvider>
                        <AttendanceProvider>
                        <MessagesProvider>
                        <ExcuseRequestProvider>
                        <FeedbackProvider>
                        <ScheduleOpsProvider>
                        <InterventionProvider>
                        <ExamCenterProvider>
                        <QuestionBankProvider>
                        <Routes>
                          <Route path="/" element={<Login />} />
                          <Route path="/superadmin" element={<SuperAdminPage />} />
                          <Route path="/app" element={<Layout />}>

                          <Route path="instructor/questions" element={<InstructorQuestionsPage />} />
                            <Route path="instructor/grade-homework" element={<InstructorGradeHomeworkPage />} />
                            <Route path="instructor/manual-grades" element={<InstructorManualGradesPage />} />
                            <Route path="instructor/attendance" element={<InstructorAttendancePage />} />
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
                            <Route path="messages" element={<MessagesPage />} />
                            <Route path="admin/insights" element={<AdminInsightsPage />} />
                            <Route path="admin/rollover" element={<AdminRolloverPage />} />
                            <Route path="announcements" element={<AnnouncementsPage />} />
                            <Route path="admin/audit-log" element={<AdminAuditLogPage />} />
                            <Route path="admin/export" element={<AdminExportPage />} />
                            <Route path="timetable" element={<TimetablePage />} />
                            <Route path="feedback" element={<FeedbackPage />} />
                            <Route path="admin/feedback" element={<AdminFeedbackPage />} />
                            <Route path="admin/schedule" element={<ScheduleOpsPage />} />
                            <Route path="admin/students/:studentUid" element={<StudentProfilePage />} />
                            <Route path="exams" element={<ExamCenterPage />} />
                            <Route path="instructor/question-bank" element={<InstructorQuestionBankPage />} />
                          </Route>
                        </Routes>
                        </QuestionBankProvider>
                        </ExamCenterProvider>
                        </InterventionProvider>
                        </ScheduleOpsProvider>
                        </FeedbackProvider>
                        </ExcuseRequestProvider>
                        </MessagesProvider>
                        </AttendanceProvider>
                        </MarksProvider>
                        </QuestionsProvider>
                      </BrowserRouter>
                    </TimetableProvider>
                    </BulkImportProvider>
                  </AnnouncementsProvider>
                </NotificationProvider>
              </HomeworkProvider>
            </QuizStatsProvider>
          </NotesProvider>
        </ProgressProvider>
        </SchoolStructureProvider>
      </SessionProvider>
    </ThemeProvider>
  )
}