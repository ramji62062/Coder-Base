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
  "linear-gradient(135deg, #ffffff, #888888)",
  "linear-gradient(135deg, #cccccc, #444444)",
  "linear-gradient(135deg, #888888, #111111)",
  "linear-gradient(135deg, #ffffff, #333333)",
  "linear-gradient(135deg, #e0e0e0, #666666)",
  "linear-gradient(135deg, #aaaaaa, #222222)"
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
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-ct-section p-5">
        <RefreshCw size={24} className="animate-spin text-white" />
        <span className="text-xs text-gray-400">Loading profile...</span>
      </div>
    );
  }

  const isPreset = PRESETS.includes(avatar);

  return (
    <div className="p-[16px_20px] flex flex-col gap-4 bg-ct-panel h-full overflow-y-auto font-inter text-gray-200">
      <div className="text-[11px] font-bold text-white uppercase tracking-[0.12em] flex items-center gap-[6px]">
        <User size={13} /> Edit Profile
      </div>

      <div className="animate-slide-up flex flex-col items-center gap-2.5 p-[14px_10px] bg-ct-header rounded-xl border border-ct-border">
        <div className="relative">
          {isPreset ? (
            <div className="w-[68px] h-[68px] rounded-full flex items-center justify-center text-2xl font-black text-black" style={{ background: avatar }}>
              {(name || profile?.email || "U").charAt(0).toUpperCase()}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="Avatar" className="w-[68px] h-[68px] rounded-full object-cover" />
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            title="Upload profile picture"
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white border-2 border-ct-header text-black flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
          >
            <Camera size={12} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </div>
        
        {/* Preset list */}
        <div className="flex gap-1.5 mt-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setAvatar(p)}
              className={`w-5 h-5 rounded-full cursor-pointer outline-none relative ${
                avatar === p ? "border-2 border-white" : "border border-gray-600"
              }`}
              style={{ background: p }}
            >
              {avatar === p && <Check size={10} className="absolute top-0.5 left-0.5 text-black" />}
            </button>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div className="animate-slide-up flex flex-col gap-3">
        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Display Name</label>
          <input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="e.g. Ramji Kumar" 
            className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_12px] outline-none focus:border-white transition-colors box-border" 
          />
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Email (Read Only)</label>
          <div className="w-full bg-[#111119] border border-ct-border rounded-lg text-gray-500 text-xs p-[8px_12px] box-border">
            {profile?.email}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Bio</label>
          <textarea 
            value={bio} 
            onChange={(e) => setBio(e.target.value)} 
            placeholder="Tell us about yourself..." 
            rows={3}
            className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_12px] outline-none focus:border-white transition-colors box-border resize-none" 
          />
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1.5">Account Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["public", "private"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setProfileVisibility(type)}
                className={`p-[9px] rounded-lg text-xs font-extrabold capitalize cursor-pointer transition-colors ${
                  profileVisibility === type ? "bg-white/20 border border-white text-white" : "bg-[#111119] border border-ct-border text-gray-400 hover:border-gray-500"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Skills (comma separated)</label>
          <div className="relative">
            <input 
              value={skillsText} 
              onChange={(e) => setSkillsText(e.target.value)} 
              placeholder="e.g. Next.js, Python, Figma" 
              className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_30px_8px_12px] outline-none focus:border-white transition-colors box-border" 
            />
            <Tag size={13} className="absolute right-3 top-2.5 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="animate-slide-up flex flex-col gap-2.5 mt-1">
        <span className="text-[10px] text-gray-400 font-bold uppercase block">Social Links</span>
        
        <div className="relative">
          <input 
            value={github} 
            onChange={(e) => setGithub(e.target.value)} 
            placeholder="GitHub profile link..." 
            className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_12px_8px_32px] outline-none focus:border-white transition-colors box-border" 
          />
          <Github size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
        </div>

        <div className="relative">
          <input 
            value={youtube} 
            onChange={(e) => setYoutube(e.target.value)} 
            placeholder="YouTube channel link..." 
            className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_12px_8px_32px] outline-none focus:border-white transition-colors box-border" 
          />
          <Youtube size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
        </div>

        <div className="relative">
          <input 
            value={instagram} 
            onChange={(e) => setInstagram(e.target.value)} 
            placeholder="Instagram profile link..." 
            className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_12px_8px_32px] outline-none focus:border-white transition-colors box-border" 
          />
          <Instagram size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
        </div>

        <div className="relative">
          <input 
            value={otherLink} 
            onChange={(e) => setOtherLink(e.target.value)} 
            placeholder="Other website or portfolio..." 
            className="w-full bg-[#111119] border border-ct-border rounded-lg text-white text-xs p-[8px_12px_8px_32px] outline-none focus:border-white transition-colors box-border" 
          />
          <Globe size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
        </div>
      </div>

      {/* Message feedback */}
      {message && (
        <div className={`animate-fade-in p-[8px_12px] rounded-lg text-xs text-center border ${
          message.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {message.text}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full p-2.5 bg-gradient-to-br from-white to-gray-300 border-none rounded-lg text-black font-extrabold text-xs cursor-pointer flex items-center justify-center gap-1.5 mt-1 hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        <Save size={14} /> {saving ? "Saving..." : "Save Profile"}
      </button>
    </div>
  );
}
