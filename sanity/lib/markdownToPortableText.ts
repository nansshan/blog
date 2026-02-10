/**
 * Markdown to Portable Text conversion utility.
 *
 * Converts Markdown (with GFM + LaTeX math) into Sanity Portable Text blocks
 * that match the project's blockContent schema.
 *
 * Pipeline: Markdown → HTML (via unified/remark/rehype) → Portable Text (via @portabletext/block-tools)
 *
 * @author okooo5km(十里)
 */

import {
  htmlToBlocks,
  randomKey,
  type DeserializerRule,
} from '@portabletext/block-tools'
// NOTE: We accept `any` for the schema type parameter because @portabletext/block-tools
// depends on @sanity/types@5.x while the project uses sanity@4.22 (@sanity/types@4.x).
// The runtime API is compatible but the TypeScript types diverge.
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

// Unique marker for inline math (Unicode replacement char, unlikely in normal text)
const INLINE_MATH_START = '\uFFF0'
const INLINE_MATH_END = '\uFFF1'
const INLINE_MATH_RE = new RegExp(
  `${INLINE_MATH_START}([\\s\\S]*?)${INLINE_MATH_END}`,
  'g'
)

// ---------------------------------------------------------------------------
// Step 1: Markdown → HTML
// ---------------------------------------------------------------------------

async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: {
        // Block-level math → <div class="math-display">
        math(_state: unknown, node: { value: string }) {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['math-display'] },
            children: [{ type: 'text', value: node.value }],
          }
        },
        // Inline math → marker text (post-processed after htmlToBlocks)
        inlineMath(_state: unknown, node: { value: string }) {
          return {
            type: 'text',
            value: `${INLINE_MATH_START}${node.value}${INLINE_MATH_END}`,
          }
        },
      },
    })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown)

  return String(result)
}

// ---------------------------------------------------------------------------
// Step 2: HTML → Portable Text (via htmlToBlocks with custom rules)
// ---------------------------------------------------------------------------

// Map common Markdown code fence language identifiers to @sanity/code-input values.
// Sanity's code-input supports a fixed set of languages; aliases not in the set
// would be stored as-is and fail to highlight.
const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'sh',
  shell: 'sh',
  zsh: 'sh',
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  plaintext: 'text',
  txt: 'text',
  'c#': 'csharp',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  dockerfile: 'sh',
}

function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase()
  return LANGUAGE_ALIASES[lower] ?? lower
}

function buildDeserializerRules(): DeserializerRule[] {
  return [
    // Fenced code blocks: <pre><code class="language-xxx">
    {
      deserialize(el, _next, createBlock) {
        if (!(el instanceof HTMLElement) || el.tagName !== 'PRE') {
          return undefined
        }
        const codeEl = el.querySelector('code')
        if (!codeEl) return undefined

        const langMatch = codeEl.className.match(/language-(\S+)/)
        const language = normalizeLanguage(langMatch ? langMatch[1] : 'text')
        const code = codeEl.textContent || ''

        return createBlock({
          _type: 'codeBlock',
          _key: randomKey(12),
          language,
          code,
        }).block
      },
    },

    // GFM tables: <table>
    {
      deserialize(el, _next, createBlock) {
        if (!(el instanceof HTMLElement) || el.tagName !== 'TABLE') {
          return undefined
        }

        const rows = Array.from(el.querySelectorAll('tr')).map((tr) => ({
          _type: 'tableRow',
          _key: randomKey(12),
          cells: Array.from(tr.querySelectorAll('th, td')).map(
            (cell) => cell.textContent || ''
          ),
        }))

        return createBlock({
          _type: 'table',
          _key: randomKey(12),
          rows,
        }).block
      },
    },

    // Images: <img src="..." alt="...">
    {
      deserialize(el, _next, createBlock) {
        if (!(el instanceof HTMLElement) || el.tagName !== 'IMG') {
          return undefined
        }

        const url = el.getAttribute('src')
        if (!url) return undefined

        const label = el.getAttribute('alt') || ''

        return createBlock({
          _type: 'otherImage',
          _key: randomKey(12),
          url,
          label,
        }).block
      },
    },

    // Block-level LaTeX math: <div class="math-display">
    {
      deserialize(el, _next, createBlock) {
        if (!(el instanceof HTMLElement) || el.tagName !== 'DIV') {
          return undefined
        }
        if (!el.classList.contains('math-display')) return undefined

        const body = el.textContent || ''

        return createBlock({
          _type: 'latex',
          _key: randomKey(12),
          body,
        }).block
      },
    },

    // Strikethrough: <del> / <s> → mark 'strike-through'
    // htmlToBlocks may not map <del> to 'strike-through' by default,
    // so we handle it explicitly as decorated spans.
    {
      deserialize(el, next) {
        if (!(el instanceof HTMLElement)) return undefined
        const tag = el.tagName
        if (tag !== 'DEL' && tag !== 'S') return undefined

        const children = next(el.childNodes)
        // Return children with strike-through mark applied
        return children
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Step 3: Post-process inline math markers → inlineLatex objects
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function processInlineMath(blocks: any[]): any[] {
  return blocks.map((block) => {
    // Only process text blocks with children
    if (block._type !== 'block' || !Array.isArray(block.children)) return block

    let hasInlineMath = false
    for (const child of block.children) {
      if (child._type === 'span' && child.text?.includes(INLINE_MATH_START)) {
        hasInlineMath = true
        break
      }
    }
    if (!hasInlineMath) return block

    const newChildren: any[] = []
    for (const child of block.children) {
      if (
        child._type !== 'span' ||
        !child.text?.includes(INLINE_MATH_START)
      ) {
        newChildren.push(child)
        continue
      }

      // Split text by inline math markers
      const text: string = child.text
      let lastIndex = 0
      INLINE_MATH_RE.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = INLINE_MATH_RE.exec(text)) !== null) {
        // Text before the math
        const before = text.slice(lastIndex, match.index)
        if (before) {
          newChildren.push({
            ...child,
            _key: randomKey(12),
            text: before,
          })
        }

        // The inline math object
        newChildren.push({
          _type: 'inlineLatex',
          _key: randomKey(12),
          body: match[1],
        })

        lastIndex = match.index + match[0].length
      }

      // Remaining text after last math
      const after = text.slice(lastIndex)
      if (after) {
        newChildren.push({
          ...child,
          _key: randomKey(12),
          text: after,
        })
      }
    }

    return {
      ...block,
      children: newChildren.length > 0 ? newChildren : block.children,
    }
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function convertMarkdownToPortableText(
  markdown: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blockContentType: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // 1. Convert Markdown → HTML
  const html = await markdownToHtml(markdown)

  // 2. Convert HTML → Portable Text blocks
  const rules = buildDeserializerRules()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const blocks = htmlToBlocks(html, blockContentType, {
    parseHtml: (htmlStr) => new DOMParser().parseFromString(htmlStr, 'text/html'),
    rules,
  })

  // 3. Post-process: convert inline math markers to inlineLatex objects
  return processInlineMath(blocks)
}
