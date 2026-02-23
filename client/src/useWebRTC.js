//  Flow:
//  1. Gets your camera & microphone  (getUserMedia)
//  2. Opens a WebSocket to the signaling server
//  3. Sends "join" with the roomId -> server assigns a peerId
//  4. CALLER clicks "Start Call" -> creates an offer -> sends it
//  5. CALLEE receives the offer automatically -> sends answer back
//  6. Both sides exchange ICE candidates
//  7. Video/audio flows peer-to-peer

import { useEffect, useRef, useState } from "react";

const getSignalingServerURL = () => {
  const host = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${host}:${port}/ws`;
};

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
  const localVideoRef  = useRef(null);
  const webSocket      = useRef(null);
  const localStream    = useRef(null);
  const myPeerId       = useRef(null);

  // Map<peerId, RTCPeerConnection>
  const peerConnections = useRef(new Map());

  const [status, setStatus]           = useState("Initializing...");
  const [hasCamera, setHasCamera]     = useState(false);
  // Map<peerId, MediaStream> – triggers re-render on change
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  // ordered list of remote peerIds (for stable video grid)
  const [participants, setParticipants]  = useState([]);

  // Keep a stable ref to sendSignal so createPeerConnection can use it
  const wsRef = webSocket;

  function sendSignal(message) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }

  // Create (or retrieve) an RTCPeerConnection to a remote peer.
  // isInitiator = true  → we create the offer (we are the new joiner)
  // isInitiator = false → we wait for their offer (we are existing peer)
  async function createPeerConnection(remotePeerId, isInitiator) {
    // Avoid duplicate connections
    if (peerConnections.current.has(remotePeerId)) {
      return peerConnections.current.get(remotePeerId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(remotePeerId, pc);

    // Add our camera/mic tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) =>
        pc.addTrack(track, localStream.current)
      );
    }

    // Send ICE candidates to the other peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: "ice-candidate",
          to: remotePeerId,
          candidate: event.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE [${remotePeerId.slice(0,6)}]:`, pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
      if (
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "closed"
      ) {
        removePeer(remotePeerId);
      }
    };

    // When the remote stream arrives, add it to our state map
    pc.ontrack = (event) => {
      console.log(`Track received from ${remotePeerId.slice(0,6)}`);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(remotePeerId, event.streams[0]);
        return next;
      });
    };

    // If we are the initiator, create and send the offer
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({
        type: "offer",
        to: remotePeerId,
        sdp: pc.localDescription,
      });
    }

    return pc;
  }

  function removePeer(peerId) {
    peerConnections.current.get(peerId)?.close();
    peerConnections.current.delete(peerId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setParticipants((prev) => prev.filter((id) => id !== peerId));
  }

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function setup() {
      // Step 1: get camera
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch (err) {
        console.error("Camera error:", err);
        setStatus("Camera/mic blocked. Please allow access and refresh.");
        return;
      }
      if (cancelled) return;

      localStream.current = stream;
      setHasCamera(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // Step 2: connect to signaling server
      const ws = new WebSocket(getSignalingServerURL());
      webSocket.current = ws;

      ws.onopen = () => {
        setStatus("Joining room...");
        ws.send(JSON.stringify({ type: "join", roomId }));
      };

      ws.onerror = () =>
        setStatus("Cannot reach signaling server. Is it running?");

      ws.onclose = () => {
        if (!cancelled) setStatus("Disconnected from server.");
      };

      ws.onmessage = async (event) => {
        if (cancelled) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        console.log("Message:", message.type, message);

        // ---- Server confirmed we joined ---
        if (message.type === "room-joined") {
          myPeerId.current = message.peerId;
          const existing = message.existingPeers;

          setParticipants(existing);

          if (existing.length === 0) {
            setStatus("You are the first one here! Share the link to invite others.");
          } else {
            setStatus(`Connecting to ${existing.length} participant(s)...`);
          }

          // We are the new joiner → send offers to all existing peers
          for (const peerId of existing) {
            await createPeerConnection(peerId, true); // we're initiator
          }
        }

        // ---- A new peer joined the room (server tells existing peers) ----
        if (message.type === "peer-joined") {
          // Just update the participant list — the new joiner will send us an offer
          setParticipants((prev) =>
            prev.includes(message.peerId) ? prev : [...prev, message.peerId]
          );
          setStatus("Someone joined the room!");
        }

        //Someone sent us an offer
        if (message.type === "offer") {
          const pc = await createPeerConnection(message.from, false); // we are not initiator
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({
            type: "answer",
            to: message.from,
            sdp: pc.localDescription,
          });
          setStatus("Call connected!");
        }

        // ---- Received an answer to our offer ----
        if (message.type === "answer") {
          const pc = peerConnections.current.get(message.from);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
            setStatus("Call connected!");
          }
        }

        // ---- ICE candidate from another peer ----
        if (message.type === "ice-candidate") {
          const pc = peerConnections.current.get(message.from);
          if (pc && message.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
            } catch (err) {
              console.error("ICE error:", err);
            }
          }
        }

        // ---- A peer left ----
        if (message.type === "peer-left") {
          removePeer(message.peerId);
          setStatus("A participant left the call.");
        }
      };
    }

    setup();

    return () => {
      cancelled = true;
      webSocket.current?.close();
      for (const pc of peerConnections.current.values()) pc.close();
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
  };
}
