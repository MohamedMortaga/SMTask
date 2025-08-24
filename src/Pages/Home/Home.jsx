// Home.jsx
import { useEffect, useState } from "react";
import axios from "axios";

/* ---------------- avatar ---------------- */
function InitialsAvatar({ name = "User", size = 40, src }) {
  const [imgErr, setImgErr] = useState(false);
  if (src && !imgErr) {
    return (
      <img
        src={src}
        alt={`${name} avatar`}
        onError={() => setImgErr(true)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover bg-gray-700"
      />
    );
  }
  const initials =
    (name || "U")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-teal-500 text-white flex items-center justify-center font-bold"
      title={name}
    >
      {initials}
    </div>
  );
}

/* ---------------- helpers ---------------- */
const API = "https://linked-posts.routemisr.com";
const POSTS_PAGE_SIZE = 50;   // posts pagination (fetch next 50)
const COMMENT_PAGE_SIZE = 5;  // comments pagination

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
  } catch {
    return null;
  }
  return null;
};

const authHeaders = (token) =>
  token ? { token, Authorization: `Bearer ${token}` } : {};

const normPost = (p = {}) => {
  const u = p.user || p.author || {};
  const name =
    u.name ||
    u.fullName ||
    u.full_name ||
    u.username ||
    u.email?.split("@")[0] ||
    "Unknown";
  const avatar = u.photo || u.avatar || u.image || u.photoUrl || null;

  return {
    id: p._id || p.id,
    authorId: u._id || u.id || null,
    authorName: name,
    authorAvatar: avatar,
    content: p.body || p.content || p.caption || "",
    image:
      p.image ||
      p.photo ||
      (Array.isArray(p.images) && p.images.length ? p.images[0] : null),
    createdAt: p.createdAt || p.created_at || p.date || null,
    updatedAt: p.updatedAt || p.updated_at || null,
    likes: p.likesCount || p.likes || 0,
    commentsCount: Array.isArray(p.comments) ? p.comments.length : (p.commentsCount ?? 0),
  };
};

const normComment = (c = {}) => {
  const u = c.commentCreator || c.user || c.author || {};
  const name =
    u.name ||
    u.fullName ||
    u.full_name ||
    u.username ||
    u.email?.split("@")?.[0] ||
    "Anonymous";
  const avatar = u.photo || u.avatar || u.image || u.photoUrl || null;

  return {
    id: c._id || c.id,
    text: c.content || c.text || c.body || c.comment || "",
    authorName: name,
    authorAvatar: avatar,
    authorId: u._id || u.id || null,
    createdAt: c.createdAt || c.created_at || null,
  };
};

const extractArray = (resp) => {
  const d = resp?.data ?? resp;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.comments)) return d.comments;
  if (Array.isArray(d?.data?.comments)) return d.data.comments;
  if (Array.isArray(d?.posts)) return d.posts;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.results)) return d.results;
  for (const v of Object.values(d || {})) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const vv of Object.values(v)) if (Array.isArray(vv)) return vv;
    }
  }
  return [];
};

const logAxiosError = (label, err) => {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const msg = err?.message;
  console.warn(`⚠️ ${label} — status:${status ?? "?"} message:${msg ?? "?"}`);
  if (data) {
    try {
      console.warn(`↳ payload: ${JSON.stringify(data, null, 2)}`);
    } catch {
      console.warn("↳ payload: <unserializable>");
    }
  }
};

