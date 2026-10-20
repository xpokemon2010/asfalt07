import { DurableObject } from "cloudflare:workers";

const GAME_HTML_B64 = "__APP_HTML_BASE64__";
const utf8 = new TextDecoder();
const GAME_HTML = utf8.decode(Uint8Array.from(atob(GAME_HTML_B64), c => c.charCodeAt(0)));
const PLAYER_SPECS = __PLAYER_SPECS_JSON__;
const RATIOS = [0, 3.05, 2.15, 1.62, 1.30, 1.08, 0.91];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "asfalt07-room-server", protocol: 1 });
    }
    if (url.pathname.startsWith("/ws/")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      const origin = request.headers.get("Origin");
      if (origin && new URL(origin).host !== url.host) {
        return new Response("Origin not allowed", { status: 403 });
      }
      const code = url.pathname.slice(4).toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) {
        return new Response("Invalid room code", { status: 400 });
      }
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(new Request(url, request));
    }
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    return new Response(GAME_HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.world = null;
    this.sockets = new Map();
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment || !attachment.seat) continue;
      this.sockets.set(ws, attachment.seat);
      if (attachment.world && (!this.world || attachment.world.rev > this.world.rev)) {
        this.world = attachment.world;
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const intent = url.searchParams.get("intent") === "create" ? "create" : "join";
    const active = this.ctx.getWebSockets();
    if (intent === "create" && active.length > 0) {
      return new Response("Room already exists", { status: 409 });
    }
    if (intent === "join" && active.length === 0) {
      return new Response("Room not found", { status: 404 });
    }
    if (active.length >= 2) return new Response("Room is full", { status: 409 });

    if (!this.world) this.world = makeWorld();
    const occupied = new Set(active.map(ws => ws.deserializeAttachment()?.seat).filter(Boolean));
    const seat = occupied.has(1) ? 2 : 1;
    if (this.world.players[seat]?.connected && occupied.has(seat)) {
      return new Response("Seat already taken", { status: 409 });
    }
    if (!this.world.players[seat] || !this.world.players[seat].connected) {
      this.world.players[seat] = makePlayer(seat);
    }
    this.world.players[seat].connected = true;
    this.world.tick = Date.now();
    this.world.rev++;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    this.sockets.set(server, seat);
    server.serializeAttachment({ seat, world: this.world, lastRx: 0 });
    this.persistWorldToAttachments();
    this.send(server, { t: "joined", seat, players: this.world.players, rev: this.world.rev });
    this.broadcast({ t: "state", players: this.world.players, rev: this.world.rev });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const attachment = ws.deserializeAttachment();
    if (!attachment || !attachment.seat || typeof raw !== "string" || raw.length > 2048) return;
    const now = Date.now();
    if (now - (attachment.lastRx || 0) < 35) return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message?.t !== "input" || !message.i || !this.world) return;
    const seat = attachment.seat;
    const player = this.world.players[seat];
    if (!player?.connected) return;
    attachment.lastRx = now;
    const i = message.i;
    player.input = {
      th: clamp(Number(i.th) || 0, 0, 1),
      br: clamp(Number(i.br) || 0, 0, 1),
      st: clamp(Number(i.st) || 0, -1, 1),
      hb: clamp(Number(i.hb) || 0, 0, 1),
    };
    player.gear = (i.gear === -1) ? -1 : clamp(Math.round(Number(i.gear) || 1), 1, 6);
    player.car = Object.hasOwn(PLAYER_SPECS, i.car) ? i.car : "coupe";
    player.color = /^#[0-9a-fA-F]{6}$/.test(i.color) ? i.color : player.color;
    player.lastInputAt = now;
    const dt = clamp((now - (this.world.tick || now)) / 1000, 0, 0.18);
    if (dt > 0) simulateWorld(this.world, dt, now);
    this.world.tick = now;
    this.world.rev++;
    this.persistWorldToAttachments();
    this.broadcast({ t: "state", players: this.world.players, rev: this.world.rev });
  }

  async webSocketClose(ws) {
    this.removeSocket(ws);
  }

  async webSocketError(ws) {
    this.removeSocket(ws);
  }

  removeSocket(ws) {
    const seat = this.sockets.get(ws) ?? ws.deserializeAttachment()?.seat;
    this.sockets.delete(ws);
    if (seat && this.world?.players[seat]) {
      const p = this.world.players[seat];
      p.connected = false;
      p.input = { th: 0, br: 1, st: 0, hb: 0 };
      p.vx *= 0.5;
      p.vz *= 0.5;
      this.world.tick = Date.now();
      this.world.rev++;
      this.persistWorldToAttachments();
      this.broadcast({ t: "state", players: this.world.players, rev: this.world.rev });
    }
  }

  persistWorldToAttachments() {
    for (const ws of this.ctx.getWebSockets()) {
      const old = ws.deserializeAttachment() || {};
      ws.serializeAttachment({ ...old, world: this.world });
      this.sockets.set(ws, old.seat);
    }
  }

  send(ws, message) {
    try { ws.send(JSON.stringify(message)); } catch { this.sockets.delete(ws); }
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { this.sockets.delete(ws); }
    }
  }
}

function makeWorld() {
  return {
    rev: 0,
    tick: Date.now(),
    players: {
      1: makePlayer(1),
      2: makePlayer(2),
    },
  };
}

function makePlayer(seat) {
  return {
    x: seat === 1 ? -101 : -95,
    z: seat === 1 ? -59 : -64,
    yaw: 2.27,
    vx: 0,
    vz: 0,
    gear: 1,
    car: "coupe",
    color: seat === 1 ? "#ff7438" : "#55d6c2",
    connected: false,
    input: { th: 0, br: 0, st: 0, hb: 0 },
    lastInputAt: Date.now(),
  };
}

function simulateWorld(world, dt, now) {
  for (const p of Object.values(world.players)) {
    if (!p.connected) continue;
    const input = now - p.lastInputAt > 450 ? { th: 0, br: 1, st: 0, hb: 0 } : p.input;
    const spec = PLAYER_SPECS[p.car] || PLAYER_SPECS.coupe;
    const ratio = p.gear === -1 ? 2.65 : RATIOS[p.gear] || 1;
    const direction = p.gear === -1 ? -1 : 1;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let vf = p.vx * fx + p.vz * fz;
    let vs = p.vx * rx + p.vz * rz;
    vf += spec.power * 0.15 * ratio / spec.weight * input.th * direction * dt;
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), input.br * 15 * dt);
    vf *= Math.exp(-0.025 * dt);
    vs *= Math.exp(-spec.grip * (input.hb ? 0.42 : 1) * dt);
    p.yaw -= input.st * (0.52 + Math.min(34, Math.abs(vf)) * 0.024) * (vf < -0.15 ? -1 : 1) * dt;
    p.vx = fx * vf + rx * vs;
    p.vz = fz * vf + rz * vs;
    const speed = Math.hypot(p.vx, p.vz);
    if (speed > spec.max) { p.vx *= spec.max / speed; p.vz *= spec.max / speed; }
    p.x = clamp(p.x + p.vx * dt, -232, 232);
    p.z = clamp(p.z + p.vz * dt, -190, 190);
  }
}
