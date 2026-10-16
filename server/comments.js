// YouTube-style comments: anyone can comment on a film, reply, like or dislike, and edit or delete their own.
// Threads are one level deep, as on YouTube: a reply to a reply joins the same thread (the page adds "@name").
// The admin can pin one comment per film, heart comments, hide or delete them, and reply as MANA CINEMA.
// Visitors are known by the same anonymous cookie as audience ratings (auth.js); there are no accounts.
import { db, tx, nowISO } from "./db.js";

export const COMMENT_MAX = 1500;
export const COMMENT_NAME_MAX = 40;
export const ADMIN_AUTHOR = "admin";
export const ADMIN_NAME = "MANA CINEMA";
const PAGE_MAX = 50;

// Likes, dislikes and visible replies are counted from their tables, so they can never drift.
// :me is the viewer (a cookie hash, or "" for someone who has never posted): their own hidden posts stay visible to them.
const SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = c.id AND v.vote = 1) AS likes,
    (SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = c.id AND v.vote = -1) AS dislikes,
    (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id AND (r.hidden = 0 OR r.author = :me OR :admin)) AS replies,
    COALESCE((SELECT vote FROM comment_votes v WHERE v.comment_id = c.id AND v.voter = :me), 0) AS my_vote
  FROM comments c`;
const VISIBLE = "(c.hidden = 0 OR c.author = :me OR :admin)";
const who = (viewer, admin = false) => ({ me: viewer || "", admin: Number(admin) });

// The shape the film page and the admin portal use
export function commentOut(r, { viewer = null, admin = false } = {}) {
  const out = {
    id: r.id, movieId: r.movie_id, parentId: r.parent_id, name: r.name, text: r.body, at: r.created_at,
    byAdmin: Boolean(r.is_admin), pinned: Boolean(r.pinned), hearted: Boolean(r.hearted),
    likes: r.likes ?? 0, replyCount: r.replies ?? 0, myVote: r.my_vote ?? 0,
  };
  if (r.edited_at) out.editedAt = r.edited_at;
  const mine = Boolean(viewer) && r.author === viewer;
  if (mine) out.mine = true;
  if (r.hidden && (mine || admin)) out.hidden = true;
  if (admin) Object.assign(out, { dislikes: r.dislikes ?? 0, by: r.author, hidden: Boolean(r.hidden) });
  return out;
}

const getRow = (id, viewer = null, admin = false) => db.prepare(`${SELECT} WHERE c.id = :id`).get({ ...who(viewer, admin), id });

// One page of a film's top-level comments. sort: "top" (pinned, then likes and replies) or "new"
export function listComments(movieId, { viewer = null, sort = "top", limit = 20, offset = 0 } = {}) {
  const order = sort === "new" ? "c.pinned DESC, c.created_at DESC" : "c.pinned DESC, (likes - dislikes + 2 * replies) DESC, c.created_at DESC";
  const params = { ...who(viewer), movie: movieId, limit: Math.min(PAGE_MAX, Math.max(1, limit)), offset: Math.max(0, offset) };
  const rows = db.prepare(`${SELECT} WHERE c.movie_id = :movie AND c.parent_id IS NULL AND ${VISIBLE} ORDER BY ${order} LIMIT :limit OFFSET :offset`).all(params);
  const counts = db.prepare(`
    SELECT COUNT(*) AS total, SUM(c.parent_id IS NULL) AS threads FROM comments c
    WHERE c.movie_id = :movie AND ${VISIBLE}
      AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM comments p WHERE p.id = c.parent_id AND (p.hidden = 0 OR p.author = :me OR :admin)))
  `).get({ ...who(viewer), movie: movieId });
  return {
    total: counts.total || 0,
    threads: counts.threads || 0,
    hasMore: params.offset + rows.length < (counts.threads || 0),
    comments: rows.map(r => commentOut(r, { viewer })),
  };
}

// A thread's replies, oldest first (as on YouTube)
export function listReplies(parentId, { viewer = null } = {}) {
  return db.prepare(`${SELECT} WHERE c.parent_id = :parent AND ${VISIBLE} ORDER BY c.created_at ASC, c.id ASC`)
    .all({ ...who(viewer), parent: parentId }).map(r => commentOut(r, { viewer }));
}

// Visible to this viewer: not hidden (or theirs), and its thread's first comment visible too
function visibleTo(row, viewer, admin) {
  if (!row) return false;
  if (admin) return true;
  if (row.hidden && row.author !== viewer) return false;
  if (row.parent_id) {
    const parent = db.prepare("SELECT hidden, author FROM comments WHERE id = ?").get(row.parent_id);
    if (!parent || (parent.hidden && parent.author !== viewer)) return false;
  }
  return true;
}

// Line breaks kept, at most one blank line in a row, no spaces at the ends
export const cleanText = text => String(text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export function commentProblem(body, { needName = true } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Send the comment as JSON.";
  if (typeof (body.text ?? "") !== "string") return "The comment must be text.";
  const text = cleanText(body.text);
  if (!text) return "Write something first.";
  if (text.length > COMMENT_MAX) return `Keep your comment under ${COMMENT_MAX.toLocaleString("en-IN")} characters.`;
  if (needName) {
    if (typeof (body.name ?? "") !== "string") return "Your name must be text.";
    // Only the admin portal posts as MANA CINEMA
    if (String(body.name ?? "").toLowerCase().replace(/[^a-z]/g, "").includes("manacinema")) return "That name is kept for MANA CINEMA's own replies. Pick another.";
  }
  return "";
}

// Posts a comment, or a reply when parentId is set. Returns { comment } or { error, status }.
export function addComment({ movieId, parentId = null, viewer, name, text, admin = false }) {
  let parent = null;
  if (parentId !== null && parentId !== undefined) {
    parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(Number(parentId));
    if (!parent || parent.movie_id !== movieId || !visibleTo(parent, viewer, admin)) return { error: "That comment was deleted.", status: 404 };
    if (parent.parent_id) parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(parent.parent_id);   // one level, like YouTube
  }
  const id = Number(db.prepare(`
    INSERT INTO comments (movie_id, parent_id, author, name, body, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(movieId, parent ? parent.id : null, admin ? ADMIN_AUTHOR : viewer,
    admin ? ADMIN_NAME : String(name ?? "").trim().slice(0, COMMENT_NAME_MAX) || "Anonymous", cleanText(text), Number(admin), nowISO()).lastInsertRowid);
  return { comment: commentOut(getRow(id, admin ? ADMIN_AUTHOR : viewer, admin), { viewer: admin ? ADMIN_AUTHOR : viewer, admin }) };
}

