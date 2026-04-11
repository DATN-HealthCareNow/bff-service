const express = require("express");
const axios = require("axios");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8090;
const CORE_BASE_URL = process.env.CORE_BASE_URL || "http://core-service:8081";
const IOT_BASE_URL = process.env.IOT_BASE_URL || "http://iot-service:8082";
const NOTIFICATION_BASE_URL = process.env.NOTIFICATION_BASE_URL || "http://notification-service:8084";

const server = http.createServer(app);
const wsServer = new WebSocketServer({ noServer: true });
const connectionsByUser = new Map();

const extractForwardHeaders = (req) => {
  const headers = {};
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }
  if (req.headers["x-user-id"]) {
    headers["x-user-id"] = req.headers["x-user-id"];
  }
  if (req.headers["x-correlation-id"]) {
    headers["x-correlation-id"] = req.headers["x-correlation-id"];
  }
  return headers;
};

const registerConnection = (userId, socket) => {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return false;
  }

  if (!connectionsByUser.has(normalizedUserId)) {
    connectionsByUser.set(normalizedUserId, new Set());
  }

  connectionsByUser.get(normalizedUserId).add(socket);
  socket.userId = normalizedUserId;
  return true;
};

const unregisterConnection = (socket) => {
  const userId = socket.userId;
  if (!userId || !connectionsByUser.has(userId)) {
    return;
  }

  const connections = connectionsByUser.get(userId);
  connections.delete(socket);

  if (connections.size === 0) {
    connectionsByUser.delete(userId);
  }
};

const broadcastNotification = (notification) => {
  const userId = notification?.userId?.trim();
  if (!userId || !connectionsByUser.has(userId)) {
    return 0;
  }

  const payload = JSON.stringify({
    eventType: "NOTIFICATION_DELIVERED",
    deliveredAt: new Date().toISOString(),
    notification,
  });

  let sentCount = 0;
  const connections = connectionsByUser.get(userId);
  for (const socket of connections) {
    if (socket.readyState === 1) {
      socket.send(payload);
      sentCount += 1;
    }
  }

  return sentCount;
};

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "bff-service" });
});

app.post("/api/v1/bff/mobile/notifications/broadcast", (req, res) => {
  const notification = req.body || {};
  const deliveredCount = broadcastNotification(notification);

  res.status(200).json({
    success: true,
    userId: notification.userId || null,
    deliveredCount,
  });
});

app.get("/api/v1/bff/mobile/notifications", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.get(
      `${NOTIFICATION_BASE_URL}/api/v1/notifications`,
      {
        headers,
        params: {
          page: req.query.page ?? 0,
          size: req.query.size ?? 20,
        },
      },
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "notification_list_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.get("/api/v1/bff/mobile/notifications/unread-count", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.get(
      `${NOTIFICATION_BASE_URL}/api/v1/notifications/unread-count`,
      { headers },
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "notification_unread_count_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.patch("/api/v1/bff/mobile/notifications/:notificationId/read", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.patch(
      `${NOTIFICATION_BASE_URL}/api/v1/notifications/${req.params.notificationId}/read`,
      req.body || {},
      { headers },
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "notification_mark_read_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.patch("/api/v1/bff/mobile/notifications/read-all", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.patch(
      `${NOTIFICATION_BASE_URL}/api/v1/notifications/read-all`,
      req.body || {},
      { headers },
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "notification_mark_all_read_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.get("/api/v1/bff/mobile/notifications/preferences", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.get(
      `${NOTIFICATION_BASE_URL}/api/v1/notifications/preferences`,
      { headers },
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "notification_preferences_get_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.patch("/api/v1/bff/mobile/notifications/preferences", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.patch(
      `${NOTIFICATION_BASE_URL}/api/v1/notifications/preferences`,
      req.body || {},
      { headers },
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "notification_preferences_update_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.get("/api/v1/bff/mobile/hydration", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const [progressResp, logsResp] = await Promise.all([
      axios.get(`${CORE_BASE_URL}/api/v1/water-intake/progress`, { headers }),
      axios.get(`${IOT_BASE_URL}/api/v1/water/logs/today`, { headers }),
    ]);

    res.json({
      progress: progressResp.data,
      logs: Array.isArray(logsResp.data) ? logsResp.data : [],
    });
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "hydration_fetch_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.post("/api/v1/bff/mobile/hydration/log", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const response = await axios.post(`${IOT_BASE_URL}/api/v1/water/log`, req.body, { headers });
    res.status(response.status).json(response.data || { success: true });
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "hydration_log_failed",
      message: error.response?.data || error.message,
    });
  }
});

app.get("/api/v1/bff/mobile/home", async (req, res) => {
  const headers = extractForwardHeaders(req);

  try {
    const [waterProgressResp, schedulesResp] = await Promise.all([
      axios.get(`${CORE_BASE_URL}/api/v1/water-intake/progress`, { headers }),
      axios.get(`${IOT_BASE_URL}/api/v1/schedules/upcoming`, { headers }),
    ]);

    const schedules = Array.isArray(schedulesResp.data) ? schedulesResp.data : [];

    res.json({
      water_progress: waterProgressResp.data,
      upcoming_schedules: schedules,
      total_upcoming_schedules: schedules.length,
    });
  } catch (error) {
    const statusCode = error.response?.status || 502;
    res.status(statusCode).json({
      error: "home_aggregate_failed",
      message: error.response?.data || error.message,
    });
  }
});

server.on("upgrade", (request, socket, head) => {
  if (!request.url?.startsWith("/api/v1/bff/mobile/ws")) {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (webSocket) => {
    wsServer.emit("connection", webSocket, request);
  });
});

wsServer.on("connection", (socket, request) => {
  const wsUrl = new URL(request.url || "/", "http://localhost");
  const userIdFromQuery = wsUrl.searchParams.get("userId");
  const userIdFromHeader = request.headers["x-user-id"];
  const userId = userIdFromQuery || (Array.isArray(userIdFromHeader) ? userIdFromHeader[0] : userIdFromHeader);
  const authorized = registerConnection(userId, socket);

  if (!authorized) {
    socket.close(1008, "Missing user context");
    return;
  }

  socket.send(JSON.stringify({
    eventType: "CONNECTED",
    userId: socket.userId,
    connectedAt: new Date().toISOString(),
  }));

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      if (message?.type === "PING") {
        socket.send(JSON.stringify({ type: "PONG", timestamp: new Date().toISOString() }));
      }
    } catch (error) {
      console.warn("[bff-service] Invalid websocket payload", error.message);
    }
  });

  socket.on("close", () => unregisterConnection(socket));
  socket.on("error", () => unregisterConnection(socket));
});

server.listen(PORT, () => {
  console.log(`[bff-service] listening on port ${PORT}`);
});
