import { Link } from "wouter";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="room-error">
      <div className="error-illustration"><Compass size={30} /></div>
      <span className="section-kicker">OFF THE MAP</span>
      <h1>This path leads nowhere.</h1>
      <p>The page you’re looking for isn’t part of this campaign.</p>
      <Link className="button button-primary" href="/" data-testid="link-not-found-home"><ArrowLeft size={16} /> Return to the table</Link>
    </main>
  );
}
