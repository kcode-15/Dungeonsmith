import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getGetRoomVoiceStateQueryKey,
  useGetRoomVoiceState,
  useJoinRoomVoice,
  useLeaveRoomVoice,
  useSendRoomVoiceSignal,
  type VoiceParticipant,
  type VoiceSignalPayload,
} from "@workspace/api-client-react";
import { Mic, MicOff, Phone, PhoneOff, Radio, ShieldCheck, Volume2 } from "lucide-react";

type RoomVoiceProps = {
  code: string;
  displayName: string;
  kind: "dm" | "player";
};

type ConnectionBundle = {
  pc: RTCPeerConnection;
  queuedCandidates: RTCIceCandidateInit[];
};

function voiceErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone access was blocked. Allow it in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is busy in another app. Close it there, then try again.";
  }
  if (name === "SecurityError") {
    return "Microphone access needs a secure browser connection.";
  }
  return "Voice could not connect. Check your network and try again.";
}

function RoomVoice({ code, displayName, kind }: RoomVoiceProps) {
  const [participantId, setParticipantId] = useState("");
  const [joinedParticipant, setJoinedParticipant] = useState<VoiceParticipant | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [connectionNote, setConnectionNote] = useState("");
  const peersRef = useRef(new Map<string, ConnectionBundle>());
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const processedSignalsRef = useRef(new Set<string>());
  const offeredToRef = useRef(new Set<string>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantIdRef = useRef("");
  const mountedRef = useRef(true);

  const joinVoice = useJoinRoomVoice();
  const sendSignal = useSendRoomVoiceSignal();
  const leaveVoice = useLeaveRoomVoice();
  const voiceStateQuery = useGetRoomVoiceState(code, participantId, {
    query: {
      enabled: Boolean(participantId),
      queryKey: getGetRoomVoiceStateQueryKey(code, participantId),
      refetchInterval: 1000,
    },
  });
  const voiceState = voiceStateQuery.data;
  const participants = useMemo(() => {
    const list = voiceState?.participants ?? (joinedParticipant ? [joinedParticipant] : []);
    const merged = new Map<string, VoiceParticipant>();
    for (const person of [...(joinedParticipant ? [joinedParticipant] : []), ...list]) {
      merged.set(person.id, person);
    }
    return [...merged.values()].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }, [joinedParticipant, voiceState?.participants]);

  const send = useCallback(async (
    toParticipantId: string,
    type: "offer" | "answer" | "ice-candidate",
    payload: VoiceSignalPayload,
  ): Promise<void> => {
    const fromId = participantIdRef.current;
    if (!fromId || !toParticipantId) return;
    await sendSignal.mutateAsync({
      code,
      participantId: fromId,
      data: { toParticipantId, type, payload },
    });
  }, [code, sendSignal]);

  const disposeConnections = useCallback(() => {
    peersRef.current.forEach(({ pc }) => {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    });
    peersRef.current.clear();
    audioRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioRef.current.clear();
    offeredToRef.current.clear();
    processedSignalsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const leave = useCallback((notify = true) => {
    const id = participantIdRef.current;
    disposeConnections();
    participantIdRef.current = "";
    setParticipantId("");
    setJoinedParticipant(null);
    setMuted(false);
    setConnectionNote("");
    if (notify && id) {
      leaveVoice.mutate({ code, participantId: id });
    }
  }, [code, disposeConnections, leaveVoice]);

  const createPeer = useCallback((remoteId: string) => {
    const existing = peersRef.current.get(remoteId);
    if (existing) return existing;

    const pc = new RTCPeerConnection();
    const bundle: ConnectionBundle = { pc, queuedCandidates: [] };
    peersRef.current.set(remoteId, bundle);
    localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current as MediaStream));
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      void send(remoteId, "ice-candidate", {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      }).catch(() => setConnectionNote("A voice connection is still negotiating. Check your network if it does not connect."));
    };
    pc.ontrack = (event) => {
      let audio = audioRef.current.get(remoteId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.setAttribute("playsinline", "");
        audio.setAttribute("aria-label", "Remote voice audio");
        audio.dataset.testid = `audio-voice-${remoteId}`;
        document.body.appendChild(audio);
        audioRef.current.set(remoteId, audio);
      }
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      void audio.play().catch(() => setConnectionNote("Your browser paused incoming audio. Interact with the page to hear the table."));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setConnectionNote("A player’s connection is interrupted. Their browser may reconnect automatically.");
      } else if (pc.connectionState === "connected") {
        setConnectionNote("");
      }
    };
    return bundle;
  }, [send]);

  const flushCandidates = useCallback(async (bundle: ConnectionBundle) => {
    if (!bundle.pc.remoteDescription) return;
    const waiting = bundle.queuedCandidates.splice(0);
    for (const candidate of waiting) {
      await bundle.pc.addIceCandidate(candidate);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const id = participantIdRef.current;
      disposeConnections();
      participantIdRef.current = "";
      if (id) leaveVoice.mutate({ code, participantId: id });
    };
  }, [code, disposeConnections, leaveVoice]);

  useEffect(() => {
    if (!localStream || !participantId || !voiceState) return;
    const incoming = voiceState.signals ?? [];
    let cancelled = false;

    const processSignals = async () => {
      for (const signal of incoming) {
        if (cancelled || signal.fromParticipantId === participantId || processedSignalsRef.current.has(signal.id)) continue;
        processedSignalsRef.current.add(signal.id);
        try {
          const bundle = createPeer(signal.fromParticipantId);
          if (signal.type === "offer" && signal.payload.sdp) {
            await bundle.pc.setRemoteDescription({ type: "offer", sdp: signal.payload.sdp });
            await flushCandidates(bundle);
            const answer = await bundle.pc.createAnswer();
            await bundle.pc.setLocalDescription(answer);
            if (answer.sdp) await send(signal.fromParticipantId, "answer", { sdp: answer.sdp });
          } else if (signal.type === "answer" && signal.payload.sdp) {
            if (!bundle.pc.currentRemoteDescription) {
              await bundle.pc.setRemoteDescription({ type: "answer", sdp: signal.payload.sdp });
              await flushCandidates(bundle);
            }
          } else if (signal.type === "ice-candidate" && signal.payload.candidate) {
            const candidate: RTCIceCandidateInit = {
              candidate: signal.payload.candidate,
              sdpMid: signal.payload.sdpMid,
              sdpMLineIndex: signal.payload.sdpMLineIndex,
              usernameFragment: signal.payload.usernameFragment,
            };
            if (bundle.pc.remoteDescription) await bundle.pc.addIceCandidate(candidate);
            else bundle.queuedCandidates.push(candidate);
          }
        } catch {
          setConnectionNote("A voice connection could not be established. Check your network and rejoin.");
        }
      }
    };
    void processSignals();
    return () => { cancelled = true; };
  }, [createPeer, flushCandidates, localStream, participantId, send, voiceState]);

  useEffect(() => {
    if (!localStream || !participantId || !voiceState) return;
    const others = voiceState.participants.filter((person) => person.id !== participantId);
    for (const person of others) {
      if (participantId.localeCompare(person.id) >= 0 || offeredToRef.current.has(person.id)) continue;
      offeredToRef.current.add(person.id);
      const bundle = createPeer(person.id);
      void bundle.pc.createOffer()
        .then(async (offer) => {
          await bundle.pc.setLocalDescription(offer);
          if (offer.sdp) await send(person.id, "offer", { sdp: offer.sdp });
        })
        .catch(() => setConnectionNote("Could not reach another player. Check your network and try again."));
    }
  }, [createPeer, localStream, participantId, send, voiceState]);

  const handleJoin = async () => {
    if (working) return;
    setError("");
    setConnectionNote("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access a microphone. Try a current browser over a secure connection.");
      return;
    }
    setWorking(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const joined = await joinVoice.mutateAsync({ code });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        leaveVoice.mutate({ code, participantId: joined.participantId });
        return;
      }
      localStreamRef.current = stream;
      participantIdRef.current = joined.participantId;
      setLocalStream(stream);
      setParticipantId(joined.participantId);
      setJoinedParticipant(joined.participant);
    } catch (joinError) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(voiceErrorMessage(joinError));
    } finally {
      if (mountedRef.current) setWorking(false);
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  };

  const connected = Boolean(participantId);
  const visibleParticipants = participants.filter((person) => person.id !== participantId || Boolean(joinedParticipant));

  return (
    <section className="voice-panel" aria-labelledby="voice-title">
      <div className="panel-header voice-header">
        <div>
          <span className="section-kicker">VOICE CHANNEL</span>
          <h2 id="voice-title">Speak at the table</h2>
        </div>
        <span className={`voice-state ${connected ? "voice-state-live" : ""}`} data-testid="status-voice-connection">
          <i />
          {connected ? "CONNECTED" : "READY"}
        </span>
      </div>

      <div className="voice-intro">
        <span className="voice-emblem"><Radio size={18} /></span>
        <p>{connected ? "Your table is open. Audio travels directly between players." : "A quiet channel for the voices around your table."}</p>
      </div>

      {error && <div className="voice-alert" role="alert" data-testid="status-voice-error">{error}</div>}
      {connectionNote && <div className="voice-network-note" role="status" data-testid="status-voice-network">{connectionNote}</div>}
      {voiceStateQuery.isError && connected && <div className="voice-alert" role="alert" data-testid="status-voice-signaling-error">The voice channel lost contact with the room. Check your network and rejoin.</div>}

      {connected ? (
        <>
          <div className="voice-roster-heading"><span>IN THE CHANNEL</span><strong data-testid="text-voice-participant-count">{visibleParticipants.length}</strong></div>
          <div className="voice-roster" data-testid="list-voice-participants">
            {visibleParticipants.length ? visibleParticipants.map((person, index) => (
              <div className="voice-person" key={person.id} data-testid={`voice-participant-${person.id}`}>
                <span className={`voice-avatar voice-avatar-${index % 4}`}>{person.displayName.slice(0, 1).toUpperCase()}</span>
                <span className="voice-person-name"><strong>{person.displayName}{person.id === participantId ? " (you)" : ""}</strong><small>{person.kind === "dm" ? "Dungeon Master" : "Player"}</small></span>
                <span className={`voice-person-presence ${person.id === participantId ? (muted ? "is-muted" : "is-speaking-ready") : "is-connected"}`} title={person.id === participantId && muted ? "Muted" : "Connected"}>
                  {person.id === participantId && muted ? <MicOff size={13} /> : <Volume2 size={13} />}
                </span>
              </div>
            )) : <div className="voice-roster-loading" data-testid="status-voice-roster-loading"><span />Finding the rest of the party…</div>}
          </div>
          <div className="voice-controls">
            <button type="button" className={`voice-control voice-mute-control ${muted ? "voice-control-muted" : ""}`} onClick={toggleMute} data-testid="button-voice-mute" aria-pressed={muted}>
              {muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" className="voice-control voice-leave-control" onClick={() => leave()} data-testid="button-leave-voice">
              <PhoneOff size={16} /> Leave voice
            </button>
          </div>
          <p className="voice-privacy"><ShieldCheck size={13} /> Live peer-to-peer audio. Nothing is recorded or saved.</p>
        </>
      ) : (
        <>
          <div className="voice-notice"><ShieldCheck size={15} /><span>Your microphone stays off until you choose to join.</span></div>
          <button type="button" className="button button-primary voice-join-button" onClick={handleJoin} disabled={working} data-testid="button-join-voice">
            {working ? <span className="voice-loading-mark" /> : <Phone size={16} />}
            {working ? "Opening channel…" : "Join voice"}
          </button>
          <p className="voice-privacy"><ShieldCheck size={13} /> Live peer-to-peer audio. Nothing is recorded or saved.</p>
        </>
      )}
    </section>
  );
}

export default RoomVoice;
