# WebRTC Video Call App — How to Run

## Quick Start (2 terminals)

### Terminal 1 — Start the Signaling Server
```
cd server
npm start
```
This will print your **LAN IP address** in the terminal. Share that link with your friend!

### Terminal 2 — Start the Web App
```
cd client
npm run dev
```
Then open `http://localhost:5173` in your browser.

---

## How the Call Works
1. **You** open `http://localhost:5173` in your browser  
2. **Friend** opens `http://<YOUR_LAN_IP>:5173` (same Wi-Fi required)  
3. **You** click **"Start Call"**  
4. Both see each other's video and hear audio!

## Project Structure
```
WebRTC/
├── server/
│   ├── server.js       ← Node.js WebSocket signaling server
│   └── package.json
└── client/
    ├── src/
    │   ├── App.jsx         ← Main UI (video boxes, button)
    │   ├── App.css         ← Styles
    │   ├── useWebRTC.js    ← All WebRTC logic
    │   └── main.jsx
    └── vite.config.js
```
