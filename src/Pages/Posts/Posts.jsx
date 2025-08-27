// src/Pages/Posts/Posts.jsx
import { useEffect, useState } from "react";
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
  if (Array.isArray(d?.posts)) return d.posts;
  if (Array.isArray(d?.data?.posts)) return d.data.posts;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.items)) return d.items;
  // scan nested objects for the first array
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

      // quick local guess
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

      // authoritative ask the API
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

    // primary route (two pagination styles)
    const urlPage = `${API}/users/${userId}/posts?limit=${limit}&page=${curPage}`;
    const urlSkip = `${API}/users/${userId}/posts?limit=${limit}&skip=${
      (curPage - 1) * limit
    }`;

    // plan B: fetch general posts and filter locally
    const planB = async (cfg) => {
      // pull a larger page to find yours
      const fallbackUrl = `${API}/posts?limit=${Math.max(
        50,
        limit * 3
      )}&page=1`;
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
      // try page variant
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

      // try skip variant
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

      // try plan B
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
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {err}
          </div>
        )}

        {checkingUser ? (
          <div className="text-white/90 text-center">Checking user…</div>
        ) : loading && posts.length === 0 ? (
          <div className="text-white/90 text-center">Loading…</div>
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
                  <div className="flex items-center justify-between gap-3">
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
                  {p.body && (
                    <p className="mt-2 text-gray-700 whitespace-pre-line">
                      {p.body}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

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
    </div>
  );
}
