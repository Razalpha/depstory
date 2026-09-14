import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const requestedPort = Number.parseInt(process.env.DEPSTORY_SITE_PORT ?? "4173", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
  ? requestedPort
  : 4173;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function fileForRequest(requestUrl = "/") {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname)
    .replaceAll("\\", "/");
  if (pathname.split("/").includes("..")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const absolute = path.resolve(root, relative);
  return absolute === root || absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

export function createSiteServer() {
  return createServer(async (request, response) => {
    let file;
    try {
      file = fileForRequest(request.url);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    if (!file) {
      response.writeHead(400).end("Bad request");
      return;
    }
    try {
      const details = await stat(file);
      if (!details.isFile()) throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": details.size,
        "Content-Type": contentTypes.get(path.extname(file)) ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(file).pipe(response);
    } catch (error) {
      if (error.code !== "ENOENT") console.error(error);
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
}

const isEntrypoint = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  const server = createSiteServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`depstory site: http://127.0.0.1:${port}`);
  });
}
