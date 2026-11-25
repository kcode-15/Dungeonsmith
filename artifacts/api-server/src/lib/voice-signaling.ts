import { randomUUID } from "node:crypto";
import type {
  VoiceParticipant,
  VoiceParticipantKind,
  VoiceSignal,
  VoiceSignalInput,
  VoiceSignalInputType,
  VoiceSignalPayload,
} from "@workspace/api-zod";

const PARTICIPANT_TTL_MS = 30_000;
const SIGNAL_TTL_MS = 25_000;
const MAX_PARTICIPANTS_PER_ROOM = 8;
const MAX_PENDING_SIGNALS = 80;
const CLEANUP_INTERVAL_MS = 15_000;

type VoiceSession = {
  actorKey: string;
  participant: VoiceParticipant;
  lastSeenAt: number;
  pendingSignals: VoiceSignal[];
};

type VoiceRoom = Map<string, VoiceSession>;
type JoinParticipant = Pick<VoiceParticipant, "displayName" | "kind">;

const voiceRooms = new Map<string, VoiceRoom>();

function getOrCreateRoom(roomId: string): VoiceRoom {
  let room = voiceRooms.get(roomId);
  if (!room) {
    room = new Map();
    voiceRooms.set(roomId, room);
  }
  return room;
}

function removeExpiredSessions(roomId: string, now: number): VoiceRoom | undefined {
  const room = voiceRooms.get(roomId);
  if (!room) return undefined;

  const expiredIds = new Set(
    [...room.values()]
      .filter((session) => now - session.lastSeenAt > PARTICIPANT_TTL_MS)
      .map((session) => session.participant.id),
  );

  for (const participantId of expiredIds) {
    room.delete(participantId);
  }

  for (const session of room.values()) {
    session.pendingSignals = session.pendingSignals.filter(
      (signal) =>
        now - signal.createdAt.getTime() <= SIGNAL_TTL_MS &&
        !expiredIds.has(signal.fromParticipantId),
    );
  }

  if (room.size === 0) {
    voiceRooms.delete(roomId);
    return undefined;
  }

  return room;
}

function cleanupAllRooms(now: number): void {
  for (const roomId of voiceRooms.keys()) {
    removeExpiredSessions(roomId, now);
  }
}

const cleanupTimer = setInterval(
  () => cleanupAllRooms(Date.now()),
  CLEANUP_INTERVAL_MS,
);
cleanupTimer.unref?.();

export function joinVoiceRoom(
  roomId: string,
  actorKey: string,
  participantDetails: JoinParticipant,
  now = Date.now(),
): { participantId: string; participant: VoiceParticipant; participants: VoiceParticipant[] } | null {
  const room = removeExpiredSessions(roomId, now) ?? getOrCreateRoom(roomId);
  if (room.size >= MAX_PARTICIPANTS_PER_ROOM) return null;

  const participant: VoiceParticipant = {
    id: randomUUID(),
    displayName: participantDetails.displayName,
    kind: participantDetails.kind as VoiceParticipantKind,
    joinedAt: new Date(now),
  };

  room.set(participant.id, {
    actorKey,
    participant,
    lastSeenAt: now,
    pendingSignals: [],
  });

  return {
    participantId: participant.id,
    participant,
    participants: [...room.values()].map((session) => session.participant),
  };
}

export function getVoiceRoomState(
  roomId: string,
  participantId: string,
  actorKey: string,
  now = Date.now(),
):
  | { status: "ok"; state: { participantId: string; participants: VoiceParticipant[]; signals: VoiceSignal[] } }
  | { status: "not_found" }
  | { status: "forbidden" } {
  const room = removeExpiredSessions(roomId, now);
  const session = room?.get(participantId);
  if (!room || !session) return { status: "not_found" };
  if (session.actorKey !== actorKey) return { status: "forbidden" };

  session.lastSeenAt = now;
  return {
    status: "ok",
    state: {
      participantId,
      participants: [...room.values()].map((entry) => entry.participant),
      signals: session.pendingSignals,
    },
  };
}

export function queueVoiceSignal(
  roomId: string,
  participantId: string,
  actorKey: string,
  input: VoiceSignalInput,
  now = Date.now(),
):
  | { status: "ok"; signal: VoiceSignal }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "recipient_not_found" }
  | { status: "self_signal" }
  | { status: "queue_full" } {
  const room = removeExpiredSessions(roomId, now);
  const sender = room?.get(participantId);
  if (!room || !sender) return { status: "not_found" };
  if (sender.actorKey !== actorKey) return { status: "forbidden" };
  if (input.toParticipantId === participantId) return { status: "self_signal" };

  const recipient = room.get(input.toParticipantId);
  if (!recipient) return { status: "recipient_not_found" };
  if (recipient.pendingSignals.length >= MAX_PENDING_SIGNALS) {
    return { status: "queue_full" };
  }

  sender.lastSeenAt = now;
  const signal: VoiceSignal = {
    id: randomUUID(),
    fromParticipantId: participantId,
    type: input.type as VoiceSignalInputType,
    payload: { ...input.payload } as VoiceSignalPayload,
    createdAt: new Date(now),
  };
  recipient.pendingSignals.push(signal);

  return { status: "ok", signal };
}

export function leaveVoiceRoom(
  roomId: string,
  participantId: string,
  actorKey: string,
  now = Date.now(),
): "ok" | "not_found" | "forbidden" {
  const room = removeExpiredSessions(roomId, now);
  const session = room?.get(participantId);
  if (!room || !session) return "not_found";
  if (session.actorKey !== actorKey) return "forbidden";

  room.delete(participantId);
  for (const remaining of room.values()) {
    remaining.pendingSignals = remaining.pendingSignals.filter(
      (signal) => signal.fromParticipantId !== participantId,
    );
  }
  if (room.size === 0) voiceRooms.delete(roomId);
  return "ok";
}
