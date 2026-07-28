// Creates a readable 6-character room code like XK9P2M.
export function generateRoomCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Small helper to create friendly guest names.
export function generateGuestName(): string {
  const animals = ["Tiger", "Falcon", "Panda", "Wolf", "Koala", "Otter"];
  const number = Math.floor(10 + Math.random() * 90);
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `Guest_${animal}${number}`;
}

// Gets initials used for tiny avatar circles.
export function getInitials(name: string): string {
  if (!name.trim()) return "G";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
