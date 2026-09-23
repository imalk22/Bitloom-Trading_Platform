import { io } from "socket.io-client";
import { API_BASE } from "./config.js";

const isDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;

/**
 * Dev: talk to the backend directly (Vite's /socket.io proxy is unreliable on
 * Windows and breaks chat). Prod: use VITE_API_URL when set, otherwise same origin.
 */
function resolveSocketUrl() {
  if (API_BASE) return API_BASE;
  if (isDev) return "http://127.0.0.1:3001";
  return undefined;
}

const url = resolveSocketUrl();
const shouldConnect = Boolean(url) || isDev;

const socket = io(url, {
  autoConnect: shouldConnect,
  path: "/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 5000,
  timeout: 12000,
});

export function waitForSocket(timeoutMs = 10000) {
  if (socket.connected) return Promise.resolve(true);
  if (!shouldConnect) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onErr);
      resolve(ok);
    };
    const onConnect = () => finish(true);
    const onErr = () => { /* keep waiting until timeout */ };
    const timer = setTimeout(() => finish(socket.connected), timeoutMs);
    socket.once("connect", onConnect);
    socket.on("connect_error", onErr);
    try {
      if (!socket.connected) socket.connect();
    } catch {
      finish(false);
    }
  });
}

export default socket;
