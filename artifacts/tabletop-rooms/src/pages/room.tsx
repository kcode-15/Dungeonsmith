import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Copy, Eye, MapPin, MessageCircle, Pencil, Send, Users, WandSparkles } from "lucide-react";
import CombatPanel from "../components/CombatPanel";
import RoomVoice from "../components/RoomVoice";
import {
  getGetRoomCombatQueryKey,
  getGetRoomByCodeQueryKey,
  getListDmRoomsQueryKey,
  getListRoomMessagesQueryKey,
  Terrain,
  useGetRoomByCode,
  useJoinRoom,
  useListDmRooms,
  useListRoomMessages,
  useSendRoomMessage,
  useUpdateRoomMap,
  type MapData,
  type Terrain as TerrainValue,
} from "@workspace/api-client-react";

const TERRAIN: { value: TerrainValue; label: string; key: string }[] = [
  { value: Terrain.grass, label: "Grass", key: "G" },
  { value: Terrain.stone, label: "Stone", key: "S" },
  { value: Terrain.water, label: "Water", key: "W" },
  { value: Terrain.forest, label: "Forest", key: "F" },
  { value: Terrain.sand, label: "Sand", key: "D" },
  { value: Terrain.lava, label: "Lava", key: "L" },
  { value: Terrain.wall, label: "Wall", key: "A" },
];

