// Login.jsx
import { useForm } from "react-hook-form";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Login() {
  const {
    register,
    handleSubmit,
    reset,
    setError, // ← to inject server errors under a field
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { email: "", password: "" },
  });

  const navigate = useNavigate();

  const onSubmit = async (data) => {
    try {
      const res = await axios.post(
        "https://linked-posts.routemisr.com/users/signin",
        {
          email: data.email.trim(),
          password: data.password,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const token =
        res.data?.token || res.data?.data?.token || res.data?.user?.token;

      if (!token) throw new Error("Login succeeded but token not found.");

      // 1) Save token
      localStorage.setItem("token", token);

      // 2) Build and save a user object for the Navbar to read
      const normalizeUser = (src = {}) => {
        const first = src.firstName || src.first_name;
        const last = src.lastName || src.last_name;
        const name =
          src.name ||
          src.fullName ||
          src.full_name ||
          src.username ||
          (first || last ? [first, last].filter(Boolean).join(" ") : null) ||
          data.email.split("@")[0];
        const email = src.email || src.userEmail || src.mail || data.email.trim();
        return { name, email };
      };

      // Try to get user from the login response first
      let rawUser =
        res.data?.user || res.data?.data?.user || res.data?.data || null;

      // If not present, try common "me" endpoints using the token
      if (!rawUser) {
        const tryHeaders = [
          { Authorization: `Bearer ${token}` }, // most common
          { token },                             // sometimes used
          { Authorization: token },              // rarely
        ];
        const endpoints = [
          "https://linked-posts.routemisr.com/users/getMe",
          "https://linked-posts.routemisr.com/users/me",
          "https://linked-posts.routemisr.com/users/profile",
        ];

        for (const h of tryHeaders) {
          for (const url of endpoints) {
            try {
              const { data: me } = await axios.get(url, { headers: h });
              rawUser = me?.data?.user || me?.user || me?.data || me || null;
              if (rawUser) throw new Error("__DONE__");
            } catch (e) {
              if (e?.message === "__DONE__") break;
              // else continue trying
            }
          }
          if (rawUser) break;
        }
      }

      const userObj = normalizeUser(rawUser || {});
      localStorage.setItem("user", JSON.stringify(userObj));

      // ✅ Toast on success
      toast.success(`Welcome back, ${userObj.name || "User"}! 🎉`, {
        position: "top-right",
        autoClose: 2000,
      });

      reset(); // clear form

      // Small delay so the toast is visible before route change.
      // (If you mount <ToastContainer /> at App level, you can navigate immediately.)
      setTimeout(() => navigate("/home"), 900);
    } catch (err) {
      console.error("❌ Login failed:", err.response?.data || err.message);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Login failed. Please try again.";

      // Show under password field
      setError("password", { type: "server", message: msg });

      // Optional: toast for visibility as well
      toast.error(msg, { position: "top-right", autoClose: 3000 });
    }
  };

  return (
    <div className="dark:bg-teal-500 light:bg-teal-400 min-h-[85vh] flex flex-col items-center justify-center py-8">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="text-center w-[90%] md:w-1/2 dark:bg-teal-400 light:bg-white mx-auto p-12 rounded-lg shadow-lg border light:border-gray-200"
        noValidate
      >
        <h1 className="text-4xl font-bold dark:text-white light:text-gray-800 uppercase mb-8">
          LOGIN
        </h1>

        {/* Email */}
        <div className="mb-4">
          <p className="text-left dark:text-white light:text-gray-700">Email</p>
          <input
            type="email"
            className="p-2 rounded w-full outline-none focus:ring-2 focus:ring-teal-600 border light:border-gray-300"
            {...register("email", {
              required: "Email is required",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Invalid email format",
              },
            })}
          />
          {errors.email && (
            <p className="text-red-200 text-left text-sm mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="mb-4">
          <p className="text-left dark:text-white light:text-gray-700">Password</p>
          <input
            type="password"
            className="p-2 rounded w-full outline-none focus:ring-2 focus:ring-teal-600 border light:border-gray-300"
            {...register("password", {
              required: "Password is required",
              minLength: { value: 6, message: "Min length is 6 characters" },
            })}
          />
          {errors.password && (
            <p className="text-red-200 text-left text-sm mt-1">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="dark:bg-white dark:text-teal-500 light:bg-teal-600 light:text-white font-bold py-2 px-20 rounded 
                     transition-all duration-300 
                     hover:bg-teal-600 hover:text-white hover:scale-105 
                     active:scale-95 disabled:opacity-60"
        >
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>

      {/* Toast host (move to App.jsx if you want to keep it visible across routes) */}
      <ToastContainer />
    </div>
  );
}
