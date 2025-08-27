// Profile.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

/* -------- Password strength rule (shown in modal) -------- */
const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[#?!@$%^&*-]).{8,}$/;

const AVATAR = (name = "User") =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=0D8ABC&color=fff`;

const normalizeUser = (raw = {}) => {
  const first = raw.firstName || raw.first_name;
  const last = raw.lastName || raw.last_name;

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
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState("");
  const [changing, setChanging] = useState(false);

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

    const url = "https://linked-posts.routemisr.com/users/profile-data";
    const headersList = [
      { Authorization: `Bearer ${token}` },
      { token },
      { Authorization: token },
    ];

    for (const headers of headersList) {
      try {
        const { data } = await axios.get(url, { headers });
        const raw = data?.data?.user || data?.user || data?.data || data || {};
        const merged = normalizeUser(raw);
        setUser(merged);
        setFetching(false);
        return;
      } catch {
        /* try next header variant */
      }
    }

    setFetching(false);
    setErr("Couldn’t fetch profile from server. Please try again.");
  };

  // Upload profile photo
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please login first.");
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);

    try {
      setUploading(true);
      await axios.put(
        "https://linked-posts.routemisr.com/users/upload-photo",
        formData,
        {
          headers: {
            token,
            "Content-Type": "multipart/form-data",
          },
        }
      );
      await fetchProfile();
    } catch (error) {
      const msg =
        error?.response?.data?.message || "Upload failed. Please try again.";
      alert(msg);
    } finally {
      setUploading(false);
      e.target.value = ""; // reset file input
    }
  };

  // Live checklist for password strength
  const pwChecks = useMemo(
    () => ({
      upper: /[A-Z]/.test(newPass),
      lower: /[a-z]/.test(newPass),
      digit: /[0-9]/.test(newPass),
      special: /[#?!@$%^&*-]/.test(newPass),
      length: newPass.length >= 8,
    }),
    [newPass]
  );

  const allStrong =
    pwChecks.upper &&
    pwChecks.lower &&
    pwChecks.digit &&
    pwChecks.special &&
    pwChecks.length;

  const isSameAsOld = newPass && oldPass && newPass === oldPass;

  // Change password (modal submit)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      setMsg("Not logged in. Please sign in.");
      return;
    }

    if (!PASSWORD_REGEX.test(newPass)) {
      setMsg(
        "❌ Password must be 8+ chars and include uppercase, lowercase, number, and special character."
      );
      return;
    }

    if (isSameAsOld) {
      setMsg("❌ New password cannot be the same as the current password.");
      return;
    }

    if (newPass !== confirmPass) {
      setMsg("❌ New password and confirmation do not match.");
      return;
    }

    try {
      setChanging(true);
      setMsg("");
      await axios.patch(
        "https://linked-posts.routemisr.com/users/change-password",
        { password: oldPass, newPassword: newPass },
        { headers: { token, "Content-Type": "application/json" } }
      );

      // Success: clear session and navigate to login
      localStorage.removeItem("token");
      setMsg("✅ Password changed. Redirecting to login…");
      setTimeout(() => navigate("/login"), 1200);
    } catch (error) {
      setMsg(
        error?.response?.data?.message ||
          "❌ Failed to change password. Please try again."
      );
    } finally {
      setChanging(false);
    }
  };

  useEffect(() => {
    fetchProfile();
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

        {/* Avatar + upload */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <img
            src={user.avatar || AVATAR(user.name)}
            alt="avatar"
            className="w-28 h-28 rounded-full ring-4 ring-white shadow-md object-cover"
            onError={(e) => (e.currentTarget.src = AVATAR(user.name))}
          />
          <label className="bg-white text-teal-600 px-4 py-2 rounded-lg cursor-pointer hover:bg-teal-600 hover:text-white transition">
            {uploading ? "Uploading…" : "Change Photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
              disabled={uploading}
            />
          </label>
          <div className="text-white/90 text-sm">
            {fetching ? "Refreshing from server…" : err ? err : ""}
          </div>
        </div>

        {/* Info fields (full) */}
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
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={fetchProfile}
            className="flex-1 bg-white text-teal-600 font-semibold py-2.5 rounded-lg shadow hover:bg-teal-700 hover:text-white transition"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 bg-yellow-500 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-yellow-600 transition"
          >
            Change Password
          </button>
          <button
            onClick={() => window.history.back()}
            className="flex-1 bg-teal-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-teal-700 transition"
          >
            Back
          </button>
        </div>
      </div>

      {/* Password Change Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[92%] sm:w-[440px]">
            <h2 className="text-xl font-bold text-teal-600 mb-4 text-center">
              Change Password
            </h2>

            {/* Show the actual regex as requested */}
            <div className="text-xs bg-gray-100 rounded p-2 mb-3 overflow-x-auto">
              <span className="font-semibold">PASSWORD_REGEX:</span>{" "}
              <p>
                "Password must be ≥8 chars and include uppercase, lowercase, number, and special (#?!@$%^&*-)."
              </p>
            </div>

            {/* Live checklist of rules */}
            <ul className="text-sm mb-4 space-y-1">
              <li className={pwChecks.length ? "text-green-600" : "text-red-600"}>
                • At least 8 characters
              </li>
              <li className={pwChecks.upper ? "text-green-600" : "text-red-600"}>
                • Contains an uppercase letter (A–Z)
              </li>
              <li className={pwChecks.lower ? "text-green-600" : "text-red-600"}>
                • Contains a lowercase letter (a–z)
              </li>
              <li className={pwChecks.digit ? "text-green-600" : "text-red-600"}>
                • Contains a digit (0–9)
              </li>
              <li className={pwChecks.special ? "text-green-600" : "text-red-600"}>
                • Contains a special character #?!@$%^&*-
              </li>
            </ul>

            <form onSubmit={handleChangePassword}>
              <div className="mb-3">
                <label className="block font-semibold mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  required
                  className="w-full p-3 rounded-lg border"
                />
              </div>

              <div className="mb-3">
                <label className="block font-semibold mb-1">New Password</label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                  className={`w-full p-3 rounded-lg border ${
                    newPass && (!allStrong || isSameAsOld) ? "border-red-500" : ""
                  }`}
                />
                {isSameAsOld && (
                  <p className="text-red-600 text-sm mt-1">
                    New password cannot be the same as the current password.
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block font-semibold mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  required
                  className={`w-full p-3 rounded-lg border ${
                    confirmPass && confirmPass !== newPass
                      ? "border-red-500"
                      : ""
                  }`}
                />
                {confirmPass && confirmPass !== newPass && (
                  <p className="text-red-600 text-sm mt-1">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {msg && (
                <p
                  className={`text-center mb-3 ${
                    msg.startsWith("✅") ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {msg}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={
                    changing ||
                    !allStrong ||
                    newPass !== confirmPass ||
                    isSameAsOld
                  }
                  className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 transition disabled:opacity-60"
                >
                  {changing ? "Changing…" : "Submit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setMsg("");
                    setOldPass("");
                    setNewPass("");
                    setConfirmPass("");
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
