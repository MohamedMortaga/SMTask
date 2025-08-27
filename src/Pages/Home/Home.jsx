// Home.jsx
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  memo,
} from "react";
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
const PAGE_SIZE = 5;       // comments page size (client side only)
const POSTS_LIMIT = 6;     // posts page size (server side)

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

const authHeaders = (token) => (token ? { token } : {});

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

// pagination meta with “infinite next” fallback
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

  if (typeof totalPagesFromMeta !== "number") {
    return {
      page: requestedPage,
      totalPages: listLen < limit ? requestedPage : requestedPage + 1,
    };
  }
  return { page: requestedPage, totalPages: totalPagesFromMeta };
};

const buildPageWindow = (page, total) => {
  const out = [];
  const push = (x) => out.push(x);
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
  return out;
};

/* ---------- memoized inline comments panel (outside Home) ---------- */
const InlineComments = memo(function InlineComments({
  postId,
  openedInline,            // ← visible state is passed in
  cmap,
  setCmap,
  isAuthed,
  canEditDelete,
  loadComments,
  deleteComment,
  submitComment,
  cancelEdit,
}) {
  const s = cmap[postId] || {};
  const {
    all = [],
    loading = false,
    hasMore = false,
    page = 1,
    input = "",
    posting = false,
    savingEdit = false,
    editingId = null,
    errorMsg = "",
  } = s;

  // 🔥 Auto-load when panel becomes visible and list is empty
  useEffect(() => {
    if (openedInline && !loading && (!all || all.length === 0)) {
      loadComments(postId, 1, false);
    }
  }, [openedInline, loading, all?.length, postId, loadComments]);

  // keep focus across re-renders
  const inputRef = useRef(null);
  const wasFocusedRef = useRef(false);

  useLayoutEffect(() => {
    if (wasFocusedRef.current && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      const len = inputRef.current.value?.length ?? 0;
      inputRef.current.setSelectionRange(len, len);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, posting, savingEdit, editingId, loading, page, all.length]);

  return (
    <div
      className="mt-3 rounded-xl border border-gray-700 bg-gray-800/60"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-gray-700 text-gray-200 font-semibold">
        Comments
      </div>

      <div className="max-h-[360px] overflow-auto p-3 space-y-3">
        {loading ? (
          <div className="text-gray-300">Loading comments…</div>
        ) : all.length === 0 ? (
          <div className="text-gray-400">No comments yet.</div>
        ) : (
          all.map((c) => (
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
                {canEditDelete(c) && (
                  <div className="flex items-center gap-2 self-start">
                    <button
                      title="Edit"
                      className="p-1 rounded hover:bg-gray-600"
                      onClick={() =>
                        setCmap((prev) => ({
                          ...prev,
                          [postId]: { ...(prev[postId] || {}), editingId: c.id, input: c.text },
                        }))
                      }
                      disabled={savingEdit || posting}
                    >
                      ✎
                    </button>
                    <button
                      title="Delete"
                      className="p-1 rounded hover:bg-gray-600"
                      onClick={() => deleteComment(postId, c.id)}
                      disabled={savingEdit || posting}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {errorMsg && <div className="text-red-400 text-xs">{errorMsg}</div>}
        {hasMore && (
          <button
            onClick={() => loadComments(postId, (page || 1) + 1, true)}
            disabled={loading}
            className="text-blue-400 hover:underline text-sm"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {/* composer */}
      {isAuthed && (
        <div className="p-3 border-t border-gray-700">
          <textarea
            ref={inputRef}
            className="w-full bg-gray-700 text-gray-100 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={editingId ? "Edit your comment..." : "Write a comment..."}
            rows={2}
            value={input || ""}
            onFocus={() => (wasFocusedRef.current = true)}
            onBlur={() => (wasFocusedRef.current = false)}
            onChange={(e) =>
              setCmap((prev) => ({
                ...prev,
                [postId]: { ...(prev[postId] || {}), input: e.target.value },
              }))
            }
            disabled={posting || savingEdit}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => submitComment(postId)}
              disabled={(posting || savingEdit) || !(input || "").trim()}
              className={`${(posting || savingEdit) ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"} text-white font-semibold px-4 py-2 rounded-lg`}
            >
              {editingId ? (savingEdit ? "Saving…" : "Save") : (posting ? "Posting…" : "Comment")}
            </button>
            {editingId && (
              <button
                onClick={() => cancelEdit(postId)}
                className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-3 py-2 rounded-lg"
                disabled={savingEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/* ---------- pager (outside Home) ---------- */
function Pager({ page, total, onGo }) {
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
}

/* ---------- modal (outside Home) ---------- */
function PostModal({
  m,
  onBackdropMouseDown,
  closeModal,
  cmap,
  setCmap,
  posts,
  isAuthed,
  canEditDelete,
  loadComments,
  deleteComment,
  submitComment,
  cancelEdit,
}) {
  const inputRef = useRef(null);

  // auto-focus when modal opens (after first paint)
  useEffect(() => {
    if (m.open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [m.open]);

  if (!m.open) return null;
  const pid = m.postId;
  const s = cmap[pid] || {};
  const {
    all = [],
    loading = false,
    hasMore = false,
    page = 1,
    input = "",
    posting = false,
    savingEdit = false,
    editingId = null,
    errorMsg = "",
  } = s;

  const post = m.post || posts.find((p) => p.id === pid);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        className="bg-gray-900 rounded-2xl shadow-xl w-full max-w-6xl h-[100vh] overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_380px]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Left: post */}
        <div className="relative h-full overflow-auto">
          {m.loading ? (
            <div className="h-full flex items-center justify-center text-gray-300">Loading post…</div>
          ) : !post ? (
            <div className="h-full flex items-center justify-center text-gray-400">Post not found.</div>
          ) : (
            <div className="p-5">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={post.authorName} src={post.authorAvatar} size={46} />
                <div>
                  <p className="text-white font-semibold">{post.authorName}</p>
                  {(post.createdAt || post.updatedAt) && (
                    <time className="text-gray-400 text-xs">
                      {new Date(post.createdAt || post.updatedAt).toLocaleString()}
                    </time>
                  )}
                </div>
              </div>
              {post.content && (
                <p className="text-gray-200 mt-4 whitespace-pre-line">{post.content}</p>
              )}
              {post.image && (
                <img
                  src={post.image}
                  alt="post"
                  className="rounded-xl mt-4 max-h-[60vh] w-full object-contain bg-black/20"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
            </div>
          )}
          <button
            onClick={closeModal}
            className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full w-9 h-9 flex items-center justify-center"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Right: comments */}
        <aside className="h-full bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700 text-gray-200 font-semibold">
            Comments
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-1">
            {loading ? (
              <div className="text-gray-300">Loading comments…</div>
            ) : all.length === 0 ? (
              <div className="text-gray-400">No comments yet.</div>
            ) : (
              all.map((c) => (
                <div key={c.id} className="bg-gray-700 rounded-xl p-3 text-gray-100">
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
                    {canEditDelete(c) && (
                      <div className="flex items-center gap-2 self-start">
                        <button
                          title="Edit"
                          className="p-1 rounded hover:bg-gray-600"
                          onClick={() =>
                            setCmap((prev) => ({
                              ...prev,
                              [pid]: { ...(prev[pid] || {}), editingId: c.id, input: c.text },
                            }))
                          }
                          disabled={savingEdit || posting}
                        >
                          ✎
                        </button>
                        <button
                          title="Delete"
                          className="p-1 rounded hover:bg-gray-600"
                          onClick={() => deleteComment(pid, c.id)}
                          disabled={savingEdit || posting}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {errorMsg && <div className="text-red-400 text-xs">{errorMsg}</div>}
            {hasMore && (
              <button
                onClick={() => loadComments(pid, (page || 1) + 1, true)}
                disabled={loading}
                className="text-blue-400 hover:underline text-sm"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>

          {isAuthed && (
            <div className="p-3 border-t border-gray-700">
              <textarea
                ref={inputRef}
                className="w-full bg-gray-700 text-gray-100 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={editingId ? "Edit your comment..." : "Write a comment..."}
                rows={2}
                value={input || ""}
                onChange={(e) =>
                  setCmap((prev) => ({
                    ...prev,
                    [pid]: { ...(prev[pid] || {}), input: e.target.value },
                  }))
                }
                disabled={posting || savingEdit}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => submitComment(pid)}
                  disabled={(posting || savingEdit) || !(input || "").trim()}
                  className={`${(posting || savingEdit) ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"} text-white font-semibold px-4 py-2 rounded-lg`}
                >
                  {editingId ? (savingEdit ? "Saving…" : "Save") : (posting ? "Posting…" : "Comment")}
                </button>
                {editingId && (
                  <button
                    onClick={() => cancelEdit(pid)}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-semibold px-3 py-2 rounded-lg"
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------------- main component ---------------- */
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

  // comments cache + per post UI
  const [commentsCache, setCommentsCache] = useState({});
  const [cmap, setCmap] = useState({});
  const cmapRef = useRef(cmap);
  useEffect(() => { cmapRef.current = cmap; }, [cmap]);

  // modal
  const [modal, setModal] = useState({
    open: false,
    loading: false,
    postId: null,
    post: null,
  });

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

  // client-side comments paging
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
    setPostPage(1);
  };

  /* ---------- FETCH POSTS ---------- */
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

      const { page: current, totalPages } = getPostPagination(
        data,
        POSTS_LIMIT,
        list.length,
        page
      );

      setCommentsCache((prev) => ({ ...prev, ...cache }));
      setPosts(normalized);
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

  /* ---------- comments load ---------- */
  const ensureCommentsLoaded = async (postId) => {
    if ((commentsCache[postId] || []).length) return commentsCache[postId];

    try {
      const res = await axios.get(`${API}/posts/${postId}/comments`, {
        headers: authHeaders(token),
      });
      const arr = extractArray(res)
        .map(normComment)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

      setCommentsCache((prev) => ({ ...prev, [postId]: arr }));
      return arr;
    } catch (e) {
      logAxiosError("Load comments failed", e);
      setCmap((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          opened: true,
          loading: false,
          page: 1,
          hasMore: false,
          errorMsg: "Couldn’t load comments. Check your login and try again.",
        },
      }));
      return [];
    }
  };

  const loadComments = async (postId, page = 1, append = false) => {
    setCmap((prev) => {
      const cur = prev[postId] || {};
      return { ...prev, [postId]: { ...cur, loading: true, errorMsg: "" } };
    });

    const all = await ensureCommentsLoaded(postId);
    PAGE(postId, all, page, append);
  };

  const refreshComments = async (postId, page = 1) => {
    try {
      const res = await axios.get(`${API}/posts/${postId}/comments`, {
        headers: authHeaders(token),
      });
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
    const cur = cmapRef.current[postId] || {};
    const text = (cur.input || "").trim();
    if (!isAuthed || !text) return;

    const editing = !!cur.editingId;

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), posting: !editing, savingEdit: editing, opened: true },
    }));

    if (editing) {
      let ok = false;
      try {
        await axios.put(`${API}/comments/${cur.editingId}`, { content: text }, { headers: authHeaders(token) });
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
    const cur = cmapRef.current[postId] || {};

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

    try {
      await axios.delete(`${API}/comments/${commentId}`, {
        headers: authHeaders(token),
      });
    } catch (e) {
      logAxiosError("Delete comment failed", e);
      const status = e?.response?.status;
      const apiMsg = e?.response?.data?.message || "";
      if (status === 403) toast.error(apiMsg || "You can only delete your own comments.");
      else if (status === 404) toast.error("Comment not found.");
      else if (status === 401) toast.error("Unauthorized. Please log in again.");
      else toast.error(apiMsg || "Couldn't delete the comment.");
      setCmap((prev) => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          savingEdit: false,
          errorMsg: "Couldn’t delete the comment (check permissions/login).",
        },
      }));
      return;
    }

    setCmap((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || {}), savingEdit: false },
    }));

    setCommentsCache((prev) => {
      const nextArr = (prev[postId] || []).filter((c) => c.id !== commentId);
      PAGE(postId, nextArr, cur.page || 1, false);
      return { ...prev, [postId]: nextArr };
    });
    toast.success("Comment deleted.");
  };

  /* ---------- modal open/close ---------- */
  const openPost = useCallback(async (postId) => {
    setModal({ open: true, loading: true, postId, post: null });

    setCmap((prev) => ({ ...prev, [postId]: { ...(prev[postId] || {}), opened: true } }));
    await loadComments(postId, 1, false);

    try {
      const { data } = await axios.get(`${API}/posts/${postId}`, { headers: authHeaders(token) });
      const raw = data?.post || data?.data?.post || data?.data || data || {};
      setModal((m) => ({ ...m, post: normPost(raw), loading: false }));
    } catch (e) {
      logAxiosError("Get single post failed", e);
      setModal((m) => ({ ...m, loading: false }));
      toast.error("Couldn't open post.");
    }
  }, [token]); // eslint-disable-line

  const closeModal = useCallback(() => {
    setModal({ open: false, loading: false, postId: null, post: null });
  }, []);

  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };

  /* ---------- lifecycle ---------- */
  useEffect(() => { fetchMe(); }, [token]);

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

  /* ---------- toggle inline comments (CSS hide, no unmount) ---------- */
  const toggleInlineComments = useCallback((postId) => {
    setCmap((prev) => {
      const cur = prev[postId] || {};
      const willOpen = !cur.openedInline;
      return {
        ...prev,
        [postId]: {
          ...cur,
          openedInline: willOpen,
          loading: willOpen ? (cur.loading ?? false) : cur.loading, // spinner handled by effect
        },
      };
    });
  }, []);

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
            <span className="text-gray-400 text-sm">Page : {postPage}</span>
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
              const when = p.createdAt || p.updatedAt;

              return (
                <article
                  key={p.id}
                  className="bg-gray-800 rounded-xl shadow-md p-5"
                >
                  {/* click anywhere on header/body to open modal */}
                  <div
                    className="cursor-pointer"
                    onClick={() => openPost(p.id)}
                  >
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

                    {p.content && <p className="text-gray-200 mt-3 whitespace-pre-line">{p.content}</p>}
                    {p.image && (
                      <img
                        src={p.image}
                        alt="post"
                        className="rounded-lg mt-3 max-h-[520px] w-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-6 text-gray-400 mt-4">
                    <span className="inline-flex items-center gap-2" title="likes">
                      <span role="img" aria-label="like">👍</span>
                    </span>

                    <button
                      className="inline-flex items-center gap-2 hover:text-gray-200"
                      title="comments"
                      onClick={(e) => { e.stopPropagation(); toggleInlineComments(p.id); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2z" />
                      </svg>
                      <span>{p.commentsCount}</span>
                      <span className="text-xs ml-1">
                        {(cmap[p.id]?.openedInline ? "Hide" : "Show")}
                      </span>
                    </button>
                  </div>

                  {/* Inline comments panel — keep mounted to preserve focus */}
                  <div className={cmap[p.id]?.openedInline ? "" : "hidden"}>
                    <InlineComments
                      postId={p.id}
                      openedInline={!!cmap[p.id]?.openedInline}   // ← drives self-loading
                      cmap={cmap}
                      setCmap={setCmap}
                      isAuthed={isAuthed}
                      canEditDelete={canEditDelete}
                      loadComments={loadComments}
                      deleteComment={deleteComment}
                      submitComment={submitComment}
                      cancelEdit={cancelEdit}
                    />
                  </div>
                </article>
              );
            })}

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

      {/* Modal */}
      <PostModal
        m={modal}
        onBackdropMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        closeModal={closeModal}
        cmap={cmap}
        setCmap={setCmap}
        posts={posts}
        isAuthed={isAuthed}
        canEditDelete={canEditDelete}
        loadComments={loadComments}
        deleteComment={deleteComment}
        submitComment={submitComment}
        cancelEdit={cancelEdit}
      />
    </div>
  );
}
