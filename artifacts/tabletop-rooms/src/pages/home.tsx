import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, BookOpen, Map, MessageSquareText, ShieldCheck, Swords } from "lucide-react";
import { useJoinRoom } from "@workspace/api-client-react";

function HomePage() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [error, setError] = useState("");
  const join = useJoinRoom();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode || !characterName.trim()) {
      setError("Add your room code and character name to join.");
      return;
    }
    setError("");
    join.mutate({ code: normalizedCode, data: { characterName: characterName.trim() } }, {
      onSuccess: () => {
        localStorage.setItem(`tabletop-player-${normalizedCode}`, characterName.trim());
        setLocation(`/room/${normalizedCode}`);
      },
      onError: () => setError("We couldn't find that room. Check the code and try again."),
    });
  };

  return (
    <main className="landing">
      <header className="landing-nav page-wrap">
        <Link href="/" className="brand-lockup" data-testid="link-home-brand">
          <img src="/logo.svg" alt="" className="brand-mark" />
          <span>Dungeon<span className="brand-light">smith</span></span>
        </Link>
        <nav className="landing-actions">
          <Link href="/sign-in" className="nav-text-link" data-testid="link-sign-in">DM sign in</Link>
          <Link href="/sign-up" className="button button-dark button-small" data-testid="link-create-account">Create a room <ArrowRight size={15} /></Link>
        </nav>
      </header>

      <section className="hero page-wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-rule" />YOUR ONLINE D&amp;D TABLE</div>
          <h1>Gather your party.<br /><em>The world is waiting.</em></h1>
          <p className="hero-description">Play D&amp;D online with a shared map and table chat. DMs build the room; players join by code—no account needed.</p>
          <div className="hero-actions">
            <a href="#join" className="button button-primary" data-testid="link-join-adventure">Join an adventure <ArrowRight size={17} /></a>
            <Link href="/sign-up" className="button button-outline" data-testid="link-host-adventure">I'm the DM</Link>
          </div>
          <div className="hero-proof"><span className="proof-dots"><i /><i /><i /><i /></span><span>Players join with a code. That's it.</span></div>
        </div>
        <div className="hero-art" aria-label="A hand-drawn fantasy map laid out on a campaign table">
          <div className="map-caption"><span>FIELD NOTES · 07</span><span>THE SUNKEN MARCH</span></div>
          <div className="map-art">
            <div className="map-river" />
            <div className="map-hill hill-one" /><div className="map-hill hill-two" /><div className="map-hill hill-three" />
            <div className="map-forest forest-one"><i /><i /><i /></div><div className="map-forest forest-two"><i /><i /></div>
            <div className="map-ruin"><span /><span /><span /></div>
            <div className="map-path" />
            <div className="map-marker marker-a" /><div className="map-marker marker-b" /><div className="map-marker marker-c" />
            <div className="map-location">ASHENFORD</div><div className="map-location location-two">THE OLD WATCH</div>
            <div className="map-compass">N<br /><span /></div>
          </div>
          <div className="map-footer"><span>CAMPAIGN 01</span><span>24 × 16 HEXES</span><span>EST. 11:42 PM</span></div>
          <div className="floating-note"><span className="note-dot" /> <span>3 adventurers at the table</span></div>
        </div>
        <div className="hero-index">01 <span>/ 04</span></div>
      </section>

      <section className="join-section" id="join">
        <div className="page-wrap join-layout">
          <div className="join-copy">
            <span className="section-kicker">YOUR SEAT IS READY</span>
            <h2>Already have<br />a room code?</h2>
            <p>Ask your DM for the invite code. Pick a character name and you’re in — no player account needed.</p>
            <div className="join-assurance"><ShieldCheck size={17} />Your character name is all we need.</div>
          </div>
          <form className="join-form" onSubmit={submit}>
            <label htmlFor="room-code">ROOM CODE</label>
            <input id="room-code" data-testid="input-room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="e.g. MOSS-7K" autoComplete="off" />
            <label htmlFor="character-name">CHARACTER NAME</label>
            <input id="character-name" data-testid="input-character-name" value={characterName} onChange={(e) => setCharacterName(e.target.value)} maxLength={40} placeholder="What do they call you?" autoComplete="nickname" />
            {error && <p className="form-error" role="alert" data-testid="status-join-error">{error}</p>}
            <button className="button button-primary join-submit" data-testid="button-join-room" disabled={join.isPending}>
              {join.isPending ? "Finding your table…" : "Enter the room"} <ArrowRight size={17} />
            </button>
            <div className="join-form-foot"><span>NO PASSWORD</span><span>NO PLAYER ACCOUNT</span><span>JUST ADVENTURE</span></div>
          </form>
        </div>
      </section>

      <section className="features-section page-wrap">
        <div className="features-heading"><span className="section-kicker">LESS SETUP. MORE STORY.</span><h2>Keep the table<br /><em>in one place.</em></h2></div>
        <div className="feature-stack">
          <article className="feature-row"><div className="feature-icon"><Map size={20} /></div><div><h3>Build a world as you go</h3><p>Paint terrain right onto the grid. Forest paths, stone keeps, lava pits — set the scene in a few strokes.</p></div><span className="feature-number">01</span></article>
          <article className="feature-row"><div className="feature-icon"><MessageSquareText size={20} /></div><div><h3>Keep the chatter close</h3><p>Planning, plotting, and the occasional terrible pun all live beside the map. The whole table stays in the loop.</p></div><span className="feature-number">02</span></article>
          <article className="feature-row"><div className="feature-icon"><Swords size={20} /></div><div><h3>Bring the whole party in</h3><p>Share a short room code. Players choose a character name and see the same world, instantly.</p></div><span className="feature-number">03</span></article>
        </div>
      </section>

      <section className="closing-banner"><div className="page-wrap closing-inner"><BookOpen size={24} /><p>Every great D&amp;D campaign starts<br /><em>with a place to meet.</em></p><Link href="/sign-up" className="button button-light" data-testid="link-start-campaign">Start your campaign <ArrowRight size={16} /></Link></div></section>
      <footer className="landing-footer page-wrap"><Link href="/" className="brand-lockup"><img src="/logo.svg" alt="" className="brand-mark" /><span>Dungeon<span className="brand-light">smith</span></span></Link><span>Your online table for D&amp;D.</span><span>BUILT FOR THE TABLE</span></footer>
    </main>
  );
}

export default HomePage;
