import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../hooks/useAuth';
import { AssignmentPage } from '../pages/AssignmentPage';
import { AssignmentTrashPage } from '../pages/AssignmentTrashPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { CoursePage } from '../pages/CoursePage';
import { CoursesPage } from '../pages/CoursesPage';
import { DeadlinesPage } from '../pages/DeadlinesPage';
import { FilesLibraryPage } from '../pages/FilesLibraryPage';
import { GroupsPage } from '../pages/GroupsPage';
import { GradebookPage } from '../pages/GradebookPage';
import { LoginPage } from '../pages/LoginPage';
import { MembersPage } from '../pages/MembersPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ReviewQueuePage } from '../pages/ReviewQueuePage';
import { VideoRoomPage } from '../pages/VideoRoomPage';

function Protected({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  return token ? <AppShell>{children}</AppShell> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/profile"
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
      />
      <Route
        path="/courses"
        element={
          <Protected>
            <CoursesPage />
          </Protected>
        }
      />
      <Route
        path="/deadlines"
        element={
          <Protected>
            <DeadlinesPage />
          </Protected>
        }
      />
      <Route
        path="/files"
        element={
          <Protected>
            <FilesLibraryPage />
          </Protected>
        }
      />
      <Route
        path="/review-queue"
        element={
          <Protected>
            <ReviewQueuePage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId/gradebook"
        element={
          <Protected>
            <GradebookPage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId/assignments/trash"
        element={
          <Protected>
            <AssignmentTrashPage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId"
        element={
          <Protected>
            <CoursePage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId/members"
        element={
          <Protected>
            <MembersPage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId/groups"
        element={
          <Protected>
            <GroupsPage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId/assignments/:assignmentId"
        element={
          <Protected>
            <AssignmentPage />
          </Protected>
        }
      />
      <Route
        path="/notifications"
        element={
          <Protected>
            <NotificationsPage />
          </Protected>
        }
      />
      <Route
        path="/audit"
        element={
          <Protected>
            <AuditLogsPage />
          </Protected>
        }
      />
      <Route
        path="/courses/:courseId/video"
        element={
          <Protected>
            <VideoRoomPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/courses" replace />} />
    </Routes>
  );
}
