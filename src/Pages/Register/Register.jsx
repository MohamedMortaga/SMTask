// Register.jsx
import { useState } from "react";
import axios from "axios";

/* --- mini UI helpers to match your structure --- */
function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-left dark:text-white light:text-gray-700">
      {children}
    </label>
  );
}

function TextInput({
  id,
  name,
  type = "text",
  placeholder = "",
  required,
  value,
  onChange,
  autoComplete,
}) {
  return (
    <input
      id={id}
      name={name ?? id}
      type={type}
      placeholder={placeholder}
      required={required}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      className="p-2 rounded w-full outline-none focus:ring-2 focus:ring-teal-600 border light:border-gray-300"
    />
  );
}

/* --- same password policy shown in your Postman error --- */
const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[#?!@$%^&*-]).{8,}$/;

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    rePassword: "",
    dateOfBirth: "", // YYYY-MM-DD
    gender: "male",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  const change = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!PASSWORD_REGEX.test(form.password)) {
      return setErr(
        "Password must be ≥8 chars and include uppercase, lowercase, number, and special (#?!@$%^&*-)."
      );
    }
    if (form.password !== form.rePassword) {
      return setErr("Passwords do not match.");
    }
    if (!form.name.trim()) return setErr("Username (name) is required.");

    setLoading(true);
    try {
      const { data } = await axios.post(
        "https://linked-posts.routemisr.com/users/signup",
        {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          rePassword: form.rePassword,
          dateOfBirth: form.dateOfBirth || undefined, // e.g. "1994-10-07"
          gender: form.gender,
        },
        {
          timeout: 15000, // optional
          headers: { "Content-Type": "application/json" },
        }
      );

      // If API returns a message, you can surface it; otherwise use a generic success.
      setOk(data?.message || "Account created successfully. You can log in now.");
      setForm({
        name: "",
        email: "",
        password: "",
        rePassword: "",
        dateOfBirth: "",
        gender: "male",
      });
    } catch (error) {
      // Prefer API error payloads, fall back to generic message
      const apiMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Registration failed. Check inputs.";
      setErr(apiMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark:bg-teal-500 light:bg-teal-400 min-h-[85vh] flex flex-col items-center justify-center py-8">
      <form
        onSubmit={submit}
        className="text-center w-[90%] md:w-1/2 dark:bg-teal-400 light:bg-white mx-auto p-12 rounded-lg shadow-lg border light:border-gray-200"
        noValidate
      >
        <h1 className="text-4xl font-bold dark:text-white light:text-gray-800 uppercase mb-8">
          Register
        </h1>

        {err && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-left">
            {err}
          </div>
        )}
        {ok && (
          <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-left">
            {ok}
          </div>
        )}

        {/* *************** Email *************** */}
        <div className="mb-4">
          <div className="mb-2 block">
            <Label htmlFor="email">Email</Label>
          </div>
          <TextInput
            id="email"
            type="email"
            placeholder="name@example.com"
            required
            value={form.email}
            onChange={change}
            autoComplete="email"
          />
        </div>

        {/* *************** Username (name) *************** */}
        <div className="mb-4">
          <div className="mb-2 block">
            <Label htmlFor="name">Username</Label>
          </div>
          <TextInput
            id="name"
            placeholder="Your name"
            required
            value={form.name}
            onChange={change}
            autoComplete="username"
          />
        </div>

        {/* *************** Password *************** */}
        <div className="mb-4">
          <div className="mb-2 block">
            <Label htmlFor="password">Password</Label>
          </div>
          <TextInput
            id="password"
            type="password"
            placeholder="********"
            required
            value={form.password}
            onChange={change}
            autoComplete="new-password"
          />
          <p className="text-left dark:text-white/80 light:text-gray-600 text-sm mt-1">
            Must include A-Z, a-z, 0-9, and special (#?!@$%^&*-), 8+ chars.
          </p>
        </div>

        {/* *************** Confirm Password *************** */}
        <div className="mb-4">
          <div className="mb-2 block">
            <Label htmlFor="rePassword">Confirm password</Label>
          </div>
          <TextInput
            id="rePassword"
            type="password"
            placeholder="********"
            required
            value={form.rePassword}
            onChange={change}
            autoComplete="new-password"
          />
        </div>

        {/* *************** Date of Birth + Gender *************** */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="mb-2 block">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
            </div>
            <TextInput
              id="dateOfBirth"
              type="date"
              required
              value={form.dateOfBirth}
              onChange={change}
            />
          </div>

          <div className="mb-6">
            <p className="text-left dark:text-white light:text-gray-700 mb-2">Gender</p>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 dark:text-white light:text-gray-700">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={form.gender === "male"}
                  onChange={change}
                  className="accent-teal-600"
                />
                Male
              </label>

              <label className="flex items-center gap-2 dark:text-white light:text-gray-700">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={form.gender === "female"}
                  onChange={change}
                  className="accent-teal-600"
                />
                Female
              </label>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="dark:bg-white dark:text-teal-500 light:bg-teal-600 light:text-white font-bold py-2 px-20 rounded 
                     transition-all duration-300 
                     hover:bg-teal-600 hover:text-white hover:scale-105 
                     active:scale-95 disabled:opacity-60"
        >
          {loading ? "Registering..." : "Register"}
        </button>
      </form>
    </div>
  );
}
