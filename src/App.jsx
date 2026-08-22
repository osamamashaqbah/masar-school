import { lazy, Suspense } from 'react'
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
const Login = lazy(() => import('./pages/Login'))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const SubjectPage = lazy(() => import('./pages/SubjectPage'))
const LessonPage = lazy(() => import('./pages/LessonPage'))
const QuizPage = lazy(() => import('./pages/QuizPage'))
const InstructorPage = lazy(() => import('./pages/InstructorPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HomeworkPage = lazy(() => import('./pages/HomeworkPage'))
const HomeworkDetailPage = lazy(() => import('./pages/HomeworkDetailPage'))
const SchoolStructurePage = lazy(() => import('./pages/SchoolStructurePage'))
const ParentDashboardPage = lazy(() => import('./pages/ParentDashboardPage'))
const InstructorAddLessonPage = lazy(() => import('./pages/instructor/InstructorAddLessonPage'))
const InstructorMaterialsPage = lazy(() => import('./pages/instructor/InstructorMaterialsPage'))
const InstructorHomeworkPage = lazy(() => import('./pages/instructor/InstructorHomeworkPage'))
const InstructorNotesPage = lazy(() => import('./pages/instructor/InstructorNotesPage'))
const InstructorAnalyticsPage = lazy(() => import('./pages/instructor/InstructorAnalyticsPage'))

import { QuestionsProvider } from './context/QuestionsContext'
import { MarksProvider } from './context/MarksContext'
import { AttendanceProvider } from './context/AttendanceContext'
const InstructorQuestionsPage = lazy(() => import('./pages/instructor/InstructorQuestionsPage'))
const InstructorGradeHomeworkPage = lazy(() => import('./pages/instructor/InstructorGradeHomeworkPage'))
const InstructorManualGradesPage = lazy(() => import('./pages/instructor/InstructorManualGradesPage'))
const InstructorAttendancePage = lazy(() => import('./pages/instructor/InstructorAttendancePage'))
const StudentGradesPage = lazy(() => import('./pages/StudentGradesPage'))
import { MessagesProvider } from './context/MessagesContext'
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const AdminInsightsPage = lazy(() => import('./pages/AdminInsightsPage'))
const AdminRolloverPage = lazy(() => import('./pages/AdminRolloverPage'))
import { AnnouncementsProvider } from './context/AnnouncementsContext'
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'))
import { ExcuseRequestProvider } from './context/ExcuseRequestContext'
const AdminAuditLogPage = lazy(() => import('./pages/AdminAuditLogPage'))
const AdminExportPage = lazy(() => import('./pages/AdminExportPage'))
import { TimetableProvider } from './context/TimetableContext'
const TimetablePage = lazy(() => import('./pages/TimetablePage'))
import { FeedbackProvider } from './context/FeedbackContext'
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'))
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'))
import { ScheduleOpsProvider } from './context/ScheduleOpsContext'
const ScheduleOpsPage = lazy(() => import('./pages/ScheduleOpsPage'))
import { InterventionProvider } from './context/InterventionContext'
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage'))
import { ExamCenterProvider } from './context/ExamCenterContext'
const ExamCenterPage = lazy(() => import('./pages/ExamCenterPage'))
import { QuestionBankProvider } from './context/QuestionBankContext'
const InstructorQuestionBankPage = lazy(() => import('./pages/instructor/InstructorQuestionBankPage'))

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
                        <Suspense fallback={<div className="auth-loading-screen"><i className="ti ti-loader-2 spin" /></div>}>
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
                        </Suspense>
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
