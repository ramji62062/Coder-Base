"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import { generateGuestName } from "@/lib/utils";

type RoomLookup = {
  id: string;
  name: string | null;
  room_code: string;
  is_active: boolean | null;
};

export default function JoinByCodePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = useMemo(() => (params?.code || "").toUpperCase(), [params]);

  const [room, setRoom] = useState<RoomLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function lookupRoom() {
      setLoading(true);
      const { data, error: roomError } = await supabase
        .from("rooms")
        .select("id, name, room_code, is_active")
        .eq("room_code", code)
        .maybeSingle();

      if (roomError || !data) {
        setError("Room not found. Check your code.");
        setLoading(false);
        return;
      }
      if (data.is_active === false) {
        setError("This session has ended. Ask the owner to create a new room.");
        setLoading(false);
        return;
      }

      setRoom(data);
      setLoading(false);
    }

    if (code) {
      lookupRoom();
    } else {
      setError("Invalid room code");
      setLoading(false);
    }
  }, [code]);

  async function joinRoom() {
    if (!room) return;
    setJoining(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Logged-in users join directly using their user id.
    if (session?.user?.id) {
      const { error: participantError } = await supabase.from("room_participants").insert({
        room_id: room.id,
        user_id: session.user.id,
      });

      if (participantError) {
        setError(participantError.message);
        setJoining(false);
        return;
      }

      router.push(`/room/${room.id}`);
      return;
    }

    // Guests must enter a display name before joining.
    const safeName = displayName.trim() || generateGuestName();
    localStorage.setItem("guest_name", safeName);

    const { error: guestJoinError } = await supabase.from("room_participants").insert({
      room_id: room.id,
      guest_name: safeName,
    });

    if (guestJoinError) {
      setError(guestJoinError.message);
      setJoining(false);
      return;
    }

    router.push(`/room/${room.id}`);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        {loading ? (
          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-6">
            <p className="text-gray-300">Checking room code...</p>
          </div>
        ) : room ? (
          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-6">
            <h1 className="text-2xl font-bold">Join Room</h1>
            <p className="mt-1 text-gray-400">
              Room: {room.name || "Untitled"} · Code: {room.room_code}
            </p>

            <GuestJoinSection displayName={displayName} setDisplayName={setDisplayName} />

            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

            <button
              onClick={joinRoom}
              disabled={joining}
              className="mt-5 rounded-lg bg-[#7C3AED] px-5 py-2 font-semibold transition hover:bg-[#6d28d9] disabled:opacity-70"
            >
              {joining ? "Joining..." : "Join Room"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function GuestJoinSection({
  displayName,
  setDisplayName,
}: {
  displayName: string;
  setDisplayName: (value: string) => void;
}) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    async function detectSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsLoggedIn(Boolean(session?.user));
    }
    detectSession();
  }, []);

  if (isLoggedIn === null) return null;
  if (isLoggedIn) {
    return <p className="mt-4 text-sm text-gray-300">You are logged in and will join with your account.</p>;
  }

  return (
    <div className="mt-4 rounded-xl border border-[#292929] bg-[#0f0f0f] p-4">
      <p className="text-sm text-[#c4b5fd]">You are joining as guest.</p>
      <input
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Display name (or we generate one)"
        className="mt-3 w-full rounded-lg border border-[#2a2a2a] bg-[#101010] px-3 py-2 outline-none focus:border-[#7C3AED]"
      />
    </div>
  );
}
