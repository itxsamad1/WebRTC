import { useRef, useEffect, useCallback } from "react";
import { useWebRTC } from "../useWebRTC";
import "../App.css";

// RemoteVideo: Renders a single remote peer's video stream.
// Uses THREE mechanisms to ensure srcObject always gets set:
//   1. ref callback (fires on mount/unmount)
//   2. useEffect watching the stream prop (fires when stream arrives later)
//   3. Direct check in the ref callback (fires if stream already there on mount)
function RemoteVideo({ peerId, stream }) {
  const videoRef = useRef(null);
  const shortId  = peerId.slice(0, 6);

  // Mechanism 1 & 3: ref callback — runs whenever DOM element mounts/unmounts
  const setVideoRef = useCallback(
    (element) => {
      videoRef.current = element;
      if (element && stream) {
        element.srcObject = stream;
      }
    },
    [stream]
  );

  // Mechanism 2: stream prop changed (arrive late, or stream replaced)
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-card remote">
      <video ref={setVideoRef} autoPlay playsInline />
      {!stream && (
        <div className="video-placeholder">
          <span className="icon">👤</span>
          <span>Connecting {shortId}…</span>
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
      const btn = document.getElementById("copy-btn");
      if (btn) {
        btn.textContent = "✅ Copied!";
        setTimeout(() => (btn.textContent = "Copy Link"), 2000);
      }
    });
  }

  const statusClass =
    status.startsWith("📞") ? "calling" :
    status.startsWith("❌") ? "error" :
    status.startsWith("You") ? "connected" : "";

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

      {/* Status bar */}
      <div className={`status-bar ${statusClass}`}>{status}</div>

      {/* Video grid — adapts by total peer count */}
      <div className={`video-grid peers-${Math.min(totalPeers, 9)}`}>

        {/* Local video tile */}
        <div className="video-card local">
          <video ref={localVideoRef} autoPlay playsInline muted />
          {!hasCamera && (
            <div className="video-placeholder">
              <span className="icon">📷</span>
              <span>Waiting for camera…</span>
            </div>
          )}
          <span className="video-label">You</span>
        </div>

        {/* One tile per remote participant */}
        {participants.map((peerId) => (
          <RemoteVideo
            key={peerId}
            peerId={peerId}
            stream={remoteStreams.get(peerId) || null}
          />
        ))}
      </div>

      {/* Invite panel */}
      <div className="info-box">
        <strong>Invite others to this call:</strong>
        <br />
        Anyone who opens this link joins instantly — no app needed:
        <br />
        <code className="share-url">
          {window.location.protocol}//{window.location.host}/?room={roomId}
        </code>
      </div>
    </div>
  );
}
