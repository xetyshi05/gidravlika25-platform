// Stand-in for services/image-worker in browser E2E: the real worker needs the
// rembg model. Same contract (POST /remove-background -> image/png); a PNG is
// returned unchanged, anything else is rejected like an undecodable image.
import { createServer } from "node:http";
import { ports } from "../environment.mjs";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"ok":true}');
    return;
  }
  if (request.method !== "POST" || request.url !== "/remove-background") {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (!body.subarray(0, pngSignature.length).equals(pngSignature)) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end('{"detail":"Image cannot be decoded."}');
    return;
  }
  response.writeHead(200, { "Content-Type": "image/png" });
  response.end(body);
});

server.listen(ports.imageWorker, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
