import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type RoomMap = {
  width: number;
  height: number;
  tiles: string[];
};

export type RoomCombatant = {
  id: string;
  playerId: string | null;
  name: string;
  kind: "player" | "enemy";
  initiative: number;
};

export type RoomAttackResult = {
  id: string;
  actorId: string;
  actorName: string;
  targetName: string;
  dexterityScore: number;
  dexterityModifier: number;
  d20Roll: number;
  total: number;
  round: number;
  createdAt: string;
};

export type RoomCombatState = {
  active: boolean;
  round: number;
  activeCombatantId: string | null;
  combatants: RoomCombatant[];
  attacks: RoomAttackResult[];
};

export const roomsTable = pgTable("tabletop_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  code: text("code").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  map: jsonb("map").$type<RoomMap>().notNull(),
  combatState: jsonb("combat_state").$type<RoomCombatState>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playersTable = pgTable("tabletop_players", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => roomsTable.id, { onDelete: "cascade" }),
  characterName: text("character_name").notNull(),
  sessionTokenHash: text("session_token_hash").notNull().unique(),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messagesTable = pgTable("tabletop_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => roomsTable.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  characterName: text("character_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
