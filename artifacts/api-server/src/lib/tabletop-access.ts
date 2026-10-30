import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Request } from "express";
import { db, playersTable, roomsTable } from "@workspace/db";

const ROOM_COOKIE_PREFIX = "tabletop_player_";

export function roomCookieName(code: string): string {
  return `${ROOM_COOKIE_PREFIX}${code.toUpperCase()}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getRoom(code: string) {
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.code, code.toUpperCase()))
    .limit(1);
  return room;
}

export async function getPlayerForRequest(
  req: Request,
  roomId: string,
  code: string,
) {
  const token = req.cookies?.[roomCookieName(code)];
  if (typeof token !== "string" || token.length < 32) return undefined;
  const [player] = await db
    .select()
    .from(playersTable)
    .where(
      and(
        eq(playersTable.roomId, roomId),
        eq(playersTable.sessionTokenHash, hashToken(token)),
      ),
    )
    .limit(1);
  return player;
}

export async function isRoomOwner(req: Request, ownerId: string) {
  return getAuth(req).userId === ownerId;
}
