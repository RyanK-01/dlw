import os
import json
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

# On Vercel: read credentials from FIREBASE_CREDENTIALS_JSON env var (full JSON string)
# Locally: fall back to serviceAccountKey.json file
_creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
if _creds_json:
    cred = credentials.Certificate(json.loads(_creds_json))
else:
    cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./serviceAccountKey.json")
    cred = credentials.Certificate(cred_path)

firebase_admin.initialize_app(cred)

db = firestore.client()


RESPONDER_DOMAIN = "@staff.safewatch.sg"


def create_user_document(uid: str, username: str, email: str) -> bool:
    """
    Writes a new user document to users/{uid}.
    Role is assigned by email domain: @staff.safewatch.sg → responder, else public.
    Returns False if the user already exists, True if created.
    """
    user_ref = db.collection("users").document(uid)

    if user_ref.get().exists:
        return False

    role = "responder" if email.lower().endswith(RESPONDER_DOMAIN) else "public"

    user_ref.set({
        "username": username,
        "email": email,
        "role": role,
        "createdAt": datetime.utcnow(),
    })

    return True


def get_user_role(uid: str) -> str | None:
    """
    Returns the stored role for a user, or None if the user document doesn't exist.
    Role is authoritative from the users/{uid} document written at signup.
    """
    user_doc = db.collection("users").document(uid).get()

    if not user_doc.exists:
        return None

    return user_doc.to_dict().get("role", "public")
