import { copyFile, mkdir, readFile, rm } from "fs/promises";
import path from "path";
import process from "process";

const root = process.cwd();
const configPath = path.join(root, "deploy-test.local.json");
const manifestPath = path.join(root, "manifest.json");
const requiredFiles = ["manifest.json", "main.js"];
const optionalFiles = ["styles.css"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail(`无法读取 ${label}：${error instanceof Error ? error.message : String(error)}`);
  }
}

const manifest = await readJson(manifestPath, "manifest.json");
const config = await readJson(configPath, "deploy-test.local.json");

if (!manifest.id || typeof manifest.id !== "string") {
  fail("manifest.json 缺少有效的插件 id。");
}

if (!config.pluginDir || typeof config.pluginDir !== "string") {
  fail("deploy-test.local.json 需要配置 pluginDir。");
}

const pluginDir = path.resolve(config.pluginDir);
const pluginDirName = path.basename(pluginDir);
const parentDirName = path.basename(path.dirname(pluginDir));
const obsidianDirName = path.basename(path.dirname(path.dirname(pluginDir)));

if (pluginDirName !== manifest.id) {
  fail(`目标目录名 ${pluginDirName} 与插件 id ${manifest.id} 不一致，已停止部署。`);
}

if (parentDirName !== "plugins" || obsidianDirName !== ".obsidian") {
  fail("目标目录必须位于 Obsidian 仓库的 .obsidian/plugins/ 下，已停止部署。");
}

const copied = [];

await rm(pluginDir, { recursive: true, force: true });
await mkdir(pluginDir, { recursive: true });

for (const file of requiredFiles) {
  await copyFile(path.join(root, file), path.join(pluginDir, file));
  copied.push(file);
}

for (const file of optionalFiles) {
  try {
    await copyFile(path.join(root, file), path.join(pluginDir, file));
    copied.push(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(`已部署到：${pluginDir}`);
console.log(`已复制文件：${copied.join(", ")}`);
