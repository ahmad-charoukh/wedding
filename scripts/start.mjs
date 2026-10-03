import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../server/api.mjs";
import { db } from "../server/db.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

process.env.NODE_ENV = "production";

const conn = await db();
await conn.query(
  readFileSync(
    new URL("../netlify/database/migrations/001_wedding.sql", import.meta.url),
    "utf8"
  )
);

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist"
);

const port = Number(process.env.PORT || 3000);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ttf": "font/ttf"
};

const server = http.createServer(async (req, res) => {
  try {
    const proto = (req.headers["x-forwarded-proto"] || "http")
      .toString()
      .split(",")[0];

    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || "/", `${proto}://${host}`);

    if (url.pathname.startsWith("/api/")) {
      const chunks = [];

      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body:
          ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Buffer.concat(chunks)
      });

      const ip = (
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "local"
      )
        .toString()
        .split(",")[0];

      const response = await handler(request, { ip });

      res.writeHead(
        response.status,
        Object.fromEntries(response.headers)
      );

      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    let rel = decodeURIComponent(url.pathname);

    if (rel === "/" || rel.endsWith("/")) {
      rel += "index.html";
    }

    rel = rel.replace(/^\/+/, "");

    let file = path.resolve(root, rel);

    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      file = path.join(root, "index.html");
    }

    const data = await readFile(file);

    res.writeHead(200, {
      "Content-Type":
        mime[path.extname(file).toLowerCase()] ||
        "application/octet-stream"
    });

    if (req.method === "HEAD") res.end();
    else res.end(data);

  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Internal server error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Wedding site running on port ${port}`);
});
