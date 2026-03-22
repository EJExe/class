import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AssignmentPage } from '../pages/AssignmentPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { CoursePage } from '../pages/CoursePage';
import { CoursesPage } from '../pages/CoursesPage';
import { GroupsPage } from '../pages/GroupsPage';
import { LoginPage } from '../pages/LoginPage';
import { MembersPage } from '../pages/MembersPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { VideoRoomPage } from '../pages/VideoRoomPage';

function Protected({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/courses"
        element={
          <Protected>
            <CoursesPage />
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
