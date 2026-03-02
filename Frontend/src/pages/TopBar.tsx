
import React, { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export function TopBar() {
  const { user, role } = useAuth();
  const nav = useNavigate();
  const [photoURL, setPhotoURL] = useState("");
  const [accessErr, setAccessErr] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadPhoto = async () => {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setPhotoURL(userDoc.data().photoURL || "");
      }
    };
    loadPhoto();
  }, [user]);

  function handleResponder() {
    if (role === "responder") {
      setAccessErr(false);
      nav("/responder");
    } else {
      setAccessErr(true);
      setTimeout(() => setAccessErr(false), 3500);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand">SafeWatcher</div>
          
          {/* User Profile Icon */}
          <div
            onClick={() => nav("/profile")}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: photoURL ? `url(${photoURL})` : "#111",
              backgroundSize: "cover",
              backgroundPosition: "center",
              cursor: "pointer",
              border: "2px solid #e6e6e6",
            }}
            title="Profile Settings"
          />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button className="topbar-btn" onClick={() => nav("/public")}>
            Public
          </button>
          <button className="topbar-btn" onClick={handleResponder}>
            Responder
          </button>
          <button className="topbar-btn" onClick={() => signOut(auth)}>
            Logout
          </button>
        </div>
      </div>

      {accessErr && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#b00020",
          color: "white",
          padding: "12px 24px",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          zIndex: 1000,
        }}>
          You do not have access to the responder feature.
        </div>
      )}
    </>
  );
}