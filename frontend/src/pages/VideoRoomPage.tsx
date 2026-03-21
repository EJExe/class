import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourseVideoRoom, getVideoParticipants } from '../services/video.api';
import { useAuth } from '../hooks/useAuth';
import { wsService } from '../services/ws.service';

type Participant = {
  peerId: string;
  user: { id: string; nickname: string };
};

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function VideoRoomPage() {
  const { courseId = '' } = useParams();
  const { token, user } = useAuth();

  const [room, setRoom] = useState<any | null>(null);
  const [participants, setParticipants] = useState<Array<Participant>>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const myPeerIdRef = useRef<string | null>(null);
  const participantsPollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token || !courseId) return;
    getCourseVideoRoom(token, courseId).then(setRoom).catch(() => setRoom(null));
  }, [token, courseId]);

  useEffect(() => {
    return () => {
      if (participantsPollRef.current) {
        window.clearInterval(participantsPollRef.current);
      }
      wsService.disconnect();
      peersRef.current.forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const getOrCreatePeer = (targetPeerId: string, roomId: string) => {
    const existing = peersRef.current.get(targetPeerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(rtcConfig);

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      wsService.getSocket().emit('webrtc:ice', {
        roomId,
        targetPeerId,
        candidate: event.candidate,
      });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStreams((prev) => ({ ...prev, [targetPeerId]: stream }));
    };

    peersRef.current.set(targetPeerId, pc);
    return pc;
  };

  const joinRoom = async () => {
    if (!token || !room || !user || joined) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const socket = wsService.connect(token);
      const joinCurrentRoom = () => socket.emit('room:join', { roomId: room.id });

      socket.off('room:error');
      socket.off('room:joined');
      socket.off('room:participants');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');
      socket.off('connect');

      socket.on('connect', joinCurrentRoom);
      socket.on('room:error', (event: { message: string }) => setError(event.message));

      socket.on('room:joined', (payload: { roomId: string; peerId: string; participants: Array<Participant> }) => {
        if (payload.roomId !== room.id) return;
        myPeerIdRef.current = payload.peerId;
        setParticipants(payload.participants);
      });

      socket.on('room:participants', async (payload: { roomId: string; participants: Array<Participant> }) => {
        if (payload.roomId !== room.id) return;
        setParticipants(payload.participants);

        const activePeerIds = new Set(
          payload.participants.map((p) => p.peerId).filter((peerId) => peerId !== myPeerIdRef.current),
        );

        for (const [peerId, pc] of peersRef.current.entries()) {
          if (!activePeerIds.has(peerId)) {
            pc.close();
            peersRef.current.delete(peerId);
            setRemoteStreams((prev) => {
              const next = { ...prev };
              delete next[peerId];
              return next;
            });
          }
        }

        for (const peer of payload.participants) {
          if (!myPeerIdRef.current || peer.peerId === myPeerIdRef.current) continue;
          if (myPeerIdRef.current < peer.peerId && !peersRef.current.has(peer.peerId)) {
            const pc = getOrCreatePeer(peer.peerId, room.id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc:offer', { roomId: room.id, targetPeerId: peer.peerId, sdp: offer });
          }
        }
      });

      socket.on(
        'webrtc:offer',
        async (payload: { fromPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
          if (!myPeerIdRef.current || payload.targetPeerId !== myPeerIdRef.current) return;
          const pc = getOrCreatePeer(payload.fromPeerId, room.id);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', { roomId: room.id, targetPeerId: payload.fromPeerId, sdp: answer });
        },
      );

      socket.on(
        'webrtc:answer',
        async (payload: { fromPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
          if (!myPeerIdRef.current || payload.targetPeerId !== myPeerIdRef.current) return;
          const pc = peersRef.current.get(payload.fromPeerId);
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        },
      );

      socket.on(
        'webrtc:ice',
        async (payload: { fromPeerId: string; targetPeerId: string; candidate: RTCIceCandidateInit }) => {
          if (!myPeerIdRef.current || payload.targetPeerId !== myPeerIdRef.current) return;
          const pc = peersRef.current.get(payload.fromPeerId);
          if (!pc) return;
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        },
      );

      if (socket.connected) {
        joinCurrentRoom();
      }

      const refreshParticipants = async () => {
        try {
          const active = await getVideoParticipants(token, room.id);
          setParticipants(active);
        } catch {
          // ignore transient errors
        }
      };

      await refreshParticipants();
      if (participantsPollRef.current) {
        window.clearInterval(participantsPollRef.current);
      }
      participantsPollRef.current = window.setInterval(refreshParticipants, 1500);

      setJoined(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const leaveRoom = () => {
    if (!room || !joined) return;
    const socket = wsService.getSocket();
    socket.emit('room:leave', { roomId: room.id });
    if (participantsPollRef.current) {
      window.clearInterval(participantsPollRef.current);
      participantsPollRef.current = null;
    }
    setJoined(false);
    setParticipants([]);
    setRemoteStreams({});
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
  };

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamEnabled(track.enabled);
  };

  return (
    <div className="page col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Video Room</h2>
        <Link to={`/courses/${courseId}`}>Back to course</Link>
      </div>

      <div className="row">
        <button onClick={() => void joinRoom()} disabled={!room || joined}>
          Join
        </button>
        <button className="secondary" onClick={toggleMic} disabled={!joined}>
          {micEnabled ? 'Mute mic' : 'Unmute mic'}
        </button>
        <button className="secondary" onClick={toggleCam} disabled={!joined}>
          {camEnabled ? 'Turn camera off' : 'Turn camera on'}
        </button>
        <button className="danger" onClick={leaveRoom} disabled={!joined}>
          Leave
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="video-room-layout">
        <div className="panel video-members">
          <h3>Participants ({participants.length})</h3>
          {participants.map((p) => (
            <div key={p.peerId} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{p.user.nickname}</span>
            </div>
          ))}
        </div>

        <div className="panel video-stage">
          <div className="video-grid video-grid-large">
            <div>
              <strong>You</strong>
              <video ref={localVideoRef} autoPlay playsInline muted />
            </div>
            {participants
              .filter((p) => p.user.id !== user?.id)
              .map((p) => (
                <div key={p.peerId}>
                  <strong>{p.user.nickname}</strong>
                  <RemoteVideo stream={remoteStreams[p.peerId]} />
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RemoteVideo({ stream }: { stream?: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null;
    }
  }, [stream]);

  return <video ref={ref} autoPlay playsInline />;
}
