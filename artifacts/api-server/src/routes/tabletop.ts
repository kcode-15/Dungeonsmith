import { randomBytes, randomInt } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import {
  count,
  desc,
  eq,
} from "drizzle-orm";
import {
  CreateRoomBody,
  CreateRoomResponse,
  GetRoomByCodeParams,
  GetRoomByCodeResponse,
  JoinRoomBody,
  JoinRoomParams,
  JoinRoomResponse,
  ListDmRoomsResponse,
  ListRoomMessagesParams,
  ListRoomMessagesResponse,
  SendRoomMessageBody,
  SendRoomMessageParams,
  SendRoomMessageResponse,
  UpdateRoomMapBody,
  UpdateRoomMapParams,
  UpdateRoomMapResponse,
} from "@workspace/api-zod";
import {
  db,
  messagesTable,
  playersTable,
  roomsTable,
  type RoomMap,
} from "@workspace/db";
import {
  getPlayerForRequest,
  getRoom,
  hashToken,
  isRoomOwner,
  roomCookieName,
} from "../lib/tabletop-access";

const router: IRouter = Router();
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const requireAuth: RequestHandler = (req, res, next): void => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function newRoomCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
}

function createDefaultMap(): RoomMap {
  const width = 20;
  const height = 14;
  const tiles = Array.from({ length: width * height }, () => "grass");
  for (let x = 0; x < width; x += 1) {
    tiles[x] = "stone";
    tiles[(height - 1) * width + x] = "stone";
  }
  for (let y = 0; y < height; y += 1) {
    tiles[y * width] = "stone";
    tiles[y * width + width - 1] = "stone";
  }
  return { width, height, tiles };
}

function toPlayer(player: typeof playersTable.$inferSelect) {
  return {
    id: player.id,
    characterName: player.characterName,
    joinedAt: player.joinedAt.toISOString(),
  };
}

function toMessage(message: typeof messagesTable.$inferSelect) {
  return {
    id: message.id,
    characterName: message.characterName,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function toRoomSummary(
  room: typeof roomsTable.$inferSelect,
  playerCount: number,
) {
  return {
    id: room.id,
    title: room.title,
    code: room.code,
    playerCount,
    createdAt: room.createdAt.toISOString(),
  };
}

router.get("/dm/rooms", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.ownerId, userId))
    .orderBy(desc(roomsTable.createdAt));
  const counts = await db
    .select({ roomId: playersTable.roomId, count: count() })
    .from(playersTable)
    .groupBy(playersTable.roomId);
  const countByRoom = new Map(counts.map((item) => [item.roomId, item.count]));
  res.json(
    ListDmRoomsResponse.parse(
      rooms.map((room) => toRoomSummary(room, countByRoom.get(room.id) ?? 0)),
    ),
  );
});

router.post("/dm/rooms", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const title = parsed.data.title.trim();
  if (!title) {
    res.status(400).json({ error: "Room title cannot be empty" });
    return;
  }

  const ownerId = res.locals.userId as string;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const [room] = await db
        .insert(roomsTable)
        .values({
          title,
          code: newRoomCode(),
          ownerId,
          map: createDefaultMap(),
        })
        .returning();
      if (room) {
        res.status(201).json(CreateRoomResponse.parse(toRoomSummary(room, 0)));
        return;
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        continue;
      }
      throw error;
    }
  }

  req.log.error("Could not allocate a unique tabletop room code");
  res.status(503).json({ error: "Could not create a room. Please try again." });
});

router.get("/rooms/:code", async (req, res): Promise<void> => {
  const parsed = GetRoomByCodeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const code = parsed.data.code.toUpperCase();
  const room = await getRoom(code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const players = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.roomId, room.id))
    .orderBy(playersTable.joinedAt);
  res.json(
    GetRoomByCodeResponse.parse({
      id: room.id,
      title: room.title,
      code: room.code,
      map: room.map,
      players: players.map(toPlayer),
      createdAt: room.createdAt.toISOString(),
    }),
  );
});

router.post("/rooms/:code/join", async (req, res): Promise<void> => {
  const params = JoinRoomParams.safeParse(req.params);
  const parsed = JoinRoomBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
        error: !params.success
          ? params.error.message
          : !parsed.success
            ? parsed.error.message
            : "Invalid request",
    });
    return;
  }
  const code = params.data.code.toUpperCase();
  const room = await getRoom(code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const characterName = parsed.data.characterName.trim();
  if (!characterName) {
    res.status(400).json({ error: "Character name cannot be empty" });
    return;
  }

  const sessionToken = randomBytes(32).toString("hex");
  const [player] = await db
    .insert(playersTable)
    .values({
      roomId: room.id,
      characterName,
      sessionTokenHash: hashToken(sessionToken),
    })
    .returning();
  if (!player) {
    res.status(500).json({ error: "Could not join room" });
    return;
  }
  res.cookie(roomCookieName(code), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 60,
  });
  res.status(201).json(
    JoinRoomResponse.parse({
      id: player.id,
      characterName: player.characterName,
      joinedAt: player.joinedAt.toISOString(),
    }),
  );
});

router.put(
  "/rooms/:code/map",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateRoomMapParams.safeParse(req.params);
    const parsed = UpdateRoomMapBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : !parsed.success
            ? parsed.error.message
            : "Invalid request",
      });
      return;
    }
    const room = await getRoom(params.data.code);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (!(await isRoomOwner(req, room.ownerId))) {
      res.status(403).json({ error: "Only the room DM can edit its map" });
      return;
    }
    const map = parsed.data.map;
    if (map.tiles.length !== map.width * map.height) {
      res.status(400).json({ error: "Map tiles do not match map dimensions" });
      return;
    }
    await db.update(roomsTable).set({ map }).where(eq(roomsTable.id, room.id));
    res.json(UpdateRoomMapResponse.parse(map));
  },
);

router.get(
  "/rooms/:code/messages",
  async (req, res): Promise<void> => {
    const parsed = ListRoomMessagesParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const code = parsed.data.code.toUpperCase();
    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const player = await getPlayerForRequest(req, room.id, code);
    if (!player && !(await isRoomOwner(req, room.ownerId))) {
      res.status(401).json({ error: "Join this room to view chat" });
      return;
    }
    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.roomId, room.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(100);
    res.json(
      ListRoomMessagesResponse.parse(messages.reverse().map(toMessage)),
    );
  },
);

router.post(
  "/rooms/:code/messages",
  async (req, res): Promise<void> => {
    const params = SendRoomMessageParams.safeParse(req.params);
    const parsed = SendRoomMessageBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : !parsed.success
            ? parsed.error.message
            : "Invalid request",
      });
      return;
    }
    const code = params.data.code.toUpperCase();
    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const player = await getPlayerForRequest(req, room.id, code);
    const isDm = await isRoomOwner(req, room.ownerId);
    if (!player && !isDm) {
      res.status(401).json({ error: "Join this room to chat" });
      return;
    }
    const content = parsed.data.content.trim();
    if (!content) {
      res.status(400).json({ error: "Message cannot be empty" });
      return;
    }
    const [message] = await db
      .insert(messagesTable)
      .values({
        roomId: room.id,
        playerId: player?.id ?? null,
        characterName: player?.characterName ?? "Dungeon Master",
        content,
      })
      .returning();
    if (!message) {
      res.status(500).json({ error: "Could not send message" });
      return;
    }
    res.status(201).json(SendRoomMessageResponse.parse(toMessage(message)));
  },
);

export default router;
