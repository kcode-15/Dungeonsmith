import { randomInt, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  AddCombatantBody,
  AddCombatantParams,
  AddCombatantResponse,
  GetRoomCombatParams,
  GetRoomCombatResponse,
  RemoveCombatantParams,
  RemoveCombatantResponse,
  RequestAttackBody,
  RequestAttackParams,
  RequestAttackResponse,
  UpdateCombatantInitiativeBody,
  UpdateCombatantInitiativeParams,
  UpdateCombatantInitiativeResponse,
  UpdateRoomCombatBody,
  UpdateRoomCombatParams,
  UpdateRoomCombatResponse,
} from "@workspace/api-zod";
import {
  db,
  playersTable,
  roomsTable,
  type RoomCombatState,
  type RoomAttackResult,
  type RoomCombatant,
} from "@workspace/db";
import {
  getPlayerForRequest,
  getRoom,
  isRoomOwner,
} from "../lib/tabletop-access";

const router: IRouter = Router();
const MAX_ATTACK_HISTORY = 50;

type RouteFailure = { error: string; status: number };
type CombatStateResult = { state: RoomCombatState } | RouteFailure;
type AttackRollResult = { attack: RoomAttackResult } | RouteFailure;

function emptyCombatState(): RoomCombatState {
  return {
    active: false,
    round: 1,
    activeCombatantId: null,
    combatants: [],
    attacks: [],
  };
}

function orderCombatants(combatants: RoomCombatant[]): RoomCombatant[] {
  return combatants
    .map((combatant, originalIndex) => ({ combatant, originalIndex }))
    .sort(
      (a, b) =>
        b.combatant.initiative - a.combatant.initiative ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ combatant }) => combatant);
}

