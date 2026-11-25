import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, CirclePlus, DoorOpen, LogOut, Map, MoreHorizontal, Users } from "lucide-react";
import { getListDmRoomsQueryKey, useCreateRoom, useListDmRooms } from "@workspace/api-client-react";

const logoUrl = `${import.meta.env.BASE_URL}logo.svg`;

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
        <Link href="/" className="brand-lockup rail-brand" data-testid="link-dashboard-home"><img src={logoUrl} alt="" className="brand-mark" /><span>Dungeon<span className="brand-light">smith</span></span></Link>
        <div className="rail-label">YOUR TABLE</div>
        <Link href="/dashboard" className="rail-link rail-active"><BookOpen size={17} /> Campaigns <span className="rail-count">{roomsQuery.data?.length ?? "—"}</span></Link>
        <div className="rail-bottom">
          <div className="account-card"><div className="avatar avatar-rust">{firstName.slice(0, 1).toUpperCase()}</div><div className="account-copy"><strong>{firstName}</strong><small>Dungeon master</small></div><button aria-label="Sign out" className="icon-button account-logout" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: `${import.meta.env.BASE_URL}` })}><LogOut size={16} /></button></div>
        </div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar"><div className="breadcrumb">DUNGEONSMITH <span>/</span> CAMPAIGNS</div></header>
        <div className="dashboard-content">
          <div className="dash-heading"><div><span className="section-kicker">THE STORY SO FAR</span><h1>Your campaigns</h1><p>Every world you’ve set in motion, all in one place.</p></div><button className="button button-primary" onClick={() => { setShowCreate((open) => !open); setError(""); }} data-testid="button-new-campaign"><CirclePlus size={17} /> New campaign</button></div>

          {showCreate && <form className="create-room-panel" onSubmit={submit}>
            <div className="create-panel-icon"><BookOpen size={20} /></div><div className="create-panel-copy"><label htmlFor="campaign-title">NAME YOUR NEXT CAMPAIGN</label><input id="campaign-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Your campaign name" /><p>Campaign rooms start with a shared map.</p></div>
            <div className="create-panel-actions"><button type="button" className="button button-quiet" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" data-testid="button-create-room" disabled={createRoom.isPending}>{createRoom.isPending ? "Creating…" : "Create room"}</button></div>
            {error && <p className="form-error create-error" role="alert">{error}</p>}
          </form>}

          {roomsQuery.isLoading ? <div className="room-grid">{[0, 1, 2].map((item) => <div key={item} className="room-skeleton"><div /><div /><div /></div>)}</div> :
            roomsQuery.isError ? <div className="state-panel"><div className="state-mark">!</div><h2>We lost the map for a moment.</h2><p>Your campaigns couldn't load just now.</p><button className="button button-outline" onClick={() => roomsQuery.refetch()}>Try again</button></div> :
              roomsQuery.data?.length ? <div className="room-grid">{roomsQuery.data.map((room, index) => <article className="room-card" key={room.id} data-testid={`card-room-${room.id}`}>
                <div className={`room-card-art room-art-${index % 3}`}><div className="room-art-grid" /><div className="room-art-glyph"><Map /></div><span className="room-code-badge">{room.code}</span></div>
                <div className="room-card-body"><div className="room-card-title"><h2>{room.title}</h2><button className="icon-button" aria-label={`Open ${room.title}`} onClick={() => setLocation(`/room/${room.code}`)}><ArrowUpRight size={15} /></button></div><div className="room-card-meta"><span><Users size={12} /> {room.playerCount} players</span><span><DoorOpen size={12} /> Open room</span></div></div>
              </article>)}</div> :
                <div className="empty-state"><div className="empty-illustration"><div className="empty-map-lines" /><Map size={34} /></div><span className="section-kicker">A BLANK MAP IS FULL OF POSSIBILITIES</span><h2>Create your first campaign</h2><p>Give it a name and open a room for your party.</p><button className="button button-primary" onClick={() => setShowCreate(true)}><CirclePlus size={16} /> New campaign</button></div>}
        </div>
      </section>
    </main>
  );
}

export default DashboardPage;
