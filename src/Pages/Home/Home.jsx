// Home.jsx
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

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

// client-side page size for COMMENTS only
const PAGE_SIZE = 5;

// server-side page size for POSTS (set 10 for your test; change anytime)
const POSTS_LIMIT = 6;

// read token
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

const authHeaders = (token) => (token ? { token } : {});
const headerVariants = (token) =>
  token
    ? [
        { token: token },
        { token: ` ${token} `.trim() },
        { Authorization: token },
        { Authorization: `Bearer ${token}` },
      ]
    : [{}];

const normPost = (p = {}) => {
  const u = p.user || p.author || p.createdBy || p.owner || {};
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
    commentsCount: Array.isArray(p.comments)
      ? p.comments.length
      : p.commentsCount ?? 0,
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

/**
 * Read pagination meta from API if present; otherwise behave like "infinite next":
 * keep showing Next until a page returns fewer than `limit` items.
 * We ALWAYS trust the requested page number (`requestedPage`) for the UI.
 */
const getPostPagination = (data, limit, listLen, requestedPage) => {
  const meta =
    data?.paginationResult ||
    data?.data?.paginationResult ||
    data?.metadata ||
    {};
  const total = meta.total || data?.total || data?.data?.total || meta.count;
  const totalPagesFromMeta =
    meta.numberOfPages ||
    meta.totalPages ||
    data?.totalPages ||
    data?.data?.totalPages ||
    (typeof total === "number" && limit
      ? Math.max(1, Math.ceil(total / limit))
      : undefined);

  const current = requestedPage;

  // If API didn't provide totalPages, keep "one page ahead" until fewer than limit are returned
  if (typeof totalPagesFromMeta !== "number") {
    return {
      page: current,
      totalPages: listLen < limit ? current : current + 1,
    };
  }

  return { page: current, totalPages: totalPagesFromMeta };
};

// build compact window like: Back [1] 2 3 4 5 … 25 Next
const buildPageWindow = (page, total) => {
  const nums = [];
  const push = (x) => nums.push(x);
  if (total <= 8) {
    for (let i = 1; i <= total; i++) push(i);
  } else {
    const left = Math.max(2, page - 2);
    const right = Math.min(total - 1, page + 2);
    push(1);
    if (left > 2) push("…");
    for (let i = left; i <= right; i++) push(i);
    if (right < total - 1) push("…");
    push(total);
  }
  return nums;
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
  const [me, setMe] = useState(null);

  // composer
  const [postText, setPostText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [postingPost, setPostingPost] = useState(false);

  // feed
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [err, setErr] = useState("");

  // posts pagination
  const [postPage, setPostPage] = useState(1);
  const [postTotalPages, setPostTotalPages] = useState(1);

  // comments cache + UI map
  const [commentsCache, setCommentsCache] = useState({});
  const [cmap, setCmap] = useState({}); // per post state

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

  /* ---------- repaint one page from a given array (comments) ---------- */
  const PAGE = (postId, arr, page = 1, append = false) => {
    const start = (page - 1) * PAGE_SIZE;
    const slice = arr.slice(start, start + PAGE_SIZE);
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
          hasMore: start + PAGE_SIZE < arr.length,
          errorMsg: "",
        },
      };
    });
  };

  /* ---------- me ---------- */
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

  /* ---------- CREATE POST ---------- */
  const handleCreatePost = async () => {
    if (!isAuthed) return alert("Please sign in first.");
    const text = postText.trim();
    if (!text && !imageFile) return;

    const form = new FormData();
    form.append("body", text || ".");
    if (imageFile) form.append("image", imageFile);

    setPostingPost(true);
    let created = null;
    try {
      const { data } = await axios.post(`${API}/posts`, form, {
        headers: {
          ...authHeaders(token),
          "Content-Type": "multipart/form-data",
          Accept: "application/json",
        },
        withCredentials: false,
      });
      created = data?.post || data?.data?.post || data?.data || data || null;
    } catch (e) {
      logAxiosError("Create post failed", e);
      const status = e?.response?.status;
      const msg = (e?.response?.data?.message || "").toLowerCase();
      if (status === 401 || msg.includes("login")) {
        setErr("Your session is invalid or expired. Please log in again.");
      } else {
        setErr("Couldn't create the post. Please try again.");
      }
    }
    setPostingPost(false);

    if (!created) {
      toast.error("Couldn't create the post. Please try again.");
      return;
    }

    setPostText("");
    setImageFile(null);
    setImagePreview(null);

    // push to top of current page when on page 1
    if (postPage === 1) {
      let p = normPost(created);
      p = {
        ...p,
        authorId: p.authorId || me?.id || null,
        authorName:
          p.authorName && p.authorName !== "Unknown"
            ? p.authorName
            : (me?.name || "You"),
        authorAvatar: p.authorAvatar ?? me?.avatar ?? null,
        createdAt: p.createdAt || new Date().toISOString(),
        commentsCount: p.commentsCount ?? 0,
      };
      setPosts((prev) => [p, ...prev].slice(0, POSTS_LIMIT));
    }

    toast.success("Post created!");
    // re-fetch page 1 to align with server (and reset to first page)
    setPostPage(1);
  };

  /* ---------- FETCH POSTS (server-side pagination) ---------- */
  const fetchPosts = async (page = 1) => {
    setLoadingPosts(true);
    setErr("");

    try {
      const { data } = await axios.get(
        `${API}/posts?page=${page}&limit=${POSTS_LIMIT}`,
        { headers: authHeaders(token) }
      );

      const rawList = data?.posts || data?.data?.posts || data?.data || data?.results || [];
      const list = Array.isArray(rawList) ? rawList : [];

      const normalized = list
        .map(normPost)
        .filter((p) => p.id)
        .sort(
          (a, b) =>
            (Date.parse(b.createdAt || b.updatedAt) || 0) -
            (Date.parse(a.createdAt || a.updatedAt) || 0)
        );

      // comments cache + preview for those posts
      const cache = {};
      const previews = {};
      list.forEach((raw) => {
        const pid = raw._id || raw.id;
        const rc = Array.isArray(raw?.comments) ? raw.comments : [];
        const norm = rc
          .map(normComment)
          .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
        cache[pid] = norm;
        previews[pid] = norm[0] || null;
      });

      // dynamic/infinite fallback if totals are missing
      const { page: current, totalPages } = getPostPagination(
        data,
        POSTS_LIMIT,
        list.length,
        page
      );

      setCommentsCache((prev) => ({ ...prev, ...cache }));
      setPosts(normalized);

      // Always trust the page we requested
      setPostPage(current);
      setPostTotalPages(Math.max(1, totalPages || 1));

      setCmap((prev) => {
        const next = { ...prev };
        normalized.forEach((p) => {
          if (!next[p.id]) next[p.id] = {};
          next[p.id].preview = previews[p.id] || null;
        });
        return next;
      });
    } catch (e) {
      logAxiosError("Fetch posts failed", e);
      setErr("Couldn’t load posts. Make sure you’re logged in, then refresh.");
    } finally {
      setLoadingPosts(false);
    }
  };

  /* ---------- refresh comments page ---------- */
  const refreshComments = async (postId, page = 1) => {
    try {
      const res = await axios.get(
        `${API}/posts/${postId}/comments?limit=${PAGE_SIZE}&page=${page}`,
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

  /* ---------- comments: cache-first pagination ---------- */
  const loadFromCache = (postId, page, append) => {
    const all = commentsCache[postId] || [];
    PAGE(postId, all, page, append);
    return { used: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).length > 0, total: all.length };
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
        `${API}/posts/${postId}/comments?limit=${PAGE_SIZE}&page=${page}`,
        { headers: authHeaders(token) }
      );
      const arr = extractArray(res)
        .map(normComment)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

      setCommentsCache((prev) => {
        const cur = prev[postId] || [];
        const copy = cur.slice();
        const start = (page - 1) * PAGE_SIZE;
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

  /* ---------- comment edit helpers ---------- */
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

  const submitComment = async (postId) => {
    const cur = cmap[postId] || {};
    const text = (cur.input || "").trim();
    if (!isAuthed || !text) return;

    const editing = !!cur.editingId;

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), posting: !editing, savingEdit: editing, opened: true },
    }));

    if (editing) {
      let ok = false;
      for (const headers of headerVariants(token)) {
        try {
          await axios.put(`${API}/comments/${cur.editingId}`, { content: text }, { headers });
          ok = true;
          break;
        } catch (e) {
          logAxiosError("Update comment failed", e);
        }
      }

      setCmap((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          savingEdit: false,
          posting: false,
          editingId: ok ? null : cur.editingId,
          input: ok ? "" : cur.input,
        },
      }));
      if (!ok) {
        toast.error("Couldn't update the comment.");
        return;
      }

      setCommentsCache((prev) => {
        const updated = (prev[postId] || []).map((c) =>
          c.id === cur.editingId ? { ...c, text } : c
        );
        PAGE(postId, updated, cur.page || 1, false);
        return { ...prev, [postId]: updated };
      });
      toast.success("Comment updated.");
      return;
    }

    // create
    let createdComment = null;
    try {
      const { data } = await axios.post(
        `${API}/comments`,
        { content: text, post: postId },
        { headers: authHeaders(token) }
      );
      createdComment =
        data?.comment ||
        data?.data?.comment ||
        (data?.data && (data.data._id || data.data.id) ? data.data : null) ||
        (data && (data._id || data.id) ? data : null);
    } catch (e) {
      logAxiosError("Create comment failed", e);
    }

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), posting: false },
    }));

    if (createdComment) {
      const mine = normComment(createdComment);
      setCommentsCache((prev) => {
        const nextArr = [mine, ...(prev[postId] || [])];
        PAGE(postId, nextArr, 1, false);
        return { ...prev, [postId]: nextArr };
      });
      setCmap((prev) => ({
        ...prev,
        [postId]: { ...(prev[postId] || {}), input: "", opened: true },
      }));
      toast.success("Comment added.");
      return;
    }

    // optimistic then sync
    setCommentsCache((prev) => {
      const curArr = prev[postId] || [];
      const mine = {
        id: `local-${Date.now()}`,
        text,
        authorName: me?.name || "You",
        authorAvatar: me?.avatar || null,
        authorId: me?.id || null,
        createdAt: new Date().toISOString(),
      };
      const nextArr = [mine, ...curArr];
      PAGE(postId, nextArr, 1, false);
      return { ...prev, [postId]: nextArr };
    });
    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), input: "", opened: true },
    }));
    toast.success("Comment added.");
    await refreshComments(postId, 1);
  };

  const deleteComment = async (postId, commentId) => {
    const cur = cmap[postId] || {};

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

    const tryDelete = async () => {
      try {
        await axios.delete(`${API}/comments/${commentId}`, { headers: { token } });
        return { ok: true };
      } catch (e1) {
        logAxiosError("Delete (token) failed", e1);
        const status = e1?.response?.status || 0;
        if (status === 401 || status === 403) {
          try {
            await axios.delete(`${API}/comments/${commentId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return { ok: true };
          } catch (e2) {
            logAxiosError("Delete (Bearer) failed", e2);
            if ((e2?.response?.status || 0) === 403) return { ok: false, forbidden: true };
          }
        }
        try {
          await axios.delete(
            `${API}/comments/${commentId}?post=${encodeURIComponent(postId)}`,
            { headers: { token } }
          );
          return { ok: true };
        } catch (e3) {
          logAxiosError("Delete (with ?post=) failed", e3);
          return { ok: false };
        }
      }
    };

    const { ok, forbidden } = await tryDelete();

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), savingEdit: false },
    }));

    if (!ok) {
      if (forbidden) {
        toast.error("You can only delete your own comments.");
      } else {
        toast.error("Couldn't delete the comment.");
      }
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
    toast.success("Comment deleted.");
  };

  /* ---------- lifecycle ---------- */
  useEffect(() => {
    fetchMe();
  }, [token]);

  useEffect(() => {
    fetchPosts(postPage);
    const onFocus = () => setToken(getToken());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, postPage]);

  const canEditDelete = (comment) => {
    if (!me?.id) return false;
    return comment.authorId === me.id;
  };

  /* ---------- posts pager UI ---------- */
  const Pager = ({ page, total, onGo }) => {
    if (total <= 1) return null;
    const items = buildPageWindow(page, total);

    return (
      <div className="flex items-center gap-1 justify-center mt-6 select-none">
        <button
          onClick={() => onGo(Math.max(1, page - 1))}
          disabled={page === 1}
          className={`px-3 py-1 rounded ${page === 1 ? "bg-gray-700 text-gray-500" : "bg-gray-800 hover:bg-gray-700 text-gray-200"}`}
        >
          Back
        </button>

        {items.map((it, idx) =>
          it === "…" ? (
            <span key={`dots-${idx}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={it}
              onClick={() => onGo(it)}
              className={`w-8 h-8 rounded ${
                it === page
                  ? "bg-black text-white"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-200"
              }`}
              title={`Go to page ${it}`}
            >
              {it}
            </button>
          )
        )}

        <button
          onClick={() => onGo(Math.min(total, page + 1))}
          disabled={page === total}
          className={`px-3 py-1 rounded ${page === total ? "bg-gray-700 text-gray-500" : "bg-gray-800 hover:bg-gray-700 text-gray-200"}`}
        >
          Next
        </button>
      </div>
    );
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
          {postTotalPages > 1 && (
            <span className="text-gray-400 text-sm">
              Page : {postPage}
            </span>
          )}
        </div>

        {err && <div className="bg-red-100 text-red-700 p-3 rounded">{err}</div>}

        {loadingPosts ? (
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

            {/* POSTS PAGER */}
            <Pager
              page={postPage}
              total={postTotalPages}
              onGo={(p) => {
                if (p !== postPage) setPostPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
