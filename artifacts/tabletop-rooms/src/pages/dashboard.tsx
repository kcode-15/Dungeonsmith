import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, CirclePlus, DoorOpen, LogOut, Map, MoreHorizontal, Users } from "lucide-react";
import { getListDmRoomsQueryKey, useCreateRoom, useListDmRooms } from "@workspace/api-client-react";

function DashboardPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const roomsQuery = useListDmRooms();
  const createRoom = useCreateRoom();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give your campaign a name first.");
      return;
    }
    setError("");
    createRoom.mutate({ data: { title: title.trim() } }, {
      onSuccess: (room) => {
        queryClient.invalidateQueries({ queryKey: getListDmRoomsQueryKey() });
        setLocation(`/room/${room.code}`);
      },
      onError: () => setError("That room couldn't be created. Try again in a moment."),
    });
  };

  const firstName = user?.firstName || "Storyteller";

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <Link href="/" className="brand-lockup rail-brand" data-testid="link-dashboard-home"><img src="/logo.svg" alt="" className="brand-mark" /><span>Dungeon<span className="brand-light">smith</span></span></Link>
        <div className="rail-label">YOUR TABLE</div>
        <Link href="/dashboard" className="rail-link rail-active"><BookOpen size={17} /> Campaigns <span className="rail-count">{roomsQuery.data?.length ?? "—"}</span></Link>
        <div className="rail-bottom">
          <div className="account-card"><div className="avatar avatar-rust">{firstName.slice(0, 1).toUpperCase()}</div><div className="account-copy"><strong>{firstName}</strong><small>Dungeon master</small></div><button aria-label="Sign out" className="icon-button account-logout" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: "/" })}><LogOut size={16} /></button></div>
          <div className="rail-note"><span className="online-dot" /> Your tables are ready when you are.</div>
        </div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar"><div className="breadcrumb">DUNGEONSMITH <span>/</span> CAMPAIGNS</div><div className="topbar-right"><span className="topbar-status"><span className="online-dot" /> ALL SYSTEMS READY</span><div className="avatar avatar-small">{firstName.slice(0, 1).toUpperCase()}</div></div></header>
        <div className="dashboard-content">
          <div className="dash-heading"><div><span className="section-kicker">THE STORY SO FAR</span><h1>Your campaigns</h1><p>Every world you’ve set in motion, all in one place.</p></div><button className="button button-primary" onClick={() => { setShowCreate((open) => !open); setError(""); }} data-testid="button-new-campaign"><CirclePlus size={17} /> New campaign</button></div>

          {showCreate && <form className="create-room-panel" onSubmit={submit}>
            <div className="create-panel-icon"><BookOpen size={20} /></div><div className="create-panel-copy"><label htmlFor="campaign-title">NAME YOUR NEXT CAMPAIGN</label><input id="campaign-title" data-testid="input-campaign-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The Crown of Cinders" maxLength={80} autoFocus /><p>Your party will see this when they join.</p></div>
            <div className="create-panel-actions"><button type="button" className="button button-quiet" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" disabled={createRoom.isPending} data-testid="button-create-room">{createRoom.isPending ? "Opening…" : "Create room"} <ArrowUpRight size={16} /></button></div>
            {error && <p className="form-error create-error" role="alert">{error}</p>}
          </form>}

          {roomsQuery.isLoading ? <div className="room-grid">{[0,1,2].map((item) => <div key={item} className="room-skeleton"><div /><div /><div /></div>)}</div> :
            roomsQuery.isError ? <div className="state-panel"><div className="state-mark">!</div><h2>We lost the map for a moment.</h2><p>Your campaigns couldn't load just now.</p><button className="button button-outline" onClick={() => roomsQuery.refetch()}>Try again</button></div> :
            roomsQuery.data?.length ? <div className="room-grid">{roomsQuery.data.map((room, index) => <article className="room-card" key={room.id} data-testid={`card-room-${room.id}`}>
              <div className={`room-card-art room-art-${index % 3}`}><div className="room-art-grid" /><div className="room-art-glyph">{index % 3 === 0 ? <Map /> : index % 3 === 1 ? <BookOpen /> : <DoorOpen />}</div><span className="room-code-badge">{room.code}</span></div>
              <div className="room-card-body"><div className="room-card-title"><h2>{room.title}</h2><button className="icon-button" aria-label={`Open ${room.title}`} onClick={() => setLocation(`/room/${room.code}`)}><MoreHorizontal size={18} /></button></div><div className="room-card-meta"><span><Users size={14} /> {room.playerCount} {room.playerCount === 1 ? "player" : "players"}</span><span>Created {new Date(room.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div><Link href={`/room/${room.code}`} className="room-open-link" data-testid={`link-open-room-${room.id}`}>Open campaign <ArrowUpRight size={15} /></Link></div>
            </article>)}</div> :
            <div className="empty-state"><div className="empty-illustration"><div className="empty-map-lines" /><Map size={34} /></div><span className="section-kicker">A BLANK MAP IS FULL OF POSSIBILITY</span><h2>Your first campaign<br />is a few words away.</h2><p>Create a room, sketch a world, then send your party a code to join.</p><button className="button button-primary" onClick={() => setShowCreate(true)} data-testid="button-create-first-room"><CirclePlus size={16} /> Create your first room</button></div>}
          <div className="dash-footnote"><span><Users size={15} /> Players never need an account</span><span>ROOMS STAY OPEN FOR THE NEXT SESSION</span></div>
        </div>
      </section>
    </main>
  );
}

export default DashboardPage;
