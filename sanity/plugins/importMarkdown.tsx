/**
 * Sanity Document Action: Import Markdown
 *
 * Adds a "导入 Markdown" action to post documents. Opens a dialog where users
 * can paste Markdown content or upload a .md file, then converts and applies it
 * to the document body field.
 *
 * @author okooo5km(十里)
 */

import {
  Box,
  Button,
  Card,
  Flex,
  Inline,
  Stack,
  Text,
  TextArea,
  useToast,
} from '@sanity/ui'
import React, { useCallback, useRef, useState } from 'react'
import {
  type DocumentActionComponent,
  useDocumentOperation,
  useSchema,
} from 'sanity'

import { convertMarkdownToPortableText } from '~/sanity/lib/markdownToPortableText'

function UploadIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 17V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V17M7 9L12 4M12 4L17 9M12 4V16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const ImportMarkdownAction: DocumentActionComponent = (props) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { patch } = useDocumentOperation(props.id, props.type)
  const schema = useSchema()
  const blockContentType = schema.get('blockContent')
  // Get existing body from draft or published document
  const doc = props.draft || props.published
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingBody = (doc as any)?.body as any[] | undefined

  const toast = useToast()

  const [markdown, setMarkdown] = useState('')
  const [converting, setConverting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result
        if (typeof text === 'string') {
          setMarkdown(text)
        }
      }
      reader.readAsText(file)
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    []
  )

  const doConvert = useCallback(
    async (mode: 'replace' | 'append') => {
      if (!blockContentType) {
        toast.push({
          status: 'error',
          title: '无法获取 blockContent 类型定义',
        })
        return
      }

      if (!markdown.trim()) {
        toast.push({ status: 'warning', title: '请输入 Markdown 内容' })
        return
      }

      setConverting(true)
      try {
        const blocks = await convertMarkdownToPortableText(
          markdown,
          blockContentType
        )

        if (mode === 'replace') {
          patch.execute([{ set: { body: blocks } }])
        } else {
          // Append to existing body
          const existing = existingBody ?? []
          patch.execute([{ set: { body: [...existing, ...blocks] } }])
        }

        toast.push({
          status: 'success',
          title:
            mode === 'replace'
              ? 'Markdown 内容已替换'
              : 'Markdown 内容已追加',
        })

        setMarkdown('')
        setDialogOpen(false)
        props.onComplete()
      } catch (err) {
        console.error('Markdown conversion error:', err)
        toast.push({
          status: 'error',
          title: '转换失败',
          description:
            err instanceof Error ? err.message : '未知错误，请查看控制台',
        })
      } finally {
        setConverting(false)
      }
    },
    [markdown, blockContentType, patch, existingBody, toast, props]
  )

  const handleClose = useCallback(() => {
    setDialogOpen(false)
    setMarkdown('')
    props.onComplete()
  }, [props])

  return {
    label: '导入 Markdown',
    icon: UploadIcon,
    onHandle: () => setDialogOpen(true),
    dialog: dialogOpen
      ? {
          type: 'dialog' as const,
          header: '导入 Markdown',
          onClose: handleClose,
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text size={1} muted>
                  粘贴 Markdown 内容或上传 .md
                  文件，支持标题、列表、代码块、表格、图片、LaTeX 公式等格式。
                </Text>

                <Card border padding={1} radius={2}>
                  <TextArea
                    fontSize={1}
                    rows={16}
                    placeholder="在此粘贴 Markdown 内容..."
                    value={markdown}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setMarkdown(e.currentTarget.value)
                    }
                    style={{ fontFamily: 'monospace', resize: 'vertical' }}
                  />
                </Card>

                <Flex gap={3} align="center" justify="space-between">
                  <Box>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.markdown,.txt"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                    <Button
                      mode="ghost"
                      text="上传文件"
                      icon={UploadIcon}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={converting}
                    />
                  </Box>

                  <Inline space={3}>
                    <Button
                      mode="ghost"
                      text="替换内容"
                      disabled={!markdown.trim() || converting}
                      onClick={() => doConvert('replace')}
                    />
                    <Button
                      mode="ghost"
                      text="追加内容"
                      disabled={!markdown.trim() || converting}
                      onClick={() => doConvert('append')}
                    />
                  </Inline>
                </Flex>

                {converting && (
                  <Card padding={3} radius={2} tone="primary">
                    <Text size={1} align="center">
                      正在转换中...
                    </Text>
                  </Card>
                )}
              </Stack>
            </Box>
          ),
        }
      : null,
  }
}

ImportMarkdownAction.displayName = 'ImportMarkdownAction'

export default ImportMarkdownAction
