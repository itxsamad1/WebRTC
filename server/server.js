const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

// Simple health check
app.get("/", (req, res) => {
  res.send("WebRTC Multi-Room Signaling Server is running!");
});

// Create a SEPARATE WebSocket server on port 3001
const wss = new WebSocket.Server({ server });

// rooms: Map<roomId, Map<peerId, WebSocket>>
const rooms = new Map();

function generateId(bytes = 3) {
  return crypto.randomBytes(bytes).toString("hex").toUpperCase();
}

function safeSend(socket, data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId, message, excludePeerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [peerId, socket] of room.entries()) {
    if (peerId !== excludePeerId) {
      safeSend(socket, message);
    }
  }
}

wss.on("connection", (socket) => {
  let currentRoomId = null;
  let currentPeerId = null;

  console.log(" New socket connection attempt...");

  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    // ---- JOIN ROOM ----
    if (message.type === "join") {
      const { roomId } = message;
      currentRoomId = roomId;
      currentPeerId = generateId();

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
        console.log(` [+] Room created: ${roomId}`);
      }

      const room = rooms.get(roomId);
      const existingPeers = Array.from(room.keys());

      // Tell the new peer their ID and who else is there
      safeSend(socket, {
        type: "room-joined",
        peerId: currentPeerId,
        roomId,
        existingPeers,
      });

      // Tell everyone else a new peer arrived
      broadcastToRoom(roomId, {
        type: "peer-joined",
        peerId: currentPeerId,
      }, currentPeerId);

      room.set(currentPeerId, socket);
      console.log(` [>] Peer ${currentPeerId} joined room ${roomId} (Total: ${room.size})`);
    }

    // ---- RELAY: offer / answer / ice-candidate ----
    if (["offer", "answer", "ice-candidate"].includes(message.type)) {
      const room = rooms.get(currentRoomId);
      if (!room) return;

      const targetSocket = room.get(message.to);
      if (targetSocket) {
        safeSend(targetSocket, {
          ...message,
          from: currentPeerId,
        });
      }
    }
  });

  socket.on("close", () => {
    if (currentRoomId && currentPeerId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.delete(currentPeerId);
        broadcastToRoom(currentRoomId, {
          type: "peer-left",
          peerId: currentPeerId,
        });
        console.log(` [-] Peer ${currentPeerId} left room ${currentRoomId} (${room.size} left)`);

        if (room.size === 0) {
          rooms.delete(currentRoomId);
          console.log(` [x] Room ${currentRoomId} deleted`);
        }
      }
    }
  });

  socket.on("error", (err) => {
    console.error(`Socket error (${currentPeerId}):`, err.message);
  });
});

const PORT = 3001;
server.listen(PORT, "0.0.0.0", () => {
  const networkInterfaces = os.networkInterfaces();
  let localIP = "localhost";
  for (const iface of Object.values(networkInterfaces)) {
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        localIP = addr.address;
        break;
      }
    }
  }
  console.log("\n===========================================");
  console.log("   🚀 MULTI-ROOM SIGNALING SERVER UP");
  console.log("===========================================");
  console.log(`  Local IP: ${localIP}`);
  console.log(`  Port:     ${PORT}`);
  console.log("===========================================\n");
});
