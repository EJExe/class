import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourse, getCourseMembers, getRoles, updateMemberRole } from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';
import { roleLabels } from '../utils/lms';

export function MembersPage() {
  const { courseId = '' } = useParams();
  const { token, user } = useAuth();
  const [members, setMembers] = useState<Array<any>>([]);
  const [roles, setRoles] = useState<Array<any>>([]);
  const [canManage, setCanManage] = useState(false);

  const load = async () => {
    if (!token) return;
    const [course, membersData, rolesData] = await Promise.all([
      getCourse(token, courseId),
      getCourseMembers(token, courseId),
      getRoles(token, courseId),
    ]);
    setMembers(membersData);
    setRoles(rolesData);
    const myRole = course.currentUserRole ?? course.members.find((member: any) => member.user.id === user?.id)?.role;
    setCanManage(myRole === 'admin' || myRole === 'teacher');
  };

  useEffect(() => {
    void load();
  }, [token, courseId]);

  const onRoleChange = async (targetUserId: string, role: string) => {
    if (!token) return;
    await updateMemberRole(token, courseId, targetUserId, role);
    await load();
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Участники</h1>
        <Link to={`/courses/${courseId}`}>Назад к курсу</Link>
      </div>

      <div className="panel col">
        {members.map((member) => (
          <div key={member.id} className="card-row">
            <div>
              <strong>{member.user.nickname}</strong>
              <div className="muted">{roleLabels[member.role] ?? member.role}</div>
            </div>
            {canManage && member.user.id !== user?.id ? (
              <select value={member.role} onChange={(e) => void onRoleChange(member.user.id, e.target.value)}>
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {roleLabels[role.value] ?? role.label ?? role.value}
                  </option>
                ))}
              </select>
            ) : (
              <span className="muted">{roleLabels[member.role] ?? member.role}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

