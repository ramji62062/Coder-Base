import JSZip from "jszip";
import { FileItem } from "@/components/FileExplorer";

export async function downloadProjectZip(projectName: string, files: FileItem[]): Promise<void> {
  const zip = new JSZip();
  const folderName = (projectName || "codetogether-project").trim().replace(/[<>:"/\\|?*]/g, "-") || "codetogether-project";
  const root = zip.folder(folderName) || zip;

  for (const file of files) {
    const rawPath = (file.path || file.name || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!rawPath) continue;

    if (file.isFolder) {
      root.folder(rawPath);
    } else {
      root.file(rawPath, file.content || "");
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folderName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
