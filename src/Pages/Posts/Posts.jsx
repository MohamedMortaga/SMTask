// src/Pages/Posts/Posts.jsx
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

/* ------------ config ------------ */
const API = "https://linked-posts.routemisr.com";
const PAGE_LIMIT = 5;

/* ------------ helpers ------------ */
const getToken = () => {
  try {
    const strip = (s) => (s ? s.replace(/^"(.*)"$/, "$1") : s);
    for (const k of ["token", "Token", "userToken", "authToken"]) {
      const v = strip(localStorage.getItem(k));
      if (v && v !== "null" && v !== "undefined") return v;
    }
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user?.token) return user.token;
    if (user?.data?.token) return user.data.token;
  } catch {}
  return null;
};

const headerVariants = (token) =>
  token
    ? [
        { headers: { token } }, // primary for this API
        { headers: { Authorization: `Bearer ${token}` } },
        { headers: { Authorization: token } },
      ]
    : [{ headers: {} }];

const extractArray = (resp) => {
  const d = resp?.data ?? resp;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data?.posts)) return d.data.posts;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  for (const v of Object.values(d || {})) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const vv of Object.values(v)) if (Array.isArray(vv)) return vv;
    }
  }
  return [];
};

const normalizePost = (p = {}) => {
  const u = p.user || p.author || p.createdBy || p.owner || {};
  const authorName =
    u.name ||
    u.fullName ||
    u.full_name ||
    u.username ||
    u.email?.split("@")[0] ||
    "Unknown";
  return {
    id: p._id || p.id,
    body: p.body || p.content || p.caption || "",
    image: p.image || p.photo || (Array.isArray(p.images) ? p.images[0] : null),
    createdAt: p.createdAt || p.created_at || p.date || null,
    author: authorName,
    authorId: u._id || u.id || null,
  };
};

const logAxiosError = (label, err) => {
  const status = err?.response?.status;
  const msg = err?.message;
  console.warn(`⚠️ ${label} — status:${status ?? "?"} message:${msg ?? "?"}`);
  if (err?.response?.data) {
    try {
      console.warn("↳ payload:", JSON.stringify(err.response.data, null, 2));
    } catch {
      console.warn("↳ payload: <unserializable>");
    }
  }
};

/* ------------ small UI helpers ------------ */
const Spinner = ({ text = "Loading…" }) => (
  <div className="text-white/90 text-center">{text}</div>
);

