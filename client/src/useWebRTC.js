import { useEffect, useRef, useState } from "react";

// ── Bug Fix 1: Use the Vite proxy path (/ws) NOT a direct ws:// URL.
// Browsers BLOCK ws:// connections from https:// pages (mixed content).
// The Vite proxy handles the wss:// → ws://localhost:3001 upgrade securely.
const getSignalingServerURL = () => {
  const host = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${host}:${port}/ws`;
};

// ── Bug Fix 3: Restore TURN servers.
// Without TURN, ICE can fail silently and video never flows.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export function useWebRTC(roomId) {
  const localVideoRef   = useRef(null);
  const webSocket       = useRef(null);
  const localStream     = useRef(null);
  const myPeerId        = useRef(null);
  const peerConnections = useRef(new Map()); // Map<peerId, RTCPeerConnection>

  // ── Bug Fix 2: ICE candidate queue.
  // Candidates arriving before setRemoteDescription() must be buffered,
  // otherwise addIceCandidate() throws and the candidate is lost forever.
  const iceCandidateQueues = useRef(new Map()); // Map<peerId, candidate[]>

  const [status, setStatus]           = useState("Initializing...");
  const [hasCamera, setHasCamera]     = useState(false);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // Map<peerId, MediaStream>
  const [participants, setParticipants]  = useState([]);        // peerId[]

  // ── Mute/Unmute State
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // ── Helper: send JSON to signaling server
  function sendSignal(msg) {
    if (webSocket.current?.readyState === WebSocket.OPEN) {
      webSocket.current.send(JSON.stringify(msg));
    }
  }

  // ── Helper: flush queued ICE candidates after remote description is set
  async function flushIceCandidates(peerId) {
    const queue = iceCandidateQueues.current.get(peerId) || [];
    if (queue.length === 0) return;
    const pc = peerConnections.current.get(peerId);
    if (!pc) return;
    console.log(`[ICE] Flushing ${queue.length} queued candidates for ${peerId.slice(0,6)}`);
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { /* ignore */ }
    }
    iceCandidateQueues.current.delete(peerId);
  }

  // ── Bug Fix 4: Return existing PC instead of undefined
  // Creates a new RTCPeerConnection for remotePeerId, or returns existing one.
  async function createPeerConnection(remotePeerId, isInitiator) {
    // ← Previously returned `undefined` here, breaking the offer/answer flow
    if (peerConnections.current.has(remotePeerId)) {
      return peerConnections.current.get(remotePeerId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(remotePeerId, pc);

    // Add all local tracks to this peer connection
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) =>
        pc.addTrack(track, localStream.current)
      );
    }

    // When we have an ICE candidate, send it to the remote peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sendSignal({ type: "ice-candidate", to: remotePeerId, candidate });
      }
    };

    // Log ICE state changes for debugging
    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE] ${remotePeerId.slice(0,6)}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "closed") {
        removePeer(remotePeerId);
      }
    };

    // When the remote peerss video/audio tracks arrive — update state
    pc.ontrack = (event) => {
      console.log(`[ontrack] Track received from ${remotePeerId.slice(0,6)}`, event.streams);
      const stream = event.streams?.[0];
      if (stream) {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(remotePeerId, stream);
          return next;
        });
      }
    };

    // If we are the initiator (new joiner), create and send the offer
    if (isInitiator) {
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", to: remotePeerId, sdp: pc.localDescription });
    }

    return pc;
  }

  function removePeer(peerId) {
    peerConnections.current.get(peerId)?.close();
    peerConnections.current.delete(peerId);
    iceCandidateQueues.current.delete(peerId);
    setRemoteStreams((prev) => { const n = new Map(prev); n.delete(peerId); return n; });
    setParticipants((prev) => prev.filter((id) => id !== peerId));
  }

  // ── Toggle Audio (Mute/Unmute)
  function toggleAudio() {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }

  // ── Toggle Video (Camera On/Off)
  function toggleVideo() {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  }

  useEffect(() => {
    if (!roomId) return;
    let isMounted = true;

    async function setup() {
      // Step 1: get camera + mic
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (err) {
        console.error("Camera error:", err);
        setStatus("❌ Camera/mic access denied. Please allow and refresh.");
        return;
      }
      if (!isMounted) return;

      localStream.current = stream;
      setHasCamera(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // Step 2: connect to signaling server via Vite proxy
      const wsURL = getSignalingServerURL();
      console.log("[WS] Connecting to:", wsURL);
      const ws = new WebSocket(wsURL);
      webSocket.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected. Joining room:", roomId);
        ws.send(JSON.stringify({ type: "join", roomId }));
      };

      ws.onerror = (e) => {
        console.error("[WS] Error:", e);
        if (isMounted) setStatus("❌ Cannot reach signaling server. Is it running?");
      };

      ws.onclose = () => {
        console.log("[WS] Closed");
        if (isMounted) setStatus("⚠️ Server disconnected. Refresh to reconnect.");
      };

      ws.onmessage = async (event) => {
        if (!isMounted) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }

        console.log(`[WS] ${message.type} from: ${message.from?.slice(0,6) || "server"}`);

        // ── Server confirmed we joined the room
        if (message.type === "room-joined") {
          myPeerId.current = message.peerId;
          setParticipants(message.existingPeers);
          setStatus(
            message.existingPeers.length
              ? `Connecting to ${message.existingPeers.length} peer(s)...`
              : "You're the first here! Share the link to invite others."
          );
          // We are the new joiner → send offers to every existing peer
          for (const peerId of message.existingPeers) {
            await createPeerConnection(peerId, true);
          }
        }

        // ── A new peer just joined (we are an existing peer — wait for their offer)
        if (message.type === "peer-joined") {
          setParticipants((prev) =>
            prev.includes(message.peerId) ? prev : [...prev, message.peerId]
          );
        }

        // ── We received an offer from the new joiner → answer it
        if (message.type === "offer") {
          const pc = await createPeerConnection(message.from, false);
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          // ← Flush any ICE candidates that arrived before setRemoteDescription
          await flushIceCandidates(message.from);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: "answer", to: message.from, sdp: pc.localDescription });
          setStatus("📞 Call connected!");
        }

        // ── We received an answer to our offer
        if (message.type === "answer") {
          const pc = peerConnections.current.get(message.from);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
            // ← Flush any ICE candidates that arrived before setRemoteDescription
            await flushIceCandidates(message.from);
            setStatus("📞 Call connected!");
          }
        }

        // ── ICE candidate from a peer
        if (message.type === "ice-candidate" && message.candidate) {
          const pc = peerConnections.current.get(message.from);
          if (!pc) return;

          if (pc.remoteDescription && pc.remoteDescription.type) {
            // Remote description is set — add immediately
            try { await pc.addIceCandidate(new RTCIceCandidate(message.candidate)); }
            catch (e) { console.warn("[ICE] addIceCandidate error:", e.message); }
          } else {
            // ← Bug Fix 2: Remote description not set yet — queue the candidate
            if (!iceCandidateQueues.current.has(message.from)) {
              iceCandidateQueues.current.set(message.from, []);
            }
            iceCandidateQueues.current.get(message.from).push(message.candidate);
            console.log(`[ICE] Queued candidate for ${message.from.slice(0,6)}`);
          }
        }

        // ── A peer left the room
        if (message.type === "peer-left") {
          removePeer(message.peerId);
          setStatus("A participant left the call.");
        }
      };
    }

    setup();

    return () => {
      isMounted = false;
      webSocket.current?.close();
      peerConnections.current.forEach((pc) => pc.close());
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId]);

  return {
    localVideoRef,
    remoteStreams,
    participants,
    status,
    hasCamera,
    myPeerId: myPeerId.current,
    isMuted,
    isCameraOff,
    toggleAudio,
    toggleVideo,
  };
}