function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? "";
  const [, setLocation] = useLocation();
  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const [brush, setBrush] = useState<TerrainValue>(Terrain.grass);
  const [draftMap, setDraftMap] = useState<MapData | null>(null);
  const [chatText, setChatText] = useState("");
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(`tabletop-player-${code}`) || "");
  const [joinName, setJoinName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [chatError, setChatError] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const roomQuery = useGetRoomByCode(code, { query: { queryKey: getGetRoomByCodeQueryKey(code), refetchInterval: 6000 } });
  const messagesQuery = useListRoomMessages(code, { query: { queryKey: getListRoomMessagesQueryKey(code), refetchInterval: 3000 } });
  const dmRooms = useListDmRooms({ query: { queryKey: getListDmRoomsQueryKey(), enabled: Boolean(isSignedIn), retry: false } });
  const sendMessage = useSendRoomMessage();
  const joinRoom = useJoinRoom();
  const updateMap = useUpdateRoomMap();
  const room = roomQuery.data;
  const isDm = Boolean(room && dmRooms.data?.some((ownedRoom) => ownedRoom.code === room.code));
  const savedMap = room?.map;
  const map = draftMap ?? savedMap;
  const messages = useMemo(() => [...(messagesQuery.data ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [messagesQuery.data]);

  const changeTile = (index: number) => {
    if (!isDm || !editing || !map) return;
    const tiles = [...map.tiles];
    tiles[index] = brush;
    setDraftMap({ ...map, tiles });
  };

  const saveMap = () => {
    if (!draftMap) return;
    updateMap.mutate({ code, data: { map: draftMap } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetRoomByCodeQueryKey(code), (old: typeof room) => old ? { ...old, map: updated } : old);
        queryClient.invalidateQueries({ queryKey: getListDmRoomsQueryKey() });
        setDraftMap(null);
        setEditing(false);
      },
    });
  };

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = joinName.trim();
    if (!name) return;
    setJoinError("");
    joinRoom.mutate({ code, data: { characterName: name } }, {
      onSuccess: () => {
        localStorage.setItem(`tabletop-player-${code}`, name);
        setPlayerName(name);
        queryClient.invalidateQueries({ queryKey: getGetRoomByCodeQueryKey(code) });
          queryClient.invalidateQueries({ queryKey: getGetRoomCombatQueryKey(code) });
      },
      onError: () => setJoinError("That name couldn't join the table. Try another."),
    });
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chatText.trim()) return;
    setChatError("");
    sendMessage.mutate({ code, data: { content: chatText.trim() } }, {
      onSuccess: () => {
        setChatText("");
        queryClient.invalidateQueries({ queryKey: getListRoomMessagesQueryKey(code) });
      },
      onError: () => setChatError("Message didn't make it through. Try sending again."),
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (roomQuery.isLoading) return <main className="room-loading"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-map" /><div className="skeleton skeleton-side" /></main>;
  if (roomQuery.isError || !room) return <main className="room-error"><div className="error-illustration"><MapPin size={30} /></div><span className="section-kicker">THE WAYPOINT IS MISSING</span><h1>We can’t find this room.</h1><p>Check the invite code your DM shared, then try again.</p><Link className="button button-primary" href="/">Back to the front door <ArrowLeft size={16} /></Link></main>;

  const mapTiles = map?.tiles ?? [];
  const gridStyle = { gridTemplateColumns: `repeat(${map?.width ?? 16}, minmax(0, 1fr))` };

  return (
    <main className="room-layout">
      <header className="room-topbar">
        <Link href={isDm ? "/dashboard" : "/"} className="room-brand-back"><ArrowLeft size={16} /><span>{isDm ? "Campaigns" : "Home"}</span></Link>
        <div className="room-heading"><span className="room-live"><i /> LIVE TABLE</span><h1 data-testid="text-room-title">{room.title}</h1></div>
        <div className="room-top-actions"><button className="room-code-button" onClick={copyCode} data-testid="button-copy-room-code"><span>ROOM CODE</span><strong>{copied ? "COPIED" : room.code}</strong>{copied ? <Check size={15} /> : <Copy size={15} />}</button><div className="room-top-divider" /><span className="players-summary"><Users size={15} /> {room.players.length} at the table</span></div>
      </header>

      <div className="room-workspace">
        <section className="map-workspace">
          <div className="map-toolbar">
            <div className="map-toolbar-title"><span className="toolbar-icon"><MapPin size={16} /></span><div><small>SHARED CAMPAIGN MAP</small><strong>{map?.width ?? 16} × {map?.height ?? 12} GRID</strong></div></div>
            <div className="map-toolbar-actions">
              {isDm && <>{editing && <div className="terrain-picker">{TERRAIN.map((terrain) => <button type="button" key={terrain.value} onClick={() => setBrush(terrain.value)} className={`terrain-choice ${brush === terrain.value ? "terrain-selected" : ""}`} title={terrain.label} data-testid={`button-terrain-${terrain.value}`}><span className={`terrain-swatch terrain-${terrain.value}`} /><small>{terrain.label}</small></button>)}</div>}
                {editing ? <><button className="button button-quiet" onClick={() => { setDraftMap(null); setEditing(false); }}>Discard</button><button className="button button-primary button-save" disabled={updateMap.isPending} onClick={saveMap} data-testid="button-save-map">{updateMap.isPending ? "Saving…" : "Save map"} <Check size={15} /></button></> : <button className="button button-outline button-edit" onClick={() => { setDraftMap(savedMap ?? null); setEditing(true); }} data-testid="button-edit-map"><Pencil size={15} /> Edit map</button>}</>}
              {!isDm && <span className="view-only-label"><Eye size={14} /> VIEW ONLY</span>}
            </div>
          </div>
          {editing && <div className="editor-hint"><WandSparkles size={14} /> Select a terrain, then tap tiles to paint. Changes appear to everyone after saving.</div>}
          <div className="map-canvas-wrap">
            <div className={`map-canvas ${editing ? "map-canvas-editing" : ""}`} style={gridStyle} role="grid" aria-label={`${room.title} campaign map`}>
              {Array.from({ length: (map?.width ?? 16) * (map?.height ?? 12) }, (_, index) => {
                const terrain = mapTiles[index] ?? Terrain.grass;
                return <button type="button" role="gridcell" aria-label={`Tile ${index + 1}, ${terrain}`} title={editing ? `Paint ${terrain}` : String(terrain)} key={index} className={`map-tile terrain-${terrain}`} onClick={() => changeTile(index)} disabled={!editing} data-testid={`tile-${index}`}><span className="tile-texture" /></button>;
              })}
            </div>
            {!map && <div className="map-empty-overlay"><MapPin size={23} /><strong>The map is waiting for its first mark.</strong><span>The DM can open edit mode to begin.</span></div>}
          </div>
          <div className="map-legend"><div className="legend-items">{TERRAIN.slice(0, 5).map((item) => <span key={item.value}><i className={`terrain-swatch terrain-${item.value}`} />{item.label}</span>)}</div><span className="map-origin">A SHARED VIEW OF YOUR WORLD</span></div>
        </section>

        <aside className="room-sidebar">
          <section className="players-panel">
            <div className="panel-header"><div><span className="section-kicker">THE PARTY</span><h2>At the table <span>{room.players.length}</span></h2></div><Users size={18} /></div>
            {room.players.length ? <div className="player-list">{room.players.map((player, index) => <div className="player-row" key={player.id} data-testid={`player-${player.id}`}><div className={`avatar avatar-player avatar-tone-${index % 4}`}>{player.characterName.slice(0, 1).toUpperCase()}</div><div className="player-details"><strong>{player.characterName}</strong><span>Joined {new Date(player.joinedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div><i className="player-online" /></div>)}</div> : <div className="players-empty"><Users size={19} /><p>Your party is just around the corner.</p></div>}
            {!playerName && !isDm && <form className="room-join-inline" onSubmit={join}><label htmlFor="room-join-name">CLAIM YOUR SEAT</label><div><input id="room-join-name" value={joinName} onChange={(event) => setJoinName(event.target.value)} placeholder="Character name" maxLength={40} data-testid="input-room-join-name" /><button className="button button-primary button-icon-only" aria-label="Join the room" disabled={joinRoom.isPending} data-testid="button-join-from-room"><ChevronDown size={17} /></button></div>{joinError && <p className="form-error">{joinError}</p>}</form>}
          </section>

          {(playerName || isDm) && <RoomVoice key={code} code={code} />}

          <CombatPanel code={code} players={room.players} playerName={playerName} isDm={isDm} />

          <section className="chat-panel">
            <div className="panel-header chat-header"><div><span className="section-kicker">THE CAMPFIRE</span><h2>Table talk</h2></div><MessageCircle size={18} /></div>
            <div className="chat-stream">
              {messagesQuery.isLoading ? <div className="chat-skeleton"><span /><span /><span /></div> : messagesQuery.isError ? <div className="chat-empty"><p>Conversation is out of reach for a moment.</p><button className="text-button" onClick={() => messagesQuery.refetch()}>Try again</button></div> : messages.length ? messages.map((message) => <article className="chat-message" key={message.id} data-testid={`message-${message.id}`}><div className="message-meta"><span className="message-avatar">{message.characterName.slice(0, 1).toUpperCase()}</span><strong>{message.characterName}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div><p>{message.content}</p></article>) : <div className="chat-empty"><div className="chat-empty-mark"><MessageCircle size={19} /></div><strong>The first word is yours.</strong><p>Ask a question, make a plan, or just say hello.</p></div>}
              <div className="chat-end-anchor" />
            </div>
            <form className="chat-composer" onSubmit={send}>
              {chatError && <p className="form-error" role="alert">{chatError}</p>}
              <div className="composer-input-row"><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder={playerName ? `Say something, ${playerName}…` : isDm ? "Say something to the table…" : "Join the table to chat"} disabled={(!playerName && !isDm) || sendMessage.isPending} maxLength={500} data-testid="input-chat-message" /><button className="send-button" aria-label="Send message" disabled={(!playerName && !isDm) || !chatText.trim() || sendMessage.isPending} data-testid="button-send-message"><Send size={17} /></button></div>
              <div className="composer-note"><span>TO THE TABLE</span><span>{chatText.length}/500</span></div>
            </form>
          </section>
        </aside>
      </div>
      <footer className="room-footer"><span>DUNGEONSMITH <i>/</i> {room.code}</span><span>MADE FOR THE MOMENTS BETWEEN THE DICE ROLLS</span></footer>
    </main>
  );
}

export default RoomPage;
