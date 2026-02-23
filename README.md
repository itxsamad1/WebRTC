# 🎥 Multi-Room WebRTC Video Call App

A peer-to-peer video & audio calling application built with **React**, **Vite**, and **Node.js (WebSocket)**. Now supports multiple rooms and multiple participants per call!

## 🚀 Quick Start (2 terminals)

### 1. Start the Signaling Server
```bash
cd server
node server.js
```
The server will start and print your **Network IP**. Share this with anyone on the same Wi-Fi.

### 2. Start the Web App
```bash
cd client
npm run dev
```
Open the provided URL (usually `https://localhost:5173`) in your browser.

---

## 🛠 Features
- **Multi-Room Support:** Create a room and share the unique code or link.
- **Multi-Participant:** Join a room with multiple people (Mesh topology).
- **Auto-Connect:** New joiners automatically trigger connection offers to existing peers.
- **Responsive Grid:** Video layout adapts based on the number of participants.
- **Direct P2P:** Video and audio flow directly between devices using WebRTC.
- **NAT Traversal:** Includes STUN/TURN servers to help connect over different network types.

## 📦 Project Structure
```
WebRTC/
├── server/
│   ├── server.js       ← Node.js Multi-room WebSocket signaling server
│   └── package.json
└── client/
    ├── src/
    │   ├── pages/
    │   │   ├── Home.jsx    ← Entry page (Create/Join rooms)
    │   │   └── Room.jsx    ← Video call room logic
    │   ├── App.jsx         ← Simple URL-based router
    │   ├── useWebRTC.js    ← Mesh-network WebRTC logic
    │   └── ...
    └── vite.config.js
```

---

## 📱 How to Use
1. **Home Page:** Choose to "Create New Room" or "Join" with a code.
2. **Invite:** Copy the link from the header and send it to your friends.
3. **Connect:** Once someone joins your link, you will see their video instantly.

*Note: For local development, both devices must be on the same Wi-Fi network unless you use a public signaling server.*
