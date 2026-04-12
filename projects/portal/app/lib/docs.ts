const modules = import.meta.glob('../content/docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

interface DocMeta {
  title: string
  description: string
  order: number
  category: string
  slug: string
}

interface Doc {
  meta: DocMeta
  content: string
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, content: normalized }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return { meta, content: match[2] }
}

function slugFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '')
}

interface DocsCache {
  docs: Doc[]
  bySlug: Map<string, Doc>
}

let _cache: DocsCache | null = null

function getCache(): DocsCache {
  if (_cache) return _cache
  const docs = Object.entries(modules).map(([path, raw]) => {
    const { meta, content } = parseFrontmatter(raw)
    return {
      meta: {
        title: meta.title ?? '',
        description: meta.description ?? '',
        order: Number(meta.order) || 0,
        category: meta.category ?? '',
        slug: slugFromPath(path),
      },
      content,
    }
  }).sort((a, b) => a.meta.order - b.meta.order)
  _cache = { docs, bySlug: new Map(docs.map((d) => [d.meta.slug, d])) }
  return _cache
}

export function getDocs(): Doc[] {
  return getCache().docs
}

export function getDocBySlug(slug: string): Doc | undefined {
  return getCache().bySlug.get(slug)
}

export function getDocNav(): Pick<DocMeta, 'slug' | 'title' | 'category'>[] {
  return getDocs().map(({ meta: { slug, title, category } }) => ({ slug, title, category }))
}
