import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourseVideoRoom, getVideoParticipants } from '../services/video.api';
import { useAuth } from '../hooks/useAuth';
import { wsService } from '../services/ws.service';

// ── Types ──────────────────────────────────────────────────

type Participant = {
  peerId: string;
  user: { id: string; nickname: string; fullName?: string | null };
};

type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { id: string; nickname: string; fullName?: string | null };
};

type PeerState = { micEnabled: boolean; camEnabled: boolean };

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const SPEAKING_THRESHOLD = 30;
const ANALYSER_FFT = 256;

// ── Remote video component ─────────────────────────────────

function RemoteVideo({ stream, speaking, micOn, camOn }: {
  stream?: MediaStream;
  speaking: boolean;
  micOn: boolean;
  camOn: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null;
    }
  }, [stream]);

  return (
    <div className={`video-tile ${speaking ? 'speaking' : ''}`}>
      <video ref={ref} autoPlay playsInline />
      <div className="video-tile-status">
        {!micOn && <i className="bi bi-mic-mute-fill" />}
        {!camOn && <i className="bi bi-camera-video-off-fill" />}
      </div>
    </div>
  );
}

// ── Main page component ────────────────────────────────────

export function VideoRoomPage() {
  const { courseId = '' } = useParams();
  const { token, user } = useAuth();

  // Room state
  const [room, setRoom] = useState<any | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const [participants, setParticipants] = useState<Array<Participant>>([]);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [kickedAt, setKickedAt] = useState<number | null>(null);

  // Local media
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [isForceMuted, setIsForceMuted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // WebRTC
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const myPeerIdRef = useRef<string | null>(null);
  const pendingOffersRef = useRef<Array<{ fromPeerId: string; sdp: RTCSessionDescriptionInit }>>([]);
  const pendingIceRef = useRef<Array<{ fromPeerId: string; candidate: RTCIceCandidateInit }>>([]);

  // Hand raise
  const [handRaisedPeers, setHandRaisedPeers] = useState<Set<string>>(new Set());
  const [myHandRaised, setMyHandRaised] = useState(false);

  // Speaking
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingIntervalRef = useRef<number | null>(null);

  // Peer states (mic/cam)
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});

  // Chat
  const [chatMessages, setChatMessages] = useState<Array<ChatMessage>>([]);
  const [chatInput, setChatInput] = useState('');
  const chatListRef = useRef<HTMLDivElement>(null);

  // UI toggles
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showChat, setShowChat] = useState(true);

  // Devices
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');

  // Role
  const [myRole, setMyRole] = useState<string>('student');

  // ── Load room ──────────────────────────────────────────

  useEffect(() => {
    if (!token || !courseId) return;
    getCourseVideoRoom(token, courseId).then((r) => {
      setRoom(r);
      roomIdRef.current = r?.id ?? null;
    }).catch(() => setRoom(null));
  }, [token, courseId]);

  // ── Kick cooldown ─────────────────────────────────────

  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (kickedAt === null) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, 30 - Math.floor((Date.now() - (kickedAt as number)) / 1000));
      setCooldownLeft(left);
      if (left <= 0) {
        setKickedAt(null);
        setError(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [kickedAt]);

  // ── Poll participants before joining ────────────────────

  useEffect(() => {
    if (!token || !room || joined) return;
    const refresh = () => {
      getVideoParticipants(token, room.id).then(setParticipants).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [token, room, joined]);

  // ── Cleanup on unmount ─────────────────────────────────

  useEffect(() => {
    return () => {
      if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
      wsService.disconnect();
      peersRef.current.forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Enumerate devices ──────────────────────────────────

  const loadDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setAvailableDevices(all);
    if (!selectedAudioDevice) {
      const firstMic = all.find((d) => d.kind === 'audioinput');
      if (firstMic) setSelectedAudioDevice(firstMic.deviceId);
    }
    if (!selectedVideoDevice) {
      const firstCam = all.find((d) => d.kind === 'videoinput');
      if (firstCam) setSelectedVideoDevice(firstCam.deviceId);
    }
  }, [selectedAudioDevice, selectedVideoDevice]);

  // ── Auto-scroll chat ───────────────────────────────────

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ── Speaking detection ─────────────────────────────────

  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_FFT;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyserRef.current = analyser;

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;

    speakingIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(buffer);
      const avg = buffer.reduce((s, v) => s + v, 0) / buffer.length;
      const speaking = avg > SPEAKING_THRESHOLD;

      if (speaking !== lastSpeaking) {
        lastSpeaking = speaking;
        const socket = wsService.getSocket();
        if (socket && socket.connected && room) {
          socket.emit('room:speaking', { roomId: room.id, speaking });
        }
      }
    }, 300);
  }, [room]);

  // ── Sync peers (mesh) ──────────────────────────────────

  const getOrCreatePeer = useCallback((targetPeerId: string, roomId: string) => {
    const existing = peersRef.current.get(targetPeerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(rtcConfig);

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      wsService.getSocket().emit('webrtc:ice', { roomId, targetPeerId, candidate: event.candidate });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStreams((prev) => ({ ...prev, [targetPeerId]: stream }));
    };

    peersRef.current.set(targetPeerId, pc);
    return pc;
  }, []);

  const syncPeers = useCallback(async (roomId: string, nextParticipants: Array<Participant>) => {
    const myPeerId = myPeerIdRef.current;
    if (!myPeerId) return;

    setParticipants(nextParticipants);

    const activePeerIds = new Set(
      nextParticipants.map((p) => p.peerId).filter((id) => id !== myPeerId),
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

    for (const p of nextParticipants) {
      if (p.peerId === myPeerId) continue;
      if (myPeerId < p.peerId && !peersRef.current.has(p.peerId)) {
        const pc = getOrCreatePeer(p.peerId, roomId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsService.getSocket().emit('webrtc:offer', { roomId, targetPeerId: p.peerId, sdp: offer });
      }
    }
  }, [getOrCreatePeer]);

  const handleOffer = useCallback(async (roomId: string, fromPeerId: string, sdp: RTCSessionDescriptionInit) => {
    if (!myPeerIdRef.current) {
      pendingOffersRef.current.push({ fromPeerId, sdp });
      return;
    }
    const pc = getOrCreatePeer(fromPeerId, roomId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsService.getSocket().emit('webrtc:answer', { roomId, targetPeerId: fromPeerId, sdp: answer });
  }, [getOrCreatePeer]);

  const flushPendingSignals = useCallback(async (roomId: string) => {
    const offers = [...pendingOffersRef.current];
    pendingOffersRef.current = [];
    for (const o of offers) {
      await handleOffer(roomId, o.fromPeerId, o.sdp);
    }
    const ice = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const item of ice) {
      const pc = peersRef.current.get(item.fromPeerId);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(item.candidate));
    }
  }, [handleOffer]);

  // ── Join room ──────────────────────────────────────────

  const joinRoom = async () => {
    if (!token || !room || !user || joined) return;
    setError(null);

    // Clean up any preview stream from device settings
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
        audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      startSpeakingDetection(stream);

      const socket = wsService.connect(token);

      socket.off('connect');
      socket.off('room:error');
      socket.off('room:joined');
      socket.off('room:participants');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice');
      socket.off('room:hand-raised');
      socket.off('room:hand-lowered');
      socket.off('room:speaking');
      socket.off('room:chat:message');
      socket.off('room:state-change');
      socket.off('room:force-mute');
      socket.off('room:kicked');
      socket.off('disconnect');

      const joinCurrentRoom = () => socket.emit('room:join', { roomId: room.id });

      socket.on('connect', joinCurrentRoom);
      socket.on('room:error', (event: { message: string }) => setError(event.message));

      socket.on('room:joined', async (payload: {
        roomId: string; peerId: string; participants: Array<Participant>; role?: string;
      }) => {
        if (payload.roomId !== room.id) return;
        myPeerIdRef.current = payload.peerId;
        if (payload.role) setMyRole(payload.role);
        await syncPeers(room.id, payload.participants);
        await flushPendingSignals(room.id);
      });

      socket.on('room:participants', async (payload: { roomId: string; participants: Array<Participant> }) => {
        if (payload.roomId !== room.id) return;
        await syncPeers(room.id, payload.participants);
      });

      socket.on('webrtc:offer', async (payload: {
        fromPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit;
      }) => {
        if (!myPeerIdRef.current) {
          pendingOffersRef.current.push({ fromPeerId: payload.fromPeerId, sdp: payload.sdp });
          return;
        }
        if (payload.targetPeerId !== myPeerIdRef.current) return;
        await handleOffer(room.id, payload.fromPeerId, payload.sdp);
      });

      socket.on('webrtc:answer', async (payload: {
        fromPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit;
      }) => {
        if (!myPeerIdRef.current || payload.targetPeerId !== myPeerIdRef.current) return;
        const pc = peersRef.current.get(payload.fromPeerId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      });

      socket.on('webrtc:ice', async (payload: {
        fromPeerId: string; targetPeerId: string; candidate: RTCIceCandidateInit;
      }) => {
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
      });

      // -- New events --

      socket.on('room:hand-raised', (payload: { userId: string }) => {
        setHandRaisedPeers((prev) => new Set(prev).add(payload.userId));
      });

      socket.on('room:hand-lowered', (payload: { userId: string }) => {
        setHandRaisedPeers((prev) => {
          const next = new Set(prev);
          next.delete(payload.userId);
          return next;
        });
      });

      socket.on('room:speaking', (payload: { userId: string; speaking: boolean }) => {
        setSpeakingPeers((prev) => {
          const next = new Set(prev);
          if (payload.speaking) next.add(payload.userId);
          else next.delete(payload.userId);
          return next;
        });
      });

      socket.on('room:chat:message', (msg: ChatMessage) => {
        setChatMessages((prev) => [...prev, msg]);
      });

      socket.on('room:state-change', (payload: {
        userId: string; micEnabled?: boolean; camEnabled?: boolean;
      }) => {
        const matching = participants.find((p) => p.user.id === payload.userId);
        const peerId = matching?.peerId;
        if (!peerId) return;
        setPeerStates((prev) => ({
          ...prev,
          [peerId]: {
            micEnabled: payload.micEnabled ?? prev[peerId]?.micEnabled ?? true,
            camEnabled: payload.camEnabled ?? prev[peerId]?.camEnabled ?? true,
          },
        }));
      });

      socket.on('room:force-mute', (payload: { userId: string }) => {
        if (payload.userId === user?.id) {
          const track = localStreamRef.current?.getAudioTracks()[0];
          if (track) { track.enabled = false; }
          setMicEnabled(false);
          setIsForceMuted(true);
          emitState({ micEnabled: false });
        } else {
          const p = participants.find((pp) => pp.user.id === payload.userId);
          if (p) setPeerStates((prev) => ({ ...prev, [p.peerId]: { ...prev[p.peerId] ?? { micEnabled: true, camEnabled: true }, micEnabled: false } }));
        }
      });

      socket.on('room:force-unmute', (payload: { userId: string }) => {
        if (payload.userId === user?.id) {
          const track = localStreamRef.current?.getAudioTracks()[0];
          if (track) { track.enabled = true; }
          setMicEnabled(true);
          setIsForceMuted(false);
          emitState({ micEnabled: true });
        } else {
          const p = participants.find((pp) => pp.user.id === payload.userId);
          if (p) setPeerStates((prev) => ({ ...prev, [p.peerId]: { ...prev[p.peerId] ?? { micEnabled: true, camEnabled: true }, micEnabled: true } }));
        }
      });

      socket.on('room:kicked', () => {
        // Direct cleanup — no dependency on closure state
        peersRef.current.forEach((pc) => pc.close());
        peersRef.current.clear();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (speakingIntervalRef.current) {
          clearInterval(speakingIntervalRef.current);
          speakingIntervalRef.current = null;
        }
        if (analyserRef.current) {
          analyserRef.current.disconnect();
          analyserRef.current = null;
        }
        myPeerIdRef.current = null;
        pendingOffersRef.current = [];
        pendingIceRef.current = [];
        wsService.disconnect();
        setJoined(false);
        setParticipants([]);
        setRemoteStreams({});
        setChatMessages([]);
        setHandRaisedPeers(new Set());
        setSpeakingPeers(new Set());
        setPeerStates({});
        setMyHandRaised(false);
        setIsForceMuted(false);
        setKickedAt(Date.now());
        setError('Преподаватель отключил вас от видеокомнаты');
      });

      socket.on('disconnect', () => {
        // Socket disconnected — clean up peers
        setError('Соединение с сервером потеряно. Попробуйте переподключиться.');
      });

      if (socket.connected) {
        joinCurrentRoom();
      }

      setJoined(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Keep grid video synced with local stream (element mounts after room:joined)
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [joined, participants]);

  // ── Leave room ─────────────────────────────────────────

  const leaveRoom = (kicked = false) => {
    if (!room || !joined) return;
    if (!kicked) {
      setShowExitConfirm(false);
    }
    const socket = wsService.getSocket();
    socket.emit('room:leave', { roomId: room.id });
    setJoined(false);
    setParticipants([]);
    setRemoteStreams({});
    setChatMessages([]);
    setHandRaisedPeers(new Set());
    setSpeakingPeers(new Set());
    setPeerStates({});
    setMyHandRaised(false);
    setIsForceMuted(false);
    myPeerIdRef.current = null;
    pendingOffersRef.current = [];
    pendingIceRef.current = [];
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
  };

  // ── Toggle mic/cam ─────────────────────────────────────

  const toggleMic = () => {
    if (isForceMuted) return;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
    emitState({ micEnabled: track.enabled });
  };

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamEnabled(track.enabled);
    emitState({ camEnabled: track.enabled });
  };

  const emitState = (partial: { micEnabled?: boolean; camEnabled?: boolean }) => {
    if (!room || !joined) return;
    wsService.getSocket().emit('room:state-change', { roomId: room.id, ...partial });
  };

  // ── Raise hand ─────────────────────────────────────────

  const toggleRaiseHand = () => {
    if (!room || !joined) return;
    if (myHandRaised) {
      wsService.getSocket().emit('room:lower-hand', { roomId: room.id });
      setMyHandRaised(false);
    } else {
      wsService.getSocket().emit('room:raise-hand', { roomId: room.id });
      setMyHandRaised(true);
    }
  };

  // ── Chat ───────────────────────────────────────────────

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !room || !joined) return;
    wsService.getSocket().emit('room:chat:message', { roomId: room.id, content: text });
    setChatInput('');
  };

  // ── Moderation ─────────────────────────────────────────

  const canModerate = myRole === 'admin' || myRole === 'teacher';

  const mutePeer = (targetUserId: string) => {
    if (!room) return;
    wsService.getSocket().emit('room:mute-peer', { roomId: room.id, targetUserId });
  };

  const unmutePeer = (targetUserId: string) => {
    if (!room) return;
    wsService.getSocket().emit('room:unmute-peer', { roomId: room.id, targetUserId });
  };

  const kickPeer = (targetUserId: string) => {
    if (!room) return;
    wsService.getSocket().emit('room:kick-peer', { roomId: room.id, targetUserId });
  };

  // ── Local video tile ───────────────────────────────────

  const localPeerState: PeerState = { micEnabled, camEnabled };

  // ── Render: Device settings modal ──────────────────────

  const audioInputs = availableDevices.filter((d) => d.kind === 'audioinput');
  const videoInputs = availableDevices.filter((d) => d.kind === 'videoinput');

  return (
    <div className="page col">
      {/* Top bar */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Видеокомната</h2>
        <div className="row" style={{ gap: 8 }}>
          {joined && (
            <>
              <button
                title={showChat ? 'Скрыть чат' : 'Показать чат'}
                onClick={() => setShowChat((v) => !v)}
              >
                <i className={`bi ${showChat ? 'bi-chat-dots-fill' : 'bi-chat-dots'}`} />{' '}
                {showChat ? 'Чат' : 'Чат'}
              </button>
            </>
          )}
          <Link to={`/courses/${courseId}`} className="link-button">Назад к курсу</Link>
        </div>
      </div>

      {/* Control bar */}
      <div className="row video-controls" style={{ gap: 8, flexWrap: 'wrap' }}>
        {!joined ? (
          <button onClick={async () => {
            await loadDevices();
            setShowDeviceSettings(true);
          }} disabled={!room || cooldownLeft > 0}>
            <i className="bi bi-box-arrow-in-right" />{' '}
            {cooldownLeft > 0 ? `Присоединиться (через ${cooldownLeft}с)` : 'Присоединиться'}
          </button>
        ) : (
          <>
            <button
              className="danger"
              onClick={() => setShowExitConfirm(true)}
            >
              <i className="bi bi-box-arrow-right" /> Выйти
            </button>
            <button
              className={micEnabled ? 'secondary' : 'pressed'}
              onClick={toggleMic}
              disabled={isForceMuted}
              title={isForceMuted ? 'Микрофон отключён преподавателем' : micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
            >
              <i className={`bi ${isForceMuted ? 'bi-mic-mute-fill' : micEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill'}`}
                 style={isForceMuted ? { color: 'var(--danger)' } : undefined} />{' '}
              {isForceMuted ? 'Микрофон заблокирован' : micEnabled ? 'Микрофон' : 'Микрофон выкл'}
            </button>
            <button
              className={camEnabled ? 'secondary' : 'pressed'}
              onClick={toggleCam}
            >
              <i className={`bi ${camEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'}`} />{' '}
              {camEnabled ? 'Камера' : 'Камера выкл'}
            </button>
            <button
              className={myHandRaised ? 'pressed' : 'secondary'}
              onClick={toggleRaiseHand}
              title={myHandRaised ? 'Опустить руку' : 'Поднять руку'}
            >
              <i className={`bi ${myHandRaised ? 'bi-hand-index-thumb-fill' : 'bi-hand-index-thumb'}`} />{' '}
              {myHandRaised ? 'Рука поднята' : 'Поднять руку'}
            </button>
            <button
              className="secondary"
              onClick={async () => { await loadDevices(); setShowDeviceSettings(true); }}
              title="Настройки устройств"
            >
              <i className="bi bi-gear-fill" /> Настройки
            </button>
          </>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', margin: '8px 0 0 0' }}>{error}</p>}

      {/* Device settings modal */}
      {showDeviceSettings && (
        <div className="modal-backdrop" onClick={() => setShowDeviceSettings(false)}>
          <div className="modal-panel" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>Настройки устройств</h3>

            {!joined && (
              <div className="col" style={{ gap: 4, marginBottom: 12 }}>
                <div className="video-tile" style={{ maxWidth: 320, alignSelf: 'center' }}>
                  <video ref={previewVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 6 }} />
                </div>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      if (localStreamRef.current) {
                        localStreamRef.current.getTracks().forEach((t) => t.stop());
                      }
                      const s = await navigator.mediaDevices.getUserMedia({
                        video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
                        audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true,
                      });
                      localStreamRef.current = s;
                      if (previewVideoRef.current) previewVideoRef.current.srcObject = s;
                      await loadDevices();
                    } catch { /* ignore */ }
                  }}
                  style={{ alignSelf: 'center' }}
                >
                  <i className="bi bi-arrow-repeat" /> Обновить предпросмотр
                </button>
              </div>
            )}

            <label className="col" style={{ gap: 4, marginBottom: 10 }}>
              <strong>Камера</strong>
              <select
                value={selectedVideoDevice}
                onChange={(e) => setSelectedVideoDevice(e.target.value)}
                disabled={joined}
              >
                {videoInputs.length === 0 && <option value="">Камеры не найдены</option>}
                {videoInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Камера ${d.deviceId.slice(0, 8)}...`}</option>
                ))}
              </select>
            </label>

            <label className="col" style={{ gap: 4, marginBottom: 12 }}>
              <strong>Микрофон</strong>
              <select
                value={selectedAudioDevice}
                onChange={(e) => setSelectedAudioDevice(e.target.value)}
                disabled={joined}
              >
                {audioInputs.length === 0 && <option value="">Микрофоны не найдены</option>}
                {audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Микрофон ${d.deviceId.slice(0, 8)}...`}</option>
                ))}
              </select>
            </label>

            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setShowDeviceSettings(false)}>
                {joined ? 'Закрыть' : 'Отмена'}
              </button>
              {!joined && (
                <button onClick={() => { setShowDeviceSettings(false); joinRoom(); }}>
                  Присоединиться
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Exit confirmation */}
      {showExitConfirm && (
        <div className="modal-backdrop" onClick={() => setShowExitConfirm(false)}>
          <div className="modal-panel" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <h3>Выйти из видеокомнаты?</h3>
            <p>Вы уверены, что хотите выйти? Ваше видео и аудио будут отключены.</p>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setShowExitConfirm(false)}>Отмена</button>
              <button className="danger" onClick={() => leaveRoom()}>Выйти</button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className={`video-room-layout ${!showChat || !joined ? 'video-room-layout-no-chat' : ''}`} style={{ flex: 1, minHeight: 0 }}>
        {/* Left: Participants */}
        <div className="panel video-members">
          <h3>
            <i className="bi bi-people-fill" /> Участники ({participants.length})
            {myHandRaised && <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>— ваша рука поднята</span>}
          </h3>
          {participants.length === 0 && <p className="muted">Пока никого нет</p>}
          {participants.map((p) => {
            const isSelf = p.peerId === myPeerIdRef.current;
            const state = isSelf ? localPeerState : (peerStates[p.peerId] ?? { micEnabled: true, camEnabled: true });
            const handRaised = p.user.id === user?.id ? myHandRaised : handRaisedPeers.has(p.user.id);
            const speaking = p.user.id !== user?.id && speakingPeers.has(p.user.id);

            return (
              <div key={p.peerId} className={`participant-row ${speaking ? 'participant-speaking' : ''}`}>
                <div className="col" style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.user.fullName || p.user.nickname}
                    </span>
                    {handRaised && <i className="bi bi-hand-index-thumb-fill" style={{ color: 'var(--accent)' }} title="Поднята рука" />}
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>@{p.user.nickname}</span>
                </div>
                <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span title={state.micEnabled ? 'Микрофон вкл' : 'Микрофон выкл'}>
                    <i className={`bi ${state.micEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill'}`}
                       style={{ opacity: state.micEnabled ? 0.7 : 0.3, fontSize: 14 }} />
                  </span>
                  <span title={state.camEnabled ? 'Камера вкл' : 'Камера выкл'}>
                    <i className={`bi ${state.camEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'}`}
                       style={{ opacity: state.camEnabled ? 0.7 : 0.3, fontSize: 14 }} />
                  </span>
                  {canModerate && !isSelf && (
                    <>
                      {state.micEnabled ? (
                        <button
                          className="icon-ghost-button"
                          title="Выключить микрофон"
                          onClick={() => mutePeer(p.user.id)}
                        >
                          <i className="bi bi-mic-mute" style={{ fontSize: 14 }} />
                        </button>
                      ) : (
                        <button
                          className="icon-ghost-button"
                          title="Включить микрофон"
                          onClick={() => unmutePeer(p.user.id)}
                        >
                          <i className="bi bi-mic-fill" style={{ fontSize: 14, color: 'var(--accent)' }} />
                        </button>
                      )}
                      <button
                        className="icon-ghost-button"
                        title="Отключить от комнаты"
                        onClick={() => kickPeer(p.user.id)}
                      >
                        <i className="bi bi-person-x-fill" style={{ fontSize: 14, color: 'var(--danger)' }} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center: Video grid */}
        <div className="panel video-stage col">
          {!joined && participants.length === 0 && (
            <div className="col" style={{ alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--muted)' }}>
              <i className="bi bi-camera-video-off" style={{ fontSize: 48 }} />
              <p>Нажмите «Присоединиться», чтобы войти в видеокомнату</p>
            </div>
          )}

          <div className="video-grid video-grid-large">
            {myPeerIdRef.current && (
              <div>
                <strong>Вы {myHandRaised && <i className="bi bi-hand-index-thumb-fill" style={{ color: 'var(--accent)', fontSize: 13 }} />}</strong>
                <div className={`video-tile ${!camEnabled ? 'video-off' : ''}`}>
                  <video ref={localVideoRef} autoPlay playsInline muted />
                  <div className="video-tile-status">
                    {!micEnabled && <i className="bi bi-mic-mute-fill" />}
                    {!camEnabled && <i className="bi bi-camera-video-off-fill" />}
                  </div>
                </div>
              </div>
            )}
            {participants
              .filter((p) => p.peerId !== myPeerIdRef.current)
              .map((p) => {
                const state = peerStates[p.peerId] ?? { micEnabled: true, camEnabled: true };
                const speaking = speakingPeers.has(p.user.id);
                const handRaised = handRaisedPeers.has(p.user.id);
                return (
                  <div key={p.peerId}>
                    <strong>
                      {p.user.fullName || p.user.nickname}{' '}
                      {handRaised && <i className="bi bi-hand-index-thumb-fill" style={{ color: 'var(--accent)', fontSize: 13 }} />}
                    </strong>
                    <RemoteVideo
                      stream={remoteStreams[p.peerId]}
                      speaking={speaking}
                      micOn={state.micEnabled}
                      camOn={state.camEnabled}
                    />
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right: Chat panel */}
        {showChat && joined && (
          <div className="panel col" style={{ maxHeight: '100%', overflow: 'hidden' }}>
            <h3><i className="bi bi-chat-dots-fill" /> Чат</h3>
            <div className="video-chat-messages" ref={chatListRef}>
              {chatMessages.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Сообщений пока нет</p>}
              {chatMessages.map((msg) => (
                <div key={msg.id} className="chat-message-item">
                  <strong>{msg.user.fullName || msg.user.nickname}</strong>{' '}
                  <span className="muted" style={{ fontSize: 11 }}>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                  <div style={{ wordBreak: 'break-word' }}>{msg.content}</div>
                </div>
              ))}
            </div>
            <div className="chat-compose-row" style={{ marginTop: 8 }}>
              <input
                placeholder="Сообщение..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              />
              <button onClick={sendChat} disabled={!chatInput.trim()}>
                <i className="bi bi-send-fill" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
