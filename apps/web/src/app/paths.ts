export function scopedPath(path: string, base = import.meta.env.BASE_URL): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
