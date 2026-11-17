export function generateSlug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // a name with no a-z/0-9 at all (e.g. all Thai) used to give an empty slug
  return s || `r-${Date.now().toString(36)}`;
}
