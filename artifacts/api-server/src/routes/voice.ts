import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  GetRoomVoiceStateParams,
  GetRoomVoiceStateResponse,
  JoinRoomVoiceParams,
  JoinRoomVoiceResponse,
  LeaveRoomVoiceParams,
  SendRoomVoiceSignalBody,
  SendRoomVoiceSignalParams,
  SendRoomVoiceSignalResponse,
} from "@workspace/api-zod";
import { getPlayerForRequest, getRoom } from "../lib/tabletop-access";
import {
  getVoiceRoomState,
  joinVoiceRoom,
  leaveVoiceRoom,
  queueVoiceSignal,
} from "../lib/voice-signaling";

const router: IRouter = Router();

type VoiceActor = {
  key: string;
  kind: "dm" | "player";
  displayName: string;
};

async function getRoomAndActor(req: Parameters<typeof getPlayerForRequest>[0], code: string) {
  const normalizedCode = code.toUpperCase();
  const room = await getRoom(normalizedCode);
  if (!room) return { status: "room_not_found" as const };

  const userId = getAuth(req).userId;
  if (userId && userId === room.ownerId) {
    return {
      status: "ok" as const,
      room,
      actor: {
        key: `dm:${userId}`,
        kind: "dm" as const,
        displayName: "Dungeon Master",
      } satisfies VoiceActor,
    };
  }

  const player = await getPlayerForRequest(req, room.id, normalizedCode);
  if (player) {
    return {
      status: "ok" as const,
      room,
      actor: {
        key: `player:${player.id}`,
        kind: "player" as const,
        displayName: player.characterName,
      } satisfies VoiceActor,
    };
  }

  return { status: "unauthorized" as const };
}

router.post("/rooms/:code/voice/join", async (req, res): Promise<void> => {
  const params = JoinRoomVoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const access = await getRoomAndActor(req, params.data.code);
  if (access.status === "room_not_found") {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (access.status === "unauthorized") {
    res.status(401).json({ error: "Join this room before entering voice" });
    return;
  }

  const joined = joinVoiceRoom(
    access.room.id,
    access.actor.key,
    { kind: access.actor.kind, displayName: access.actor.displayName },
  );
  if (!joined) {
    res.status(409).json({ error: "This room has reached its voice participant limit" });
    return;
  }

  res.status(201).json(JoinRoomVoiceResponse.parse(joined));
});

router.get(
  "/rooms/:code/voice/participants/:participantId/state",
  async (req, res): Promise<void> => {
    const params = GetRoomVoiceStateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const access = await getRoomAndActor(req, params.data.code);
    if (access.status === "room_not_found") {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (access.status === "unauthorized") {
      res.status(401).json({ error: "Join this room before entering voice" });
      return;
    }

    const result = getVoiceRoomState(
      access.room.id,
      params.data.participantId,
      access.actor.key,
    );
    if (result.status === "not_found") {
      res.status(404).json({ error: "Voice session not found" });
      return;
    }
    if (result.status === "forbidden") {
      res.status(403).json({ error: "This voice session belongs to another room member" });
      return;
    }

    res.json(GetRoomVoiceStateResponse.parse(result.state));
  },
);

router.post(
  "/rooms/:code/voice/participants/:participantId/signals",
  async (req, res): Promise<void> => {
    const params = SendRoomVoiceSignalParams.safeParse(req.params);
    const body = SendRoomVoiceSignalBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : body.error.message,
      });
      return;
    }

    const { type, payload } = body.data;
    const payloadIsUsable =
      type === "ice-candidate"
        ? typeof payload.candidate === "string" && payload.candidate.length > 0
        : typeof payload.sdp === "string" && payload.sdp.length > 0;
    if (!payloadIsUsable) {
      res.status(400).json({ error: "The signal is missing its required connection details" });
      return;
    }

    const access = await getRoomAndActor(req, params.data.code);
    if (access.status === "room_not_found") {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (access.status === "unauthorized") {
      res.status(401).json({ error: "Join this room before entering voice" });
      return;
    }

    const result = queueVoiceSignal(
      access.room.id,
      params.data.participantId,
      access.actor.key,
      body.data,
    );
    if (result.status === "not_found" || result.status === "recipient_not_found") {
      res.status(404).json({ error: "Voice participant not found" });
      return;
    }
    if (result.status === "forbidden") {
      res.status(403).json({ error: "This voice session belongs to another room member" });
      return;
    }
    if (result.status === "self_signal") {
      res.status(400).json({ error: "A voice participant cannot signal itself" });
      return;
    }
    if (result.status === "queue_full") {
      res.status(429).json({ error: "Too many pending voice signals" });
      return;
    }

    res.status(202).json(SendRoomVoiceSignalResponse.parse(result.signal));
  },
);

router.delete(
  "/rooms/:code/voice/participants/:participantId",
  async (req, res): Promise<void> => {
    const params = LeaveRoomVoiceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const access = await getRoomAndActor(req, params.data.code);
    if (access.status === "room_not_found") {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (access.status === "unauthorized") {
      res.status(401).json({ error: "Join this room before entering voice" });
      return;
    }

    const result = leaveVoiceRoom(
      access.room.id,
      params.data.participantId,
      access.actor.key,
    );
    if (result === "not_found") {
      res.status(404).json({ error: "Voice session not found" });
      return;
    }
    if (result === "forbidden") {
      res.status(403).json({ error: "This voice session belongs to another room member" });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;
