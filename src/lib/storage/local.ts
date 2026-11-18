import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

export interface StoredMediaItem {
  name: string;
  path: string;
  url: string;
  size: number | null;
  created_at: string | null;
}

export async function saveLocalFile(
  subPath: string,
  buffer: Buffer | ArrayBuffer,
  fileName: string
): Promise<StoredMediaItem> {
  const targetDir = path.join(UPLOADS_DIR, subPath);
  await fs.promises.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, fileName);
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  await fs.promises.writeFile(filePath, data);

  const stats = await fs.promises.stat(filePath);
  const relativePath = path.join(subPath, fileName).replace(/\\/g, '/');

  return {
    name: fileName,
    path: relativePath,
    url: `/uploads/${relativePath}`,
    size: stats.size,
    created_at: stats.birthtime.toISOString(),
  };
}

export async function listLocalFiles(subPath: string, limit: number = 100): Promise<StoredMediaItem[]> {
  const targetDir = path.join(UPLOADS_DIR, subPath);
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  try {
    const files = await fs.promises.readdir(targetDir);
    const items: StoredMediaItem[] = [];

    for (const fileName of files) {
      if (fileName.startsWith('.') || fileName === '.emptyFolderPlaceholder') {
        continue;
      }

      const filePath = path.join(targetDir, fileName);
      const stats = await fs.promises.stat(filePath);

      if (stats.isFile()) {
        const relativePath = path.join(subPath, fileName).replace(/\\/g, '/');
        items.push({
          name: fileName,
          path: relativePath,
          url: `/uploads/${relativePath}`,
          size: stats.size,
          created_at: stats.birthtime.toISOString(),
        });
      }

      if (items.length >= limit) {
        break;
      }
    }

    return items.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  } catch (err) {
    console.error(`[storage/local] Error reading ${subPath}:`, err);
    return [];
  }
}
