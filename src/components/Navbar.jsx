// Navbar.jsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import styles from "./Navbar.module.css";
import axios from "axios";

/* ---------- helpers ---------- */
const AVATAR = (name = "User") =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;

const readToken = () => localStorage.getItem("token") || null;
const readSavedUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

/* ---------- component ---------- */
export default function Navbar({ theme, toggleTheme }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(!!readToken());

  // seed from localStorage (fast)
  const seed = readSavedUser() || {};
  const [user, setUser] = useState({
    name: seed.name || "User",
    email: seed.email || "",
    avatar: null,
  });

  // start with initials avatar so something appears immediately
  const [avatar, setAvatar] = useState(AVATAR(seed.name || "User"));

  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // fetch from server with the SAME fallback headers as Profile.jsx
  const hydrateFromServer = async () => {
    const token = readToken();
    setIsAuthed(!!token);
    if (!token) {
      setUser({ name: "User", email: "", avatar: null });
      setAvatar(AVATAR("User"));
      return;
    }

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

        const first = raw.firstName || raw.first_name;
        const last = raw.lastName || raw.last_name;

        const name =
          raw.name ||
          raw.fullName ||
          raw.full_name ||
          raw.username ||
          (first || last ? [first, last].filter(Boolean).join(" ") : null) ||
          user.name ||
          "User";

        const email = raw.email || raw.userEmail || raw.mail || user.email || "";
        const apiAvatar = raw.avatar || raw.image || raw.photo || null;

        setUser({ name, email, avatar: apiAvatar });

        // if server gives avatar, use it; otherwise keep initials
        if (apiAvatar && String(apiAvatar).trim()) {
          setAvatar(String(apiAvatar));
        } else {
          setAvatar(AVATAR(name));
        }
        return; // success, stop trying other headers
      } catch {
        // try next header variant
      }
    }

    // all attempts failed -> keep initials fallback
    setAvatar(AVATAR(user.name || "User"));
  };

  // run on mount and on route changes
  useEffect(() => {
    setIsOpen(false);
    setUserOpen(false);
    hydrateFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // listen for login/logout or user changes from other tabs / after Login.jsx writes
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "token") {
        setIsAuthed(!!readToken());
        hydrateFromServer();
      }
      if (e.key === "user") {
        const u = readSavedUser() || {};
        setUser((prev) => ({
          ...prev,
          name: u.name || prev.name || "User",
          email: u.email || prev.email || "",
        }));
        // refetch to align avatar
        hydrateFromServer();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsAuthed(false);
    setUser({ name: "User", email: "", avatar: null });
    setAvatar(AVATAR("User"));
    setUserOpen(false);
    navigate("/login");
  };

  const displayName =
    (user.name && user.name.trim()) ||
    (user.email || "").split("@")[0] ||
    "User";

  return (
    <nav className={`${styles.navbar} ${theme === 'light' ? styles.navbarLight : styles.navbarDark}`}>
      <div className={styles.navContainer}>
        <Link className={styles.brand} to="/">Kudo</Link>

        <button
          className={styles.menuButton}
          onClick={() => setIsOpen(v => !v)}
          aria-label="Toggle navigation"
          aria-expanded={isOpen}
          aria-controls="primary-nav"
        >
          {isOpen ? "✕" : "☰"}
        </button>

        <div id="primary-nav" className={`${styles.navLinks} ${isOpen ? styles.open : ""}`}>
          {isAuthed && (
            <>
              <Link className={styles.navLink} to="/home">Home</Link>
              <Link className={styles.navLink} to="/posts">My Posts</Link>
            </>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`${styles.themeToggle} ${theme === 'light' ? styles.themeToggleLight : styles.themeToggleDark}`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <div className={styles.profileWrap}>
            {isAuthed ? (
              <>
                <button
                  ref={btnRef}
                  onClick={() => setUserOpen(v => !v)}
                  className={`${styles.userBtn} ${theme === 'light' ? styles.userBtnLight : styles.userBtnDark}`}
                  aria-haspopup="menu"
                  aria-expanded={userOpen}
                  title={displayName}
                >
                  <img
                    src={avatar}
                    alt={`${displayName} avatar`}
                    className={styles.profileImg}
                    onError={(e) => { e.currentTarget.src = AVATAR(displayName); }}
                  />
                  <span className={styles.caret}>▾</span>
                </button>

                <div
                  ref={menuRef}
                  role="menu"
                  className={`${styles.menu} ${userOpen ? styles.open : ""} ${theme === 'light' ? styles.menuLight : styles.menuDark}`}
                >
                  <div className={`${styles.menuHeader} ${theme === 'light' ? styles.menuHeaderLight : styles.menuHeaderDark}`}>
                    <div className={styles.menuName}>{displayName}</div>
                    {user.email ? <span className={styles.menuEmail}>{user.email}</span> : null}
                  </div>

                  <Link to="/profile" role="menuitem" className={`${styles.menuItem} ${theme === 'light' ? styles.menuItemLight : styles.menuItemDark}`}>
                    Profile
                  </Link>

                  <div className={`${styles.menuDivider} ${theme === 'light' ? styles.menuDividerLight : styles.menuDividerDark}`} />

                  <button role="menuitem" className={`${styles.menuItem} ${theme === 'light' ? styles.menuItemLight : styles.menuItemDark}`} onClick={handleLogout}>
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 20 }}>
                <Link to="/login" className={styles.navLink}>Login</Link>
                <Link to="/register" className={styles.navLink}>Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
