
import React, { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { Link } from "react-router-dom";
import { ReAuthModal } from "../auth/ReAuthModal";

export function TopBar() {
  const { user, role } = useAuth();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="topbar">
        <div className="row" style={{ gap: 10 }}>
          <div className="brand">SafeWatch</div>
          <span className="badge">{role ?? "guest"}</span>
        </div>

        <div className="row">
          <Link className="badge" to="/public">Public</Link>
          {user && (
            <button
              className="button secondary"
              onClick={() => setShowModal(true)}
            >
              Responder
            </button>
          )}
          {!user ? (
            <Link className="button secondary" to="/login">Login</Link>
          ) : (
            <button className="button secondary" onClick={() => signOut(auth)}>Logout</button>
          )}
        </div>
      </div>

      {showModal && <ReAuthModal onClose={() => setShowModal(false)} />}
    </>
  );
}