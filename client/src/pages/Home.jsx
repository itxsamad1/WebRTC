import { useState } from "react";
import "../App.css";

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export default function Home({ onJoin }) {
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  function handleCreate() {
    const roomId = generateRoomId();
    onJoin(roomId);
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Please enter a valid room code.");
      return;
    }
    setError("");
    onJoin(code);
  }

  return (
    <div className="home-page">
      {/* Background blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="home-content">
        {/* Logo */}
        <div className="home-logo">
          <div className="logo-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="12" fill="url(#logoGrad)" />
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40">
                  <stop stopColor="#4f8ef7" />
                  <stop offset="1" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <path d="M10 14h14a2 2 0 012 2v8a2 2 0 01-2 2H10a2 2 0 01-2-2v-8a2 2 0 012-2z" fill="white" fillOpacity="0.9" />
              <path d="M28 17l6-4v14l-6-4V17z" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
        </div>

        <h1 className="home-title">WebRTC Video Call</h1>
        <p className="home-subtitle">
          Free, instant video calls — no account, no download, peer-to-peer.
        </p>

        <div className="home-cards">
          {/* Create Room */}
          <div className="home-card create-card">
            <div className="card-icon">✨</div>
            <h2>Create a Room</h2>
            <p>Start a new call and invite anyone by sharing the link.</p>
            <button className="btn-primary" onClick={handleCreate}>
              Create New Room
            </button>
          </div>

          <div className="home-divider">
            <span>or</span>
          </div>

          {/* Join Room */}
          <div className="home-card join-card">
            <div className="card-icon">🔗</div>
            <h2>Join a Room</h2>
            <p>Enter a room code shared by your teammate or friend.</p>
            <div className="join-input-row">
              <input
                type="text"
                className="room-code-input"
                placeholder="Enter room code..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                maxLength={8}
                spellCheck={false}
              />
              <button className="btn-secondary" onClick={handleJoin}>
                Join
              </button>
            </div>
            {error && <p className="input-error">{error}</p>}
          </div>
        </div>

        <p className="home-note">
          Works on the same Wi-Fi network. Share <code>https://YOUR_IP:5173/?room=CODE</code>
        </p>
      </div>
    </div>
  );
}
