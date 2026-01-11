#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const ws = require("ws");

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

const read_dir_recursive = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(read_dir_recursive(file));
        } else {
            results.push(path.relative(dist_dir, file).replace(/\\/g, "/"));
        }
    });

    return results;
}

const server = http.createServer((req, res) => {
    // if the request is for /list, return array of files in dist directory
    if (req.url === "/list") {
        let files;

        try {
            files = read_dir_recursive(dist_dir);
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unable to read dist directory" }));
            return;
        }

        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(files));
        return;
    }

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
            res.writeHead(200, { "Content-Type": content_type, "Access-Control-Allow-Origin": "*" });
            res.end(content, "utf-8");
        }
    });
});


const wss = new ws.Server({ server });

// watch the dist directory for changes and notify all connected websocket clients
fs.watch(dist_dir, { recursive: true }, (event, file) => {
    // determine if this is a new file, a rename, a modification, or a deletion
    let file_path = path.join(dist_dir, file);
    if (event === "rename") {
        if (fs.existsSync(file_path)) {
            event = "added";
        } else {
            event = "deleted";
        }
    } else {
        event = "modified";
    }

    wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ event, file }));
        }
    });
});

server.listen(port, () => {
    console.log(`Package dist served at http://localhost:${port}/ (with WebSocket support)`);
});
