"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { User, Mail, Globe, Tag, Check, Camera, RefreshCw, Save } from "lucide-react";

// Custom SVG icons to replace missing lucide-react brand icons
function Github({ size = 16, ...props }: { size?: number; [key: string]: any }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function Youtube({ size = 16, ...props }: { size?: number; [key: string]: any }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <polygon points="10 15 15 12 10 9" />
    </svg>
  );
}

function Instagram({ size = 16, ...props }: { size?: number; [key: string]: any }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}


type ProfileData = {
  name: string;
  email: string;
  avatarUrl: string;
  bio: string;
  skills: string[];
  links: {
    youtube: string;
    github: string;
    instagram: string;
    other: string;
    profileVisibility?: string;
  };
};

const PRESETS = [
  "linear-gradient(135deg, #7C3AED, #5b21b6)",
  "linear-gradient(135deg, #ec4899, #be185d)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #10b981, #047857)",
  "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  "linear-gradient(135deg, #8b5cf6, #ec4899)"
];

export default function AccountProfilePanel() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [youtube, setYoutube] = useState("");
  const [github, setGithub] = useState("");
  const [instagram, setInstagram] = useState("");
  const [otherLink, setOtherLink] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<"public" | "private">("public");
  const [avatar, setAvatar] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        
        const res = await fetch(`/api/profile?userId=${session.user.id}`, {
          headers: { "Authorization": `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error("Failed to load profile");
        
        const data: ProfileData = await res.json();
        setProfile(data);
        setName(data.name);
        setBio(data.bio);
        setSkillsText(data.skills.join(", "));
        setAvatar(data.avatarUrl || PRESETS[0]);
        setYoutube(data.links?.youtube || "");
        setGithub(data.links?.github || "");
        setInstagram(data.links?.instagram || "");
        setOtherLink(data.links?.other || "");
        setProfileVisibility(data.links?.profileVisibility === "private" ? "private" : "public");
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const skills = skillsText
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name,
          avatarUrl: avatar,
          bio,
          skills,
          links: {
            youtube,
            github,
            instagram,
            other: otherLink,
            profileVisibility
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to update profile");
      }

      setMessage({ text: "Profile updated successfully!", type: "success" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || "Could not save profile", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Handle custom image uploads
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 200 * 1024) {
      alert("Image is too large. Please select an image under 200KB to ensure fast loading.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAvatar(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, background: "#1a1a2e", padding: 20 }}>
        <RefreshCw size={24} className="animate-spin" color="#7C3AED" />
        <span style={{ fontSize: 12, color: "#666" }}>Loading profile...</span>
        <style>{`.animate-spin { animation: spin 1s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  const isPreset = PRESETS.includes(avatar);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16, background: "#1e1e2f", height: "100%", overflowY: "auto", fontFamily: "Inter, sans-serif", color: "#e0e0e0" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 6 }}>
        <User size={13} /> Edit Profile
      </div>

      <div className="animate-slide-up delay-100" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "14px 10px", background: "#11111f", borderRadius: 14, border: "1px solid #2a2a3f" }}>
        <div style={{ position: "relative" }}>
          {isPreset ? (
            <div style={{ width: 68, height: 68, borderRadius: "50%", background: avatar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: "#fff" }}>
              {(name || profile?.email || "U").charAt(0).toUpperCase()}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="Avatar" style={{ width: 68, height: 68, borderRadius: "50%", objectFit: "cover" }} />
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            title="Upload profile picture"
            style={{ position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%", background: "#7C3AED", border: "2px solid #11111f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <Camera size={12} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
        </div>
        
        {/* Preset list */}
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          {PRESETS.map((p, idx) => (
            <button
              key={p}
              onClick={() => setAvatar(p)}
              style={{
                width: 20, height: 20, borderRadius: "50%", background: p, border: avatar === p ? "2px solid #fff" : "1.5px solid #333", cursor: "pointer", outline: "none", position: "relative"
              }}
            >
              {avatar === p && <Check size={10} style={{ position: "absolute", top: 3, left: 3, color: "#fff" }} />}
            </button>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div className="animate-slide-up delay-200" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Display Name</label>
          <input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="e.g. Ramji Kumar" 
            style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box" }} 
          />
        </div>

        <div>
          <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Email (Read Only)</label>
          <div style={{ width: "100%", background: "#11111f", border: "1px solid #1a1a2e", borderRadius: 8, color: "#555", fontSize: 13, padding: "8px 12px", boxSizing: "border-box" }}>
            {profile?.email}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Bio</label>
          <textarea 
            value={bio} 
            onChange={(e) => setBio(e.target.value)} 
            placeholder="Tell us about yourself..." 
            rows={3}
            style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box", resize: "none" }} 
          />
        </div>

        <div>
          <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Account Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["public", "private"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setProfileVisibility(type)}
                style={{ padding: "9px", background: profileVisibility === type ? "#7C3AED22" : "#11111f", border: profileVisibility === type ? "1px solid #7C3AED" : "1px solid #2a2a3f", borderRadius: 8, color: profileVisibility === type ? "#c4b5fd" : "#888", cursor: "pointer", fontSize: 12, fontWeight: 800, textTransform: "capitalize" }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Skills (comma separated)</label>
          <div style={{ position: "relative" }}>
            <input 
              value={skillsText} 
              onChange={(e) => setSkillsText(e.target.value)} 
              placeholder="e.g. Next.js, Python, Figma" 
              style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 30px 8px 12px", outline: "none", boxSizing: "border-box" }} 
            />
            <Tag size={13} style={{ position: "absolute", right: 12, top: 11, color: "#555" }} />
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="animate-slide-up delay-300" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block" }}>Social Links</span>
        
        <div style={{ position: "relative" }}>
          <input 
            value={github} 
            onChange={(e) => setGithub(e.target.value)} 
            placeholder="GitHub profile link..." 
            style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px 8px 32px", outline: "none", boxSizing: "border-box" }} 
          />
          <Github size={13} style={{ position: "absolute", left: 10, top: 11, color: "#777" }} />
        </div>

        <div style={{ position: "relative" }}>
          <input 
            value={youtube} 
            onChange={(e) => setYoutube(e.target.value)} 
            placeholder="YouTube channel link..." 
            style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px 8px 32px", outline: "none", boxSizing: "border-box" }} 
          />
          <Youtube size={13} style={{ position: "absolute", left: 10, top: 11, color: "#777" }} />
        </div>

        <div style={{ position: "relative" }}>
          <input 
            value={instagram} 
            onChange={(e) => setInstagram(e.target.value)} 
            placeholder="Instagram profile link..." 
            style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px 8px 32px", outline: "none", boxSizing: "border-box" }} 
          />
          <Instagram size={13} style={{ position: "absolute", left: 10, top: 11, color: "#777" }} />
        </div>

        <div style={{ position: "relative" }}>
          <input 
            value={otherLink} 
            onChange={(e) => setOtherLink(e.target.value)} 
            placeholder="Other website or portfolio..." 
            style={{ width: "100%", background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px 8px 32px", outline: "none", boxSizing: "border-box" }} 
          />
          <Globe size={13} style={{ position: "absolute", left: 10, top: 11, color: "#777" }} />
        </div>
      </div>

      {/* Message feedback */}
      {message && (
        <div className="animate-fade-in" style={{
          padding: "8px 12px", borderRadius: 8, fontSize: 12, textAlign: "center",
          background: message.type === "success" ? "#10b98120" : "#ef444420",
          border: `1px solid ${message.type === "success" ? "#10b98144" : "#ef444444"}`,
          color: message.type === "success" ? "#34d399" : "#f87171"
        }}>
          {message.text}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: "100%", padding: "10px", background: saving ? "#333" : "linear-gradient(135deg, #7C3AED, #5b21b6)",
          border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, transition: "opacity 0.2s"
        }}
      >
        <Save size={14} /> {saving ? "Saving..." : "Save Profile"}
      </button>
    </div>
  );
}
