import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Room from "./pages/Room";
import "./App.css";

// Simple URL-based router using ?room=CODE
function getRoomFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("room") || null;
}

function setRoomInURL(roomId) {
  const url = roomId
    ? `${window.location.pathname}?room=${roomId}`
    : window.location.pathname;
  window.history.pushState({}, "", url);
}

function App() {
  const [roomId, setRoomId] = useState(getRoomFromURL);

  // Sync browser back/forward
  useEffect(() => {
    const onPop = () => setRoomId(getRoomFromURL());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function handleJoin(id) {
    setRoomInURL(id);
    setRoomId(id);
  }

  function handleLeave() {
    setRoomInURL(null);
    setRoomId(null);
  }

  return roomId ? (
    <Room roomId={roomId} onLeave={handleLeave} />
  ) : (
    <Home onJoin={handleJoin} />
  );
}

export default App;
