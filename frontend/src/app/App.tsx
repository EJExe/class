import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { CoursesPage } from '../pages/CoursesPage';
import { CoursePage } from '../pages/CoursePage';
import { MembersPage } from '../pages/MembersPage';
import { VideoRoomPage } from '../pages/VideoRoomPage';
import { useAuth } from '../hooks/useAuth';

function Protected({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
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

