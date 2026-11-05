"use strict";
// Vercel serverless proxy between the Hack-a-Thon gallery page and the
// Notion database "PCD Hackathon". The browser never sees the Notion token:
// it lives only in the Vercel project's NOTION_TOKEN environment variable.
//   GET  /api/submissions -> visible entries, oldest first
//   POST /api/submissions -> create one entry (always visible)
//   PATCH /api/submissions?key=<page id> {sketch_url} -> update that entry's 作品链接
//
// Notion property map (database "PCD Hackathon"; its data source is 40e401da-165b-80a3-b3f4-000ba4c02f58):
//   Name (title), 作者 (text), 主题 (select GIFT/FREEDOM/exhibition),
//   类型 (select sketch/media), 作品链接 (url), GitHub (url),
//   截图/GIF (url), 显示 (checkbox)

var DB_ID = "40e401da-165b-8090-a0df-f9cdc98a281d";  // database PAGE id (not the data-source id: /v1/databases expects the database id)
var NOTION_VERSION = "2022-06-28";

function plainText(arr) {
  return (arr || []).map(function (t) { return t.plain_text || ""; }).join("");
}

function toEntry(page) {
  var p = page.properties || {};
  var kind = p["类型"] && p["类型"].select && p["类型"].select.name;
  if (kind !== "sketch" && kind !== "media") {
    kind = p["作品链接"] && p["作品链接"].url ? "sketch" : "media";
  }
  return {
    key: page.id,
    name: plainText(p["作者"] && p["作者"].rich_text),
    title: plainText(p["Name"] && p["Name"].title),
    theme: (p["主题"] && p["主题"].select && p["主题"].select.name) || "GIFT",
    kind: kind,
    url: (p["作品链接"] && p["作品链接"].url) || null,
    codeUrl: (p["GitHub"] && p["GitHub"].url) || null,
    mediaUrl: (p["截图/GIF"] && p["截图/GIF"].url) || null,
    edited: Date.parse(page.last_edited_time) || 0,
  };
}

function notionHeaders() {
  var token = process.env.NOTION_TOKEN;
  if (!token) {
    var e = new Error("NOTION_TOKEN is not set on this Vercel project");
    e.status = 500;
    throw e;
  }
  return {
    Authorization: "Bearer " + token,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function queryVisible() {
  var out = [];
  var cursor = undefined;
  for (var page = 0; page < 5; page++) {
    var body = {
      filter: { property: "显示", checkbox: { equals: true } },
      sorts: [{ timestamp: "created_time", direction: "ascending" }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    var r = await fetch("https://api.notion.com/v1/databases/" + DB_ID + "/query", {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      var t = await r.text();
      var e = new Error("Notion query failed: " + r.status + " " + t.slice(0, 300));
      e.status = r.status;
      throw e;
    }
    var j = await r.json();
    (j.results || []).forEach(function (pg) { out.push(toEntry(pg)); });
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return out;
}

async function createEntry(b) {
  var props = {
    Name: { title: [{ text: { content: b.title } }] },
    作者: { rich_text: [{ text: { content: b.name } }] },
    主题: { select: { name: b.theme } },
    类型: { select: { name: b.kind } },
    显示: { checkbox: true },
  };
  if (b.sketch_url) props["作品链接"] = { url: b.sketch_url };
  if (b.code_url) props["GitHub"] = { url: b.code_url };
  if (b.media_url) props["截图/GIF"] = { url: b.media_url };
  var r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({ parent: { database_id: DB_ID }, properties: props }),
  });
  if (!r.ok) {
    var t = await r.text();
    var e = new Error("Notion create failed: " + r.status + " " + t.slice(0, 300));
    e.status = r.status;
    throw e;
  }
  return toEntry(await r.json());
}

async function updateEntryUrl(key, sketchUrl) {
  var r = await fetch("https://api.notion.com/v1/pages/" + encodeURIComponent(key), {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({ properties: { "作品链接": { url: sketchUrl } } }),
  });
  if (!r.ok) {
    var t = await r.text();
    var e = new Error("Notion update failed: " + r.status + " " + t.slice(0, 300));
    e.status = r.status;
    throw e;
  }
  return toEntry(await r.json());
}

module.exports = async function (req, res) {
  try {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(await queryVisible());
      return;
    }
    if (req.method === "POST") {
      var b = req.body || {};
      if (typeof b === "string") {
        try { b = JSON.parse(b); } catch (e) { b = {}; }
      }
      var name = (b.name || "").trim();
      var title = (b.title || "").trim();
      if (!name || !title) { res.status(400).json({ error: "name and title are required" }); return; }
      if (b.theme !== "GIFT" && b.theme !== "FREEDOM" && b.theme !== "exhibition") { res.status(400).json({ error: "theme must be GIFT, FREEDOM or exhibition" }); return; }
      if (b.kind !== "sketch" && b.kind !== "media") { res.status(400).json({ error: "kind must be sketch or media" }); return; }
      if (b.kind === "sketch" && !b.sketch_url) { res.status(400).json({ error: "sketch_url is required" }); return; }
      if (b.kind === "media" && (!b.code_url || !b.media_url)) { res.status(400).json({ error: "code_url and media_url are required" }); return; }
      res.status(201).json(await createEntry(b));
      return;
    }
    if (req.method === "PATCH") {
      var pb = req.body || {};
      if (typeof pb === "string") {
        try { pb = JSON.parse(pb); } catch (e) { pb = {}; }
      }
      var key = (req.query && req.query.key) || null;
      if (!key && req.url) {
        var m = /[?&]key=([^&]+)/.exec(req.url);
        if (m) key = decodeURIComponent(m[1]);
      }
      var sketchUrl = (pb.sketch_url || "").trim();
      if (!key) { res.status(400).json({ error: "key query param is required" }); return; }
      if (!/^https:\/\//.test(sketchUrl)) { res.status(400).json({ error: "sketch_url must be an https URL" }); return; }
      res.status(200).json(await updateEntryUrl(key, sketchUrl));
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
