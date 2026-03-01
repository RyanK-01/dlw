import { useEffect, useState } from "react";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { auth } from "../firebase";

export type LatLng = { lat: number; lng: number };

/**
 * Tracks the authenticated user's live location via watchPosition.
 * Writes { lat, lng, updatedAt } to locations/{uid} in Firestore on every
 * GPS update, and deletes the document on unmount (user leaves the page).
 *
 * Returns the current position, or null if not yet acquired / permission denied.
 */
export function useLocationTracking(): LatLng | null {
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !navigator.geolocation) return;

    const locationRef = doc(db, "locations", uid);

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPosition({ lat, lng });

        // Write live location to Firestore
        await setDoc(locationRef, {
          uid,
          lat,
          lng,
          updatedAt: serverTimestamp(),
        });
      },
      (err) => {
        console.warn("Location error:", err.message);
        setPosition(null);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    // On unmount: stop watching and remove the location document
    return () => {
      navigator.geolocation.clearWatch(watchId);
      deleteDoc(locationRef).catch(() => {});
    };
  }, []);

  return position;
}
