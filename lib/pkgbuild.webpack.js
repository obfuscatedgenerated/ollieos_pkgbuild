/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

const path = require("path");
const fs = require("fs");
const ExtraWatchWebpackPlugin = require("extra-watch-webpack-plugin");
const {LimitChunkCountPlugin} = require("webpack").optimize;

const dist_dir = path.resolve(process.cwd(), "dist");
const package_json_path = path.resolve(process.cwd(), "package.json");

const versions_txt_out_path = path.resolve(dist_dir, "versions.txt");
const pkg_json_out_path = path.resolve(dist_dir, "pkg.json");
const version_out_path = (version) => path.resolve(dist_dir, version);
const meta_out_path = (version) => path.resolve(dist_dir, version, "meta.json");

fs.mkdirSync(dist_dir, {recursive: true});

// look for a README, README.txt, or README.md file in the root of the project
const readme_content = (() => {
    const files = ["README", "README.txt", "README.md"];
    for (const file of files) {
        if (fs.existsSync(file)) {
            return fs.readFileSync(file, "utf8");
        }
    }
    return null;
})();

let package_json_content = fs.readFileSync(package_json_path, "utf8");
let package_json = JSON.parse(package_json_content);
let version = package_json.version;
let name = package_json.name;

var hooks = {
    compile: {
        update_package_json: () => {
            let new_package_json_content = fs.readFileSync(package_json_path, "utf8");

            if (new_package_json_content === package_json_content) {
                return;
            }

            console.log("package.json changed, updating");

            package_json_content = new_package_json_content;
            package_json = JSON.parse(package_json_content);

            version = package_json.version;
            name = package_json.name;

            fs.mkdirSync(`./dist/${version}`, {recursive: true});
        },
    },

    done: {
        edit_versions: () => {
            // if versions.txt doesn't exist, write the current version to it
            if (!fs.existsSync(versions_txt_out_path)) {
                fs.writeFileSync(versions_txt_out_path, version);
                console.log("Wrote versions");
                return;
            }

            // read the current versions.txt
            const versions = fs.readFileSync(versions_txt_out_path, "utf8");

            // if the current version is already in versions.txt, don't do anything
            if (versions.split("\n").map((v) => v.trim()).includes(version)) {
                return;
            }

            // otherwise, append the current version to versions.txt
            fs.appendFileSync(versions_txt_out_path, `\n${version}`);
            console.log("Wrote versions");
        },

        make_meta: (stats, deps, triggers) => {
            const assets = stats.toJson().assetsByChunkName;

            // get list of file names
            const files = Object.values(assets).flat();

            // filter out non-js files
            const filtered_files = files.filter((file) => file.endsWith(".js"));

            // convert to basenames
            for (let i = 0; i < filtered_files.length; i++) {
                filtered_files[i] = path.basename(filtered_files[i]);
            }

            const meta = {
                files: filtered_files,
                version,
                deps,
                triggers,
                build_timestamp: Date.now(),
                externals: "global" // marker that the pkg is built with externalsType: "global", which was introduced later
            };

            fs.writeFileSync(meta_out_path(version), JSON.stringify(meta, null, 2));
            console.log("Wrote meta.json");
        },

        copy_additional_files: (additional_files) => {
            for (const file_entry of additional_files) {
                let local_path;
                let pkg_path;
                let binary = false;

                if (typeof file_entry === "string") {
                    local_path = file_entry;
                    pkg_path = file_entry;
                } else if (typeof file_entry === "object" && file_entry.local_path && file_entry.pkg_path) {
                    local_path = file_entry.local_path;
                    pkg_path = file_entry.pkg_path;
                    binary = file_entry.binary || false;
                } else {
                    console.warn(`Invalid additional_files entry: ${JSON.stringify(file_entry)}`);
                    continue;
                }

                // convert content to crlf if not binary
                let content = fs.readFileSync(local_path);
                if (!binary) {
                    content = content.toString().replace(/\r?\n/g, "\r\n");
                }

                const out_path = path.resolve(dist_dir, version, pkg_path);
                fs.mkdirSync(path.dirname(out_path), {recursive: true});
                fs.writeFileSync(out_path, content);
                console.log(`Copied additional file to ${out_path}`);
            }
        }
    },

    afterEmit: {
        make_pkg_json: (homepage_url) => {
            const pkg = {
                latest_version: version,
                latest_timestamp: Date.now(),
                type: "program",
                description: package_json.description || "",
                author: package_json.author || "",
                license: package_json.license || "",
                repo_url: package_json.repository?.url || "",
                homepage_url,
            };

            if (readme_content) {
                pkg.long_desc = readme_content;
            }

            fs.writeFileSync(pkg_json_out_path, JSON.stringify(pkg, null, 2));
            console.log("Wrote pkg.json");
        }
    }
}
exports.hooks = hooks;