async function requireDmRoom(
  req: Request,
  res: Response,
  code: string,
): Promise<typeof roomsTable.$inferSelect | undefined> {
  const room = await getRoom(code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (!(await isRoomOwner(req, room.ownerId))) {
    res.status(403).json({ error: "Only the room DM can control combat" });
    return;
  }
  return room;
}

router.get("/rooms/:code/combat", async (req, res): Promise<void> => {
  const params = GetRoomCombatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const code = params.data.code.toUpperCase();
  const room = await getRoom(code);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const player = await getPlayerForRequest(req, room.id, code);
  if (!player && !(await isRoomOwner(req, room.ownerId))) {
    res.status(401).json({ error: "Join this room to view combat" });
    return;
  }

  res.json(GetRoomCombatResponse.parse(room.combatState ?? emptyCombatState()));
});

router.post("/rooms/:code/combat", async (req, res): Promise<void> => {
  const params = UpdateRoomCombatParams.safeParse(req.params);
  const parsed = UpdateRoomCombatBody.safeParse(req.body);
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
  const room = await requireDmRoom(req, res, code);
  if (!room) return;

  const result = await db.transaction(async (tx): Promise<CombatStateResult> => {
    const [lockedRoom] = await tx
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, room.id))
      .for("update")
      .limit(1);
    if (!lockedRoom) return { error: "Room not found", status: 404 as const };

    const current = lockedRoom.combatState ?? emptyCombatState();
    let next: RoomCombatState;

    if (parsed.data.action === "start") {
      if (current.active) {
        return { error: "Combat is already active", status: 409 as const };
      }
      const players = await tx
        .select()
        .from(playersTable)
        .where(eq(playersTable.roomId, lockedRoom.id))
        .orderBy(playersTable.joinedAt);
      const previousPlayerInitiatives = new Map(
        current.combatants
          .filter((combatant) => combatant.kind === "player")
          .map((combatant) => [combatant.id, combatant.initiative]),
      );
      const combatants = orderCombatants([
        ...players.map((player) => ({
          id: player.id,
          playerId: player.id,
          name: player.characterName,
          kind: "player" as const,
          initiative: previousPlayerInitiatives.get(player.id) ?? 0,
        })),
        ...current.combatants.filter((combatant) => combatant.kind === "enemy"),
      ]);
      next = {
        active: true,
        round: 1,
        activeCombatantId: combatants[0]?.id ?? null,
        combatants,
        attacks: [],
      };
    } else if (parsed.data.action === "advance") {
      if (!current.active) {
        return { error: "Start combat before advancing turns", status: 409 as const };
      }
      if (current.combatants.length === 0) {
        return { error: "Add a combatant before advancing turns", status: 409 as const };
      }
      const activeIndex = current.combatants.findIndex(
        (combatant) => combatant.id === current.activeCombatantId,
      );
      const nextIndex = (activeIndex + 1) % current.combatants.length;
      next = {
        ...current,
        round: nextIndex === 0 ? current.round + 1 : current.round,
        activeCombatantId: current.combatants[nextIndex]!.id,
      };
    } else {
      if (!current.active) {
        return { error: "Combat is not active", status: 409 as const };
      }
      next = { ...current, active: false, activeCombatantId: null };
    }

    await tx
      .update(roomsTable)
      .set({ combatState: next })
      .where(eq(roomsTable.id, lockedRoom.id));
    return { state: next };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(UpdateRoomCombatResponse.parse(result.state));
});

router.post("/rooms/:code/combatants", async (req, res): Promise<void> => {
  const params = AddCombatantParams.safeParse(req.params);
  const parsed = AddCombatantBody.safeParse(req.body);
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
  const room = await requireDmRoom(req, res, code);
  if (!room) return;

  const result = await db.transaction(async (tx): Promise<CombatStateResult> => {
    const [lockedRoom] = await tx
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, room.id))
      .for("update")
      .limit(1);
    if (!lockedRoom) return { error: "Room not found", status: 404 as const };
    const current = lockedRoom.combatState ?? emptyCombatState();
    const combatant: RoomCombatant = {
      id: randomUUID(),
      playerId: null,
      name: parsed.data.name.trim(),
      kind: "enemy",
      initiative: parsed.data.initiative,
    };
    const combatants = orderCombatants([...current.combatants, combatant]);
    const next = {
      ...current,
      combatants,
      activeCombatantId:
        current.activeCombatantId ??
        (current.active ? combatant.id : null),
    };
    await tx
      .update(roomsTable)
      .set({ combatState: next })
      .where(eq(roomsTable.id, lockedRoom.id));
    return { state: next };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(AddCombatantResponse.parse(result.state));
});

router.patch(
  "/rooms/:code/combatants/:combatantId",
  async (req, res): Promise<void> => {
    const params = UpdateCombatantInitiativeParams.safeParse(req.params);
    const parsed = UpdateCombatantInitiativeBody.safeParse(req.body);
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
    const room = await requireDmRoom(req, res, code);
    if (!room) return;

    const result = await db.transaction(async (tx): Promise<CombatStateResult> => {
      const [lockedRoom] = await tx
        .select()
        .from(roomsTable)
        .where(eq(roomsTable.id, room.id))
        .for("update")
        .limit(1);
      if (!lockedRoom) return { error: "Room not found", status: 404 as const };
      const current = lockedRoom.combatState ?? emptyCombatState();
      if (!current.combatants.some((item) => item.id === params.data.combatantId)) {
        return { error: "Combatant not found", status: 404 as const };
      }
      const combatants = orderCombatants(
        current.combatants.map((item) =>
          item.id === params.data.combatantId
            ? { ...item, initiative: parsed.data.initiative }
            : item,
        ),
      );
      const next = { ...current, combatants };
      await tx
        .update(roomsTable)
        .set({ combatState: next })
        .where(eq(roomsTable.id, lockedRoom.id));
      return { state: next };
    });

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(UpdateCombatantInitiativeResponse.parse(result.state));
  },
);

router.delete(
  "/rooms/:code/combatants/:combatantId",
  async (req, res): Promise<void> => {
    const params = RemoveCombatantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const code = params.data.code.toUpperCase();
    const room = await requireDmRoom(req, res, code);
    if (!room) return;

    const result = await db.transaction(async (tx): Promise<CombatStateResult> => {
      const [lockedRoom] = await tx
        .select()
        .from(roomsTable)
        .where(eq(roomsTable.id, room.id))
        .for("update")
        .limit(1);
      if (!lockedRoom) return { error: "Room not found", status: 404 as const };
      const current = lockedRoom.combatState ?? emptyCombatState();
      const removedIndex = current.combatants.findIndex(
        (item) => item.id === params.data.combatantId,
      );
      if (removedIndex < 0) {
        return { error: "Combatant not found", status: 404 as const };
      }
      const combatants = current.combatants.filter(
        (item) => item.id !== params.data.combatantId,
      );
      const nextActiveId =
        current.activeCombatantId === params.data.combatantId
          ? combatants[Math.min(removedIndex, combatants.length - 1)]?.id ?? null
          : current.activeCombatantId;
      const next = {
        ...current,
        combatants,
        activeCombatantId: nextActiveId,
      };
      await tx
        .update(roomsTable)
        .set({ combatState: next })
        .where(eq(roomsTable.id, lockedRoom.id));
      return { state: next };
    });

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(RemoveCombatantResponse.parse(result.state));
  },
);

router.post("/rooms/:code/combat/attacks", async (req, res): Promise<void> => {
  const params = RequestAttackParams.safeParse(req.params);
  const parsed = RequestAttackBody.safeParse(req.body);
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
  if (!player) {
    res.status(401).json({ error: "Join this room to request an attack" });
    return;
  }

  const result = await db.transaction(async (tx): Promise<AttackRollResult> => {
    const [lockedRoom] = await tx
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, room.id))
      .for("update")
      .limit(1);
    if (!lockedRoom) return { error: "Room not found", status: 404 as const };
    const current = lockedRoom.combatState ?? emptyCombatState();
    if (!current.active) {
      return { error: "Combat is not active", status: 409 as const };
    }
    if (current.activeCombatantId !== player.id) {
      return { error: "It is not your turn", status: 403 as const };
    }

    const dexterityModifier = Math.floor(
      (parsed.data.dexterityScore - 10) / 2,
    );
    const d20Roll = randomInt(1, 21);
    const attack = {
      id: randomUUID(),
      actorId: player.id,
      actorName: player.characterName,
      targetName: parsed.data.targetName.trim(),
      dexterityScore: parsed.data.dexterityScore,
      dexterityModifier,
      d20Roll,
      total: d20Roll + dexterityModifier,
      round: current.round,
      createdAt: new Date().toISOString(),
    };
    const next: RoomCombatState = {
      ...current,
      attacks: [...current.attacks, attack].slice(-MAX_ATTACK_HISTORY),
    };
    await tx
      .update(roomsTable)
      .set({ combatState: next })
      .where(eq(roomsTable.id, lockedRoom.id));
    return { attack };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(RequestAttackResponse.parse(result.attack));
});

export default router;
