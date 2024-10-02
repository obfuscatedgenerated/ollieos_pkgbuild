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

fs.mkdirSync("./dist", {recursive: true});

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

let package_json_content = fs.readFileSync("./package.json", "utf8");
let package_json = JSON.parse(package_json_content);
let version = package_json.version;
let name = package_json.name;

var hooks = {
    compile: {
        update_package_json: () => {
            let new_package_json_content = fs.readFileSync("./package.json", "utf8");

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
            if (!fs.existsSync("./dist/versions.txt")) {
                fs.writeFileSync("./dist/versions.txt", version);
                console.log("Wrote versions");
                return;
            }

            // read the current versions.txt
            const versions = fs.readFileSync("./dist/versions.txt", "utf8");

            // if the current version is already in versions.txt, don't do anything
            if (versions.split("\n").map((v) => v.trim()).includes(version)) {
                return;
            }

            // otherwise, append the current version to versions.txt
            fs.appendFileSync("./dist/versions.txt", `\n${version}`);
            console.log("Wrote versions");
        },

        make_meta: (stats, deps) => {
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
                build_timestamp: Date.now(),
            };

            fs.writeFileSync(`./dist/${version}/meta.json`, JSON.stringify(meta, null, 2));
            console.log("Wrote meta.json");
        }
    },

    afterEmit: {
        make_pkg_json: (homepage_url) => {
            const pkg = {
                latest_version: version,
                latest_timestamp: Date.now(),
                type: "program",
                description: package_json.description,
                author: package_json.author,
                license: package_json.license,
                repo_url: package_json.repository.url,
                homepage_url,
            };

            if (readme_content) {
                pkg.long_desc = readme_content;
            }

            fs.writeFileSync("./dist/pkg.json", JSON.stringify(pkg, null, 2));
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
 * @returns {{devtool: string, output: {path: string, filename: string, library: {type: string}, sourceMapFilename: string}, entry, resolve: {extensions: string[]}, plugins: [undefined,{apply: *},{apply: *},{apply: *},undefined], module: {rules: [{test: RegExp, loader: string, options: {allowTsInNodeModules: boolean}}]}, experiments: {outputModule: boolean}, externals}}
 */
var pkgbuild = (programs, deps, homepage_url, externals) => {
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
    externals["@xterm/link-provider"] = "@xterm/link-provider";

    console.log(`Building version ${version}`);
    fs.mkdirSync(`./dist/${version}`, {recursive: true});

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
                    compiler.hooks.done.tap("make_meta", (stats) => hooks.done.make_meta(stats, deps));
                }
            },
            new ExtraWatchWebpackPlugin({
                files: ["package.json"],
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
            path: path.resolve(__dirname, "dist"),
            library: {
                type: "module",
            }
        },
        externals,
        experiments: {
            outputModule: true,
        },
    }
};
exports.pkgbuild = pkgbuild;
exports.default = pkgbuild;
module.exports = exports.default;