/* ---------------- component ---------------- */
export default function Home() {
  const [token, setToken] = useState(getToken());
  const isAuthed = !!token;

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

  // me
  const [me, setMe] = useState(null); // { id, name, avatar }

  // composer
  const [postText, setPostText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [postingPost, setPostingPost] = useState(false);

  // posts feed (pagination)
  const [posts, setPosts] = useState([]);
  const [postPage, setPostPage] = useState(1);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [err, setErr] = useState("");

  // comments cache & per-post UI state
  const [commentsCache, setCommentsCache] = useState({});
  // [postId]: { opened, loading, hasMore, page, all[], preview, input, posting, errorMsg, editingId, savingEdit }
  const [cmap, setCmap] = useState({});

  useEffect(() => {
    const onStorage = (e) => {
      if (["token", "Token", "userToken", "authToken", "user"].includes(e.key)) {
        setToken(getToken());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleImageChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (f) {
      setImageFile(f);
      setImagePreview(URL.createObjectURL(f));
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  /* ---------- utility to repaint a page of comments ---------- */
  const PAGE = (postId, arr, page = 1, append = false) => {
    const start = (page - 1) * COMMENT_PAGE_SIZE;
    const slice = arr.slice(start, start + COMMENT_PAGE_SIZE);
    setCmap((prev) => {
      const cur = prev[postId] || {};
      const combined = append ? [ ...(cur.all || []), ...slice ] : slice;
      return {
        ...prev,
        [postId]: {
          ...cur,
          opened: true,
          loading: false,
          all: combined,
          page,
          hasMore: start + COMMENT_PAGE_SIZE < arr.length,
          errorMsg: "",
        },
      };
    });
  };

  /* ---------- FETCH ME ---------- */
  const fetchMe = async () => {
    if (!token) { setMe(null); return; }
    try {
      const { data } = await axios.get(`${API}/users/profile-data`, { headers: authHeaders(token) });
      const u = data?.user || data?.data || data || {};
      setMe({
        id: u._id || u.id || null,
        name: u.name || u.fullName || u.username || u.email?.split("@")[0] || "You",
        avatar: u.photo || u.avatar || u.image || null,
      });
    } catch (e) {
      logAxiosError("Fetch profile failed", e);
      setMe(null);
    }
  };

  /* ---------- CREATE POST (robust) ---------- */
  const handleCreatePost = async () => {
    if (!isAuthed) return alert("Please sign in first.");
    const text = postText.trim();
    if (!text && !imageFile) return;

    // Build the form but DO NOT set Content-Type manually (browser sets boundary)
    const form = new FormData();
    // Send all common text keys some APIs accept
    if (text) {
      form.append("body", text);
      form.append("content", text);
      form.append("caption", text);
    } else {
      form.append("body", "."); // some backends require non-empty
    }
    // Send image under multiple likely keys
    if (imageFile) {
      form.append("image", imageFile, imageFile.name);
      form.append("photo", imageFile, imageFile.name);
      form.append("file", imageFile, imageFile.name);
    }

    setPostingPost(true);
    let created = null;
    try {
      const { data } = await axios.post(`${API}/posts`, form, {
        headers: { ...authHeaders(token), Accept: "application/json" },
        withCredentials: false,
      });
      created = data?.post || data?.data?.post || data?.data || data || null;
    } catch (e) {
      logAxiosError("Create post failed", e);
      const status = e?.response?.status;
      const msg = (e?.response?.data?.message || "").toLowerCase();
      if (status === 401 || msg.includes("login")) {
        setErr("Your session is invalid or expired. Please log in again.");
      } else if (status === 415) {
        setErr("Upload failed (bad Content-Type). Please try again.");
      } else {
        setErr("Couldn't create the post. Please try again.");
      }
    }
    setPostingPost(false);

    if (!created) return;

    // Clear composer
    setPostText("");
    setImageFile(null);
    setImagePreview(null);

    // If server returned a real id, show it immediately; then refresh from server
    try {
      const normalized = normPost(created);
      const pid = normalized.id;
      if (pid) {
        const nameFromMe = me?.name || "You";
        const avatarFromMe = me?.avatar || null;
        const safe = {
          ...normalized,
          authorId: normalized.authorId || me?.id || null,
          authorName:
            normalized.authorName && normalized.authorName !== "Unknown"
              ? normalized.authorName
              : nameFromMe,
          authorAvatar: normalized.authorAvatar || avatarFromMe,
        };
        setPosts((prev) => [safe, ...prev]);
        setCommentsCache((prev) => ({ ...prev, [safe.id]: [] }));
        setCmap((prev) => ({ ...prev, [safe.id]: { preview: null } }));
      }
    } catch {/* ignore optimistic failure */}

    // Always reload page 1 from server to ensure we see persisted data
    fetchPostsPage(1, false);
  };

  /* ---------- POSTS: fetch page ---------- */
  const fetchPostsPage = async (page = 1, append = false) => {
    if (append) setLoadingMorePosts(true); else setLoadingPosts(true);
    setErr("");
    try {
      const { data } = await axios.get(
        `${API}/posts?page=${page}&limit=${POSTS_PAGE_SIZE}`,
        { headers: authHeaders(token) }
      );

      const rawList = data?.posts || data?.data?.posts || data?.data || [];
      const list = Array.isArray(rawList) ? rawList : [];

      // normalize THIS page only (preserve server order across pages)
      const normalizedPage = list.map(normPost);

      // cache previews from embedded comments (if any)
      const cacheUpdates = {};
      const previews = {};
      rawList.forEach((raw) => {
        const pid = raw._id || raw.id;
        const rc = Array.isArray(raw?.comments) ? raw.comments : [];
        const norm = rc
          .map(normComment)
          .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
        cacheUpdates[pid] = norm;
        previews[pid] = norm[0] || null;
      });

      setCommentsCache((prev) => ({ ...prev, ...cacheUpdates }));

      setPosts((prev) => {
        const combined = append ? [...prev, ...normalizedPage] : normalizedPage;
        // dedupe by id while preserving first occurrence order
        const seen = new Set();
        return combined.filter((p) => {
          if (!p || !p.id) return false;
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      });

      setCmap((prev) => {
        const next = { ...prev };
        normalizedPage.forEach((p) => {
          if (!next[p.id]) next[p.id] = {};
          next[p.id].preview = previews[p.id] || next[p.id].preview || null;
        });
        return next;
      });

      setPostPage(page);
      setHasMorePosts(normalizedPage.length === POSTS_PAGE_SIZE);
    } catch (e) {
      logAxiosError("Fetch posts failed", e);
      setErr("Couldn’t load posts. Make sure you’re logged in, then refresh.");
    } finally {
      if (append) setLoadingMorePosts(false); else setLoadingPosts(false);
    }
  };

  const reloadPosts = async () => {
    setPostPage(1);
    await fetchPostsPage(1, false);
  };

  const loadMorePosts = async () => {
    if (!hasMorePosts || loadingMorePosts) return;
    await fetchPostsPage(postPage + 1, true);
  };

  /* ---------- COMMENTS: refresh from server ---------- */
  const refreshComments = async (postId, page = 1) => {
    try {
      const res = await axios.get(
        `${API}/posts/${postId}/comments?limit=${COMMENT_PAGE_SIZE}&page=${page}`,
        { headers: authHeaders(token) }
      );
      const arr = extractArray(res)
        .map(normComment)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

      setCommentsCache((prev) => {
        PAGE(postId, arr, page, false);
        return { ...prev, [postId]: arr };
      });
    } catch (e) {
      logAxiosError("Refresh comments failed", e);
      setCmap((prev) => ({
        ...prev,
        [postId]: { ...(prev[postId] || {}), errorMsg: "Couldn’t refresh comments." },
      }));
    }
  };

  /* ---------- COMMENTS: cache-first pagination ---------- */
  const loadFromCache = (postId, page, append) => {
    const all = commentsCache[postId] || [];
    PAGE(postId, all, page, append);
    return { used: all.slice((page - 1) * COMMENT_PAGE_SIZE, page * COMMENT_PAGE_SIZE).length > 0, total: all.length };
  };

  const loadComments = async (postId, page = 1, append = false) => {
    setCmap((prev) => {
      const cur = prev[postId] || {};
      return { ...prev, [postId]: { ...cur, loading: true, errorMsg: "" } };
    });

    const { used, total } = loadFromCache(postId, page, append);
    if (used) return;

    try {
      const res = await axios.get(
        `${API}/posts/${postId}/comments?limit=${COMMENT_PAGE_SIZE}&page=${page}`,
        { headers: authHeaders(token) }
      );
      const arr = extractArray(res)
        .map(normComment)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

      setCommentsCache((prev) => {
        const cur = prev[postId] || [];
        const copy = cur.slice();
        const start = (page - 1) * COMMENT_PAGE_SIZE;
        for (let i = 0; i < arr.length; i++) copy[start + i] = arr[i];
        const seen = new Set();
        const dedup = copy.filter((c) => {
          if (!c) return false;
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
        PAGE(postId, dedup, page, append);
        return { ...prev, [postId]: dedup };
      });
    } catch (e) {
      logAxiosError("Load comments failed", e);
      setCmap((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          opened: true,
          loading: false,
          page: Math.max(1, page),
          hasMore: false,
          errorMsg:
            total > 0
              ? "Couldn’t load more comments."
              : "Couldn’t load comments. Check your login and try again.",
        },
      }));
    }
  };

  /* ---------- EDIT / CANCEL ---------- */
  const startEditComment = (postId, comment) => {
    setCmap((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {}),
        opened: true,
        editingId: comment.id,
        input: comment.text,
      },
    }));
  };

  const cancelEdit = (postId) => {
    setCmap((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {}),
        editingId: null,
        savingEdit: false,
        input: "",
      },
    }));
  };

  /* ---------- ADD / UPDATE COMMENT (JSON + both auth headers) ---------- */
/* ---------- ADD / UPDATE COMMENT (match API exactly) ---------- */
const submitComment = async (postId) => {
  const cur = cmap[postId] || {};
  const text = (cur.input || "").trim();
  if (!isAuthed || !text) return;

  const editing = !!cur.editingId;

  setCmap((prev) => ({
    ...prev,
    [postId]: { ...(prev[postId] || {}), posting: !editing, savingEdit: editing, opened: true, errorMsg: "" },
  }));

  // --- EDIT ---
  if (editing) {
    let ok = false;
    try {
      // keep JSON; send only the `token` header (API doesn’t need Authorization for comments)
      await axios.put(
        `${API}/comments/${cur.editingId}`,
        { content: text },
        { headers: { token, "Content-Type": "application/json", Accept: "application/json" } }
      );
      ok = true;
    } catch (e) {
      logAxiosError("Update comment failed", e);
    }

    setCmap((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {}),
        savingEdit: false,
        posting: false,
        editingId: ok ? null : cur.editingId,
        input: ok ? "" : cur.input,
        errorMsg: ok ? "" : "Couldn’t save the edit.",
      },
    }));

    if (!ok) return;

    setCommentsCache((prev) => {
      const updated = (prev[postId] || []).map((c) =>
        c.id === cur.editingId ? { ...c, text } : c
      );
      PAGE(postId, updated, cur.page || 1, false);
      return { ...prev, [postId]: updated };
    });
    return;
  }

  // --- CREATE ---
  // optimistic local insert
  const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const optimistic = {
    id: tempId,
    text,
    authorId: me?.id || null,
    authorName: me?.name || "You",
    authorAvatar: me?.avatar || null,
    createdAt: new Date().toISOString(),
  };
  setCommentsCache((prev) => {
    const nextArr = [optimistic, ...(prev[postId] || [])];
    PAGE(postId, nextArr, 1, false);
    return { ...prev, [postId]: nextArr };
  });
  setCmap((prev) => ({ ...prev, [postId]: { ...(prev[postId] || {}), input: "", posting: true } }));

  // helper: try exact API first, then a safe fallback
  const tryCreate = async () => {
    try {
      // EXACTLY like your curl/postman:
      const { data } = await axios.post(
        `${API}/comments`,
        { content: text, post: postId },
        { headers: { token, "Content-Type": "application/json", Accept: "application/json" } }
      );
      return data?.comment || data?.data?.comment || data?.data || data || null;
    } catch (e1) {
      logAxiosError("Create comment failed (json)", e1);
      // fallback: some gateways expect form-encoded
      try {
        const params = new URLSearchParams({ content: text, post: postId });
        const { data } = await axios.post(
          `${API}/comments`,
          params,
          { headers: { token, "Content-Type": "application/x-www-form-urlencoded" } }
        );
        return data?.comment || data?.data?.comment || data?.data || data || null;
      } catch (e2) {
        logAxiosError("Create comment failed (form)", e2);
        return null;
      }
    }
  };

  const created = await tryCreate();

  setCmap((prev) => ({ ...prev, [postId]: { ...(prev[postId] || {}), posting: false } }));

  if (!created) {
    // revert optimistic and hard refresh page 1
    setCommentsCache((prev) => {
      const nextArr = (prev[postId] || []).filter((c) => c.id !== tempId);
      PAGE(postId, nextArr, 1, false);
      return { ...prev, [postId]: nextArr };
    });
    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), errorMsg: "Couldn’t add the comment. Check login/permissions." },
    }));
    await refreshComments(postId, 1);
    return;
  }

  // replace optimistic with server one
  const mineRaw = normComment(created);
  const mine = {
    ...mineRaw,
    authorId: mineRaw.authorId || me?.id || null,
    authorName:
      mineRaw.authorName && mineRaw.authorName !== "Anonymous"
        ? mineRaw.authorName
        : (me?.name || "You"),
    authorAvatar: mineRaw.authorAvatar || me?.avatar || null,
  };

  setCommentsCache((prev) => {
    const replaced = (prev[postId] || []).map((c) => (c.id === tempId ? mine : c));
    PAGE(postId, replaced, 1, false);
    return { ...prev, [postId]: replaced };
  });
};

  /* ---------- DELETE COMMENT ---------- */
  const deleteComment = async (postId, commentId) => {
    const cur = cmap[postId] || {};

    if (String(commentId).startsWith("local-")) {
      const local = (commentsCache[postId] || []).find((c) => c.id === commentId);
      if (local) {
        const match = (commentsCache[postId] || []).find(
          (c) =>
            !String(c.id).startsWith("local-") &&
            c.authorId === local.authorId &&
            c.text === local.text
        );
        if (match) commentId = match.id;
      }
    }

    if (String(commentId).startsWith("local-")) {
      setCommentsCache((prev) => {
        const nextArr = (prev[postId] || []).filter((c) => c.id !== commentId);
        PAGE(postId, nextArr, cur.page || 1, false);
        return { ...prev, [postId]: nextArr };
      });
      return;
    }

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), savingEdit: true, errorMsg: "" },
    }));

    let ok = false;
    try {
      await axios.delete(`${API}/comments/${commentId}`, { headers: authHeaders(token) });
      ok = true;
    } catch (e) {
      logAxiosError("Delete comment failed", e);
    }

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), savingEdit: false },
    }));

    if (!ok) {
      setCmap((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          errorMsg: "Couldn’t delete the comment (check permissions/login).",
        },
      }));
      return;
    }

    setCommentsCache((prev) => {
      const nextArr = (prev[postId] || []).filter((c) => c.id !== commentId);
      PAGE(postId, nextArr, cur.page || 1, false);
      return { ...prev, [postId]: nextArr };
    });
  };

  /* ---------- lifecycle ---------- */
  useEffect(() => {
    fetchMe();
    fetchPostsPage(1, false);
    const onFocus = () => setToken(getToken());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // if profile loads after posting, fix "Unknown" authored by me
  useEffect(() => {
    if (!me?.id) return;
    setPosts((prev) =>
      prev.map((p) =>
        (p.authorName === "Unknown" || !p.authorName) && (!p.authorId || p.authorId === me.id)
          ? { ...p, authorId: me.id, authorName: me.name || "You", authorAvatar: me.avatar || p.authorAvatar }
          : p
      )
    );
  }, [me]);

  /* ---------------- helpers: ownership ---------------- */
  const canEditDelete = (comment) => {
    if (!me?.id) return false;
    return comment.authorId === me.id;
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center py-12">
      {/* Composer */}
      <div className="bg-gray-800 w-[90%] max-w-3xl rounded-xl shadow-lg p-5">
        <h3 className="text-white text-lg font-semibold mb-3">Post something</h3>
        <div className="flex flex-col space-y-3">
          <textarea
            className="w-full bg-gray-700 text-white rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Say something…"
            rows={3}
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            disabled={postingPost}
          />
          {imagePreview && (
            <img src={imagePreview} alt="preview" className="rounded-lg max-h-60 object-cover" />
          )}
          <div className="flex items-center justify-between">
            <label className="cursor-pointer text-gray-400 hover:text-white flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
                disabled={postingPost}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12v9m0 0l-3-3m3 3l3-3M12 3v9" />
              </svg>
              <span>Upload</span>
            </label>
            <button
              onClick={handleCreatePost}
              disabled={postingPost || (!postText.trim() && !imageFile)}
              className={`${postingPost ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"} text-white font-semibold px-6 py-2 rounded-lg`}
            >
              {postingPost ? "Posting…" : "Create Post"}
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="w-[90%] max-w-3xl mt-8 space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-gray-300 font-semibold">Latest Posts</h4>
          <button
            onClick={reloadPosts}
            className="text-sm text-blue-400 hover:underline disabled:text-gray-500"
            disabled={loadingPosts || loadingMorePosts}
          >
            Refresh
          </button>
        </div>

        {err && <div className="bg-red-100 text-red-700 p-3 rounded">{err}</div>}

        {loadingPosts && posts.length === 0 ? (
          <div className="text-gray-300">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="text-gray-400">No posts yet.</div>
        ) : (
          <>
            {posts.map((p) => {
              const s = cmap[p.id] || {};
              const {
                opened = false,
                loading = false,
                hasMore = false,
                all = [],
                preview = null,
                input = "",
                posting = false,
                page = 1,
                errorMsg = "",
                editingId = null,
                savingEdit = false,
              } = s;

              const when = p.createdAt || p.updatedAt;

              return (
                <article key={p.id} className="bg-gray-800 rounded-xl shadow-md p-5">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={p.authorName} src={p.authorAvatar} size={44} />
                    <div>
                      <p className="text-white font-semibold">{p.authorName}</p>
                      {when && (
                        <time className="text-gray-400 text-xs" dateTime={new Date(when).toISOString()}>
                          {new Date(when).toLocaleString()}
                        </time>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  {p.content && <p className="text-gray-200 mt-3 whitespace-pre-line">{p.content}</p>}
                  {p.image && (
                    <img
                      src={p.image}
                      alt="post"
                      className="rounded-lg mt-3 max-h-[520px] w-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-gray-400 mt-4">
                    <span className="inline-flex items-center gap-2" title="likes">
                      <span role="img" aria-label="like">👍</span>
                      <span>{p.likes || 0}</span>
                    </span>
                    <span className="inline-flex items-center gap-2" title="comments">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2z" />
                      </svg>
                      <span>{p.commentsCount}</span>
                    </span>
                  </div>

                  {/* Preview & open */}
                  {!opened && (
                    <div className="mt-3 space-y-2">
                      {preview && (
                        <div className="bg-gray-700 rounded p-3 text-gray-100">
                          <div className="flex items-center gap-3">
                            <InitialsAvatar name={preview.authorName} src={preview.authorAvatar} size={28} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{preview.authorName}</span>
                                {preview.createdAt && (
                                  <time className="text-xs text-gray-300">
                                    {new Date(preview.createdAt).toLocaleString()}
                                  </time>
                                )}
                              </div>
                              <div className="text-sm whitespace-pre-line mt-1">{preview.text}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => loadComments(p.id, 1, false)}
                        className="text-blue-400 hover:underline text-sm"
                        disabled={loading}
                      >
                        {loading ? "Loading comments…" : "Show comments"}
                      </button>
                      {errorMsg && <div className="text-red-400 text-xs mt-1">{errorMsg}</div>}
                    </div>
                  )}

                  {/* Full comments */}
                  {opened && (
                    <div className="mt-4 space-y-3">
                      {all.length === 0 && !loading && (
                        <div className="text-gray-400 text-sm">No comments yet.</div>
                      )}

                      {all.map((c) => (
                        <div key={c.id} className="bg-gray-700 rounded p-3 text-gray-100">
                          <div className="flex items-start gap-3">
                            <InitialsAvatar name={c.authorName} src={c.authorAvatar} size={28} />

                            {/* Comment content */}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{c.authorName}</span>
                                {c.createdAt && (
                                  <time className="text-xs text-gray-300">
                                    {new Date(c.createdAt).toLocaleString()}
                                  </time>
                                )}
                              </div>
                              <div className="text-sm whitespace-pre-line mt-1">{c.text}</div>
                            </div>

                            {/* Actions (only mine) */}
                            {canEditDelete(c) && (
                              <div className="flex items-center gap-2 self-start">
                                <button
                                  title="Edit"
                                  className="p-1 rounded hover:bg-gray-600"
                                  onClick={() => startEditComment(p.id, c)}
                                  disabled={savingEdit || posting}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M4 13.5V20h6.5l9.793-9.793a1 1 0 000-1.414l-3.086-3.086a1 1 0 00-1.414 0L4 13.5z" />
                                  </svg>
                                </button>
                                <button
                                  title="Delete"
                                  className="p-1 rounded hover:bg-gray-600"
                                  onClick={() => deleteComment(p.id, c.id)}
                                  disabled={savingEdit || posting}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-3h4m-6 0h8m-9 3h10M9 11v6m6-6v6" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {hasMore && (
                        <button
                          onClick={() => loadComments(p.id, (page || 1) + 1, true)}
                          disabled={loading}
                          className="text-blue-400 hover:underline text-sm"
                        >
                          {loading ? "Loading…" : "Load more"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Add / Edit comment box */}
                  {isAuthed && (
                    <div className="flex items-start gap-3 mt-4">
                      <textarea
                        className="flex-1 bg-gray-700 text-gray-100 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={editingId ? "Edit your comment..." : "Write a comment..."}
                        rows={2}
                        value={input || ""}
                        onChange={(e) =>
                          setCmap((prev) => ({
                            ...prev,
                            [p.id]: { ...(prev[p.id] || {}), input: e.target.value },
                          }))
                        }
                        disabled={posting || savingEdit}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => submitComment(p.id)}
                          disabled={(posting || savingEdit) || !(input || "").trim()}
                          className={`${(posting || savingEdit) ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"} text-white font-semibold px-4 py-2 rounded-lg`}
                        >
                          {editingId ? (savingEdit ? "Saving…" : "Save") : (posting ? "Posting…" : "Comment")}
                        </button>
                        {editingId && (
                          <button
                            onClick={() => cancelEdit(p.id)}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-3 py-2 rounded-lg"
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {/* Posts pagination */}
            <div className="flex items-center justify-center pt-2">
              {hasMorePosts ? (
                <button
                  onClick={loadMorePosts}
                  disabled={loadingMorePosts}
                  className="text-blue-400 hover:underline text-sm disabled:text-gray-500"
                >
                  {loadingMorePosts ? "Loading…" : `Load next ${POSTS_PAGE_SIZE} posts`}
                </button>
              ) : (
                <span className="text-gray-500 text-sm">No more posts.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
