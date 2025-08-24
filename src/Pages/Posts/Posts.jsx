// Posts.jsx
import { useEffect, useState } from "react";
import axios from "axios";

const USER_ID = "664bcf3e33da217c4af21f00"; // from your link
const LIST_BASE = `https://linked-posts.routemisr.com/users/${USER_ID}/posts`;
const POST_BASE = `https://linked-posts.routemisr.com/posts`;

const normalizePost = (p = {}) => ({
  id: p._id || p.id,
  title: p.title || p.caption || "Untitled",
  body: p.body || p.content || "",
  image: p.image || p.photo || (Array.isArray(p.images) ? p.images[0] : null),
  createdAt: p.createdAt || p.created_at || p.date || null,
  author:
    p.user?.name ||
    p.author?.name ||
    p.username ||
    (p.user && (p.user.full_name || p.user.fullName)) ||
    "Unknown",
});

function getHeaderConfigs() {
  const token = localStorage.getItem("token");
  if (!token) return [ { headers: {} } ];
  return [
    { headers: { token } },
    { headers: { Authorization: `Bearer ${token}` } },
    { headers: { Authorization: token } },
  ];
}

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // edit state
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [editImage, setEditImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchPosts = async ({ reset = false } = {}) => {
    setLoading(true);
    setErr("");

    const headersVariants = getHeaderConfigs();

    const limit = 2;
    const urlPage = `${LIST_BASE}?limit=${limit}&page=${reset ? 1 : page}`;
    const urlSkip = `${LIST_BASE}?limit=${limit}&skip=${(reset ? 0 : (page - 1)) * limit}`;

    let success = false;
    for (const cfg of headersVariants) {
      try {
        const { data } = await axios.get(urlPage, cfg);
        const rawList =
          data?.data?.posts || data?.posts || data?.data || data || [];
        const next = rawList.map(normalizePost);
        setPosts((cur) => (reset ? next : [...cur, ...next]));
        setHasMore(next.length === limit);
        success = true;
        break;
      } catch {
        try {
          const { data } = await axios.get(urlSkip, cfg);
          const rawList =
            data?.data?.posts || data?.posts || data?.data || data || [];
          const next = rawList.map(normalizePost);
          setPosts((cur) => (reset ? next : [...cur, ...next]));
          setHasMore(next.length === limit);
          success = true;
          break;
        } catch {
          // try next header
        }
      }
    }

    if (!success) setErr("Couldn’t load posts. Please try again.");
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (page > 1) fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* ---------------- actions: edit / delete ---------------- */

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditBody(p.body || "");
    setEditImage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
    setEditImage(null);
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setErr("");

    const headersVariants = getHeaderConfigs();
    const fd = new FormData();
    fd.append("body", editBody || "");
    if (editImage) {
      fd.append("image", editImage);
    }

    let success = false;
    let updatedPost = null;

    for (const cfg of headersVariants) {
      try {
        // IMPORTANT: do NOT set Content-Type manually; axios sets multipart boundary.
        const { data } = await axios.put(`${POST_BASE}/${editingId}`, fd, cfg);
        const raw =
          data?.data?.post || data?.post || data?.data || data || null;
        if (raw) updatedPost = normalizePost(raw);
        success = true;
        break;
      } catch (_) {
        // try next header variant
      }
    }

    if (!success) {
      setErr("Couldn’t update the post. Check your token or try again.");
      setSaving(false);
      return;
    }

    if (updatedPost) {
      setPosts((cur) =>
        cur.map((x) => (x.id === editingId ? { ...x, ...updatedPost } : x))
      );
    } else {
      // fallback: update locally if API didn’t return a full object
      setPosts((cur) =>
        cur.map((x) =>
          x.id === editingId
            ? {
                ...x,
                body: editBody,
                // optimistic local preview if user chose a new image
                ...(editImage ? { image: URL.createObjectURL(editImage) } : {}),
              }
            : x
        )
      );
    }

    cancelEdit();
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this post?")) return;
    setDeletingId(id);
    setErr("");

    const headersVariants = getHeaderConfigs();
    let success = false;

    for (const cfg of headersVariants) {
      try {
        await axios.delete(`${POST_BASE}/${id}`, cfg);
        success = true;
        break;
      } catch (_) {
        // try next header variant
      }
    }

    if (!success) {
      setErr("Couldn’t delete the post. Check your token or try again.");
      setDeletingId(null);
      return;
    }

    setPosts((cur) => cur.filter((p) => p.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="bg-teal-500 min-h-[85vh] flex flex-col items-center py-16">
      <div className="w-[92%] max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold text-white uppercase mb-6 text-center">
          Posts
        </h1>

        {err && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {err}
          </div>
        )}

        {loading && posts.length === 0 ? (
          <div className="text-white/90 text-center">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="text-white/90 text-center">No posts yet.</div>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <li
                  key={p.id}
                  className="bg-white/95 rounded-xl shadow-md overflow-hidden"
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      className="w-full max-h-72 object-cover"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : null}

                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-gray-800">
                        {p.title}
                      </h3>
                      {p.createdAt ? (
                        <time
                          className="text-xs text-gray-500"
                          dateTime={new Date(p.createdAt).toISOString()}
                        >
                          {new Date(p.createdAt).toLocaleString()}
                        </time>
                      ) : null}
                    </div>

                    {/* Body / Edit form */}
                    {!isEditing ? (
                      p.body ? (
                        <p className="mt-2 text-gray-700 whitespace-pre-line">
                          {p.body}
                        </p>
                      ) : null
                    ) : (
                      <div className="mt-3 space-y-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Body
                        </label>
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="Write something…"
                        />
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Replace Image (optional)
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              setEditImage(e.target.files?.[0] || null)
                            }
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        by <span className="font-medium">{p.author}</span>
                      </div>

                      {/* Actions */}
                      {!isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(p)}
                            className="px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            className={`px-3 py-1.5 rounded-lg ${
                              deletingId === p.id
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-red-600 text-white hover:bg-red-700"
                            }`}
                          >
                            {deletingId === p.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className={`px-3 py-1.5 rounded-lg ${
                              saving
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-teal-600 text-white hover:bg-teal-700"
                            }`}
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-center mt-8">
          <button
            disabled={!hasMore || loading}
            onClick={() => setPage((n) => n + 1)}
            className={`px-5 py-2 rounded-lg font-semibold shadow
              ${
                hasMore
                  ? "bg-white text-teal-600 hover:bg-teal-700 hover:text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }
            `}
          >
            {loading && posts.length > 0
              ? "Loading…"
              : hasMore
              ? "Load more"
              : "No more posts"}
          </button>
        </div>
      </div>
    </div>
  );
}