// Only the author can edit or delete (a moderator hides or deletes from the admin portal)
export function editComment(id, viewer, text) {
  const row = db.prepare("SELECT author FROM comments WHERE id = ?").get(id);
  if (!row) return { error: "That comment was deleted.", status: 404 };
  if (!viewer || row.author !== viewer) return { error: "You can only edit your own comments.", status: 403 };
  db.prepare("UPDATE comments SET body = ?, edited_at = ? WHERE id = ?").run(cleanText(text), nowISO(), id);
  return { comment: commentOut(getRow(id, viewer), { viewer }) };
}

// Deleting a comment deletes its replies too, as on YouTube
export function removeComment(id, viewer, { admin = false } = {}) {
  const row = db.prepare("SELECT author FROM comments WHERE id = ?").get(id);
  if (!row) return { error: "That comment was already deleted.", status: 404 };
  if (!admin && (!viewer || row.author !== viewer)) return { error: "You can only delete your own comments.", status: 403 };
  db.prepare("DELETE FROM comments WHERE id = ?").run(id);
  return { ok: true };
}

// vote: 1 like, -1 dislike, 0 take it back. Returns the comment's new counts.
export function voteComment(id, viewer, vote) {
  const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
  if (!row || !visibleTo(row, viewer, false)) return { error: "That comment was deleted.", status: 404 };
  if (vote === 0) db.prepare("DELETE FROM comment_votes WHERE comment_id = ? AND voter = ?").run(id, viewer);
  else db.prepare("INSERT INTO comment_votes (comment_id, voter, vote) VALUES (?, ?, ?) ON CONFLICT (comment_id, voter) DO UPDATE SET vote = excluded.vote").run(id, viewer, vote);
  const r = getRow(id, viewer);
  return { likes: r.likes, myVote: r.my_vote };
}

