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
  const pendingOffersRef = useRef<Array<{ fromPeerId: string; sdp: RTCSessionDescriptionInit }>>([]);
  const pendingIceRef = useRef<Array<{ fromPeerId: string; candidate: RTCIceCandidateInit }>>([]);
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

  const syncPeers = async (roomId: string, nextParticipants: Array<Participant>) => {
    const myPeerId = myPeerIdRef.current;
    if (!myPeerId) return;

    setParticipants(nextParticipants);

    const activePeerIds = new Set(
      nextParticipants.map((participant) => participant.peerId).filter((peerId) => peerId !== myPeerId),
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

    for (const participant of nextParticipants) {
      if (participant.peerId === myPeerId) continue;
      if (myPeerId < participant.peerId && !peersRef.current.has(participant.peerId)) {
        const pc = getOrCreatePeer(participant.peerId, roomId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsService.getSocket().emit('webrtc:offer', {
          roomId,
          targetPeerId: participant.peerId,
          sdp: offer,
        });
      }
    }
  };

  const flushPendingSignals = async (roomId: string) => {
    const offers = [...pendingOffersRef.current];
    pendingOffersRef.current = [];
    for (const offer of offers) {
      await handleOffer(roomId, offer.fromPeerId, offer.sdp);
    }

    const iceCandidates = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const item of iceCandidates) {
      const pc = peersRef.current.get(item.fromPeerId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(item.candidate));
      }
    }
  };

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

  const handleOffer = async (roomId: string, fromPeerId: string, sdp: RTCSessionDescriptionInit) => {
    if (!myPeerIdRef.current) {
      pendingOffersRef.current.push({ fromPeerId, sdp });
      return;
    }

    const pc = getOrCreatePeer(fromPeerId, roomId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsService.getSocket().emit('webrtc:answer', { roomId, targetPeerId: fromPeerId, sdp: answer });
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

      socket.on('room:joined', async (payload: { roomId: string; peerId: string; participants: Array<Participant> }) => {
        if (payload.roomId !== room.id) return;
        myPeerIdRef.current = payload.peerId;
        await syncPeers(room.id, payload.participants);
        await flushPendingSignals(room.id);
      });

      socket.on('room:participants', async (payload: { roomId: string; participants: Array<Participant> }) => {
        if (payload.roomId !== room.id) return;
        await syncPeers(room.id, payload.participants);
      });

      socket.on(
        'webrtc:offer',
        async (payload: { fromPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
          if (!myPeerIdRef.current) {
            pendingOffersRef.current.push({ fromPeerId: payload.fromPeerId, sdp: payload.sdp });
            return;
          }
          if (payload.targetPeerId !== myPeerIdRef.current) return;
          await handleOffer(room.id, payload.fromPeerId, payload.sdp);
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
          if (!myPeerIdRef.current) {
            pendingIceRef.current.push({ fromPeerId: payload.fromPeerId, candidate: payload.candidate });
            return;
          }
          if (payload.targetPeerId !== myPeerIdRef.current) return;
          const pc = peersRef.current.get(payload.fromPeerId);
          if (!pc) {
            pendingIceRef.current.push({ fromPeerId: payload.fromPeerId, candidate: payload.candidate });
            return;
          }
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
    myPeerIdRef.current = null;
    pendingOffersRef.current = [];
    pendingIceRef.current = [];
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
        <h2>Видеокомната</h2>
        <Link to={`/courses/${courseId}`}>Назад к курсу</Link>
      </div>

      <div className="row">
        <button className={joined ? 'pressed' : ''} onClick={() => void joinRoom()} disabled={!room || joined}>
          Присоединиться
        </button>
        <button className={`secondary ${!micEnabled ? 'pressed' : ''}`} onClick={toggleMic} disabled={!joined}>
          {micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        </button>
        <button className={`secondary ${!camEnabled ? 'pressed' : ''}`} onClick={toggleCam} disabled={!joined}>
          {camEnabled ? 'Выключить камеру' : 'Включить камеру'}
        </button>
        <button className="danger" onClick={leaveRoom} disabled={!joined}>
          Выйти
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="video-room-layout">
        <div className="panel video-members">
          <h3>Участники ({participants.length})</h3>
          {participants.map((participant) => (
            <div key={participant.peerId} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{participant.user.nickname}</span>
            </div>
          ))}
        </div>

        <div className="panel video-stage">
          <div className="video-grid video-grid-large">
            <div>
              <strong>Вы</strong>
              <video ref={localVideoRef} autoPlay playsInline muted />
            </div>
            {participants
              .filter((participant) => participant.peerId !== myPeerIdRef.current)
              .map((participant) => (
                <div key={participant.peerId}>
                  <strong>{participant.user.nickname}</strong>
                  <RemoteVideo stream={remoteStreams[participant.peerId]} />
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
