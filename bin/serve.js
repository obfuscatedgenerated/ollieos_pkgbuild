#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.argv[2] || 3006;
const dist_dir = path.resolve(process.cwd(), "dist");

if (!fs.existsSync(dist_dir)) {
    console.error(`Error: dist directory "${dist_dir}" does not exist. Please build the package first.`);
    process.exit(1);
}

const mimes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".woff": "application/font-woff",
    ".ttf": "application/font-ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".otf": "application/font-otf",
    ".wasm": "application/wasm"
};

const server = http.createServer((req, res) => {
    let file_path = path.join(dist_dir, req.url === "/" ? "/index.html" : req.url);
    const extname = String(path.extname(file_path)).toLowerCase();

    const content_type = mimes[extname] || "application/octet-stream";

    fs.readFile(file_path, (error, content) => {
        if (error) {
            if (error.code === "ENOENT") {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("404 Not Found", "utf-8");
            } else {
                res.writeHead(500);
                res.end(`500 Internal Server Error: ${error.code}`, "utf-8");
            }
        } else {
            res.writeHead(200, { "Content-Type": content_type });
            res.end(content, "utf-8");
        }
    });
});

server.listen(port, () => {
    console.log(`Package dist served at http://localhost:${port}/`);
});
