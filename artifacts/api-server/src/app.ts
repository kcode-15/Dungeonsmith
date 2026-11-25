import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";

import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim();

if (!clerkPublishableKey) {
  throw new Error(
    "Missing CLERK_PUBLISHABLE_KEY for the API. Configure the key that matches CLERK_SECRET_KEY.",
  );
}

const allowedOrigins = (process.env.CORS_ORIGINS ??
  (process.env.NODE_ENV === "production"
    ? "https://kcode-15.github.io"
    : "http://localhost:5173"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Requests from tools or health checks normally have no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
  }),
);

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(clerkMiddleware(() => ({ publishableKey: clerkPublishableKey })));

app.use("/api", router);

export default app;