// ---------- Admin ----------
export function allComments() {
  return db.prepare(`${SELECT} ORDER BY c.created_at DESC`).all(who(ADMIN_AUTHOR, true)).map(r => commentOut(r, { viewer: ADMIN_AUTHOR, admin: true }));
}

// patch: { pinned?, hearted?, hidden? }. Pinning a comment unpins the film's other one; only first comments can be pinned.
export function moderateComment(id, patch) {
  const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
  if (!row) return { error: "That comment was already deleted.", status: 404 };
  if (patch.pinned && row.parent_id) return { error: "Only a thread's first comment can be pinned.", status: 400 };
  tx(() => {
    if (patch.pinned === true) db.prepare("UPDATE comments SET pinned = 0 WHERE movie_id = ? AND id != ?").run(row.movie_id, id);
    for (const key of ["pinned", "hearted", "hidden"]) {
      if (typeof patch[key] === "boolean") db.prepare(`UPDATE comments SET ${key} = ? WHERE id = ?`).run(Number(patch[key]), id);
    }
  });
  return { comment: commentOut(getRow(id, ADMIN_AUTHOR, true), { viewer: ADMIN_AUTHOR, admin: true }) };
}

// ---------- Backups ----------
// Every comment with its votes, parents before replies
export function exportComments() {
  const votes = new Map();
  for (const v of db.prepare("SELECT * FROM comment_votes").all()) {
    if (!votes.has(v.comment_id)) votes.set(v.comment_id, []);
    votes.get(v.comment_id).push([v.voter, v.vote]);
  }
  return db.prepare("SELECT * FROM comments ORDER BY parent_id IS NOT NULL, id").all().map(c => {
    const out = { id: c.id, movieId: c.movie_id, parentId: c.parent_id, by: c.author, name: c.name, text: c.body, at: c.created_at };
    if (c.edited_at) out.editedAt = c.edited_at;
    for (const [key, col] of [["byAdmin", "is_admin"], ["pinned", "pinned"], ["hearted", "hearted"], ["hidden", "hidden"]]) if (c[col]) out[key] = true;
    if (votes.has(c.id)) out.votes = votes.get(c.id);
    return out;
  });
}

const isRecord = x => Boolean(x) && typeof x === "object" && !Array.isArray(x);
export function commentsBackupProblem(list) {
  if (list === undefined) return "";
  if (!Array.isArray(list)) return "The backup's comments are damaged.";
  const ids = new Set();
  for (const [i, c] of list.entries()) {
    if (!isRecord(c) || !Number.isSafeInteger(c.id) || !Number.isInteger(c.movieId) || typeof c.text !== "string" || typeof (c.name ?? "") !== "string") return `Comment ${i + 1} in the backup is damaged.`;
    if (c.parentId !== null && c.parentId !== undefined && !ids.has(c.parentId)) return `Comment ${i + 1} in the backup replies to a comment that isn't in it.`;
    if (c.votes !== undefined && !(Array.isArray(c.votes) && c.votes.every(v => Array.isArray(v) && typeof v[0] === "string" && (v[1] === 1 || v[1] === -1)))) return `Comment ${i + 1} in the backup has damaged likes.`;
    ids.add(c.id);
  }
  return "";
}

// Replaces every comment (call inside the restore's transaction)
export function importComments(list) {
  db.exec("DELETE FROM comments");
  const add = db.prepare("INSERT INTO comments (id, movie_id, parent_id, author, name, body, is_admin, pinned, hearted, hidden, created_at, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const vote = db.prepare("INSERT OR IGNORE INTO comment_votes (comment_id, voter, vote) VALUES (?, ?, ?)");
  for (const c of list) {
    add.run(c.id, c.movieId, c.parentId ?? null, String(c.by || `restored:${c.id}`), String(c.name || "Anonymous").slice(0, COMMENT_NAME_MAX),
      cleanText(c.text).slice(0, COMMENT_MAX), Number(Boolean(c.byAdmin)), Number(Boolean(c.pinned)), Number(Boolean(c.hearted)),
      Number(Boolean(c.hidden)), String(c.at || nowISO()), c.editedAt ? String(c.editedAt) : null);
    for (const [voter, v] of c.votes || []) vote.run(c.id, voter, v);
  }
}
