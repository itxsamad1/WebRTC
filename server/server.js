const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

//for CORS for vite
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

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

      // Create room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
        console.log(` Room created: ${roomId}`);
      }

      const room = rooms.get(roomId);

      // Tell the new peer their ID and who else is in the room
      const existingPeers = [...room.keys()];
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
      });

      // Add to room
      room.set(currentPeerId, socket);
      console.log(` Peer ${currentPeerId} joined room ${roomId} (${room.size} total)`);
    }

    // ---- RELAY: offer / answer / ice-candidate (addressed to specific peer) ----
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

  //PEER DISCONNECTS
  socket.on("close", () => {
    if (currentRoomId && currentPeerId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.delete(currentPeerId);
        broadcastToRoom(currentRoomId, {
          type: "peer-left",
          peerId: currentPeerId,
        });
        console.log(` Peer ${currentPeerId} left room ${currentRoomId} (${room.size} remaining)`);

        // Clean up empty rooms
        if (room.size === 0) {
          rooms.delete(currentRoomId);
          console.log(` Room ${currentRoomId} deleted (empty)`);
        }
      }
    }
  });

  socket.on("error", (err) => {
    console.log("Socket error:", err.message);
  });
});

// Debug endpoint — see all active rooms
app.get("/rooms", (req, res) => {
  const roomList = {};
  for (const [roomId, room] of rooms.entries()) {
    roomList[roomId] = room.size;
  }
  res.json({ activeRooms: roomList, total: rooms.size });
});

app.get("/", (req, res) => {
  res.send("WebRTC Multi-Room Signaling Server is running!");
});

// start
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
  console.log("   WebRTC Multi-Room Signaling Server Started");
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIP}:${PORT}`);
  console.log(`\n   Link for p2p connection on same wifi:`);
  console.log(`     https://${localIP}:5173\n`);
  console.log("   Anyone can create a room and share the link!");
});