/* ------------ component ------------ */
export default function Posts() {
  const [token, setToken] = useState(getToken());
  const [userId, setUserId] = useState(null);
  const [checkingUser, setCheckingUser] = useState(true);

  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editPostId, setEditPostId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState("");

  const canAct = useMemo(() => Boolean(token && userId), [token, userId]);

  // keep axios headers synced
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["token"] = token;
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      axios.defaults.headers.common["Accept"] = "application/json";
    } else {
      delete axios.defaults.headers.common["token"];
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // watch localStorage changes from other tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (["token", "Token", "userToken", "authToken", "user"].includes(e.key)) {
        setToken(getToken());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* ---- resolve userId from /users/profile-data ---- */
  useEffect(() => {
    let cancelled = false;

    const resolveUser = async () => {
      setCheckingUser(true);
      setErr("");

      if (!token) {
        setUserId(null);
        setCheckingUser(false);
        return;
      }

      // local guess
      try {
        const raw = JSON.parse(localStorage.getItem("user") || "null");
        const idFromLocal =
          raw?.id || raw?._id || raw?.userId || raw?.data?._id || raw?.data?.id;
        if (idFromLocal) {
          if (!cancelled) setUserId(idFromLocal);
          setCheckingUser(false);
          return;
        }
      } catch {}

      // ask API
      for (const cfg of headerVariants(token)) {
        try {
          const { data } = await axios.get(`${API}/users/profile-data`, cfg);
          const u = data?.user || data?.data || data || {};
          const id = u._id || u.id;
          if (id) {
            if (!cancelled) setUserId(id);
            setCheckingUser(false);
            return;
          }
        } catch (e) {
          logAxiosError("profile-data failed", e);
        }
      }

      if (!cancelled) {
        setErr("Couldn’t read your profile. Please re-login.");
        setUserId(null);
        setCheckingUser(false);
      }
    };

    resolveUser();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ---------------- fetch posts ---------------- */
  const fetchPosts = async ({ reset = false } = {}) => {
    if (!userId) return;
    setLoading(true);
    setErr("");

    const curPage = reset ? 1 : page;
    const limit = PAGE_LIMIT;

    const urlPage = `${API}/users/${userId}/posts?limit=${limit}&page=${curPage}`;
    const urlSkip = `${API}/users/${userId}/posts?limit=${limit}&skip=${
      (curPage - 1) * limit
    }`;

    const planB = async (cfg) => {
      const fallbackUrl = `${API}/posts?limit=${Math.max(50, limit * 3)}&page=1`;
      try {
        const res = await axios.get(fallbackUrl, cfg);
        const all = extractArray(res).map(normalizePost);
        const mine = all.filter((p) => p.authorId === userId);
        const pageSlice = mine.slice((curPage - 1) * limit, curPage * limit);
        setPosts((cur) => (reset ? pageSlice : [...cur, ...pageSlice]));
        setHasMore(mine.length > curPage * limit);
        return true;
      } catch (e) {
        logAxiosError("fallback /posts failed", e);
        return false;
      }
    };

    let success = false;

    for (const cfg of headerVariants(token)) {
      try {
        const res = await axios.get(urlPage, cfg);
        const arr = extractArray(res).map(normalizePost);
        setPosts((cur) => (reset ? arr : [...cur, ...arr]));
        setHasMore(arr.length === limit);
        success = true;
        break;
      } catch (e) {
        logAxiosError("GET user posts (page) failed", e);
      }

      try {
        const res = await axios.get(urlSkip, cfg);
        const arr = extractArray(res).map(normalizePost);
        setPosts((cur) => (reset ? arr : [...cur, ...arr]));
        setHasMore(arr.length === limit);
        success = true;
        break;
      } catch (e) {
        logAxiosError("GET user posts (skip) failed", e);
      }

      const ok = await planB(cfg);
      if (ok) {
        success = true;
        break;
      }
    }

    if (!success) setErr("Couldn’t load posts. Please try again.");
    setLoading(false);
  };

  // initial load after userId
  useEffect(() => {
    if (userId) {
      setPage(1);
      fetchPosts({ reset: true });
    } else {
      setPosts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // load more
  useEffect(() => {
    if (page > 1) fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* ---------------- CRUD: Delete ---------------- */
  const deletePost = async (id) => {
    if (!canAct || !id) return;
    const ok = window.confirm("Delete this post?");
    if (!ok) return;

    // optimistic
    const prev = posts;
    setPosts((cur) => cur.filter((p) => p.id !== id));

    let success = false;
    for (const cfg of headerVariants(token)) {
      try {
        await axios.delete(`${API}/posts/${id}`, cfg);
        success = true;
        break;
      } catch (e) {
        logAxiosError("DELETE /posts/:id failed", e);
      }
    }
    if (!success) {
      alert("Delete failed.");
      setPosts(prev); // rollback
    }
  };

  /* ---------------- CRUD: Edit ---------------- */
  const openEdit = async (id) => {
    if (!id) return;
    setEditErr("");
    setEditLoading(true);
    setEditOpen(true);
    setEditPostId(id);
    setEditBody("");
    setEditImageFile(null);
    setEditImagePreview("");

    // Always fetch the freshest copy via GET /posts/:id
    let loaded = false;
    for (const cfg of headerVariants(token)) {
      try {
        const { data } = await axios.get(`${API}/posts/${id}`, cfg);
        const raw = data?.data || data?.post || data;
        const n = normalizePost(raw);
        setEditBody(n.body || "");
        setEditImagePreview(n.image || "");
        loaded = true;
        break;
      } catch (e) {
        logAxiosError("GET /posts/:id failed", e);
      }
    }
    if (!loaded) setEditErr("Couldn’t load post. Try again.");
    setEditLoading(false);
  };

  const onPickImage = (file) => {
    setEditImageFile(file || null);
    if (file) {
      const url = URL.createObjectURL(file);
      setEditImagePreview(url);
    }
  };

  const submitEdit = async () => {
    if (!canAct || !editPostId) return;
    setEditErr("");
    setEditLoading(true);

    const form = new FormData();
    if (typeof editBody === "string") form.append("body", editBody);
    if (editImageFile) form.append("image", editImageFile);

    let updated = null;
    for (const cfg of headerVariants(token)) {
      try {
        const { data } = await axios.put(`${API}/posts/${editPostId}`, form, cfg);
        const raw = data?.data || data?.post || data;
        updated = normalizePost(raw);
        break;
      } catch (e) {
        logAxiosError("PUT /posts/:id failed", e);
      }
    }

    if (!updated) {
      setEditErr("Update failed. Please try again.");
      setEditLoading(false);
      return;
    }

    // update list item in place (if present)
    setPosts((cur) =>
      cur.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    setEditLoading(false);
    setEditOpen(false);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditPostId(null);
    setEditBody("");
    setEditImageFile(null);
    setEditImagePreview("");
    setEditErr("");
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="bg-teal-500 min-h-[85vh] flex flex-col items-center py-16">
      <div className="w-[92%] max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white uppercase mb-6 text-center">
          My Posts
        </h1>

        {!token && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            No user logged in.
          </div>
        )}
        {err && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{err}</div>
        )}

        {checkingUser ? (
          <Spinner text="Checking user…" />
        ) : loading && posts.length === 0 ? (
          <Spinner />
        ) : posts.length === 0 ? (
          <div className="text-white/90 text-center">No posts yet.</div>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li
                key={p.id}
                className="bg-white/95 rounded-xl shadow-md overflow-hidden"
              >
                {p.image && (
                  <img
                    src={p.image}
                    alt="post"
                    className="w-full max-h-72 object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {p.author || "You"}
                      </h3>
                      {p.createdAt && (
                        <time
                          className="text-xs text-gray-500"
                          dateTime={new Date(p.createdAt).toISOString()}
                        >
                          {new Date(p.createdAt).toLocaleString()}
                        </time>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="px-3 py-1 rounded-md bg-amber-500 text-white text-sm hover:bg-amber-600"
                        onClick={() => openEdit(p.id)}
                        disabled={!canAct}
                        title="Edit post"
                      >
                        Edit
                      </button>
                      <button
                        className="px-3 py-1 rounded-md bg-rose-600 text-white text-sm hover:bg-rose-700"
                        onClick={() => deletePost(p.id)}
                        disabled={!canAct}
                        title="Delete post"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {p.body && (
                    <p className="mt-3 text-gray-700 whitespace-pre-line">
                      {p.body}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Load more */}
        <div className="flex items-center justify-center mt-8">
          <button
            disabled={!hasMore || loading || !userId}
            onClick={() => setPage((n) => n + 1)}
            className={`px-5 py-2 rounded-lg font-semibold shadow
              ${
                hasMore && userId
                  ? "bg-white text-teal-600 hover:bg-teal-700 hover:text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
          >
            {loading && posts.length > 0
              ? "Loading…"
              : hasMore
              ? "Load more"
              : "No more posts"}
          </button>
        </div>
      </div>

      {/* ---------- Edit Modal ---------- */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-lg font-semibold">Edit Post</h2>
            </div>

            <div className="p-5 space-y-4">
              {editErr && (
                <div className="bg-rose-50 text-rose-700 p-2 rounded">
                  {editErr}
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700">
                Body
              </label>
              <textarea
                className="w-full rounded-md border p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={5}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Write something…"
              />

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Image (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                />
                {editImagePreview && (
                  <img
                    src={editImagePreview}
                    alt="preview"
                    className="w-full max-h-64 object-cover rounded-md border"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border text-gray-700 hover:bg-gray-50"
                onClick={closeEdit}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 rounded-md text-white ${
                  editLoading ? "bg-teal-400" : "bg-teal-600 hover:bg-teal-700"
                }`}
                onClick={submitEdit}
                disabled={editLoading}
              >
                {editLoading ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
