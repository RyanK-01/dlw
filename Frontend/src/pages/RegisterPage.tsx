import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { TopBar } from "./TopBar";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

export function RegisterPage() {
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      // Step 1: Create account in Firebase Auth
      const credential = await createUserWithEmailAndPassword(auth, email, pw);
      const uid = credential.user.uid;

      // Step 2: Write user document (with role) to Firestore via backend
      const res = await fetch(`${BACKEND_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, username, phone }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail ?? "Failed to save user profile.");
      }

      // Step 3: Navigate — AuthContext will pick up the role from Firestore
      nav("/public", { replace: true });
    } catch (ex: any) {
      setErr(ex?.message ?? "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="card" style={{ maxWidth: 440, margin: "30px auto" }}>
          <h2 style={{ marginTop: 0 }}>Register</h2>
          <hr />
          <form onSubmit={onSubmit} className="col">
            <label>
              Username
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label>
              Phone (e.g. +60112345678)
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            <label>
              Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </label>
            <button className="button" disabled={loading}>
              {loading ? "Registering…" : "Register"}
            </button>
            {err && <div style={{ color: "#b00020" }}>{err}</div>}
          </form>
          <div style={{ marginTop: 12, textAlign: "center" }}>
            Already have an account? <a href="/login">Login here</a>
          </div>
        </div>
      </div>
    </>
  );
}