/**
 * Export this directly from your webpack.config.js file.
 * @param {Object} programs An object where the key is the program name and the value is the path to the entry point
 * @param {Object} deps An array of dependencies in the format name@version
 * @param {String} homepage_url The URL to the homepage of the project
 * @param {Object} externals An object where the key is the module name and the value is the external name for webpack
 * @param {Object} triggers An object where the key is the name of the trigger and the value is any data to pass to the trigger
 * @param {string[] | {local_path: string, pkg_path: string, binary?: boolean}} additional_files An array of additional files to include in the package. Each entry can be a string (local path directly mapped to pkg path) or an object with local_path and pkg_path. Files are copied into your package's /usr/bin subdirectory. Specify the "binary" property to prevent line ending conversion.
 * @returns {{devtool: string, output: {path: string, filename: string, library: {type: string}, sourceMapFilename: string}, entry, resolve: {extensions: string[]}, plugins: [undefined,{apply: *},{apply: *},{apply: *},undefined], module: {rules: [{test: RegExp, loader: string, options: {allowTsInNodeModules: boolean}}]}, experiments: {outputModule: boolean}, externals}}
 */
const pkgbuild = (programs = {}, deps = [], homepage_url = "https://ollieg.codes", externals = {}, triggers = {}, additional_files = []) => {
    // define built in externals
    externals["ollieos"] = "ollieos";
    externals["howler"] = "howler";
    externals["html-to-text"] = "html-to-text";
    externals["sixel"] = "sixel";
    externals["sweetalert2"] = "sweetalert2";
    externals["@xterm/xterm"] = "@xterm/xterm";
    externals["@xterm/addon-fit"] = "@xterm/addon-fit";
    externals["@xterm/addon-web-links"] = "@xterm/addon-web-links";
    externals["@xterm/addon-image"] = "@xterm/addon-image";
    externals["xterm-link-provider"] = "xterm-link-provider";

    console.log(`Building version ${version}`);
    fs.mkdirSync(version_out_path(version), {recursive: true});

    // get all local paths from additional_files to watch
    const additional_file_paths = additional_files.map((file_entry) => {
        if (typeof file_entry === "string") {
            return file_entry;
        } else if (typeof file_entry === "object" && file_entry.local_path) {
            return file_entry.local_path;
        }
        return null;
    }).filter((p) => p !== null);

    return {
        entry: programs,
        devtool: "hidden-source-map",
        plugins: [
            new LimitChunkCountPlugin({
                maxChunks: 1
            }),
            {
                apply: (compiler) => {
                    compiler.hooks.compile.tap("update_package_json", hooks.compile.update_package_json);
                }
            },
            {
                apply: (compiler) => {
                    compiler.hooks.done.tap("edit_versions", hooks.done.edit_versions);
                    compiler.hooks.afterEmit.tap("make_pkg_json", () => hooks.afterEmit.make_pkg_json(homepage_url));
                }
            },
            {
                apply: (compiler) => {
                    compiler.hooks.done.tap("make_meta", (stats) => hooks.done.make_meta(stats, deps, triggers));
                }
            },
            new ExtraWatchWebpackPlugin({
                files: [package_json_path, ...additional_file_paths],
            }),
        ],
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: {
                        allowTsInNodeModules: true,
                    }
                },
            ],
        },
        resolve: {
            extensions: [".ts", ".js"],
        },
        output: {
            filename: `./${version}/${name}-[name]-${version}.js`,
            sourceMapFilename: `../maps/${name}-[name]-${version}.js.map`,
            path: dist_dir,
            library: {
                type: "module",
            },
            globalObject: "globalThis",
        },
        externals,
        externalsType: "global",
        experiments: {
            outputModule: true,
        },
    }
};
exports.pkgbuild = pkgbuild;
exports.default = pkgbuild;
module.exports = exports.default;

// TODO: configurable file paths
