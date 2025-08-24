// Profile.jsx
import { useEffect, useState } from "react";
import axios from "axios";

const AVATAR = (name = "User") =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;

const normalizeUser = (raw = {}) => {
  const first = raw.firstName || raw.first_name;
  const last  = raw.lastName  || raw.last_name;

  const name =
    raw.name ||
    raw.fullName ||
    raw.full_name ||
    raw.username ||
    (first || last ? [first, last].filter(Boolean).join(" ") : null) ||
    "User";

  return {
    name,
    email: raw.email || raw.userEmail || raw.mail || "",
    gender: raw.gender || raw.sex || raw.genderType || "Not provided",
    dateOfBirth: raw.dateOfBirth || raw.birthDate || raw.dob || "Not provided",
    avatar: raw.avatar || raw.image || raw.photo || null,
    createdAt: raw.createdAt || raw.created_at || "",
    updatedAt: raw.updatedAt || raw.updated_at || "",
  };
};

export default function Profile() {
  const [user, setUser] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [err, setErr] = useState("");

  const fetchProfile = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setErr("Not logged in. Please sign in.");
      setUser(null);
      setFetching(false);
      return;
    }

    setFetching(true);
    setErr("");

    // Try common header formats against the required endpoint
    const url = "https://linked-posts.routemisr.com/users/profile-data";
    const headersList = [
      { Authorization: `Bearer ${token}` },
      { token },
      { Authorization: token },
    ];

    for (const headers of headersList) {
      try {
        const { data } = await axios.get(url, { headers });
        const raw =
          data?.data?.user || data?.user || data?.data || data || {};
        const merged = normalizeUser(raw);
        setUser(merged);
        setFetching(false);
        return;
      } catch (e) {
        // if 401/403, no need to keep trying other headers if this one already used Bearer
        if (e?.response?.status === 401 || e?.response?.status === 403) {
          // continue to try the next header variant; if all fail we'll set a session error
        }
      }
    }

    setFetching(false);
    setErr("Couldn’t fetch profile from server. Please try again.");
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await fetchProfile();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fetching && !user) {
    return (
      <div className="bg-teal-500 min-h-[85vh] flex items-center justify-center">
        <p className="text-white text-xl">Loading profile…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-teal-500 min-h-[85vh] flex items-center justify-center">
        <div className="bg-teal-400 rounded-lg shadow-lg p-8 text-center">
          <p className="text-white text-lg mb-4">
            {err || "No user info found."}
          </p>
          <button
            onClick={fetchProfile}
            className="bg-white text-teal-600 font-semibold px-5 py-2 rounded hover:bg-teal-700 hover:text-white transition"
          >
            Retry fetching profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-teal-500 min-h-[85vh] flex flex-col items-center py-16">
      <div className="w-[92%] sm:w-[520px] bg-teal-400 rounded-2xl shadow-xl p-8">
        <h1 className="text-4xl font-extrabold text-white tracking-wide text-center mb-6">
          PROFILE
        </h1>

        {/* Avatar + status */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative">
            <img
              src={user.avatar || AVATAR(user.name)}
              alt="avatar"
              className="w-28 h-28 rounded-full ring-4 ring-white shadow-md object-cover"
              onError={(e) => (e.currentTarget.src = AVATAR(user.name))}
            />
          </div>
          <div className="text-white/90 text-sm">
            {fetching ? "Refreshing from server…" : err ? err : ""}
          </div>
        </div>

        {/* Info fields */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-white font-semibold mb-1">Name</label>
            <input
              type="text"
              value={user.name || ""}
              readOnly
              className="w-full p-3 rounded-lg bg-white/90 text-gray-800 shadow-sm"
            />
          </div>

          <div>
            <label className="block text-white font-semibold mb-1">Email</label>
            <input
              type="email"
              value={user.email || ""}
              readOnly
              disabled
              className="w-full p-3 rounded-lg bg-gray-200 text-gray-700 shadow-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-white font-semibold mb-1">Gender</label>
            <input
              type="text"
              value={user.gender || "Not provided"}
              readOnly
              className="w-full p-3 rounded-lg bg-white/90 text-gray-800 shadow-sm"
            />
          </div>

          <div>
            <label className="block text-white font-semibold mb-1">
              Date of Birth
            </label>
            <input
              type="text"
              value={user.dateOfBirth || "Not provided"}
              readOnly
              className="w-full p-3 rounded-lg bg-white/90 text-gray-800 shadow-sm"
            />
          </div>

          {(user.createdAt || user.updatedAt) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              {user.createdAt && (
                <div>
                  <label className="block text-white font-semibold mb-1">
                    Created
                  </label>
                  <input
                    type="text"
                    value={
                      user.createdAt
                        ? new Date(user.createdAt).toLocaleString()
                        : ""
                    }
                    readOnly
                    className="w-full p-3 rounded-lg bg-white/90 text-gray-800 shadow-sm"
                  />
                </div>
              )}
              {user.updatedAt && (
                <div>
                  <label className="block text-white font-semibold mb-1">
                    Updated
                  </label>
                  <input
                    type="text"
                    value={
                      user.updatedAt
                        ? new Date(user.updatedAt).toLocaleString()
                        : ""
                    }
                    readOnly
                    className="w-full p-3 rounded-lg bg-white/90 text-gray-800 shadow-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            onClick={fetchProfile}
            className="flex-1 bg-white text-teal-600 font-semibold py-2.5 rounded-lg shadow hover:bg-teal-700 hover:text-white transition"
          >
            Refresh from server
          </button>

          <button
            onClick={() => window.history.back()}
            className="flex-1 bg-teal-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-teal-700 transition"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
