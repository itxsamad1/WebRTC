import { useRef, useEffect } from "react";
import { useWebRTC } from "../useWebRTC";
import "../App.css";

// A single remote video tile — uses a ref to set srcObject
function RemoteVideo({ peerId, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const shortId = peerId.slice(0, 6);

  return (
    <div className="video-card remote">
      <video ref={videoRef} autoPlay playsInline />
      {!stream && (
        <div className="video-placeholder">
          <span className="icon">👤</span>
          <span>Connecting...</span>
        </div>
      )}
      <span className="video-label">{shortId}</span>
    </div>
  );
}

export default function Room({ roomId, onLeave }) {
  const { localVideoRef, remoteStreams, participants, status, hasCamera } =
    useWebRTC(roomId);

  const totalPeers = participants.length + 1; // +1 for self

  function copyLink() {
    const url = `${window.location.protocol}//${window.location.host}/?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      // Simple visual feedback
      const btn = document.getElementById("copy-btn");
      if (btn) {
        btn.textContent = "✅ Copied!";
        setTimeout(() => (btn.textContent = "Copy Link"), 2000);
      }
    });
  }

  // Derive status color class
  const statusClass = status.startsWith("Call connected") || status.startsWith("Connecting")
    ? "calling"
    : status.includes("blocked") || status.includes("Cannot")
    ? "error"
    : status.startsWith("You are the first")
    ? "connected"
    : "";

  return (
    <div className="app">
      {/* Header */}
      <div className="room-header">
        <div className="room-info">
          <span className="room-label">Room</span>
          <span className="room-code">{roomId}</span>
          <button id="copy-btn" className="btn-copy" onClick={copyLink}>
            Copy Link
          </button>
        </div>
        <div className="room-meta">
          <span className="participant-count">
            👥 {totalPeers} {totalPeers === 1 ? "person" : "people"}
          </span>
          <button className="btn-leave" onClick={onLeave}>
            Leave Call
          </button>
        </div>
      </div>

      {/* Status */}
      <div className={`status-bar ${statusClass}`}>{status}</div>

      {/* Video grid */}
      <div className={`video-grid peers-${Math.min(totalPeers, 9)}`}>
        {/* Local tile (always first) */}
        <div className="video-card local">
          <video ref={localVideoRef} autoPlay playsInline muted />
          {!hasCamera && (
            <div className="video-placeholder">
              <span className="icon">📷</span>
              <span>Waiting for camera...</span>
            </div>
          )}
          <span className="video-label">You</span>
        </div>

        {/* Remote tiles — one per participant */}
        {participants.map((peerId) => (
          <RemoteVideo
            key={peerId}
            peerId={peerId}
            stream={remoteStreams.get(peerId)}
          />
        ))}
      </div>

      {/* Share panel */}
      <div className="info-box">
        <strong>Invite others to this call:</strong>
        <br />
        Share this link — anyone who opens it joins instantly:
        <br />
        <code className="share-url">
          {window.location.protocol}//{window.location.host}/?room={roomId}
        </code>
        <br />
        <br />
        <strong>Tip:</strong> Multiple rooms can run at the same time — each has its own link.
        You can also create more rooms from the home page.
      </div>
    </div>
  );
}
