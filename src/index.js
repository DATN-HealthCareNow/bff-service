const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8090;
const CORE_BASE_URL = process.env.CORE_BASE_URL || "http://core-service:8081";
const IOT_BASE_URL = process.env.IOT_BASE_URL || "http://iot-service:8082";

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

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "bff-service" });
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

app.listen(PORT, () => {
  console.log(`[bff-service] listening on port ${PORT}`);
});
