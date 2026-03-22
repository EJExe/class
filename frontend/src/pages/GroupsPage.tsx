import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addGroupMember,
  createGroup,
  getCourseMembers,
  listGroups,
  removeGroupMember,
} from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';

export function GroupsPage() {
  const { courseId = '' } = useParams();
  const { token } = useAuth();
  const [groups, setGroups] = useState<Array<any>>([]);
  const [members, setMembers] = useState<Array<any>>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    const [groupData, memberData] = await Promise.all([listGroups(token, courseId), getCourseMembers(token, courseId)]);
    setGroups(groupData);
    setMembers(memberData);
  };

  useEffect(() => {
    void load();
  }, [token, courseId]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await createGroup(token, courseId, name);
      setName('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onAddMember = async (groupId: string, userId: string) => {
    if (!token) return;
    await addGroupMember(token, groupId, userId);
    await load();
  };

  const onRemoveMember = async (groupId: string, userId: string) => {
    if (!token) return;
    await removeGroupMember(token, groupId, userId);
    await load();
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Groups</h1>
        <Link to={`/courses/${courseId}`}>Back to course</Link>
      </div>

      <form className="panel row" onSubmit={onCreate}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group name" required />
        <button type="submit">Create group</button>
      </form>

      <div className="grid-2">
        {groups.map((group) => (
          <div key={group.id} className="panel col">
            <h3>{group.name}</h3>
            <div className="col">
              {group.members.map((member: any) => (
                <div key={member.id} className="card-row">
                  <span>{member.user.nickname}</span>
                  <button className="danger" onClick={() => void onRemoveMember(group.id, member.user.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <select defaultValue="" onChange={(e) => e.target.value && void onAddMember(group.id, e.target.value)}>
              <option value="" disabled>
                Add member
              </option>
              {members
                .filter((member) => !group.members.some((groupMember: any) => groupMember.user.id === member.user.id))
                .map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.nickname}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
