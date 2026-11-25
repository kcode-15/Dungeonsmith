import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, BookOpen, Map, MessageSquareText, ShieldCheck, Swords } from "lucide-react";
import { useJoinRoom } from "@workspace/api-client-react";

const logoUrl = `${import.meta.env.BASE_URL}logo.svg`;

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
          <img src={logoUrl} alt="" className="brand-mark" />
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
        </div>
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
            <input id="room-code" data-testid="input-room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={12} placeholder="e.g. MOSS-7K" autoComplete="off" />
            <label htmlFor="character-name">CHARACTER NAME</label>
            <input id="character-name" data-testid="input-character-name" value={characterName} onChange={(event) => setCharacterName(event.target.value)} maxLength={40} placeholder="What do they call you?" autoComplete="nickname" />
            {error && <p className="form-error" role="alert" data-testid="status-join-error">{error}</p>}
            <button className="button button-primary join-submit" data-testid="button-join-room" disabled={join.isPending}>
              {join.isPending ? "Finding your table…" : "Enter the room"} <ArrowRight size={17} />
            </button>
          </form>
        </div>
      </section>

      <section className="features-section page-wrap">
        <div className="features-heading"><span className="section-kicker">LESS SETUP. MORE STORY.</span><h2>Keep the table<br /><em>in one place.</em></h2></div>
        <div className="feature-stack">
          <article className="feature-row"><div className="feature-icon"><Map size={20} /></div><div><h3>Build a world as you go</h3><p>Paint terrain right onto the grid. Set the scene in a few strokes.</p></div></article>
          <article className="feature-row"><div className="feature-icon"><MessageSquareText size={20} /></div><div><h3>Keep the chatter close</h3><p>Planning and plotting stay beside the shared map.</p></div></article>
          <article className="feature-row"><div className="feature-icon"><Swords size={20} /></div><div><h3>Bring the whole party in</h3><p>Share a room code and start adventuring.</p></div></article>
        </div>
      </section>

      <section className="closing-banner"><div className="page-wrap closing-inner"><BookOpen size={24} /><p>Every great D&amp;D campaign starts<br /><em>with a place to meet.</em></p><Link href="/sign-up" className="button button-light" data-testid="link-start-campaign">Start your campaign <ArrowRight size={16} /></Link></div></section>
      <footer className="landing-footer page-wrap"><Link href="/" className="brand-lockup"><img src={logoUrl} alt="" className="brand-mark" /><span>Dungeon<span className="brand-light">smith</span></span></Link><span>Your online table for D&amp;D.</span></footer>
    </main>
  );
}

export default HomePage;
